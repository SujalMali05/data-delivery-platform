'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { gdriveApi, customersApi, batchOperationsApi, transfersApi } from '@/lib/api-client';
import { useSSE } from '@/hooks/use-sse';
import { getStatusBgColor } from '@/lib/utils';
import FolderBrowser from '@/components/FolderBrowser';
import {
  Boxes,
  Trash2,
  Copy,
  HardDrive,
  Database,
  Folder,
  Upload,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Loader2,
  Search,
  Check,
  Play,
  ArrowRight,
  RefreshCw,
  Layers,
  Activity,
  ArrowUpRight,
} from 'lucide-react';

interface DriveSource {
  id: string;
  name: string;
  drivePath?: string;
  authType?: string;
  driveType?: string;
  sharedDriveId?: string;
  direction?: string;
}

interface Customer {
  id: string;
  name: string;
  bucketName: string;
  roleArn: string;
  region: string;
  externalId?: string;
  prefixPath?: string;
}

interface RunFailure {
  path: string;
  error: string;
}

interface RunResult {
  total: number;
  // Dynamic fields supporting both copy (copiedCount) and delete (deletedCount)
  copiedCount?: number;
  deletedCount?: number;
  failedCount: number;
  failures: RunFailure[];
}

interface AnalysisResult {
  total: number;
  matchedCount: number;
  missingCount: number;
  matched: string[];
  missing: string[];
}

interface SyncAnalysisResult {
  sourceTotal: number;
  destTotal: number;
  toCopyCount: number;
  toDeleteCount: number;
  alreadySyncedCount: number;
  toCopy: string[];
  toDelete: string[];
  alreadySynced: string[];
}

