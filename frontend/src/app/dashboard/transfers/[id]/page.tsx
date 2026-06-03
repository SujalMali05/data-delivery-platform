'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { transfersApi, logsApi } from '@/lib/api-client';
import { useSSE } from '@/hooks/use-sse';
import {
  formatBytes,
  formatDate,
  getStatusBgColor,
  getProgressPercentage,
} from '@/lib/utils';
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  RotateCcw,
  Activity,
  HardDrive,
  FileText,
  Clock,
  AlertTriangle,
  Zap,
  Trash2,
  Calendar,
  CheckCircle2,
  Database,
  Shield,
  Info,
} from 'lucide-react';

export default function TransferDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [transfer, setTransfer] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveData, setLiveData] = useState<any>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  const fetchTransfer = useCallback(async () => {
    try {
      const [transferRes, logsRes] = await Promise.all([
        transfersApi.get(id),
        logsApi.byTransfer(id),
      ]);
      setTransfer(transferRes.data);
      setLogs(logsRes.data);
    } catch (error: any) {
      console.warn('Failed to fetch transfer:', error.message || error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const formatDuration = (startedAt?: string, completedAt?: string) => {
    if (!startedAt || !completedAt) return '—';
    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();
    const diffMs = end - start;
    if (diffMs <= 0) return '0s';
    const diffSecs = Math.floor(diffMs / 1000);
    const h = Math.floor(diffSecs / 3600);
    const m = Math.floor((diffSecs % 3600) / 60);
    const s = diffSecs % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  useEffect(() => {
    fetchTransfer();
  }, [fetchTransfer]);

  useEffect(() => {
    const isActive = transfer && ['RUNNING', 'QUEUED', 'RETRYING'].includes(transfer.status);
    if (!isActive) return;

    const interval = setInterval(() => {
      fetchTransfer();
    }, 4000);

    return () => clearInterval(interval);
  }, [transfer?.status, fetchTransfer]);

  // SSE for live progress
  useSSE({
    url: `/transfers/${id}/progress`,
    enabled: transfer?.status === 'RUNNING',
    onMessage: (data) => setLiveData(data),
  });

  const handleAction = async (action: string) => {
    try {
      switch (action) {
        case 'start':
          await transfersApi.start(id);
          break;
        case 'queue':
          await transfersApi.queue(id);
          break;
        case 'pause':
          await transfersApi.pause(id);
          break;
        case 'stop':
          await transfersApi.stop(id);
          break;
        case 'retry':
          await transfersApi.retry(id);
          break;
        case 'delete':
          if (confirm('Are you sure you want to delete and clear this transfer?')) {
            await transfersApi.delete(id);
            router.push('/dashboard/transfers');
          }
          break;
      }
      if (action !== 'delete') {
        fetchTransfer();
      }
    } catch (error) {
      console.error(`Action failed:`, error);
    }
  };

  if (loading || !transfer) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        <Activity size={24} style={{ color: 'var(--accent-blue)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const status = liveData?.status || transfer.status;
  const progress = status === 'COMPLETED' ? 100 : getProgressPercentage(
    liveData?.transferredBytes || transfer.transferredBytes,
    liveData?.totalBytes || transfer.totalBytes,
  );
  const speed = liveData?.speed || transfer.currentSpeed || '—';
  const eta = liveData?.eta || transfer.eta || '—';
  const transferredBytes = liveData?.transferredBytes || transfer.transferredBytes;
  const totalBytes = liveData?.totalBytes || transfer.totalBytes;
  const transferredFiles = liveData?.transferredFiles || transfer.transferredFiles;
  const totalFiles = liveData?.totalFiles || transfer.totalFiles;
  const errorCount = liveData?.errorCount || transfer.errorCount;

  return (
    <div className="animate-fadeIn">
      <Link href="/dashboard/transfers" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-tertiary)', fontSize: '13px', textDecoration: 'none', marginBottom: '20px' }}>
        <ArrowLeft size={14} />
        Back to Transfers
      </Link>

      {/* ── Header ──────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700 }}>{transfer.name}</h1>
            <span className={`badge ${getStatusBgColor(status)}`}>
              {status === 'RUNNING' && <span className="live-dot" />}
              {status}
            </span>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {transfer.direction === 'PULL'
              ? `${transfer.customer?.bucketName || transfer.customerBucket || 'deleted-bucket'}/${transfer.destinationPath} ➔ ${transfer.source?.drivePath || transfer.sourcePath || 'deleted-path'}`
              : `${transfer.source?.drivePath || transfer.sourcePath || 'deleted-path'} ➔ ${transfer.customer?.bucketName || transfer.customerBucket || 'deleted-bucket'}/${transfer.destinationPath}`
            }
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {transfer.mode === 'SYNC' && transfer.dryRunReport && (
            <button
              className="btn-secondary"
              onClick={() => setShowReportModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid var(--border-accent)', color: 'var(--text-primary)' }}
            >
              <FileText size={14} /> View Sync Report
            </button>
          )}
          {['QUEUED', 'PAUSED', 'SCHEDULED'].includes(status) && (
            <button className="btn-primary" onClick={() => handleAction('start')}><Play size={14} /> Start</button>
          )}
          {['PAUSED', 'FAILED', 'SCHEDULED'].includes(status) && (
            <button className="btn-secondary" style={{ border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)' }} onClick={() => handleAction('queue')}><Clock size={14} /> Queue</button>
          )}
          {status === 'RUNNING' && (
            <>
              <button className="btn-secondary" onClick={() => handleAction('pause')}><Pause size={14} /> Pause</button>
              <button className="btn-danger" onClick={() => handleAction('stop')}><Square size={14} /> Stop</button>
            </>
          )}
          {status === 'FAILED' && (
            <button className="btn-primary" onClick={() => handleAction('retry')}><RotateCcw size={14} /> Retry</button>
          )}
          {status !== 'RUNNING' && (
            <button className="btn-danger" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => handleAction('delete')}><Trash2 size={14} /> Delete</button>
          )}
        </div>
      </div>

      {/* ── Progress Bar ────────────────── */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>{progress}% Complete</span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {formatBytes(transferredBytes)} / {formatBytes(totalBytes)}
          </span>
        </div>
        <div className="progress-bar" style={{ height: '12px', borderRadius: '6px' }}>
          <div
            className={`progress-bar-fill ${status === 'COMPLETED' ? 'completed' : status === 'FAILED' ? 'failed' : ''}`}
            style={{ width: `${progress}%`, borderRadius: '6px' }}
          />
        </div>
      </div>

      {/* ── Live Metrics ────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {['COMPLETED', 'FAILED', 'CANCELLED'].includes(status) ? (
          <>
            <div className="card-stat">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Clock size={16} style={{ color: 'var(--accent-emerald)' }} />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Duration</span>
              </div>
              <p style={{ fontSize: '20px', fontWeight: 700 }}>
                {formatDuration(transfer.startedAt, transfer.completedAt)}
              </p>
            </div>
            <div className="card-stat">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Calendar size={16} style={{ color: 'var(--accent-amber)' }} />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Completed At</span>
              </div>
              <p style={{ fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {transfer.completedAt ? formatDate(transfer.completedAt) : '—'}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="card-stat">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Zap size={16} style={{ color: 'var(--accent-emerald)' }} />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Speed</span>
              </div>
              <p style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'monospace' }}>{speed}</p>
            </div>
            <div className="card-stat">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Clock size={16} style={{ color: 'var(--accent-amber)' }} />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>ETA</span>
              </div>
              <p style={{ fontSize: '20px', fontWeight: 700 }}>{eta}</p>
            </div>
          </>
        )}
        <div className="card-stat">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <FileText size={16} style={{ color: 'var(--accent-blue)' }} />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Files</span>
          </div>
          <p style={{ fontSize: '20px', fontWeight: 700 }}>{transferredFiles?.toLocaleString()} / {totalFiles?.toLocaleString()}</p>
        </div>
        <div className="card-stat">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <AlertTriangle size={16} style={{ color: errorCount > 0 ? 'var(--accent-red)' : 'var(--text-tertiary)' }} />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Errors</span>
          </div>
          <p style={{ fontSize: '20px', fontWeight: 700, color: errorCount > 0 ? 'var(--accent-red)' : 'inherit' }}>{errorCount}</p>
        </div>
      </div>

      {/* ── Transfer Details ────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '28px' }}>
        <div className="card">
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>Transfer Configuration</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              ['Direction', transfer.direction === 'PUSH' ? '⬆ Push (GDrive → S3)' : '⬇ Pull (S3 → GDrive)'],
              ['Mode', transfer.mode],
              ['Concurrency', transfer.concurrency],
              ['Checkers', transfer.checkers],
              ['Retries', transfer.retries],
              ['Bandwidth', transfer.bandwidthLimit || 'Unlimited'],
              ...(transfer.mode === 'SYNC' ? [['Skip Deletion', transfer.skipDeletion ? '✅ Yes' : '❌ No']] : []),
            ].map(([label, value]) => (
              <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{ fontSize: '13px', fontFamily: 'monospace' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>Timeline</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              ['Created', formatDate(transfer.createdAt)],
              ['Started', transfer.startedAt ? formatDate(transfer.startedAt) : '—'],
              ['Completed', transfer.completedAt ? formatDate(transfer.completedAt) : '—'],
              ['Customer', transfer.customer?.name || transfer.customerName || 'Deleted Customer'],
            ].map(([label, value]) => (
              <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{ fontSize: '13px' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Logs ────────────────────────── */}
      <div className="card">
        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>
          <ScrollText size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} />
          Transfer Logs
        </h3>
        <div style={{ maxHeight: '360px', overflow: 'auto', borderRadius: '8px', background: 'var(--bg-primary)', padding: '12px', border: '1px solid var(--border-secondary)' }}>
          {logs.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
              No logs yet
            </p>
          ) : (
            logs.map((log: any) => (
              <div key={log.id} style={{ display: 'flex', gap: '10px', padding: '6px 0', fontSize: '13px', fontFamily: 'monospace', borderBottom: '1px solid var(--border-secondary)' }}>
                <span style={{ color: 'var(--text-muted)', minWidth: '140px', flexShrink: 0 }}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span style={{
                  minWidth: '48px',
                  fontWeight: 600,
                  color: log.level === 'ERROR' ? 'var(--accent-red)' : log.level === 'WARN' ? 'var(--accent-amber)' : 'var(--accent-emerald)',
                }}>
                  {log.level}
                </span>
                <span style={{ color: 'var(--text-secondary)', flex: 1, minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {showReportModal && transfer.dryRunReport && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }}>
          <div className="glass animate-fadeIn" style={{
            maxWidth: '860px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '28px',
            borderRadius: '16px',
            border: '1px solid var(--border-primary)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '14px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Sync Dry-Run Report
              </h3>
              <button
                className="btn-secondary"
                onClick={() => setShowReportModal(false)}
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                Close
              </button>
            </div>
            
            {/* Paths mapping cards (Referenced validation style) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Source Card */}
              <div className="card" style={{ padding: '14px 18px', borderRadius: '12px' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                  {transfer.dryRunReport.source.type === 's3' ? 'AWS S3 Source' : 'Google Drive Source'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '13px', color: 'var(--text-primary)' }}>
                  {transfer.dryRunReport.source.type === 's3' ? <Database size={16} color="var(--accent-blue)" /> : <HardDrive size={16} color="var(--accent-blue)" />}
                  <strong>{transfer.dryRunReport.source.name}</strong>
                </div>
                <div style={{
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  background: 'rgba(255,255,255,0.02)',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  marginTop: '6px',
                  color: 'var(--text-secondary)',
                  wordBreak: 'break-all'
                }}>
                  {transfer.dryRunReport.source.type === 's3' 
                    ? `s3://${transfer.dryRunReport.source.bucket}/${transfer.dryRunReport.source.path || ''}`
                    : `gdrive://${transfer.dryRunReport.source.path || '/'}`
                  }
                </div>
              </div>

              {/* Destination Card */}
              <div className="card" style={{ padding: '14px 18px', borderRadius: '12px' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                  {transfer.dryRunReport.destination.type === 's3' ? 'AWS S3 Destination' : 'Google Drive Destination'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '13px', color: 'var(--text-primary)' }}>
                  {transfer.dryRunReport.destination.type === 's3' ? <Database size={16} color="var(--accent-blue)" /> : <HardDrive size={16} color="var(--accent-blue)" />}
                  <strong>{transfer.dryRunReport.destination.name}</strong>
                </div>
                <div style={{
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  background: 'rgba(255,255,255,0.02)',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  marginTop: '6px',
                  color: 'var(--text-secondary)',
                  wordBreak: 'break-all'
                }}>
                  {transfer.dryRunReport.destination.type === 's3' 
                    ? `s3://${transfer.dryRunReport.destination.bucket}/${transfer.dryRunReport.destination.path || ''}`
                    : `gdrive://${transfer.dryRunReport.destination.path || '/'}`
                  }
                </div>
              </div>
            </div>

            {/* Stats counters grid (Referenced validation style, 4-columns, red for To Delete) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
              {/* Files to Transfer */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderLeft: '4px solid var(--accent-cyan)', padding: '14px 18px', borderRadius: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>To Transfer</span>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-blue)' }}>
                  {transfer.dryRunReport.summary.filesToTransfer.toLocaleString()}
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {formatBytes(transfer.dryRunReport.summary.bytesToTransfer)} volume
                </span>
              </div>

              {/* Files to Delete */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderLeft: '4px solid var(--accent-red)', padding: '14px 18px', borderRadius: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>To Delete</span>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-red)' }}>
                  {transfer.dryRunReport.summary.filesToDelete.toLocaleString()}
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {transfer.skipDeletion ? '0 (Blocked)' : 'on destination'}
                </span>
              </div>

              {/* Files Compared */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderLeft: '4px solid var(--accent-emerald)', padding: '14px 18px', borderRadius: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Compared</span>
                <h3 style={{ fontSize: '16px', fontWeight: 700 }}>
                  {transfer.dryRunReport.summary.checksPerformed.toLocaleString()}
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>integrity checks</span>
              </div>

              {/* Scanner Errors */}
              <div className="card" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                borderLeft: transfer.dryRunReport.summary.errors > 0 ? '4px solid var(--accent-red)' : '4px solid var(--border-primary)',
                padding: '14px 18px',
                borderRadius: '12px',
              }}>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Errors</span>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: transfer.dryRunReport.summary.errors > 0 ? 'var(--accent-red)' : 'inherit' }}>
                  {transfer.dryRunReport.summary.errors}
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>during scan</span>
              </div>
            </div>

            {/* Safe Mode status box */}
            <div style={{
              padding: '14px 18px',
              borderRadius: '12px',
              border: '1px solid',
              borderColor: transfer.skipDeletion ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.3)',
              background: transfer.skipDeletion ? 'rgba(16, 185, 129, 0.03)' : 'rgba(59, 130, 246, 0.03)',
              fontSize: '13px',
              fontWeight: 600,
              color: transfer.skipDeletion ? 'var(--accent-emerald)' : 'var(--accent-blue)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              {transfer.skipDeletion ? (
                <>
                  <Shield size={16} /> Safe Sync Mode Active — deletes on the destination were blocked.
                </>
              ) : (
                <>
                  <Info size={16} /> Full Sync Mode Active — files not present in the source were deleted from the destination (affected {transfer.dryRunReport.summary.filesToDelete} file(s)).
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button
                className="btn-primary"
                onClick={() => setShowReportModal(false)}
                style={{ padding: '10px 20px', borderRadius: '10px' }}
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScrollText(props: any) {
  return <FileText {...props} />;
}
