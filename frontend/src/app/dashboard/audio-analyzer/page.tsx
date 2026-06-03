'use client';

import { useEffect, useState, useMemo } from 'react';
import { customersApi, gdriveApi, streamWavDuration } from '@/lib/api-client';
import { Volume2, FolderOpen, Loader2, Info, Search, ArrowUpDown, FileAudio } from 'lucide-react';
import FolderBrowser from '@/components/FolderBrowser';

interface WavFileDetails {
  name: string;
  path: string;
  size: number;
  duration: number;
}

interface CalculationResult {
  totalDuration: number;
  wavCount: number;
  files: WavFileDetails[];
  skippedCount: number;
}

const EqualizerAnimation = ({ active = true }: { active?: boolean }) => (
  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '24px' }}>
    {[1, 2, 3, 4, 5].map((i) => (
      <div
        key={i}
        style={{
          width: '3px',
          height: '100%',
          background: 'var(--accent-blue)',
          borderRadius: '2px',
          animation: active ? `bounce-bar ${0.5 + i * 0.12}s ease-in-out infinite` : 'none',
          transformOrigin: 'bottom',
          transform: active ? 'none' : 'scaleY(0.2)',
        }}
      />
    ))}
    <style dangerouslySetInnerHTML={{__html: `
      @keyframes bounce-bar {
        0%, 100% { transform: scaleY(0.2); }
        50% { transform: scaleY(1); }
      }
    `}} />
  </div>
);

