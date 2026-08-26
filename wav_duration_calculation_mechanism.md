# WAV Audio Duration Calculation Mechanism

This document describes the high-performance, low-bandwidth mechanism used to calculate the playback duration of WAV audio files hosted on cloud storage (e.g., Google Drive, AWS S3) without downloading the full files.

---

## 1. High-Level Concept

Downloading entire gigabyte-sized audio files just to read a few seconds of metadata is extremely slow and bandwidth-intensive. To solve this, the parser uses **Byte-Range Requests** combined with **RIFF Container Parsing**:

1. **Byte-Range Fetching (First 64 KB)**:
   The tool queries the cloud storage provider to download only the **first 64 KB** of the file (specifically `Math.min(65536, file.Size)`). This is accomplished via standard HTTP range requests (e.g. `Range: bytes=0-65535`).
   
2. **Metadata Header Walk**:
   It parses the downloaded buffer sequentially as a WAV (RIFF/RF64 format) file structure:
   - Verifies the `RIFF` (or `RF64`) signature and the `WAVE` format header.
   - Walks through format chunks until it finds the `fmt ` sub-chunk, from which it extracts the **`ByteRate`** (typically at offset 8, representing `SampleRate * NumChannels * BitsPerSample / 8`).
   - Walks until it finds the `data` sub-chunk, from which it extracts the **`DataSize`** (the raw audio payload byte count).
   
3. **Exact Duration Computation**:
   Once both parameters are retrieved, the playback duration in seconds is calculated immediately:
   $$\text{Duration (seconds)} = \frac{\text{DataSize (bytes)}}{\text{ByteRate (bytes/second)}}$$

---

## 2. Chunk Reference Table

| Chunk ID | Parameter Name | Offset (within chunk) | Size | Description |
| :--- | :--- | :--- | :--- | :--- |
| `RIFF` / `RF64` | Signature | 0 | 4 bytes | Identifies the container format |
| `WAVE` | File Format | 8 | 4 bytes | Identifies it specifically as WAV audio |
| `fmt ` | `ByteRate` | 8 | 4 bytes | Playback speed: `SampleRate * NumChannels * BitsPerSample / 8` |
| `data` | `DataSize` | 0 | 4 bytes (after ID) | Total size in bytes of the raw audio data payload |

---

## 3. Node.js Reference Implementation

Below is a production-ready Node.js function to parse the duration from a fetched partial header buffer:

```javascript
/**
 * Calculates WAV audio duration from a partial header buffer.
 * 
 * @param {Buffer} buffer - First 64KB (or less) of the WAV file
 * @param {number} fileSize - Total size of the file in bytes (from directory listing)
 * @returns {number} Playback duration in seconds (0 if invalid)
 */
function parseWavDuration(buffer, fileSize) {
  if (buffer.length < 44) return 0;

  // 1. Verify WAV Container Signatures
  let riffOffset = buffer.indexOf('RIFF');
  if (riffOffset === -1) {
    riffOffset = buffer.indexOf('RF64');
  }
  if (riffOffset === -1 || riffOffset + 12 > buffer.length) {
    return 0; // No valid signature found
  }

  const format = buffer.toString('ascii', riffOffset + 8, riffOffset + 12);
  if (format !== 'WAVE') {
    return 0; // Not a valid WAVE file
  }

  let offset = riffOffset + 12;
  let byteRate = 0;
  let dataSize = 0;

  // 2. Iterate RIFF Sub-chunks
  try {
    while (offset + 8 <= buffer.length) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      offset += 8;

      if (chunkId === 'fmt ') {
        if (chunkSize >= 12 && offset + 12 <= buffer.length) {
          byteRate = buffer.readUInt32LE(offset + 8); // Read ByteRate
        }
      } else if (chunkId === 'data') {
        dataSize = chunkSize; // Read Raw Data payload size
        break; // Stop iteration once fmt and data chunks are resolved
      }

      // Prevent loops on corrupt or invalid chunk sizes
      if (chunkSize <= 0 || offset + chunkSize > fileSize) {
        break; 
      }
      offset += chunkSize;
    }
  } catch (e) {
    // Ignore buffer reading errors due to truncation
  }

  // 3. Calculate Final Duration
  if (byteRate > 0) {
    // Handle cases where data size is unset/invalid (e.g. streaming WAVs or RF64 placeholders)
    if (dataSize === 0xffffffff || dataSize === 0 || dataSize >= fileSize) {
      dataSize = Math.max(0, fileSize - offset);
    }
    return dataSize / byteRate;
  }

  return 0;
}
```
