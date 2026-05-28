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
} from 'lucide-react';

export default function TransferDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [transfer, setTransfer] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveData, setLiveData] = useState<any>(null);

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
              ? `${transfer.customer?.bucketName}/${transfer.destinationPath} ➔ ${transfer.source?.drivePath}`
              : `${transfer.source?.drivePath} ➔ ${transfer.customer?.bucketName}/${transfer.destinationPath}`
            }
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
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
              ['Mode', transfer.mode],
              ['Concurrency', transfer.concurrency],
              ['Checkers', transfer.checkers],
              ['Retries', transfer.retries],
              ['Bandwidth', transfer.bandwidthLimit || 'Unlimited'],
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
              ['Customer', transfer.customer?.name],
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
        <div style={{ maxHeight: '360px', overflowY: 'auto', borderRadius: '8px', background: 'var(--bg-primary)', padding: '12px', border: '1px solid var(--border-secondary)' }}>
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
                <span style={{ color: 'var(--text-secondary)' }}>{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ScrollText(props: any) {
  return <FileText {...props} />;
}
