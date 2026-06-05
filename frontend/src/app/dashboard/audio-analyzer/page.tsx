'use client';

import { useEffect, useState, useMemo } from 'react';
import { customersApi, gdriveApi, wavCalculationsApi } from '@/lib/api-client';
import { Volume2, FolderOpen, Loader2, Info, Search, ArrowUpDown, FileAudio, History, Trash2, X } from 'lucide-react';
import FolderBrowser from '@/components/FolderBrowser';

interface WavFileDetails {
  name: string;
  path: string;
  size: number;
  duration: number;
}

interface CalculationResult {
  id?: string;
  name?: string;
  storageType?: string;
  targetPath?: string;
  sourceName?: string;
  status?: string;
  progressScanned?: number;
  progressTotal?: number;
  currentFile?: string;
  errorMessage?: string | null;
  totalDuration: number;
  wavCount: number;
  files: WavFileDetails[];
  skippedCount: number;
  createdAt?: string;
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

  // Duration filter state
  const [durationFilter, setDurationFilter] = useState<'all' | '15m' | '30m' | 'custom'>('all');
  const [customMin, setCustomMin] = useState<number>(60);

  // Calculation Name state & custom name flag
  const [calculationName, setCalculationName] = useState('');
  const [isCustomName, setIsCustomName] = useState(false);

  // History states
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [viewingHistory, setViewingHistory] = useState(false);

  const selectedCustomer = customers.find((c: any) => c.id === selectedCustomerId);
  const selectedSource = selectedSourceId.startsWith('GLOBAL_')
    ? {
        id: selectedSourceId,
        name: selectedSourceId === 'GLOBAL_SERVICE_ACCOUNT' ? 'Global Service Account' : 'Global User Account',
        authType: selectedSourceId === 'GLOBAL_SERVICE_ACCOUNT' ? 'SERVICE_ACCOUNT' : 'OAUTH',
        drivePath: '',
      }
    : sources.find((s: any) => s.id === selectedSourceId);

  const fetchHistory = async () => {
    try {
      const res = await wavCalculationsApi.list();
      setHistoryList(res.data);
    } catch (err) {
      console.error('Failed to fetch calculation history:', err);
    }
  };