export default function AudioAnalyzerPage() {
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [error, setError] = useState('');
  
  // Progress state
  const [progress, setProgress] = useState<{ scanned: number; total: number; currentFile: string } | null>(null);
  const [result, setResult] = useState<CalculationResult | null>(null);

  // Form state
  const [type, setType] = useState<'GDrive' | 'S3'>('S3');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [path, setPath] = useState('');
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);

  // Search & sorting state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'path' | 'size' | 'duration'>('path');
  const [sortAscending, setSortAscending] = useState(true);

  useEffect(() => {
    Promise.all([
      customersApi.list(),
      gdriveApi.sources(),
    ]).then(([custRes, srcRes]) => {
      setCustomers(custRes.data);
      setSources(srcRes.data);
    });
  }, []);

  // Auto-fill path with customer's default prefix when selected
  useEffect(() => {
    if (type === 'S3' && selectedCustomerId) {
      const customer = customers.find((c: any) => c.id === selectedCustomerId);
      if (customer?.prefixPath) {
        setPath(customer.prefixPath);
      } else {
        setPath('');
      }
    }
  }, [selectedCustomerId, customers, type]);

  // Auto-fill path with Google Drive source's default path when selected
  useEffect(() => {
    if (type === 'GDrive' && selectedSourceId) {
      const source = selectedSourceId.startsWith('GLOBAL_')
        ? { drivePath: '' }
        : sources.find((s: any) => s.id === selectedSourceId);
      if (source?.drivePath) {
        setPath(source.drivePath);
      } else {
        setPath('');
      }
    }
  }, [selectedSourceId, sources, type]);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setProgress(null);
    setLoading(true);

    try {
      let payload: any = {};
      if (type === 'S3') {
        const customer = customers.find((c: any) => c.id === selectedCustomerId);
        if (!customer) throw new Error('Please select a customer first.');

        payload = {
          roleArn: customer.roleArn,
          bucketName: customer.bucketName,
          region: customer.region,
          externalId: customer.externalId || undefined,
          path: path,
        };
      } else {
        const source = selectedSourceId.startsWith('GLOBAL_')
          ? {
              id: selectedSourceId,
              authType: selectedSourceId === 'GLOBAL_SERVICE_ACCOUNT' ? 'SERVICE_ACCOUNT' : 'OAUTH',
              sharedDriveId: undefined,
            }
          : sources.find((s: any) => s.id === selectedSourceId);
        if (!source) throw new Error('Please select a Google Drive source first.');

        payload = {
          path: path,
          sharedDriveId: source.sharedDriveId || undefined,
          authType: source.authType,
        };
      }

      // Trigger NDJSON stream
      await streamWavDuration(type, payload, (event) => {
        if (event.type === 'progress') {
          setProgress({
            scanned: event.scanned,
            total: event.total,
            currentFile: event.currentFile,
          });
        } else if (event.type === 'done') {
          setResult(event.result);
        } else if (event.type === 'error') {
          setError(event.message || 'An error occurred during audio analysis.');
        }
      });
    } catch (err: any) {
      setError(err.message || 'Failed to complete audio analysis.');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const selectedCustomer = customers.find((c: any) => c.id === selectedCustomerId);
  const selectedSource = selectedSourceId.startsWith('GLOBAL_')
    ? {
        id: selectedSourceId,
        name: selectedSourceId === 'GLOBAL_SERVICE_ACCOUNT' ? 'Global Service Account' : 'Global User Account',
        authType: selectedSourceId === 'GLOBAL_SERVICE_ACCOUNT' ? 'SERVICE_ACCOUNT' : 'OAUTH',
        drivePath: '',
      }
    : sources.find((s: any) => s.id === selectedSourceId);

  // Format helpers
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.round(seconds % 60);
    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    return parts.join(' ');
  };

  const formatTrackTime = (seconds: number) => {
    if (!seconds || seconds <= 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Filter and sort track details
  const filteredAndSortedTracks = useMemo(() => {
    if (!result?.files) return [];
    
    let tracks = [...result.files];

    // Filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      tracks = tracks.filter(
        (t) => t.name.toLowerCase().includes(query) || t.path.toLowerCase().includes(query)
      );
    }

    // Sort
    tracks.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'path') {
        comparison = a.path.localeCompare(b.path);
      } else if (sortField === 'size') {
        comparison = a.size - b.size;
      } else if (sortField === 'duration') {
        comparison = a.duration - b.duration;
      }
      return sortAscending ? comparison : -comparison;
    });

    return tracks;
  }, [result, searchQuery, sortField, sortAscending]);

  const toggleSort = (field: 'path' | 'size' | 'duration') => {
    if (sortField === field) {
      setSortAscending(!sortAscending);
    } else {
      setSortField(field);
      setSortAscending(true);
    }
  };

  // Active progress calculations
  const progressPercent = useMemo(() => {
    if (!progress || progress.total === 0) return 0;
    return Math.round((progress.scanned / progress.total) * 100);
  }, [progress]);

  return (
    <div className="animate-fadeIn" style={{ maxWidth: '1080px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Volume2 size={24} color="var(--accent-blue)" />
        Audio Duration Analyzer
      </h1>
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px' }}>
        Recursively scan a directory in S3 or Google Drive to sum the total playback duration of all WAV files.
      </p>

      {/* Structured Grid Layout: Left is 340px Fixed Setting, Right is Auto Results */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '32px', alignItems: 'start' }}>
        
        {/* Left Input Configuration Column */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '28px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, borderBottom: '1px solid var(--border-secondary)', paddingBottom: '12px', marginBottom: '4px' }}>
            Analysis Target
          </h2>

          {/* Storage Type Toggle */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Storage Location
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-secondary)' }}>
              <button
                type="button"
                onClick={() => {
                  setType('S3');
                  setPath('');
                  setResult(null);
                  setError('');
                }}
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: 'none',
                  background: type === 'S3' ? 'var(--gradient-primary)' : 'transparent',
                  color: type === 'S3' ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                Customer S3
              </button>
              <button
                type="button"
                onClick={() => {
                  setType('GDrive');
                  setPath('');
                  setResult(null);
                  setError('');
                  setSelectedSourceId('GLOBAL_SERVICE_ACCOUNT');
                }}
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: 'none',
                  background: type === 'GDrive' ? 'var(--gradient-primary)' : 'transparent',
                  color: type === 'GDrive' ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                Google Drive
              </button>
            </div>
          </div>

          <form onSubmit={handleAnalyze} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Source Selector */}
            {type === 'S3' ? (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Customer S3 Bucket *
                </label>
                <select
                  className="select"
                  value={selectedCustomerId}
                  onChange={(e) => {
                    setSelectedCustomerId(e.target.value);
                    setResult(null);
                    setError('');
                  }}
                  required
                >
                  <option value="">Select customer bucket...</option>
                  {customers.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.bucketName})</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Google Drive Source *
                </label>
                <select
                  className="select"
                  value={selectedSourceId}
                  onChange={(e) => {
                    setSelectedSourceId(e.target.value);
                    setResult(null);
                    setError('');
                  }}
                  required
                >
                  <option value="GLOBAL_SERVICE_ACCOUNT">Global Service Account (Service Account)</option>
                  <option value="GLOBAL_OAUTH">Global User Account (OAuth2 Token)</option>
                  <optgroup label="Saved Pull Sources (OAuth2)">
                    {sources.filter((s: any) => s.authType === 'OAUTH').map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.drivePath})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Saved Push Sources (Service Account)">
                    {sources.filter((s: any) => s.authType === 'SERVICE_ACCOUNT').map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.drivePath})</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            )}

            {/* Path Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                Folder Path (Prefix)
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                <input
                  className="input"
                  placeholder={type === 'S3' ? 'e.g., Stark_Maptix/Audio' : 'e.g., Audio/Project Marvel'}
                  value={path}
                  onChange={(e) => {
                    setPath(e.target.value);
                    setResult(null);
                  }}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    if (type === 'S3' && !selectedCustomerId) {
                      alert('Please select a customer bucket first.');
                      return;
                    }
                    if (type === 'GDrive' && !selectedSourceId) {
                      alert('Please select a Google Drive source first.');
                      return;
                    }
                    setIsBrowserOpen(true);
                  }}
                  style={{ padding: '0 16px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, fontSize: '13px' }}
                >
                  <FolderOpen size={14} />
                  Browse
                </button>
              </div>
            </div>

            {error && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--accent-red)', fontSize: '13px' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={loading || (type === 'S3' && !selectedCustomerId) || (type === 'GDrive' && !selectedSourceId)}
              style={{ opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', height: '42px', fontSize: '14px', width: '100%' }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Analyzing Audio...
                </>
              ) : (
                'Analyze WAV Duration'
              )}
            </button>
          </form>
        </div>

        {/* Right Output Analysis Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Real-time Streaming Scanner Progress */}
          {loading && progress && (
            <div className="card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-accent)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />
                  Extracting Audio Headers recursively...
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-blue)' }}>
                  {progressPercent}%
                </span>
              </div>

              {/* Progress Bar */}
              <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'var(--bg-tertiary)', overflow: 'hidden', position: 'relative' }}>
                <div
                  style={{
                    height: '100%',
                    background: 'var(--gradient-primary)',
                    width: `${progressPercent}%`,
                    transition: 'width 0.15s ease',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                <span>Analyzed {progress.scanned.toLocaleString()} of {progress.total.toLocaleString()} WAV files</span>
                <span style={{ maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>
                  {progress.currentFile}
                </span>
              </div>
            </div>
          )}

          {/* Results Summary Overview */}
          {result ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Stat Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '16px' }}>
                {/* Cumulative play time */}
                <div className="glass" style={{ padding: '20px', borderRadius: '14px', border: '1px solid var(--border-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Playback Duration</span>
                    <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-blue)' }}>
                      {formatDuration(result.totalDuration)}
                    </span>
                  </div>
                  {result.totalDuration > 0 && <EqualizerAnimation />}
                </div>

                {/* WAV files count */}
                <div className="glass" style={{ padding: '20px', borderRadius: '14px', border: '1px solid var(--border-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>WAV Tracks Found</span>
                    <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {result.wavCount} files
                    </span>
                  </div>
                </div>

                {/* Skipped files count */}
                <div className="glass" style={{ padding: '20px', borderRadius: '14px', border: '1px solid var(--border-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Formats Skipped</span>
                    <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      {result.skippedCount} files
                    </span>
                  </div>
                </div>
              </div>

              {/* Tracks Detail Listing Card */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Analyzed Tracks List</h3>
                  
                  {/* Search bar inside list card */}
                  <div style={{ position: 'relative', width: '220px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--text-tertiary)' }} />
                    <input
                      className="input"
                      placeholder="Search audio tracks..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ paddingLeft: '30px', paddingRight: '10px', height: '36px', fontSize: '13px' }}
                    />
                  </div>
                </div>

                {/* Track Details Playlist-style List */}
                {filteredAndSortedTracks.length > 0 ? (
                  <div style={{
                    border: '1px solid var(--border-secondary)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    background: 'var(--bg-input)',
                    maxHeight: '480px',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                  }}>
                    {/* Sticky Table Header */}
                    <div style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 10,
                      background: 'var(--bg-tertiary)',
                      borderBottom: '1px solid var(--border-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '12px 20px',
                      fontSize: '12px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      color: 'var(--text-secondary)',
                      letterSpacing: '0.05em',
                    }}>
                      <div
                        onClick={() => toggleSort('path')}
                        style={{ flex: 1, minWidth: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', userSelect: 'none' }}
                      >
                        File Path
                        <ArrowUpDown size={12} style={{ opacity: sortField === 'path' ? 1 : 0.5 }} />
                      </div>
                      <div
                        onClick={() => toggleSort('size')}
                        style={{ width: '110px', textAlign: 'right', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', userSelect: 'none', paddingRight: '12px' }}
                      >
                        Size
                        <ArrowUpDown size={12} style={{ opacity: sortField === 'size' ? 1 : 0.5 }} />
                      </div>
                      <div
                        onClick={() => toggleSort('duration')}
                        style={{ width: '100px', textAlign: 'right', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', userSelect: 'none' }}
                      >
                        Duration
                        <ArrowUpDown size={12} style={{ opacity: sortField === 'duration' ? 1 : 0.5 }} />
                      </div>
                    </div>

                    {/* Scrollable Rows */}
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                      {filteredAndSortedTracks.map((file, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '12px 20px',
                            borderBottom: idx === filteredAndSortedTracks.length - 1 ? 'none' : '1px solid var(--border-secondary)',
                            transition: 'background 0.15s ease',
                            cursor: 'default',
                            background: 'var(--bg-card)',
                          }}
                          className="glass-hover"
                        >
                          {/* File Path Column */}
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <FileAudio size={16} style={{ color: 'var(--accent-blue)', minWidth: '16px', flexShrink: 0 }} />
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                              <div style={{ fontWeight: 500, fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {file.name}
                              </div>
                              <div
                                style={{ fontSize: '11px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                title={file.path}
                              >
                                {file.path}
                              </div>
                            </div>
                          </div>

                          {/* Size Column */}
                          <div style={{
                            width: '110px',
                            textAlign: 'right',
                            fontSize: '13px',
                            color: 'var(--text-secondary)',
                            whiteSpace: 'nowrap',
                            fontFamily: 'monospace',
                            paddingRight: '12px',
                            flexShrink: 0,
                          }}>
                            {formatBytes(file.size)}
                          </div>

                          {/* Duration Column */}
                          <div style={{
                            width: '100px',
                            textAlign: 'right',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'var(--accent-blue)',
                            whiteSpace: 'nowrap',
                            fontFamily: 'monospace',
                            flexShrink: 0,
                          }}>
                            {formatTrackTime(file.duration)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '40px', border: '1px dashed var(--border-secondary)', borderRadius: '8px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                    No WAV audio tracks found matching search parameters.
                  </div>
                )}
              </div>
            </div>
          ) : (
            !loading && (
              <div className="glass" style={{ border: '1px dashed var(--border-secondary)', borderRadius: '16px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '60px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '14px', height: '100%' }}>
                <Volume2 size={40} style={{ opacity: 0.25 }} />
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Analyze Playback Lengths</h3>
                  <p style={{ fontSize: '13px', maxWidth: '340px', margin: '0 auto' }}>
                    Select a directory target on S3 or Google Drive to recursively scan WAV files and generate audio reports.
                  </p>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Browser Popup Dialog */}
      {isBrowserOpen && (type === 'S3' ? selectedCustomer : selectedSource) && (
        <FolderBrowser
          isOpen={isBrowserOpen}
          onClose={() => setIsBrowserOpen(false)}
          onSelect={(selectedPath) => setPath(selectedPath)}
          type={type === 'S3' ? 's3' : 'gdrive'}
          initialPath={path}
          s3Params={
            type === 'S3' && selectedCustomer
              ? {
                  roleArn: selectedCustomer.roleArn,
                  bucketName: selectedCustomer.bucketName,
                  region: selectedCustomer.region,
                  externalId: selectedCustomer.externalId || undefined,
                }
              : undefined
          }
          gdriveAuthType={type === 'GDrive' && selectedSource ? selectedSource.authType : undefined}
          sharedDriveId={type === 'GDrive' && selectedSource ? selectedSource.sharedDriveId || undefined : undefined}
        />
      )}
    </div>
  );
}