export default function BatchOperationsPage() {
  // Tabs: 'copy' | 'delete'
  const [activeMode, setActiveMode] = useState<'copy' | 'delete'>('copy');

  // Connections state
  const [driveSources, setDriveSources] = useState<DriveSource[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);

  // Common browser state
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [browserMode, setBrowserMode] = useState<'source' | 'dest'>('source');

  // ==========================================
  // BATCH COPY STATES
  // ==========================================
  const [copySourceType, setCopySourceType] = useState<'GDrive' | 'S3'>('GDrive');
  const [copySourceId, setCopySourceId] = useState('');
  const [copySourcePath, setCopySourcePath] = useState('');

  const [copyDestType, setCopyDestType] = useState<'GDrive' | 'S3'>('S3');
  const [copyDestId, setCopyDestId] = useState('');
  const [copyDestPath, setCopyDestPath] = useState('');

  const [copyCsvFile, setCopyCsvFile] = useState<File | null>(null);
  const [copyParsedPaths, setCopyParsedPaths] = useState<string[]>([]);
  const [copyCsvError, setCopyCsvError] = useState('');

  const [copyAnalyzing, setCopyAnalyzing] = useState(false);
  const [copyAnalysisResult, setCopyAnalysisResult] = useState<AnalysisResult | null>(null);
  const [copyPreviewTab, setCopyPreviewTab] = useState<'matched' | 'missing' | 'csv' | 'toCopy' | 'toDelete' | 'alreadySynced' | 'allSource'>('matched');
  const [copyConfirmedSafety, setCopyConfirmedSafety] = useState(false);
  const [copyRunning, setCopyRunning] = useState(false);
  const [copyResult, setCopyResult] = useState<RunResult | null>(null);
  const [copyIgnoreExtension, setCopyIgnoreExtension] = useState(false);

  // All Objects & Sync mode states
  const [copyAllObjects, setCopyAllObjects] = useState(false);
  const [copySyncMode, setCopySyncMode] = useState(false);
  const [copySyncAnalysisResult, setCopySyncAnalysisResult] = useState<SyncAnalysisResult | null>(null);

  // ==========================================
  // BATCH DELETE STATES
  // ==========================================
  const [deleteStorageType, setDeleteStorageType] = useState<'GDrive' | 'S3'>('GDrive');
  const [deleteStorageId, setDeleteStorageId] = useState('');
  const [deletePath, setDeletePath] = useState('');

  const [deleteCsvFile, setDeleteCsvFile] = useState<File | null>(null);
  const [deleteParsedPaths, setDeleteParsedPaths] = useState<string[]>([]);
  const [deleteCsvError, setDeleteCsvError] = useState('');

  const [deleteAnalyzing, setDeleteAnalyzing] = useState(false);
  const [deleteAnalysisResult, setDeleteAnalysisResult] = useState<AnalysisResult | null>(null);
  const [deletePreviewTab, setDeletePreviewTab] = useState<'matched' | 'missing' | 'csv'>('matched');
  const [deleteConfirmedSafety, setDeleteConfirmedSafety] = useState(false);
  const [deleteRunning, setDeleteRunning] = useState(false);
  const [deleteResult, setDeleteResult] = useState<RunResult | null>(null);
  const [deleteIgnoreExtension, setDeleteIgnoreExtension] = useState(false);

  // Filter preview lists
  const [previewSearch, setPreviewSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Persistent Active Transfer Task State
  const [activeTransferId, setActiveTransferId] = useState<string | null>(null);
  const [activeTransfer, setActiveTransfer] = useState<any | null>(null);

  // Restore active transfer task from localStorage on mount
  useEffect(() => {
    fetchConnections();
    const savedId = localStorage.getItem('batch_active_transfer_id');
    if (savedId) {
      setActiveTransferId(savedId);
      transfersApi.get(savedId)
        .then((res) => setActiveTransfer(res.data))
        .catch(() => {
          localStorage.removeItem('batch_active_transfer_id');
          setActiveTransferId(null);
        });
    }
  }, []);

  // Poll transfer status if active task exists
  useEffect(() => {
    if (!activeTransferId) return;
    const interval = setInterval(() => {
      transfersApi.get(activeTransferId)
        .then((res) => {
          setActiveTransfer(res.data);
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [activeTransferId]);

  // Subscribe to SSE live transfer stream
  useSSE({
    url: '/transfers/stream/all',
    enabled: !!activeTransferId,
    onMessage: (eventData) => {
      if (eventData.transferId && eventData.transferId === activeTransferId) {
        setActiveTransfer((prev: any) => ({
          ...(prev || {}),
          ...eventData,
        }));
      }
    },
  });

  const fetchConnections = async () => {
    setLoadingConnections(true);
    try {
      const [sourcesRes, customersRes] = await Promise.all([
        gdriveApi.sources(),
        customersApi.list(),
      ]);
      setDriveSources(sourcesRes.data || []);
      setCustomers(customersRes.data || []);
    } catch (err) {
      console.error('Failed to load connections:', err);
    } finally {
      setLoadingConnections(false);
    }
  };

  const handleTabChange = (mode: 'copy' | 'delete') => {
    setActiveMode(mode);
    setPreviewSearch('');
    setErrorMsg('');
  };

  // Helper selectors
  const getSelectedSource = (id: string) => {
    if (id.startsWith('GLOBAL_')) {
      return {
        id,
        name: 'Global User Account',
        authType: 'OAUTH',
        drivePath: '',
      };
    }
    return driveSources.find((s) => s.id === id);
  };

  const getSelectedCustomer = (id: string) => {
    return customers.find((c) => c.id === id);
  };

  // ==========================================
  // COPY OPERATION HANDLERS
  // ==========================================

  const handleCopySourceTypeChange = (type: 'GDrive' | 'S3') => {
    setCopySourceType(type);
    setCopySourceId('');
    setCopySourcePath('');
    setCopyAnalysisResult(null);
    setCopyConfirmedSafety(false);
  };

  const handleCopyDestTypeChange = (type: 'GDrive' | 'S3') => {
    setCopyDestType(type);
    setCopyDestId('');
    setCopyDestPath('');
    setCopyAnalysisResult(null);
    setCopyConfirmedSafety(false);
  };

  const handleCopyFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCopyCsvFile(file);
    setCopyCsvError('');
    setCopyParsedPaths([]);
    setCopyAnalysisResult(null);
    setCopyConfirmedSafety(false);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) {
        setCopyCsvError('File is empty.');
        return;
      }

      const lines = text.split(/\r?\n/);
      const paths: string[] = [];
      let startIndex = 0;

      if (lines.length > 0) {
        const firstLine = lines[0].toLowerCase();
        if (firstLine.includes('path') || firstLine.includes('file')) {
          startIndex = 1;
        }
      }

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cleaned = line.replace(/^["']|["']$/g, '').trim();
        if (cleaned) {
          paths.push(cleaned);
        }
      }

      if (paths.length === 0) {
        setCopyCsvError('No valid file paths found in the CSV.');
      } else {
        setCopyParsedPaths(paths);
      }
    };
    reader.readAsText(file);
  };

  const handleAnalyzeCopy = async () => {
    if (!copySourceId) {
      alert('Please select a source storage connection.');
      return;
    }

    // In CSV mode, we need parsed paths
    if (!copyAllObjects && copyParsedPaths.length === 0) {
      alert('Please upload a CSV file listing objects.');
      return;
    }

    // In Sync mode, we need destination configured
    if (copySyncMode) {
      if (!copyDestId) {
        alert('Please select a destination storage connection for sync analysis.');
        return;
      }
    }

    setCopyAnalyzing(true);
    setCopyAnalysisResult(null);
    setCopySyncAnalysisResult(null);
    setErrorMsg('');

    try {
      if (copySyncMode) {
        // SYNC MODE: Compare source vs destination
        const res = await batchOperationsApi.analyzeCopySync({
          sourceType: copySourceType,
          sourceId: copySourceId,
          sourcePath: copySourcePath,
          destType: copyDestType,
          destId: copyDestId,
          destinationPath: copyDestPath,
          ignoreExtension: copyIgnoreExtension,
        });
        setCopySyncAnalysisResult(res.data);
        if (res.data.toCopyCount > 0) {
          setCopyPreviewTab('toCopy');
        } else if (res.data.toDeleteCount > 0) {
          setCopyPreviewTab('toDelete');
        } else {
          setCopyPreviewTab('alreadySynced');
        }
      } else if (copyAllObjects) {
        // ALL OBJECTS MODE: List everything in source
        const res = await batchOperationsApi.analyzeCopyAllObjects({
          sourceType: copySourceType,
          sourceId: copySourceId,
          sourcePath: copySourcePath,
        });
        setCopyAnalysisResult(res.data);
        setCopyPreviewTab('matched');
      } else {
        // CSV MODE: Original behavior
        const reader = new FileReader();
        reader.onload = async (event) => {
          const csvContent = event.target?.result as string;
          try {
            const res = await batchOperationsApi.analyzeCopy({
              sourceType: copySourceType,
              sourceId: copySourceId,
              sourcePath: copySourcePath,
              csvContent,
              ignoreExtension: copyIgnoreExtension,
            });
            setCopyAnalysisResult(res.data);
            if (res.data.matchedCount > 0) {
              setCopyPreviewTab('matched');
            } else {
              setCopyPreviewTab('csv');
            }
          } catch (err: any) {
            console.error('Analysis failed:', err);
            setErrorMsg(err.response?.data?.message || err.message || 'An error occurred during source folder check.');
          } finally {
            setCopyAnalyzing(false);
          }
        };
        reader.readAsText(copyCsvFile!);
        return; // Early return - the FileReader callback handles setCopyAnalyzing
      }
    } catch (err: any) {
      console.error('Analysis failed:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'An error occurred during analysis.');
    } finally {
      setCopyAnalyzing(false);
    }
  };

  const handleExecuteCopy = async () => {
    if (!copySourceId || !copyDestId) {
      alert('Please complete connection selections.');
      return;
    }
    if (!copyConfirmedSafety) {
      alert('Please check the warning confirmation.');
      return;
    }

    // Sync mode validation
    if (copySyncMode && copySyncAnalysisResult) {
      const { toCopyCount, toDeleteCount } = copySyncAnalysisResult;
      if (toCopyCount === 0 && toDeleteCount === 0) {
        alert('Source and destination are already in sync. Nothing to do.');
        return;
      }
      const confirmMsg = `SYNC WARNING: This will copy ${toCopyCount} files to destination and DELETE ${toDeleteCount} files from destination.\n\nThis is a destructive operation. Confirm execution?`;
      if (!confirm(confirmMsg)) return;

      setCopyRunning(true);
      setCopyResult(null);
      setErrorMsg('');

      try {
        const res = await batchOperationsApi.runCopySync({
          sourceType: copySourceType,
          sourceId: copySourceId,
          sourcePath: copySourcePath,
          destType: copyDestType,
          destId: copyDestId,
          destinationPath: copyDestPath,
          toCopy: copySyncAnalysisResult.toCopy,
          toDelete: copySyncAnalysisResult.toDelete,
        });
        setCopyResult(res.data);
        if (res.data?.transferId) {
          const tId = res.data.transferId;
          setActiveTransferId(tId);
          setActiveTransfer(res.data.transfer || { id: tId, status: 'QUEUED', name: 'Batch Sync Task' });
          localStorage.setItem('batch_active_transfer_id', tId);
        }
        setCopyConfirmedSafety(false);
        setCopySyncAnalysisResult(null);
      } catch (err: any) {
        console.error('Sync execution failed:', err);
        setErrorMsg(err.response?.data?.message || err.message || 'An error occurred during sync execution.');
      } finally {
        setCopyRunning(false);
      }
    } else {
      // Standard copy mode (CSV or All Objects)
      if (!copyAnalysisResult || copyAnalysisResult.matchedCount === 0) {
        alert('There are no matched source objects to copy.');
        return;
      }
      const confirmMsg = `WARNING: You are about to copy ${copyAnalysisResult.matchedCount} objects to the destination folder. Confirm execution?`;
      if (!confirm(confirmMsg)) return;

      setCopyRunning(true);
      setCopyResult(null);
      setErrorMsg('');

      try {
        const res = await batchOperationsApi.runCopy({
          sourceType: copySourceType,
          sourceId: copySourceId,
          sourcePath: copySourcePath,
          destType: copyDestType,
          destId: copyDestId,
          destinationPath: copyDestPath,
          paths: copyAnalysisResult.matched,
        });
        setCopyResult(res.data);
        if (res.data?.transferId) {
          const tId = res.data.transferId;
          setActiveTransferId(tId);
          setActiveTransfer(res.data.transfer || { id: tId, status: 'QUEUED', name: 'Batch Copy Task' });
          localStorage.setItem('batch_active_transfer_id', tId);
        }
        setCopyConfirmedSafety(false);
        setCopyCsvFile(null);
        setCopyParsedPaths([]);
        setCopyAnalysisResult(null);
      } catch (err: any) {
        console.error('Copy execution failed:', err);
        setErrorMsg(err.response?.data?.message || err.message || 'An error occurred during copy execution.');
      } finally {
        setCopyRunning(false);
      }
    }
  };

  const handleResetCopy = () => {
    setCopyResult(null);
    setCopyAnalysisResult(null);
    setCopySyncAnalysisResult(null);
    setErrorMsg('');
    setCopyConfirmedSafety(false);
    setCopyCsvFile(null);
    setCopyParsedPaths([]);
    setCopySourcePath('');
    setCopyDestPath('');
  };

  // ==========================================
  // DELETION OPERATION HANDLERS
  // ==========================================

  const handleDeleteStorageTypeChange = (type: 'GDrive' | 'S3') => {
    setDeleteStorageType(type);
    setDeleteStorageId('');
    setDeletePath('');
    setDeleteAnalysisResult(null);
    setDeleteConfirmedSafety(false);
  };

  const handleDeleteFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDeleteCsvFile(file);
    setDeleteCsvError('');
    setDeleteParsedPaths([]);
    setDeleteAnalysisResult(null);
    setDeleteConfirmedSafety(false);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) {
        setDeleteCsvError('File is empty.');
        return;
      }

      const lines = text.split(/\r?\n/);
      const paths: string[] = [];
      let startIndex = 0;

      if (lines.length > 0) {
        const firstLine = lines[0].toLowerCase();
        if (firstLine.includes('path') || firstLine.includes('file')) {
          startIndex = 1;
        }
      }

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cleaned = line.replace(/^["']|["']$/g, '').trim();
        if (cleaned) {
          paths.push(cleaned);
        }
      }

      if (paths.length === 0) {
        setDeleteCsvError('No valid file paths found in the CSV.');
      } else {
        setDeleteParsedPaths(paths);
      }
    };
    reader.readAsText(file);
  };

  const handleAnalyzeDelete = async () => {
    if (!deleteStorageId) {
      alert('Please select a storage connection.');
      return;
    }
    if (deleteParsedPaths.length === 0) {
      alert('Please upload a CSV file.');
      return;
    }

    setDeleteAnalyzing(true);
    setDeleteAnalysisResult(null);
    setErrorMsg('');

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const csvContent = event.target?.result as string;
        try {
          const res = await batchOperationsApi.analyzeDelete({
            storageType: deleteStorageType,
            storageId: deleteStorageId,
            path: deletePath,
            csvContent,
            ignoreExtension: deleteIgnoreExtension,
          });
          setDeleteAnalysisResult(res.data);
          if (res.data.matchedCount > 0) {
            setDeletePreviewTab('matched');
          } else {
            setDeletePreviewTab('csv');
          }
        } catch (err: any) {
          console.error('Delete check failed:', err);
          setErrorMsg(err.response?.data?.message || err.message || 'An error occurred during target folder check.');
        } finally {
          setDeleteAnalyzing(false);
        }
      };
      reader.readAsText(deleteCsvFile!);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to parse CSV.');
      setDeleteAnalyzing(false);
    }
  };

  const handleExecuteDelete = async () => {
    if (!deleteStorageId) {
      alert('Please select a storage connection.');
      return;
    }
    if (!deleteAnalysisResult || deleteAnalysisResult.matchedCount === 0) {
      alert('There are no matched target objects to delete.');
      return;
    }
    if (!deleteConfirmedSafety) {
      alert('Please read and check the warning confirmation.');
      return;
    }

    const confirmMsg = `PERMANENT DELETION WARNING: You are about to permanently delete ${deleteAnalysisResult.matchedCount} objects from the selected path.\n\nConfirm permanent execution?`;
    if (!confirm(confirmMsg)) return;

    setDeleteRunning(true);
    setDeleteResult(null);
    setErrorMsg('');

    try {
      const res = await batchOperationsApi.runDelete({
        storageType: deleteStorageType,
        storageId: deleteStorageId,
        path: deletePath,
        paths: deleteAnalysisResult.matched,
      });
      setDeleteResult(res.data);
      if (res.data?.transferId) {
        const tId = res.data.transferId;
        setActiveTransferId(tId);
        setActiveTransfer(res.data.transfer || { id: tId, status: 'QUEUED', name: 'Batch Deletion Task' });
        localStorage.setItem('batch_active_transfer_id', tId);
      }
      setDeleteConfirmedSafety(false);
      setDeleteCsvFile(null);
      setDeleteParsedPaths([]);
      setDeleteAnalysisResult(null);
    } catch (err: any) {
      console.error('Batch delete failed:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'An error occurred during deletion execution.');
    } finally {
      setDeleteRunning(false);
    }
  };

  const handleResetDelete = () => {
    setDeleteResult(null);
    setDeleteAnalysisResult(null);
    setErrorMsg('');
    setDeleteConfirmedSafety(false);
    setDeleteCsvFile(null);
    setDeleteParsedPaths([]);
    setDeletePath('');
  };

  // ==========================================
  // HELPERS FOR PREVIEW LISTS
  // ==========================================
  const getActivePreviewList = () => {
    if (activeMode === 'copy') {
      // Sync mode preview
      if (copySyncAnalysisResult) {
        if (copyPreviewTab === 'toCopy') return copySyncAnalysisResult.toCopy;
        if (copyPreviewTab === 'toDelete') return copySyncAnalysisResult.toDelete;
        if (copyPreviewTab === 'alreadySynced') return copySyncAnalysisResult.alreadySynced;
        if (copyPreviewTab === 'allSource') return [...copySyncAnalysisResult.toCopy, ...copySyncAnalysisResult.alreadySynced];
        return copySyncAnalysisResult.toCopy;
      }
      // Standard analysis (CSV or AllObjects)
      if (copyAnalysisResult) {
        if (copyPreviewTab === 'matched') return copyAnalysisResult.matched;
        if (copyPreviewTab === 'missing') return copyAnalysisResult.missing;
        return copyParsedPaths;
      }
      return copyParsedPaths;
    } else {
      if (!deleteAnalysisResult) return deleteParsedPaths;
      if (deletePreviewTab === 'matched') return deleteAnalysisResult.matched;
      if (deletePreviewTab === 'missing') return deleteAnalysisResult.missing;
      return deleteParsedPaths;
    }
  };

  const currentPreviewList = getActivePreviewList();

  const filteredPreviewPaths = currentPreviewList.filter((p) =>
    p.toLowerCase().includes(previewSearch.toLowerCase())
  );

  const openBrowser = (mode: 'source' | 'dest') => {
    setBrowserMode(mode);
    setIsBrowserOpen(true);
  };

  const getActiveBrowserParams = () => {
    const isSource = browserMode === 'source';
    let type: 'GDrive' | 'S3';
    let id: string;
    let pathStr: string;

    if (activeMode === 'copy') {
      type = isSource ? copySourceType : copyDestType;
      id = isSource ? copySourceId : copyDestId;
      pathStr = isSource ? copySourcePath : copyDestPath;
    } else {
      type = deleteStorageType;
      id = deleteStorageId;
      pathStr = deletePath;
    }

    return { type, id, pathStr };
  };

  const activeBrowser = getActiveBrowserParams();

  console.log('RENDER STATE:', { activeMode, copyAnalysisResult, copyPreviewTab, deleteAnalysisResult, deletePreviewTab });

  return (
    <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '20px', minHeight: 'calc(100vh - 120px)' }}>
      {/* Title Header */}
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Boxes size={24} color="var(--accent-blue)" /> Batch Operations Panel
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '6px' }}>
          Execute high-volume copy or delete operations targeting specific directories using CSV file lists.
        </p>
      </div>

      {/* Tabs Switcher */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-secondary)' }}>
        <button
          type="button"
          onClick={() => handleTabChange('copy')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: 'transparent',
            color: activeMode === 'copy' ? 'var(--accent-blue)' : 'var(--text-tertiary)',
            borderBottom: activeMode === 'copy' ? '2.5px solid var(--accent-blue)' : '2.5px solid transparent',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s ease'
          }}
        >
          <Copy size={15} /> Batch Operation for Copy
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('delete')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: 'transparent',
            color: activeMode === 'delete' ? 'var(--accent-blue)' : 'var(--text-tertiary)',
            borderBottom: activeMode === 'delete' ? '2.5px solid var(--accent-blue)' : '2.5px solid transparent',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s ease'
          }}
        >
          <Trash2 size={15} /> Batch Operation for Delete
        </button>
      </div>

      {loadingConnections ? (
        <div className="glass" style={{ padding: '60px', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <Loader2 size={32} className="animate-spin" color="var(--accent-blue)" />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Loading storage connections...</span>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px', alignItems: 'start' }}>
          {/* LEFT COLUMN: Setup Form */}
          <div className="glass" style={{ padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {activeMode === 'copy' ? (
              // BATCH COPY PANEL FORM
              <>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Copy size={16} /> Batch Copy Configurations
                </h3>

                {/* SOURCE CARD */}
                <div className="card" style={{ padding: '16px', border: '1px solid var(--border-secondary)', background: 'rgba(255,255,255,0.01)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>1. Source Configuration</span>
                  
                  {/* Source type toggles */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleCopySourceTypeChange('GDrive')}
                      style={{ flex: 1, padding: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer', borderRadius: '6px', border: copySourceType === 'GDrive' ? '1.5px solid var(--accent-blue)' : '1px solid var(--border-primary)', background: copySourceType === 'GDrive' ? 'rgba(59,130,246,0.06)' : 'transparent', color: copySourceType === 'GDrive' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    >
                      <HardDrive size={14} /> Google Drive
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopySourceTypeChange('S3')}
                      style={{ flex: 1, padding: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer', borderRadius: '6px', border: copySourceType === 'S3' ? '1.5px solid var(--accent-blue)' : '1px solid var(--border-primary)', background: copySourceType === 'S3' ? 'rgba(59,130,246,0.06)' : 'transparent', color: copySourceType === 'S3' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    >
                      <Database size={14} /> Amazon S3
                    </button>
                  </div>

                  {/* Source connection select */}
                  <select
                    className="select"
                    value={copySourceId || ''}
                    onChange={(e) => {
                      setCopySourceId(e.target.value);
                      setCopySourcePath('');
                      setCopyAnalysisResult(null);
                    }}
                    style={{ fontSize: '13px' }}
                  >
                    {copySourceType === 'GDrive' ? (
                      <>
                        <option value="">Select source connection...</option>
                        <option value="GLOBAL_OAUTH">Global User Account (OAuth2 Token)</option>
                        <optgroup label="Saved Pull Sources">
                          {driveSources
                            .filter((s) => (s.direction || (s.authType === 'OAUTH' ? 'PULL' : 'PUSH')) === 'PULL')
                            .map((s) => (
                              <option key={s.id} value={s.id}>{s.name} {s.drivePath ? `(${s.drivePath})` : ''}</option>
                            ))}
                        </optgroup>
                        <optgroup label="Saved Push Sources">
                          {driveSources
                            .filter((s) => (s.direction || (s.authType === 'OAUTH' ? 'PULL' : 'PUSH')) === 'PUSH')
                            .map((s) => (
                              <option key={s.id} value={s.id}>{s.name} {s.drivePath ? `(${s.drivePath})` : ''}</option>
                            ))}
                        </optgroup>
                      </>
                    ) : (
                      <>
                        <option value="">Select customer bucket...</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>{c.name} ({c.bucketName})</option>
                        ))}
                      </>
                    )}
                  </select>

                  {/* Source path input */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      key="copy-source-path-input"
                      type="text"
                      className="input"
                      placeholder="Source folder sub-path"
                      value={copySourcePath || ''}
                      onChange={(e) => {
                        setCopySourcePath(e.target.value);
                        setCopyAnalysisResult(null);
                      }}
                      style={{ flex: 1, margin: 0, fontSize: '13px', fontFamily: 'monospace' }}
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={!copySourceId}
                      onClick={() => openBrowser('source')}
                      style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                    >
                      <Folder size={14} /> Browse
                    </button>
                  </div>
                </div>

                {/* DESTINATION CARD */}
                <div className="card" style={{ padding: '16px', border: '1px solid var(--border-secondary)', background: 'rgba(255,255,255,0.01)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>2. Destination Configuration</span>
                  
                  {/* Dest type toggles */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleCopyDestTypeChange('GDrive')}
                      style={{ flex: 1, padding: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer', borderRadius: '6px', border: copyDestType === 'GDrive' ? '1.5px solid var(--accent-blue)' : '1px solid var(--border-primary)', background: copyDestType === 'GDrive' ? 'rgba(59,130,246,0.06)' : 'transparent', color: copyDestType === 'GDrive' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    >
                      <HardDrive size={14} /> Google Drive
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyDestTypeChange('S3')}
                      style={{ flex: 1, padding: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer', borderRadius: '6px', border: copyDestType === 'S3' ? '1.5px solid var(--accent-blue)' : '1px solid var(--border-primary)', background: copyDestType === 'S3' ? 'rgba(59,130,246,0.06)' : 'transparent', color: copyDestType === 'S3' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    >
                      <Database size={14} /> Amazon S3
                    </button>
                  </div>

                  {/* Dest connection select */}
                  <select
                    className="select"
                    value={copyDestId || ''}
                    onChange={(e) => {
                      setCopyDestId(e.target.value);
                      setCopyDestPath('');
                      setCopyAnalysisResult(null);
                    }}
                    style={{ fontSize: '13px' }}
                  >
                    {copyDestType === 'GDrive' ? (
                      <>
                        <option value="">Select destination connection...</option>
                        <option value="GLOBAL_OAUTH">Global User Account (OAuth2 Token)</option>
                        <optgroup label="Saved Pull Sources">
                          {driveSources
                            .filter((s) => (s.direction || (s.authType === 'OAUTH' ? 'PULL' : 'PUSH')) === 'PULL')
                            .map((s) => (
                              <option key={s.id} value={s.id}>{s.name} {s.drivePath ? `(${s.drivePath})` : ''}</option>
                            ))}
                        </optgroup>
                        <optgroup label="Saved Push Sources">
                          {driveSources
                            .filter((s) => (s.direction || (s.authType === 'OAUTH' ? 'PULL' : 'PUSH')) === 'PUSH')
                            .map((s) => (
                              <option key={s.id} value={s.id}>{s.name} {s.drivePath ? `(${s.drivePath})` : ''}</option>
                            ))}
                        </optgroup>
                      </>
                    ) : (
                      <>
                        <option value="">Select customer bucket...</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>{c.name} ({c.bucketName})</option>
                        ))}
                      </>
                    )}
                  </select>

                  {/* Dest path input */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      key="copy-dest-path-input"
                      type="text"
                      className="input"
                      placeholder="Destination folder sub-path"
                      value={copyDestPath || ''}
                      onChange={(e) => {
                        setCopyDestPath(e.target.value);
                        setCopyAnalysisResult(null);
                      }}
                      style={{ flex: 1, margin: 0, fontSize: '13px', fontFamily: 'monospace' }}
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={!copyDestId}
                      onClick={() => openBrowser('dest')}
                      style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                    >
                      <Folder size={14} /> Browse
                    </button>
                  </div>
                </div>

                {/* MODE OPTIONS: All Objects & Sync checkboxes */}
                <div className="card" style={{ padding: '16px', border: '1px solid var(--border-secondary)', background: 'rgba(255,255,255,0.01)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>3. Operation Mode</span>
                  
                  {/* All Objects checkbox */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: copyAllObjects ? 'rgba(59, 130, 246, 0.06)' : 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: copyAllObjects ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid var(--border-primary)', transition: 'all 0.2s ease' }}>
                    <input
                      id="copy-all-objects"
                      type="checkbox"
                      checked={copyAllObjects}
                      onChange={(e) => {
                        setCopyAllObjects(e.target.checked);
                        if (!e.target.checked) {
                          setCopySyncMode(false);
                        }
                        setCopyAnalysisResult(null);
                        setCopySyncAnalysisResult(null);
                        setCopyConfirmedSafety(false);
                      }}
                      style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--accent-blue)' }}
                    />
                    <label htmlFor="copy-all-objects" style={{ fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', flex: 1 }}>
                      <strong style={{ color: 'var(--text-primary)' }}><Layers size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />All Objects</strong>
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Copy all objects from source folder — no CSV file required</span>
                    </label>
                  </div>

                  {/* Sync checkbox (only enabled when All Objects is checked) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: copySyncMode ? 'rgba(245, 158, 11, 0.06)' : 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: copySyncMode ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--border-primary)', opacity: copyAllObjects ? 1 : 0.5, transition: 'all 0.2s ease' }}>
                    <input
                      id="copy-sync-mode"
                      type="checkbox"
                      checked={copySyncMode}
                      disabled={!copyAllObjects}
                      onChange={(e) => {
                        setCopySyncMode(e.target.checked);
                        setCopyAnalysisResult(null);
                        setCopySyncAnalysisResult(null);
                        setCopyConfirmedSafety(false);
                      }}
                      style={{ cursor: copyAllObjects ? 'pointer' : 'not-allowed', width: '16px', height: '16px', accentColor: 'var(--accent-amber)' }}
                    />
                    <label htmlFor="copy-sync-mode" style={{ fontSize: '12px', color: copyAllObjects ? 'var(--text-secondary)' : 'var(--text-muted)', cursor: copyAllObjects ? 'pointer' : 'not-allowed', userSelect: 'none', flex: 1 }}>
                      <strong style={{ color: copyAllObjects ? 'var(--text-primary)' : 'var(--text-muted)' }}><RefreshCw size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Sync Mode</strong>
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Mirror source → destination (copies missing + deletes extras from dest)</span>
                    </label>
                  </div>

                  {copySyncMode && (
                    <div style={{ padding: '8px 12px', background: 'rgba(245, 158, 11, 0.05)', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.15)', fontSize: '11px', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertTriangle size={14} />
                      <span>Sync mode will <strong>delete files from destination</strong> that don't exist in source. Review the report before executing.</span>
                    </div>
                  )}
                </div>

                {/* CSV UPLOAD — hidden when All Objects is checked */}
                {!copyAllObjects && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Upload Object Names CSV List</label>
                    <div style={{ border: '1.5px dashed var(--border-primary)', borderRadius: '10px', padding: '24px 16px', textAlign: 'center', background: 'rgba(255,255,255,0.01)', cursor: 'pointer', position: 'relative' }}>
                      <input key="copy-file-input" type="file" accept=".csv,text/csv" onChange={handleCopyFileChange} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <Upload size={24} color="var(--text-tertiary)" />
                        {copyCsvFile ? (
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-blue)' }}>{copyCsvFile.name} ({(copyCsvFile.size / 1024).toFixed(1)} KB)</span>
                        ) : (
                          <>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Drag & drop CSV or click to browse</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Files listed in the CSV will be copied</span>
                          </>
                        )}
                      </div>
                    </div>
                    {copyCsvError && <span style={{ fontSize: '11px', color: 'var(--accent-red)', marginTop: '4px' }}>⚠️ {copyCsvError}</span>}
                  </div>
                )}

                {/* All Objects info badge */}
                {copyAllObjects && !copySyncMode && (
                  <div style={{ padding: '12px 16px', background: 'rgba(59, 130, 246, 0.04)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.15)', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Layers size={16} color="var(--accent-blue)" />
                    <span>All files from the source folder will be included. Click <strong>Analyze</strong> to list all objects.</span>
                  </div>
                )}

                {/* Ignore extension checkbox */}
                {!copyAnalysisResult && !copySyncAnalysisResult && (copySyncMode || (!copyAllObjects && copyParsedPaths.length > 0)) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid var(--border-primary)', marginTop: '4px' }}>
                    <input
                      key="copy-ignore-ext-checkbox"
                      id="copy-ignore-ext"
                      type="checkbox"
                      checked={copyIgnoreExtension}
                      onChange={(e) => setCopyIgnoreExtension(e.target.checked)}
                      style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                    />
                    <label htmlFor="copy-ignore-ext" style={{ fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                      <strong>Ignore file extensions</strong> (Match object names excluding extensions, size, or date)
                    </label>
                  </div>
                )}

                {/* Phase 1 Copy Button: Analyze */}
                {(copyAllObjects || copyParsedPaths.length > 0) && !copyAnalysisResult && !copySyncAnalysisResult && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleAnalyzeCopy}
                    disabled={copyAnalyzing}
                    style={{ background: copySyncMode ? 'linear-gradient(135deg, var(--accent-amber), #d97706)' : 'linear-gradient(135deg, var(--accent-blue), #1d4ed8)', border: 'none', color: '#fff', fontWeight: 600, fontSize: '14px', padding: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: copyAnalyzing ? 'default' : 'pointer' }}
                  >
                    {copyAnalyzing ? (
                      <><Loader2 size={16} className="animate-spin" /> {copySyncMode ? 'Comparing source & destination...' : 'Fetching source objects...'}</>
                    ) : (
                      <><Play size={16} /> {copySyncMode ? 'Analyze Sync Differences' : copyAllObjects ? 'Analyze All Source Objects' : 'Analyze Source Folder & Sync Check'}</>
                    )}
                  </button>
                )}

                {/* Safety Warning Confirmation — Standard Copy (CSV or All Objects) */}
                {copyAnalysisResult && copyAnalysisResult.matchedCount > 0 && (
                  <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <input key="safety-copy-checkbox" id="safety-copy-checkbox" type="checkbox" checked={copyConfirmedSafety} onChange={(e) => setCopyConfirmedSafety(e.target.checked)} style={{ marginTop: '3px', cursor: 'pointer' }} />
                    <label htmlFor="safety-copy-checkbox" style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5', cursor: 'pointer' }}>
                      <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '2px' }}>Copy Confirmation</strong>
                      I confirm that I want to copy these {copyAnalysisResult.matchedCount} objects into the destination folder. No other data in source will be altered.
                    </label>
                  </div>
                )}

                {/* Safety Warning Confirmation — Sync Mode */}
                {copySyncAnalysisResult && (copySyncAnalysisResult.toCopyCount > 0 || copySyncAnalysisResult.toDeleteCount > 0) && (
                  <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <input key="safety-sync-checkbox" id="safety-sync-checkbox" type="checkbox" checked={copyConfirmedSafety} onChange={(e) => setCopyConfirmedSafety(e.target.checked)} style={{ marginTop: '3px', cursor: 'pointer' }} />
                    <label htmlFor="safety-sync-checkbox" style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5', cursor: 'pointer' }}>
                      <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '2px' }}>⚠️ Sync Confirmation (Destructive)</strong>
                      I confirm this sync will <strong>copy {copySyncAnalysisResult.toCopyCount} files</strong> to destination and <strong>permanently delete {copySyncAnalysisResult.toDeleteCount} files</strong> from destination. This cannot be undone.
                    </label>
                  </div>
                )}

                {/* Phase 2: Execute Button — Standard Copy */}
                {copyAnalysisResult && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {copyAnalysisResult.matchedCount > 0 && (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={handleExecuteCopy}
                        disabled={copyRunning || !copyConfirmedSafety}
                        style={{ flex: 1, background: copyConfirmedSafety ? 'linear-gradient(135deg, var(--accent-emerald), #047857)' : 'var(--border-primary)', border: 'none', color: '#fff', fontWeight: 600, fontSize: '14px', padding: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: copyConfirmedSafety && !copyRunning ? 1 : 0.6, cursor: copyConfirmedSafety && !copyRunning ? 'pointer' : 'default' }}
                      >
                        {copyRunning ? (
                          <><Loader2 size={16} className="animate-spin" /> Copying Objects...</>
                        ) : (
                          <><Play size={16} /> Start Copy of {copyAnalysisResult.matchedCount} Objects</>
                        )}
                      </button>
                    )}
                    <button type="button" className="btn-secondary" onClick={handleResetCopy} style={{ padding: '12px', borderRadius: '10px' }}>Reset</button>
                  </div>
                )}

                {/* Phase 2: Execute Button — Sync Mode */}
                {copySyncAnalysisResult && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {(copySyncAnalysisResult.toCopyCount > 0 || copySyncAnalysisResult.toDeleteCount > 0) && (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={handleExecuteCopy}
                        disabled={copyRunning || !copyConfirmedSafety}
                        style={{ flex: 1, background: copyConfirmedSafety ? 'linear-gradient(135deg, var(--accent-amber), #d97706)' : 'var(--border-primary)', border: 'none', color: '#fff', fontWeight: 600, fontSize: '14px', padding: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: copyConfirmedSafety && !copyRunning ? 1 : 0.6, cursor: copyConfirmedSafety && !copyRunning ? 'pointer' : 'default' }}
                      >
                        {copyRunning ? (
                          <><Loader2 size={16} className="animate-spin" /> Syncing...</>
                        ) : (
                          <><RefreshCw size={16} /> Execute Sync ({copySyncAnalysisResult.toCopyCount} copy, {copySyncAnalysisResult.toDeleteCount} delete)</>
                        )}
                      </button>
                    )}
                    <button type="button" className="btn-secondary" onClick={handleResetCopy} style={{ padding: '12px', borderRadius: '10px' }}>Reset</button>
                  </div>
                )}
              </>
            ) : (
              // BATCH DELETE PANEL FORM
              <>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Trash2 size={16} /> Batch Deletion Configurations
                </h3>

                {/* Storage Type Toggles */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Storage Location Type</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => handleDeleteStorageTypeChange('GDrive')}
                      style={{ padding: '12px', borderRadius: '10px', border: deleteStorageType === 'GDrive' ? '1px solid var(--accent-blue)' : '1px solid var(--border-primary)', background: deleteStorageType === 'GDrive' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255,255,255,0.01)', color: deleteStorageType === 'GDrive' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', transition: 'all 0.15s ease' }}
                    >
                      <HardDrive size={16} /> Google Drive
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteStorageTypeChange('S3')}
                      style={{ padding: '12px', borderRadius: '10px', border: deleteStorageType === 'S3' ? '1px solid var(--accent-blue)' : '1px solid var(--border-primary)', background: deleteStorageType === 'S3' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255,255,255,0.01)', color: deleteStorageType === 'S3' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', transition: 'all 0.15s ease' }}
                    >
                      <Database size={16} /> Amazon S3
                    </button>
                  </div>
                </div>

                {/* Storage Connection Dropdown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="delete-storage-connection" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Storage Connection</label>
                  <select
                    id="delete-storage-connection"
                    className="select"
                    value={deleteStorageId || ''}
                    onChange={(e) => {
                      setDeleteStorageId(e.target.value);
                      setDeletePath('');
                      setDeleteAnalysisResult(null);
                    }}
                    style={{ fontSize: '13px' }}
                  >
                    {deleteStorageType === 'GDrive' ? (
                      <>
                        <option value="">Select source connection...</option>
                        <option value="GLOBAL_OAUTH">Global User Account (OAuth2 Token)</option>
                        <optgroup label="Saved Pull Sources">
                          {driveSources
                            .filter((s) => (s.direction || (s.authType === 'OAUTH' ? 'PULL' : 'PUSH')) === 'PULL')
                            .map((s) => (
                              <option key={s.id} value={s.id}>{s.name} {s.drivePath ? `(${s.drivePath})` : ''}</option>
                            ))}
                        </optgroup>
                        <optgroup label="Saved Push Sources">
                          {driveSources
                            .filter((s) => (s.direction || (s.authType === 'OAUTH' ? 'PULL' : 'PUSH')) === 'PUSH')
                            .map((s) => (
                              <option key={s.id} value={s.id}>{s.name} {s.drivePath ? `(${s.drivePath})` : ''}</option>
                            ))}
                        </optgroup>
                      </>
                    ) : (
                      <>
                        <option value="">Select customer bucket...</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>{c.name} ({c.bucketName})</option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                {/* Folder Path Target & Browser */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="delete-target-path" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Relative Folder Path</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      key="delete-path-input"
                      id="delete-target-path"
                      className="input"
                      type="text"
                      placeholder="/ (Root folder or sub-path)"
                      value={deletePath || ''}
                      onChange={(e) => {
                        setDeletePath(e.target.value);
                        setDeleteAnalysisResult(null);
                      }}
                      style={{ flex: 1, margin: 0, fontSize: '13px', fontFamily: 'monospace' }}
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={!deleteStorageId}
                      onClick={() => openBrowser('source')}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                    >
                      <Folder size={14} /> Browse
                    </button>
                  </div>
                </div>

                {/* CSV File Upload Selection */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Upload Object Names CSV List</label>
                  <div style={{ border: '1.5px dashed var(--border-primary)', borderRadius: '10px', padding: '24px 16px', textAlign: 'center', background: 'rgba(255,255,255,0.01)', cursor: 'pointer', position: 'relative' }}>
                    <input key="delete-file-input" type="file" accept=".csv,text/csv" onChange={handleDeleteFileChange} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <Upload size={24} color="var(--text-tertiary)" />
                      {deleteCsvFile ? (
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-blue)' }}>{deleteCsvFile.name} ({(deleteCsvFile.size / 1024).toFixed(1)} KB)</span>
                      ) : (
                        <>
                          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Drag & drop CSV or click to browse</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Files listed in the CSV will be deleted</span>
                        </>
                      )}
                    </div>
                  </div>
                  {deleteCsvError && <span style={{ fontSize: '11px', color: 'var(--accent-red)', marginTop: '4px' }}>⚠️ {deleteCsvError}</span>}
                </div>

                {/* Ignore extension checkbox */}
                {deleteParsedPaths.length > 0 && !deleteAnalysisResult && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid var(--border-primary)', marginTop: '4px' }}>
                    <input
                      key="delete-ignore-ext-checkbox"
                      id="delete-ignore-ext"
                      type="checkbox"
                      checked={deleteIgnoreExtension}
                      onChange={(e) => setDeleteIgnoreExtension(e.target.checked)}
                      style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                    />
                    <label htmlFor="delete-ignore-ext" style={{ fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                      <strong>Ignore file extensions</strong> (Match object names excluding extensions)
                    </label>
                  </div>
                )}

                {/* Phase 1 Delete Button: Analyze Matched Objects */}
                {deleteParsedPaths.length > 0 && !deleteAnalysisResult && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleAnalyzeDelete}
                    disabled={deleteAnalyzing}
                    style={{ background: 'linear-gradient(135deg, var(--accent-blue), #1d4ed8)', border: 'none', color: '#fff', fontWeight: 600, fontSize: '14px', padding: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', gap: '8px', cursor: deleteAnalyzing ? 'default' : 'pointer' }}
                  >
                    {deleteAnalyzing ? (
                      <><Loader2 size={16} className="animate-spin" /> Analyzing target directory...</>
                    ) : (
                      <><Play size={16} /> Analyze Target Folder & Sync Check</>
                    )}
                  </button>
                )}

                {/* Safety Warning Confirmation Checklist */}
                {deleteAnalysisResult && deleteAnalysisResult.matchedCount > 0 && (
                  <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <input key="safety-delete-checkbox" id="safety-delete-checkbox" type="checkbox" checked={deleteConfirmedSafety} onChange={(e) => setDeleteConfirmedSafety(e.target.checked)} style={{ marginTop: '3px', cursor: 'pointer' }} />
                    <label htmlFor="safety-delete-checkbox" style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5', cursor: 'pointer' }}>
                      <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '2px' }}>Safety Warning & Confirmation</strong>
                      I understand that this action will permanently delete these {deleteAnalysisResult.matchedCount} matching objects from the target directory. This operation cannot be undone.
                    </label>
                  </div>
                )}

                {/* Phase 2: Delete Run Button */}
                {deleteAnalysisResult && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {deleteAnalysisResult.matchedCount > 0 && (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={handleExecuteDelete}
                        disabled={deleteRunning || !deleteConfirmedSafety}
                        style={{ flex: 1, background: deleteConfirmedSafety ? 'linear-gradient(135deg, var(--accent-red), #b91c1c)' : 'var(--border-primary)', border: 'none', color: '#fff', fontWeight: 600, fontSize: '14px', padding: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: deleteConfirmedSafety && !deleteRunning ? 1 : 0.6, cursor: deleteConfirmedSafety && !deleteRunning ? 'pointer' : 'default' }}
                      >
                        {deleteRunning ? (
                          <><Loader2 size={16} className="animate-spin" /> Deleting Matches...</>
                        ) : (
                          <><Trash2 size={16} /> Delete {deleteAnalysisResult.matchedCount} Matched Objects</>
                        )}
                      </button>
                    )}
                    <button type="button" className="btn-secondary" onClick={handleResetDelete} style={{ padding: '12px', borderRadius: '10px' }}>Reset</button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* RIGHT COLUMN: Previews & Results */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Active Persistent Transfer Task Progress Card */}
            {activeTransfer && (
              <div className="glass" style={{ padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '16px', border: activeTransfer.status === 'RUNNING' ? '1px solid var(--accent-blue)' : activeTransfer.status === 'COMPLETED' ? '1px solid var(--accent-emerald)' : '1px solid var(--border-primary)', background: activeTransfer.status === 'RUNNING' ? 'rgba(59, 130, 246, 0.03)' : 'rgba(255,255,255,0.01)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: activeTransfer.status === 'RUNNING' ? 'rgba(59, 130, 246, 0.1)' : activeTransfer.status === 'COMPLETED' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Activity size={20} color={activeTransfer.status === 'RUNNING' ? 'var(--accent-blue)' : activeTransfer.status === 'COMPLETED' ? 'var(--accent-emerald)' : 'var(--text-secondary)'} className={activeTransfer.status === 'RUNNING' ? 'animate-spin' : ''} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {activeTransfer.name || 'Batch Operation Task'}
                      </h3>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Task ID: <code style={{ fontFamily: 'monospace', color: 'var(--accent-blue)' }}>{activeTransfer.id}</code>
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', background: getStatusBgColor(activeTransfer.status), color: '#fff' }}>
                      {activeTransfer.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTransfer(null);
                        setActiveTransferId(null);
                        localStorage.removeItem('batch_active_transfer_id');
                      }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px', padding: '4px' }}
                      title="Clear from view"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Progress Bar & Counters */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <span>Processed: <strong>{activeTransfer.transferredFiles || 0}</strong> of <strong>{activeTransfer.totalFiles || 0}</strong> files{activeTransfer.failedFiles > 0 ? ` (${activeTransfer.failedFiles} failed)` : ''}</span>
                    <strong style={{ color: activeTransfer.status === 'COMPLETED' ? 'var(--accent-emerald)' : 'var(--accent-blue)' }}>
                      {activeTransfer.totalFiles ? Math.round(((activeTransfer.transferredFiles || 0) / activeTransfer.totalFiles) * 100) : 0}%
                    </strong>
                  </div>
                  <div style={{ height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, activeTransfer.totalFiles ? Math.round(((activeTransfer.transferredFiles || 0) / activeTransfer.totalFiles) * 100) : 0)}%`,
                        background: activeTransfer.status === 'FAILED' ? 'var(--accent-red)' : activeTransfer.status === 'COMPLETED' ? 'var(--accent-emerald)' : 'linear-gradient(90deg, var(--accent-blue), #60a5fa)',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
            {/* Run Response Report Summary Box */}
            {activeMode === 'copy' && copyResult && (
              <div className="glass" style={{ padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '16px', border: copyResult.failures.length > 0 ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: copyResult.failures.length > 0 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {copyResult.failures.length > 0 ? <AlertTriangle size={20} color="var(--accent-amber)" /> : <CheckCircle2 size={20} color="var(--accent-emerald)" />}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {copyResult.failures.length > 0 ? 'Copy Completed with Errors' : 'Batch Copy Completed'}
                    </h3>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Synced matched objects successfully</p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: copyResult.deletedCount != null && copyResult.deletedCount > 0 ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: '12px', background: 'rgba(255,255,255,0.01)', padding: '12px', borderRadius: '10px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total</span>
                    <h4 style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px' }}>{copyResult.total}</h4>
                  </div>
                  <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-secondary)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Copied</span>
                    <h4 style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px', color: 'var(--accent-emerald)' }}>{copyResult.copiedCount}</h4>
                  </div>
                  {copyResult.deletedCount != null && copyResult.deletedCount > 0 && (
                    <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-secondary)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Deleted</span>
                      <h4 style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px', color: 'var(--accent-amber)' }}>{copyResult.deletedCount}</h4>
                    </div>
                  )}
                  <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-secondary)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Failed</span>
                    <h4 style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px', color: copyResult.failedCount > 0 ? 'var(--accent-red)' : 'inherit' }}>{copyResult.failedCount}</h4>
                  </div>
                </div>

                {copyResult.failures.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Failures ({copyResult.failedCount})</span>
                    <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-primary)', borderRadius: '8px', fontSize: '12px', background: 'rgba(255,255,255,0.01)' }}>
                      {copyResult.failures.map((f, idx) => (
                        <div key={idx} style={{ padding: '8px 12px', borderBottom: idx === copyResult.failures.length - 1 ? 'none' : '1px solid var(--border-secondary)' }}>
                          <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)', wordBreak: 'break-all', display: 'block' }}>{f.path}</span>
                          <span style={{ color: 'var(--accent-red)', fontSize: '10px', marginTop: '2px', display: 'block' }}>{f.error}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeMode === 'delete' && deleteResult && (
              <div className="glass" style={{ padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '16px', border: deleteResult.failures.length > 0 ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: deleteResult.failures.length > 0 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {deleteResult.failures.length > 0 ? <AlertTriangle size={20} color="var(--accent-amber)" /> : <CheckCircle2 size={20} color="var(--accent-emerald)" />}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {deleteResult.failures.length > 0 ? 'Delete Completed with Errors' : 'Batch Deletion Completed'}
                    </h3>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Processed batch successfully</p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', background: 'rgba(255,255,255,0.01)', padding: '12px', borderRadius: '10px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Input Size</span>
                    <h4 style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px' }}>{deleteResult.total}</h4>
                  </div>
                  <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-secondary)', borderRight: '1px solid var(--border-secondary)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Deleted</span>
                    <h4 style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px', color: 'var(--accent-emerald)' }}>{deleteResult.deletedCount}</h4>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Failed</span>
                    <h4 style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px', color: deleteResult.failedCount > 0 ? 'var(--accent-red)' : 'inherit' }}>{deleteResult.failedCount}</h4>
                  </div>
                </div>

                {deleteResult.failures.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Deletion Failures ({deleteResult.failedCount})</span>
                    <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-primary)', borderRadius: '8px', fontSize: '12px', background: 'rgba(255,255,255,0.01)' }}>
                      {deleteResult.failures.map((f, idx) => (
                        <div key={idx} style={{ padding: '8px 12px', borderBottom: idx === deleteResult.failures.length - 1 ? 'none' : '1px solid var(--border-secondary)' }}>
                          <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)', wordBreak: 'break-all', display: 'block' }}>{f.path}</span>
                          <span style={{ color: 'var(--accent-red)', fontSize: '10px', marginTop: '2px', display: 'block' }}>Reason: {f.error}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Error Message Box */}
            {errorMsg && (
              <div className="glass" style={{ padding: '20px', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.02)', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <XCircle size={20} color="var(--accent-red)" style={{ marginTop: '2px' }} />
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Batch Operation Error</h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.5' }}>{errorMsg}</p>
                </div>
              </div>
            )}

            {/* Paths Preview/Analysis Report */}
            {((activeMode === 'copy' ? (copyParsedPaths.length > 0 || copyAnalysisResult || copySyncAnalysisResult) : deleteParsedPaths.length > 0)) && (
              <div className="glass" style={{ padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '560px', minHeight: '340px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileSpreadsheet size={16} color={copySyncAnalysisResult ? 'var(--accent-amber)' : 'var(--accent-blue)'} /> Pre-Execution {copySyncAnalysisResult ? 'Sync' : ''} Report
                </h3>

                {/* Sync Summary Stats */}
                {copySyncAnalysisResult && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.04)', border: '1px solid rgba(59, 130, 246, 0.12)', textAlign: 'center' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Source</span>
                      <h4 style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px', color: 'var(--text-primary)' }}>{copySyncAnalysisResult.sourceTotal}</h4>
                    </div>
                    <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.04)', border: '1px solid rgba(59, 130, 246, 0.12)', textAlign: 'center' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Destination</span>
                      <h4 style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px', color: 'var(--text-primary)' }}>{copySyncAnalysisResult.destTotal}</h4>
                    </div>
                    <div style={{ padding: '10px', borderRadius: '8px', background: copySyncAnalysisResult.alreadySyncedCount === copySyncAnalysisResult.sourceTotal && copySyncAnalysisResult.toDeleteCount === 0 ? 'rgba(16, 185, 129, 0.06)' : 'rgba(245, 158, 11, 0.06)', border: copySyncAnalysisResult.alreadySyncedCount === copySyncAnalysisResult.sourceTotal && copySyncAnalysisResult.toDeleteCount === 0 ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(245, 158, 11, 0.2)', textAlign: 'center' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Status</span>
                      <h4 style={{ fontSize: '13px', fontWeight: 700, marginTop: '2px', color: copySyncAnalysisResult.alreadySyncedCount === copySyncAnalysisResult.sourceTotal && copySyncAnalysisResult.toDeleteCount === 0 ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>
                        {copySyncAnalysisResult.alreadySyncedCount === copySyncAnalysisResult.sourceTotal && copySyncAnalysisResult.toDeleteCount === 0 ? '✓ In Sync' : '⚡ Needs Sync'}
                      </h4>
                    </div>
                  </div>
                )}

                {activeMode === 'copy' ? (
                  // COPY PREVIEW TAB NAVIGATION
                  copySyncAnalysisResult ? (
                    // SYNC MODE TABS
                    <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-secondary)', overflowX: 'auto', paddingBottom: '6px' }}>
                      <button type="button" onClick={() => setCopyPreviewTab('toCopy')} style={{ padding: '8px 12px', border: 'none', background: 'transparent', color: copyPreviewTab === 'toCopy' ? 'var(--accent-emerald)' : 'var(--text-muted)', borderBottom: copyPreviewTab === 'toCopy' ? '2.5px solid var(--accent-emerald)' : '2.5px solid transparent', fontWeight: 600, fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        📥 To Copy ({copySyncAnalysisResult.toCopyCount})
                      </button>
                      <button type="button" onClick={() => setCopyPreviewTab('toDelete')} style={{ padding: '8px 12px', border: 'none', background: 'transparent', color: copyPreviewTab === 'toDelete' ? 'var(--accent-red)' : 'var(--text-muted)', borderBottom: copyPreviewTab === 'toDelete' ? '2.5px solid var(--accent-red)' : '2.5px solid transparent', fontWeight: 600, fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        🗑️ To Delete ({copySyncAnalysisResult.toDeleteCount})
                      </button>
                      <button type="button" onClick={() => setCopyPreviewTab('alreadySynced')} style={{ padding: '8px 12px', border: 'none', background: 'transparent', color: copyPreviewTab === 'alreadySynced' ? 'var(--accent-blue)' : 'var(--text-muted)', borderBottom: copyPreviewTab === 'alreadySynced' ? '2.5px solid var(--accent-blue)' : '2.5px solid transparent', fontWeight: 600, fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        ✅ Already Synced ({copySyncAnalysisResult.alreadySyncedCount})
                      </button>
                      <button type="button" onClick={() => setCopyPreviewTab('allSource')} style={{ padding: '8px 12px', border: 'none', background: 'transparent', color: copyPreviewTab === 'allSource' ? 'var(--text-tertiary)' : 'var(--text-muted)', borderBottom: copyPreviewTab === 'allSource' ? '2.5px solid var(--text-tertiary)' : '2.5px solid transparent', fontWeight: 600, fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        📋 All Source ({copySyncAnalysisResult.sourceTotal})
                      </button>
                    </div>
                  ) : copyAnalysisResult ? (
                    // STANDARD COPY TABS (CSV or All Objects)
                    <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-secondary)', overflowX: 'auto', paddingBottom: '6px' }}>
                      <button type="button" onClick={() => setCopyPreviewTab('matched')} style={{ padding: '8px 12px', border: 'none', background: 'transparent', color: copyPreviewTab === 'matched' ? 'var(--accent-emerald)' : 'var(--text-muted)', borderBottom: copyPreviewTab === 'matched' ? '2.5px solid var(--accent-emerald)' : '2.5px solid transparent', fontWeight: 600, fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {copyAllObjects ? `All Source Objects (${copyAnalysisResult.matchedCount})` : `Matched in Source (${copyAnalysisResult.matchedCount})`}
                      </button>
                      {!copyAllObjects && (
                        <>
                          <button type="button" onClick={() => setCopyPreviewTab('missing')} style={{ padding: '8px 12px', border: 'none', background: 'transparent', color: copyPreviewTab === 'missing' ? 'var(--accent-red)' : 'var(--text-muted)', borderBottom: copyPreviewTab === 'missing' ? '2.5px solid var(--accent-red)' : '2.5px solid transparent', fontWeight: 600, fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            Missing in Source ({copyAnalysisResult.missingCount})
                          </button>
                          <button type="button" onClick={() => setCopyPreviewTab('csv')} style={{ padding: '8px 12px', border: 'none', background: 'transparent', color: copyPreviewTab === 'csv' ? 'var(--accent-blue)' : 'var(--text-muted)', borderBottom: copyPreviewTab === 'csv' ? '2.5px solid var(--accent-blue)' : '2.5px solid transparent', fontWeight: 600, fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            All CSV Paths ({copyAnalysisResult.total})
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.01)', borderRadius: '8px', border: '1px dashed var(--border-primary)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      ℹ️ CSV has <strong>{copyParsedPaths.length}</strong> paths. Run analysis to verify existing folder items.
                    </div>
                  )
                ) : (
                  // DELETE PREVIEW TAB NAVIGATION
                  deleteAnalysisResult ? (
                    <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-secondary)', overflowX: 'auto', paddingBottom: '6px' }}>
                      <button type="button" onClick={() => setDeletePreviewTab('matched')} style={{ padding: '8px 12px', border: 'none', background: 'transparent', color: deletePreviewTab === 'matched' ? 'var(--accent-red)' : 'var(--text-muted)', borderBottom: deletePreviewTab === 'matched' ? '2.5px solid var(--accent-red)' : '2.5px solid transparent', fontWeight: 600, fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        Matched in Folder ({deleteAnalysisResult.matchedCount})
                      </button>
                      <button type="button" onClick={() => setDeletePreviewTab('missing')} style={{ padding: '8px 12px', border: 'none', background: 'transparent', color: deletePreviewTab === 'missing' ? 'var(--text-tertiary)' : 'var(--text-muted)', borderBottom: deletePreviewTab === 'missing' ? '2.5px solid var(--text-tertiary)' : '2.5px solid transparent', fontWeight: 600, fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        Missing in Folder ({deleteAnalysisResult.missingCount})
                      </button>
                      <button type="button" onClick={() => setDeletePreviewTab('csv')} style={{ padding: '8px 12px', border: 'none', background: 'transparent', color: deletePreviewTab === 'csv' ? 'var(--accent-blue)' : 'var(--text-muted)', borderBottom: deletePreviewTab === 'csv' ? '2.5px solid var(--accent-blue)' : '2.5px solid transparent', fontWeight: 600, fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        All CSV Paths ({deleteAnalysisResult.total})
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.01)', borderRadius: '8px', border: '1px dashed var(--border-primary)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      ℹ️ CSV has <strong>{deleteParsedPaths.length}</strong> paths. Run Sync Check to verify existing folder items.
                    </div>
                  )
                )}

                {/* Filter preview input */}
                <div style={{ position: 'relative' }}>
                  <input
                    key="preview-search-input"
                    type="text"
                    placeholder="Filter preview items..."
                    className="input"
                    value={previewSearch || ''}
                    onChange={(e) => setPreviewSearch(e.target.value)}
                    style={{ paddingLeft: '32px', margin: 0, fontSize: '12px' }}
                  />
                  <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                </div>

                <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-primary)', borderRadius: '10px', background: 'rgba(255,255,255,0.01)' }}>
                  {filteredPreviewPaths.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                      No matching paths found.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <tbody>
                        {filteredPreviewPaths.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: idx === filteredPreviewPaths.length - 1 ? 'none' : '1px solid var(--border-secondary)' }}>
                            <td style={{ padding: '8px 12px', color: 'var(--text-muted)', width: '40px' }}>{idx + 1}</td>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: 'var(--text-primary)', wordBreak: 'break-all' }}>{item}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Directory Browser Modal */}
      {isBrowserOpen && (activeBrowser.type === 'S3' ? getSelectedCustomer(activeBrowser.id) : getSelectedSource(activeBrowser.id)) && (
        <FolderBrowser
          isOpen={isBrowserOpen}
          onClose={() => setIsBrowserOpen(false)}
          onSelect={(selectedPath) => {
            const isGDrive = activeBrowser.type === 'GDrive';

            if (isGDrive) {
              const cleanPath = selectedPath.replace(/^\//, '').replace(/\/+$/, '');
              const drivePath = getSelectedSource(activeBrowser.id)?.drivePath?.replace(/^\//, '').replace(/\/+$/, '') || '';
              
              if (drivePath && (cleanPath === drivePath || cleanPath.startsWith(drivePath + '/'))) {
                const relativePath = cleanPath === drivePath ? '' : cleanPath.substring(drivePath.length + 1);
                if (activeMode === 'copy') {
                  if (browserMode === 'source') setCopySourcePath(relativePath);
                  else setCopyDestPath(relativePath);
                } else {
                  setDeletePath(relativePath);
                }
              } else {
                if (activeMode === 'copy') {
                  if (browserMode === 'source') setCopySourcePath(cleanPath);
                  else setCopyDestPath(cleanPath);
                } else {
                  setDeletePath(cleanPath);
                }
              }
            } else {
              if (activeMode === 'copy') {
                if (browserMode === 'source') setCopySourcePath(selectedPath);
                else setCopyDestPath(selectedPath);
              } else {
                setDeletePath(selectedPath);
              }
            }
            if (activeMode === 'copy') setCopyAnalysisResult(null);
            else setDeleteAnalysisResult(null);
          }}
          type={activeBrowser.type === 'GDrive' ? 'gdrive' : 's3'}
          initialPath={
            activeBrowser.type === 'GDrive'
              ? (() => {
                  const drivePath = getSelectedSource(activeBrowser.id)?.drivePath?.replace(/^\//, '').replace(/\/+$/, '') || '';
                  const startPath = activeBrowser.pathStr.replace(/^\//, '').replace(/\/+$/, '');
                  return drivePath ? (startPath ? `${drivePath}/${startPath}` : drivePath) : startPath;
                })()
              : activeBrowser.pathStr
          }
          s3Params={
            activeBrowser.type === 'S3' && getSelectedCustomer(activeBrowser.id)
              ? {
                  roleArn: getSelectedCustomer(activeBrowser.id)!.roleArn,
                  bucketName: getSelectedCustomer(activeBrowser.id)!.bucketName,
                  region: getSelectedCustomer(activeBrowser.id)!.region,
                  externalId: getSelectedCustomer(activeBrowser.id)!.externalId || undefined,
                }
              : undefined
          }
          gdriveAuthType={activeBrowser.type === 'GDrive' && getSelectedSource(activeBrowser.id) ? getSelectedSource(activeBrowser.id)!.authType : undefined}
          sharedDriveId={activeBrowser.type === 'GDrive' && getSelectedSource(activeBrowser.id)?.driveType === 'SHARED_DRIVE' ? getSelectedSource(activeBrowser.id)!.sharedDriveId : undefined}
        />
      )}
    </div>
  );
}