  useEffect(() => {
    Promise.all([
      customersApi.list(),
      gdriveApi.sources(),
    ]).then(([custRes, srcRes]) => {
      setCustomers(custRes.data);
      setSources(srcRes.data);
    });
    fetchHistory();
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

  // Dynamic default name effect
  useEffect(() => {
    if (!isCustomName) {
      const dateStr = new Date().toISOString().split('T')[0];
      const timeStr = new Date().toTimeString().split(' ')[0].substring(0, 5); // HH:MM
      if (type === 'S3') {
        const custName = selectedCustomer ? selectedCustomer.name : '';
        if (custName) {
          const pathSnippet = path ? ` - ${path}` : '';
          setCalculationName(`S3: ${custName}${pathSnippet} (${dateStr} ${timeStr})`);
        } else {
          setCalculationName('');
        }
      } else {
        const srcName = selectedSource ? selectedSource.name : '';
        if (srcName) {
          const pathSnippet = path ? ` - ${path}` : '';
          setCalculationName(`GDrive: ${srcName}${pathSnippet} (${dateStr} ${timeStr})`);
        } else {
          setCalculationName('');
        }
      }
    }
  }, [type, selectedCustomerId, selectedSourceId, path, isCustomName, selectedCustomer, selectedSource]);

  const handleLoadHistory = async (id: string, silent = false) => {
    if (!silent) {
      setError('');
      setLoading(true);
      setResult(null);
    }
    try {
      const res = await wavCalculationsApi.get(id);
      setResult(res.data);
      setViewingHistory(true);
      setSelectedHistoryId(id);
    } catch (err: any) {
      if (!silent) {
        setError(err.message || 'Failed to load historical calculation.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  // Poll active calculations for live progress updates
  useEffect(() => {
    const hasActive = historyList.some((item) => item.status === 'PENDING' || item.status === 'RUNNING');
    if (!hasActive) return;

    const interval = setInterval(() => {
      fetchHistory();
      if (selectedHistoryId) {
        const selectedCalc = historyList.find((item) => item.id === selectedHistoryId);
        if (selectedCalc && (selectedCalc.status === 'PENDING' || selectedCalc.status === 'RUNNING')) {
          handleLoadHistory(selectedHistoryId, true);
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [historyList, selectedHistoryId]);

  const handleDeleteHistory = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this calculation from history?')) {
      return;
    }
    try {
      await wavCalculationsApi.delete(id);
      if (selectedHistoryId === id) {
        setResult(null);
        setViewingHistory(false);
        setSelectedHistoryId(null);
      }
      fetchHistory();
    } catch (err: any) {
      alert(err.message || 'Failed to delete history item.');
    }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setProgress(null);
    setLoading(true);
    setViewingHistory(false);
    setSelectedHistoryId(null);

    try {
      let params: any = {};
      if (type === 'S3') {
        const customer = customers.find((c: any) => c.id === selectedCustomerId);
        if (!customer) throw new Error('Please select a customer first.');

        params = {
          roleArn: customer.roleArn,
          bucketName: customer.bucketName,
          region: customer.region,
          externalId: customer.externalId || null,
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

        params = {
          path: path,
          sharedDriveId: source.sharedDriveId || undefined,
          authType: source.authType,
        };
      }

      const finalName = calculationName.trim() || `Scan on ${new Date().toLocaleString()}`;
      const sourceName = type === 'S3' 
        ? (selectedCustomer ? selectedCustomer.name : 'S3') 
        : (selectedSource ? selectedSource.name : 'GDrive');

      // Create background calculation job
      const res = await wavCalculationsApi.create({
        name: finalName,
        storageType: type,
        targetPath: path,
        sourceName,
        parameters: params,
      });

      await fetchHistory();
      setViewingHistory(true);
      setSelectedHistoryId(res.data.id);
      await handleLoadHistory(res.data.id);
      setIsCustomName(false);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to start audio analysis.');
    } finally {
      setLoading(false);
    }
  };

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

    // Search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      tracks = tracks.filter(
        (t) => t.name.toLowerCase().includes(query) || t.path.toLowerCase().includes(query)
      );
    }

    // Duration filter
    if (durationFilter !== 'all') {
      let limitSeconds = 0;
      if (durationFilter === '15m') limitSeconds = 15 * 60;
      else if (durationFilter === '30m') limitSeconds = 30 * 60;
      else if (durationFilter === 'custom') limitSeconds = customMin * 60;
      
      tracks = tracks.filter((t) => t.duration > limitSeconds);
    }

    // Sort
    tracks.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'path') {
        const pathA = a?.path || '';
        const pathB = b?.path || '';
        comparison = pathA.localeCompare(pathB);
      } else if (sortField === 'size') {
        const sizeA = a?.size || 0;
        const sizeB = b?.size || 0;
        comparison = sizeA - sizeB;
      } else if (sortField === 'duration') {
        const durA = a?.duration || 0;
        const durB = b?.duration || 0;
        comparison = durA - durB;
      }
      return sortAscending ? comparison : -comparison;
    });

    return tracks;
  }, [result, searchQuery, sortField, sortAscending, durationFilter, customMin]);

  const filteredTotalDuration = useMemo(() => {
    return filteredAndSortedTracks.reduce((sum, f) => sum + f.duration, 0);
  }, [filteredAndSortedTracks]);

  const filteredTotalSize = useMemo(() => {
    return filteredAndSortedTracks.reduce((sum, f) => sum + f.size, 0);
  }, [filteredAndSortedTracks]);

  const overallTotalSize = useMemo(() => {
    if (!result?.files) return 0;
    return result.files.reduce((sum, f) => sum + f.size, 0);
  }, [result]);

  const toggleSort = (field: 'path' | 'size' | 'duration') => {
    if (sortField === field) {
      setSortAscending(!sortAscending);
    } else {
      setSortField(field);
      setSortAscending(true);
    }
  };

  // Update document title dynamically based on active calculation and filters
  useEffect(() => {
    if (result?.name) {
      let filterSuffix = '';
      if (durationFilter === 'all') {
        filterSuffix = '_all_tracks';
      } else if (durationFilter === '15m') {
        filterSuffix = '_greater_than_15min';
      } else if (durationFilter === '30m') {
        filterSuffix = '_greater_than_30min';
      } else if (durationFilter === 'custom') {
        filterSuffix = `_greater_than_${customMin}min`;
      }
      
      const rawTitle = `${result.name}${filterSuffix}`;
      // Sanitize the title for filename-safe characters (e.g. replace colons, slashes, etc.)
      const safeTitle = rawTitle.replace(/[\\/:*?"<>|]/g, '_');
      document.title = safeTitle;
    } else {
      document.title = 'Audio Duration Analyzer | DataBridge';
    }
    
    // Cleanup to restore default title on unmount
    return () => {
      document.title = 'DataBridge';
    };
  }, [result?.name, durationFilter, customMin]);

  const handleExportPDF = () => {
    if (!result) return;
    const originalTitle = document.title;
    
    let filterSuffix = '';
    if (durationFilter === 'all') {
      filterSuffix = '_all_tracks';
    } else if (durationFilter === '15m') {
      filterSuffix = '_greater_than_15min';
    } else if (durationFilter === '30m') {
      filterSuffix = '_greater_than_30min';
    } else if (durationFilter === 'custom') {
      filterSuffix = `_greater_than_${customMin}min`;
    }
    
    const rawTitle = `${result.name}${filterSuffix}`;
    const safeTitle = rawTitle.replace(/[\\/:*?"<>|]/g, '_');
    
    document.title = safeTitle;
    
    const restoreTitle = () => {
      document.title = originalTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };
    window.addEventListener('afterprint', restoreTitle);
    
    window.print();
  };

  // Active progress calculations
  const progressPercent = useMemo(() => {
    if (result && (result.status === 'PENDING' || result.status === 'RUNNING')) {
      const scanned = result.progressScanned ?? 0;
      const total = result.progressTotal ?? 0;
      if (total === 0) return 0;
      return Math.round((scanned / total) * 100);
    }
    if (!progress || progress.total === 0) return 0;
    return Math.round((progress.scanned / progress.total) * 100);
  }, [progress, result]);

  return (
    <div className="animate-fadeIn" style={{ maxWidth: '1080px' }}>
      <title>{result?.name ? `${result.name}${
        durationFilter === 'all' ? '_all_tracks' :
        durationFilter === '15m' ? '_greater_than_15min' :
        durationFilter === '30m' ? '_greater_than_30min' :
        `_greater_than_${customMin}min`
      }`.replace(/[\\/:*?"<>|]/g, '_') : 'Audio Duration Analyzer | DataBridge'}</title>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }} className="hide-on-print">
        <Volume2 size={24} color="var(--accent-blue)" />
        Audio Duration Analyzer
      </h1>
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px' }} className="hide-on-print">
        Recursively scan a directory in S3 or Google Drive to sum the total playback duration of all WAV files.
      </p>

      {/* Structured Grid Layout: Left is 340px Fixed Setting, Right is Auto Results */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '32px', alignItems: 'start' }} className="hide-on-print">
        
        {/* Left Input Configuration Column Wrapper */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Analysis Target Form Card */}
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

              {/* Calculation Name / Label */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Calculation Name / Label
                </label>
                <input
                  className="input"
                  placeholder="Enter calculation name..."
                  value={calculationName}
                  onChange={(e) => {
                    setCalculationName(e.target.value);
                    setIsCustomName(true);
                  }}
                  style={{ width: '100%' }}
                />
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

          {/* History Card */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px', maxHeight: '450px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '12px', margin: 0 }}>
              <History size={16} color="var(--accent-blue)" />
              Calculation History
            </h3>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
              {historyList.length > 0 ? (
                historyList.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleLoadHistory(item.id)}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      border: selectedHistoryId === item.id 
                        ? '1px solid var(--accent-blue)' 
                        : '1px solid var(--border-secondary)',
                      background: selectedHistoryId === item.id 
                        ? 'rgba(59,130,246,0.05)' 
                        : 'var(--bg-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                    className="glass-hover"
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={item.name}>
                        {item.name}
                      </span>
                      <button
                        onClick={(e) => handleDeleteHistory(e, item.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-tertiary)',
                          cursor: 'pointer',
                          padding: '2px',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                        className="btn-danger-hover"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      <span style={{ 
                        background: item.storageType === 'S3' ? 'rgba(235,163,0,0.1)' : 'rgba(59,130,246,0.1)',
                        color: item.storageType === 'S3' ? 'var(--accent-orange)' : 'var(--accent-blue)',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        fontWeight: 600,
                      }}>
                        {item.storageType}
                      </span>
                      {item.status === 'PENDING' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                          <Loader2 size={10} className="animate-spin" />
                          Queued...
                        </span>
                      )}
                      {item.status === 'RUNNING' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-blue)', fontWeight: 500 }}>
                          <Loader2 size={10} className="animate-spin" />
                          Running ({item.progressScanned}/{item.progressTotal || '?'})
                        </span>
                      )}
                      {item.status === 'FAILED' && (
                        <span style={{ color: 'var(--accent-red)', fontWeight: 500 }}>
                          Failed
                        </span>
                      )}
                      {(!item.status || item.status === 'COMPLETED') && (
                        <>
                          <span>{item.wavCount} files</span>
                          <span>{formatDuration(item.totalDuration)}</span>
                        </>
                      )}
                    </div>

                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px', fontStyle: 'italic' }}>
                      {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px', border: '1px dashed var(--border-secondary)', borderRadius: '8px' }}>
                  No calculations saved yet.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Output Analysis Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* History Viewing Banner */}
          {viewingHistory && result && (
            <div className="glass" style={{ border: '1px solid var(--border-accent)', background: 'var(--bg-secondary)', padding: '12px 20px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', minWidth: 0 }}>
                <Info size={16} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Viewing history: <strong>{result.name}</strong> {result.createdAt ? `(calculated on ${new Date(result.createdAt).toLocaleString()})` : ''}
                </span>
              </div>
              <button
                onClick={() => {
                  setResult(null);
                  setViewingHistory(false);
                  setSelectedHistoryId(null);
                }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', marginLeft: '12px', flexShrink: 0 }}
                title="Clear selection"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Real-time Streaming Scanner Progress */}
          {result && (result.status === 'PENDING' || result.status === 'RUNNING') && (
            <div className="card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-accent)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />
                  {result.status === 'PENDING' ? 'Queued / Pending analysis...' : 'Extracting Audio Headers recursively...'}
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
                <span>Analyzed {(result.progressScanned || 0).toLocaleString()} of {(result.progressTotal || 0).toLocaleString()} WAV files</span>
                <span style={{ maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>
                  {result.currentFile}
                </span>
              </div>
            </div>
          )}

          {/* Failure Alert Block */}
          {result && result.status === 'FAILED' && (
            <div className="card" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', padding: '24px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-red)', fontWeight: 600 }}>
                <Info size={20} />
                Analysis Failed
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                {result.errorMessage || 'An unknown error occurred during calculation.'}
              </p>
            </div>
          )}

          {/* Results Summary Overview */}
          {result && (!result.status || result.status === 'COMPLETED') ? (
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }} className="hide-on-print">
                  <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Analyzed Tracks List</h3>
                  
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    {/* Duration Filter Dropdown */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Duration:</span>
                      <select
                        className="select"
                        value={durationFilter}
                        onChange={(e) => setDurationFilter(e.target.value as any)}
                        style={{ width: '130px', height: '36px', padding: '0 24px 0 10px', fontSize: '13px' }}
                      >
                        <option value="all">All Tracks</option>
                        <option value="15m">&gt; 15 mins</option>
                        <option value="30m">&gt; 30 mins</option>
                        <option value="custom">Custom min</option>
                      </select>
                    </div>

                    {/* Custom minutes input (only visible when custom filter is selected) */}
                    {durationFilter === 'custom' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="number"
                          className="input"
                          min="1"
                          placeholder="Mins"
                          value={customMin}
                          onChange={(e) => setCustomMin(Math.max(1, parseInt(e.target.value) || 0))}
                          style={{ width: '70px', height: '36px', padding: '0 8px', fontSize: '13px', textAlign: 'center' }}
                        />
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>min</span>
                      </div>
                    )}

                    {/* Search bar inside list card */}
                    <div style={{ position: 'relative', width: '180px' }}>
                      <Search size={14} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-tertiary)' }} />
                      <input
                        className="input"
                        placeholder="Search tracks..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ paddingLeft: '30px', paddingRight: '10px', height: '36px', fontSize: '13px' }}
                      />
                    </div>

                    {/* Export PDF Button */}
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleExportPDF}
                      style={{ height: '36px', padding: '0 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      Export PDF
                    </button>
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
            !loading && !result && (
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

      {/* ── Print Only PDF Report Template ────────────────────── */}
      {result && (
        <div className="print-only-container">
          {/* Top decorative gradient bar */}
          <div style={{ height: '4px', background: 'linear-gradient(90deg, #4f46e5, #0891b2, #059669)', margin: '0 0 24px 0' }}></div>

          <div style={{ borderBottom: '2px solid #edf2f7', paddingBottom: '16px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#2d3748', margin: 0, letterSpacing: '0.025em' }}>Project Marvel — Audio Duration Report</h2>
            <p style={{ fontSize: '11px', color: '#718096', margin: '6px 0 0' }}>Generated: {new Date().toLocaleString()}</p>
          </div>

          {/* Metadata Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '28px', backgroundColor: '#f8fafc', padding: '16px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', borderLeft: '4px solid #4f46e5' }}>
            <div>
              <div style={{ fontSize: '10px', color: '#718096', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Calculation Info</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a202c', marginTop: '6px' }}>{result.name}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#718096', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Details</div>
              <div style={{ fontSize: '12px', color: '#2d3748', marginTop: '6px' }}>
                <strong>Scan Date:</strong> {result.createdAt ? new Date(result.createdAt).toLocaleString() : 'N/A'}
              </div>
              <div style={{ fontSize: '12px', color: '#2d3748', marginTop: '3px' }}>
                <strong>Filters Applied:</strong> {durationFilter === 'all' ? 'None (All Tracks)' : durationFilter === '15m' ? 'Duration > 15 minutes' : durationFilter === '30m' ? 'Duration > 30 minutes' : `Duration > ${customMin} minutes`}
                {searchQuery.trim() && ` | Name search: "${searchQuery}"`}
              </div>
            </div>
          </div>

          {/* Summary Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '32px' }}>
            <div style={{ border: '1px solid #e2e8f0', borderTop: '4px solid #4f46e5', padding: '16px', borderRadius: '8px', textAlign: 'center', backgroundColor: '#f8fafc' }}>
              <div style={{ fontSize: '10px', color: '#718096', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>WAV Playback Time</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#4f46e5', marginTop: '8px', letterSpacing: '-0.025em' }}>
                {formatDuration(filteredTotalDuration)}
              </div>
              <div style={{ fontSize: '11px', color: '#718096', marginTop: '4px' }}>
                of {formatDuration(result.totalDuration)} overall
              </div>
            </div>
            <div style={{ border: '1px solid #e2e8f0', borderTop: '4px solid #0891b2', padding: '16px', borderRadius: '8px', textAlign: 'center', backgroundColor: '#f8fafc' }}>
              <div style={{ fontSize: '10px', color: '#718096', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Listed Tracks</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#0891b2', marginTop: '8px', letterSpacing: '-0.025em' }}>
                {filteredAndSortedTracks.length} files
              </div>
              <div style={{ fontSize: '11px', color: '#718096', marginTop: '4px' }}>
                of {result.wavCount} files overall
              </div>
            </div>
            <div style={{ border: '1px solid #e2e8f0', borderTop: '4px solid #059669', padding: '16px', borderRadius: '8px', textAlign: 'center', backgroundColor: '#f8fafc' }}>
              <div style={{ fontSize: '10px', color: '#718096', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cumulative Size</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#059669', marginTop: '8px', letterSpacing: '-0.025em' }}>
                {formatBytes(filteredTotalSize)}
              </div>
              <div style={{ fontSize: '11px', color: '#718096', marginTop: '4px' }}>
                of {formatBytes(overallTotalSize)} overall
              </div>
            </div>
          </div>

          {/* Table Header / Title */}
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#2d3748', borderBottom: '2px solid #cbd5e0', paddingBottom: '8px', marginBottom: '12px', letterSpacing: '0.025em' }}>
            Detailed Tracks List ({filteredAndSortedTracks.length} items)
          </h3>

          {/* Tracks Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }} className="print-table">
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th style={{ padding: '10px 8px', width: '50px' }}>#</th>
                <th style={{ padding: '10px 8px' }}>Track Name</th>
                <th style={{ padding: '10px 8px', width: '110px', textAlign: 'right' }}>Size</th>
                <th style={{ padding: '10px 8px', width: '110px', textAlign: 'right' }}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedTracks.map((file, idx) => (
                <tr key={idx} style={{ pageBreakInside: 'avoid' }}>
                  <td style={{ padding: '8px', color: '#718096' }}>{idx + 1}</td>
                  <td style={{ padding: '8px', fontWeight: 600, color: '#2d3748', wordBreak: 'break-all' }}>{file.name}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#4a5568', fontFamily: 'monospace' }}>{formatBytes(file.size)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: '#2d3748', fontFamily: 'monospace' }}>{formatTrackTime(file.duration)}</td>
                </tr>
              ))}
            </tbody>
          </table>

        </div>
      )}
    </div>
  );
}
