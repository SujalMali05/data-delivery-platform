'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  FileCheck,
  CheckCircle2,
  XCircle,
  HardDrive,
  Database,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  FileCode,
} from 'lucide-react';
import { validationApi } from '@/lib/api-client';

interface ReportDetails {
  validationId: string;
  name: string;
  oneWay: boolean;
  source: { name: string; path: string };
  destination: { customer: string; bucket: string; path: string };
  summary: {
    srcTotalBytes: string;
    srcTotalFiles: number;
    dstTotalBytes: string;
    dstTotalFiles: number;
    matchCount: number;
    differCount: number;
    missingSrcCount: number;
    missingDstCount: number;
    errorCount: number;
  };
  match: string[];
  differ: string[];
  missingOnSrc: string[];
  missingOnDst: string[];
  error: string[];
}

export default function ValidationReportPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [metadata, setMetadata] = useState<any>(null);
  const [report, setReport] = useState<ReportDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Active Tab
  const [activeTab, setActiveTab] = useState<'match' | 'differ' | 'missingOnDst' | 'missingOnSrc' | 'error'>('differ');
  // Filters & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    fetchData(true);
  }, [id]);

  useEffect(() => {
    if (!metadata || !['PENDING', 'RUNNING'].includes(metadata.status)) return;

    const interval = setInterval(() => {
      fetchData(false);
    }, 4000);

    return () => clearInterval(interval);
  }, [metadata]);

  const fetchData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setErrorMsg('');
    try {
      const metaRes = await validationApi.get(id);
      const meta = metaRes.data;
      setMetadata(meta);

      if (meta.status === 'COMPLETED') {
        const reportRes = await validationApi.getReport(id);
        setReport(reportRes.data);

        // Default active tab selection logic:
        const rep = reportRes.data;
        if (rep.summary.differCount > 0) {
          setActiveTab('differ');
        } else if (rep.summary.missingDstCount > 0) {
          setActiveTab('missingOnDst');
        } else if (rep.summary.errorCount > 0) {
          setActiveTab('error');
        } else if (rep.summary.missingSrcCount > 0 && !rep.oneWay) {
          setActiveTab('missingOnSrc');
        } else {
          setActiveTab('match');
        }
      } else if (meta.status === 'FAILED') {
        setErrorMsg(meta.errorMessage || 'Validation check failed.');
      }
    } catch (err: any) {
      console.error('Failed to retrieve validation report:', err);
      setErrorMsg(err.response?.data?.message || 'Failed to retrieve detailed validation report.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const formatBytes = (bytesStr: string | number) => {
    const bytes = typeof bytesStr === 'string' ? parseInt(bytesStr) : bytesStr;
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleExportJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `validation-report-${report.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id.slice(0, 8)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 200px)', gap: '16px' }}>
        <Loader2 className="animate-spin" size={36} color="var(--accent-blue)" />
        <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Retrieving audit and matching reports...</span>
      </div>
    );
  }

  if (errorMsg || !report || !metadata) {
    return (
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Link href="/dashboard/validation" className="btn-secondary" style={{ width: 'fit-content', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={16} /> Back to Validation
        </Link>
        <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertCircle size={24} />
          <div>
            <h4 style={{ fontWeight: 600, fontSize: '15px' }}>Error Loading Report</h4>
            <p style={{ fontSize: '13px', marginTop: '4px', opacity: 0.9 }}>{errorMsg || 'The validation process may have failed or the report is not ready yet.'}</p>
          </div>
        </div>
      </div>
    );
  }

  // Get active list from report based on selected tab
  const getActiveList = (): string[] => {
    switch (activeTab) {
      case 'match':
        return report.match;
      case 'differ':
        return report.differ;
      case 'missingOnDst':
        return report.missingOnDst;
      case 'missingOnSrc':
        return report.missingOnSrc;
      case 'error':
        return report.error;
      default:
        return [];
    }
  };

  const activeList = getActiveList();
  
  // Filter list
  const filteredList = activeList.filter((item) =>
    item.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pagination
  const totalItems = filteredList.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const paginatedList = filteredList.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  const getStatusBadge = (status: string) => {
    if (status === 'COMPLETED') {
      return (
        <span className="badge badge-emerald" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <CheckCircle2 size={12} /> Sync Complete
        </span>
      );
    }
    return <span className="badge badge-red"><XCircle size={12} /> {status}</span>;
  };

  const isCompleted = metadata?.status === 'COMPLETED';
  const isRunning = ['PENDING', 'RUNNING'].includes(metadata?.status || '');
  const isFailed = metadata?.status === 'FAILED';

  const sourceName = report?.source?.name || metadata?.source?.name || '';
  const sourcePath = report?.source?.path || metadata?.sourcePath || '';
  const destinationCustomer = report?.destination?.customer || metadata?.customer?.name || '';
  const destinationBucket = report?.destination?.bucket || metadata?.customer?.bucketName || '';
  const destinationPath = report?.destination?.path || metadata?.destinationPath || '';
  const oneWay = report ? report.oneWay : (metadata ? metadata.oneWay : false);

  const matchCount = report ? report.summary.matchCount : (metadata ? metadata.matchCount : 0);
  const differCount = report ? report.summary.differCount : (metadata ? metadata.differCount : 0);
  const missingDstCount = report ? report.summary.missingDstCount : (metadata ? metadata.missingDstCount : 0);
  const missingSrcCount = report ? report.summary.missingSrcCount : (metadata ? metadata.missingSrcCount : 0);
  const errorCount = report ? report.summary.errorCount : (metadata ? metadata.errorCount : 0);

  const srcTotalBytes = report ? report.summary.srcTotalBytes : (metadata ? metadata.srcTotalBytes : '0');
  const srcTotalFiles = report ? report.summary.srcTotalFiles : (metadata ? metadata.srcTotalFiles : 0);
  const dstTotalBytes = report ? report.summary.dstTotalBytes : (metadata ? metadata.dstTotalBytes : '0');
  const dstTotalFiles = report ? report.summary.dstTotalFiles : (metadata ? metadata.dstTotalFiles : 0);

  const isInSync = isCompleted && differCount === 0 && missingDstCount === 0 && (oneWay || missingSrcCount === 0);

  const getTabLabel = (tab: typeof activeTab) => {
    switch (tab) {
      case 'match':
        return `Matched (${matchCount})`;
      case 'differ':
        return `Differing (${differCount})`;
      case 'missingOnDst':
        return `Missing on S3 (${missingDstCount})`;
      case 'missingOnSrc':
        return `Missing on Drive (${missingSrcCount})`;
      case 'error':
        return `Errors (${errorCount})`;
    }
  };

  return (
    <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '20px', minHeight: 'calc(100vh - 120px)' }}>
      {/* Navigation & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/dashboard/validation" className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={16} /> Back to History
        </Link>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-secondary" onClick={() => fetchData(false)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn-primary" onClick={handleExportJson} disabled={!isCompleted} style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: isCompleted ? 1 : 0.6 }}>
            <Download size={14} /> Export Report (JSON)
          </button>
        </div>
      </div>

      {/* Report Info Header */}
      <div className="glass" style={{ padding: '24px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: isRunning ? 'rgba(59,130,246,0.1)' : isFailed ? 'rgba(239,68,68,0.1)' : isInSync ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center' }}>
            <FileCheck size={24} color={isRunning ? 'var(--accent-blue)' : isFailed ? 'var(--accent-red)' : isInSync ? 'var(--accent-emerald)' : 'var(--accent-amber)'} />
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{metadata.name}</h2>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <span>{getStatusBadge(metadata.status)}</span>
              <span>•</span>
              <span>{oneWay ? 'One-Way Audit' : 'Two-Way Full Audit'}</span>
              <span>•</span>
              <span>Audited: {new Date(metadata.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Sync Summary Alert */}
        <div style={{ background: isRunning ? 'rgba(59,130,246,0.06)' : isFailed ? 'rgba(239,68,68,0.06)' : isInSync ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)', border: isRunning ? '1px solid rgba(59,130,246,0.2)' : isFailed ? '1px solid rgba(239,68,68,0.2)' : isInSync ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(245,158,11,0.2)', padding: '12px 18px', borderRadius: '10px', display: 'flex', gap: '10px', alignItems: 'center', maxWidth: '380px' }}>
          {isRunning ? (
            <>
              <Loader2 size={18} className="animate-spin" color="var(--accent-blue)" />
              <div style={{ fontSize: '12px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Validation in Progress</strong>
                <p style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>rclone is analyzing folder contents. Results will load automatically.</p>
              </div>
            </>
          ) : isFailed ? (
            <>
              <XCircle size={18} color="var(--accent-red)" />
              <div style={{ fontSize: '12px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Audit Run Failed</strong>
                <p style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>An error occurred during comparison. See details below.</p>
              </div>
            </>
          ) : isInSync ? (
            <>
              <CheckCircle2 size={18} color="var(--accent-emerald)" />
              <div style={{ fontSize: '12px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>100% Integrity Sync</strong>
                <p style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>No differing or missing files were found. Directories match.</p>
              </div>
            </>
          ) : (
            <>
              <AlertTriangle size={18} color="var(--accent-amber)" />
              <div style={{ fontSize: '12px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Mismatches Detected</strong>
                <p style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>There are discrepancies in file integrity or presence. Check lists below.</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Directory Paths Mapping */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>Google Drive Source</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: '13px', color: 'var(--text-primary)' }}>
            <HardDrive size={16} color="var(--accent-blue)" />
            <strong>{sourceName}</strong>
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: '12px', background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: '6px', marginTop: '8px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
            {sourcePath || '/ (Root)'}
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>Customer S3 Destination</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: '13px', color: 'var(--text-primary)' }}>
            <Database size={16} color="var(--accent-blue)" />
            <strong>{destinationCustomer} ({destinationBucket})</strong>
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: '12px', background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: '6px', marginTop: '8px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
            {destinationPath || '/ (Root)'}
          </div>
        </div>
      </div>

      {/* Sizing Stats & Counters Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
        {/* Google Drive Sizing */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '4px solid var(--accent-blue)' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Google Drive Size</span>
          <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{formatBytes(srcTotalBytes)}</h3>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{srcTotalFiles} total objects</span>
        </div>

        {/* S3 Sizing */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '4px solid var(--accent-blue)' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>S3 Bucket Size</span>
          <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{formatBytes(dstTotalBytes)}</h3>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{dstTotalFiles} total objects</span>
        </div>

        {/* Differing Count */}
        <div
          className="card"
          onClick={() => isCompleted && differCount > 0 && setActiveTab('differ')}
          style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '4px solid var(--accent-amber)', cursor: (isCompleted && differCount > 0) ? 'pointer' : 'default' }}
        >
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Differing (Integrity)</span>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: (isCompleted && differCount > 0) ? 'var(--accent-amber)' : 'inherit' }}>
            {isRunning ? '—' : differCount}
          </h3>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Size or hash mismatch</span>
        </div>

        {/* Unique on Drive */}
        <div
          className="card"
          onClick={() => isCompleted && missingDstCount > 0 && setActiveTab('missingOnDst')}
          style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '4px solid var(--accent-purple)', cursor: (isCompleted && missingDstCount > 0) ? 'pointer' : 'default' }}
        >
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Unique in Drive</span>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: (isCompleted && missingDstCount > 0) ? 'var(--accent-purple)' : 'inherit' }}>
            {isRunning ? '—' : missingDstCount}
          </h3>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Missing in S3</span>
        </div>

        {/* Unique on S3 */}
        <div
          className="card"
          onClick={() => isCompleted && !oneWay && missingSrcCount > 0 && setActiveTab('missingOnSrc')}
          style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '4px solid var(--accent-cyan)', opacity: oneWay ? 0.5 : 1, cursor: (isCompleted && !oneWay && missingSrcCount > 0) ? 'pointer' : 'default' }}
        >
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Unique in S3</span>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: (isCompleted && !oneWay && missingSrcCount > 0) ? 'var(--accent-cyan)' : 'inherit' }}>
            {oneWay ? '—' : (isRunning ? '—' : missingSrcCount)}
          </h3>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{oneWay ? 'Audit is one-way' : 'Missing in Drive'}</span>
        </div>
      </div>

      {/* Running / Progress State */}
      {isRunning && (
        <div className="glass" style={{ padding: '40px 20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', minHeight: '300px', border: '1px dashed var(--border-primary)' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '4px solid rgba(59,130,246,0.1)', borderTopColor: 'var(--accent-blue)', animation: 'spin 1.5s linear infinite' }} />
            <HardDrive size={24} color="var(--accent-blue)" style={{ position: 'absolute' }} />
          </div>
          <div style={{ textAlign: 'center', maxWidth: '480px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Auditing Folders & Calculating Differences</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              We are performing an integrity check using rclone. This scans and compares all file names, sizes, and hashes recursively across both folders to locate any discrepancies.
            </p>
            <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-tertiary)', background: 'rgba(255,255,255,0.02)', padding: '8px 16px', borderRadius: '6px', display: 'inline-block' }}>
              🔄 Status: <strong>{metadata.status}</strong> • Polling status every 4s
            </div>
          </div>
        </div>
      )}

      {/* Failed State */}
      {isFailed && (
        <div className="glass" style={{ padding: '40px 20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', minHeight: '300px', border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.02)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertCircle size={32} color="var(--accent-red)" />
          </div>
          <div style={{ textAlign: 'center', maxWidth: '520px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Validation Audit Failed</h4>
            <p style={{ fontSize: '13px', color: 'var(--accent-red)', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', padding: '12px 16px', borderRadius: '8px', fontFamily: 'monospace', textAlign: 'left', wordBreak: 'break-all', marginTop: '12px' }}>
              {metadata.errorMessage || 'An unknown internal error occurred while executing rclone check.'}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '16px' }}>
              Please check the backend log files or retry the validation from the history page.
            </p>
          </div>
        </div>
      )}

      {/* Discrepancies Details Panel */}
      {isCompleted && report && (
        <div className="glass" style={{ borderRadius: '12px', border: '1px solid var(--border-primary)', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1 }}>
          {/* Tabs Bar */}
          <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-secondary)', padding: '12px 20px 0', background: 'rgba(255,255,255,0.01)', overflowX: 'auto' }}>
            {(['differ', 'missingOnDst', 'missingOnSrc', 'match', 'error'] as const).map((tab) => {
              if (tab === 'missingOnSrc' && oneWay) return null;
              const isActiveTab = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setPage(1);
                  }}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    background: 'transparent',
                    color: isActiveTab ? 'var(--accent-blue)' : 'var(--text-tertiary)',
                    borderBottom: isActiveTab ? '2px solid var(--accent-blue)' : '2px solid transparent',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {getTabLabel(tab)}
                </button>
              );
            })}
          </div>

          {/* Filter and Table Tools */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '320px' }}>
              <input
                className="input"
                type="text"
                placeholder="Search files path..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                style={{ paddingLeft: '36px', margin: 0, fontSize: '13px' }}
              />
              <Search size={16} color="var(--text-tertiary)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            </div>
            
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', flex: 1, textAlign: 'right' }}>
              Showing {filteredList.length === totalItems ? totalItems : `${filteredList.length} of ${totalItems}`} items
            </div>
          </div>

          {/* Content Table */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: '260px' }}>
            {paginatedList.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '10px' }}>
                <FileCode size={36} color="var(--text-muted)" style={{ opacity: 0.3 }} />
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {searchQuery ? 'No matching items found for search query.' : 'This listing contains no items.'}
                </p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-secondary)', background: 'rgba(255,255,255,0.01)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 20px', fontWeight: 600, color: 'var(--text-tertiary)', width: '60px' }}>#</th>
                    <th style={{ padding: '10px 20px', fontWeight: 600, color: 'var(--text-tertiary)' }}>Relative File Path</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedList.map((pathName, index) => {
                    const globalIdx = (page - 1) * itemsPerPage + index + 1;
                    return (
                      <tr key={globalIdx} style={{ borderBottom: '1px solid var(--border-secondary)' }} className="glass-hover">
                        <td style={{ padding: '10px 20px', color: 'var(--text-muted)' }}>{globalIdx}</td>
                        <td style={{ padding: '10px 20px', fontFamily: 'monospace', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                          {pathName}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Page {page} of {totalPages}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn-secondary"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <button
                  className="btn-secondary"
                  disabled={page === totalPages}
                  onClick={() => setPage(page + 1)}
                  style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
