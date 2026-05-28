'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { transfersApi } from '@/lib/api-client';
import {
  formatBytes,
  formatDate,
  getStatusBgColor,
  getProgressPercentage,
} from '@/lib/utils';
import { Plus, RefreshCw, Filter } from 'lucide-react';

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const fetchTransfers = useCallback(async () => {
    try {
      const params: any = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      const response = await transfersApi.list(params);
      setTransfers(response.data.data);
      setTotal(response.data.total);
    } catch (error: any) {
      console.warn('Failed to fetch transfers:', error.message || error);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  useEffect(() => {
    const hasActive = transfers.some(t => ['RUNNING', 'QUEUED', 'RETRYING'].includes(t.status));
    if (!hasActive) return;

    const interval = setInterval(() => {
      fetchTransfers();
    }, 4000);

    return () => clearInterval(interval);
  }, [transfers, fetchTransfers]);

  const handleAction = async (id: string, action: string) => {
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
          }
          break;
      }
      fetchTransfers();
    } catch (error) {
      console.error(`Action ${action} failed:`, error);
    }
  };

  const statuses = ['', 'RUNNING', 'QUEUED', 'COMPLETED', 'FAILED', 'PAUSED', 'CANCELLED', 'SCHEDULED'];

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Transfers</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Manage data transfer jobs ({total} total)
          </p>
        </div>
        <Link href="/dashboard/transfers/new" className="btn-primary">
          <Plus size={16} />
          New Transfer
        </Link>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center' }}>
        <Filter size={16} style={{ color: 'var(--text-tertiary)' }} />
        {statuses.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              border: '1px solid',
              borderColor: statusFilter === s ? 'var(--accent-blue)' : 'var(--border-secondary)',
              background: statusFilter === s ? 'rgba(99,102,241,0.1)' : 'transparent',
              color: statusFilter === s ? 'var(--accent-blue)' : 'var(--text-secondary)',
              fontFamily: 'inherit',
              transition: 'all 0.15s ease',
            }}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Transfer</th>
              <th>Mode</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Data</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>
                  <RefreshCw size={20} style={{ color: 'var(--accent-blue)', animation: 'spin 1s linear infinite' }} />
                </td>
              </tr>
            ) : transfers.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                  No transfers found
                </td>
              </tr>
            ) : (
              transfers.map((t: any) => {
                const progress = t.status === 'COMPLETED' ? 100 : getProgressPercentage(t.transferredBytes, t.totalBytes);
                return (
                  <tr key={t.id}>
                    <td>
                      <Link href={`/dashboard/transfers/${t.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                        {t.name}
                      </Link>
                      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                        {t.direction === 'PULL'
                          ? `${t.customer?.name} ➔ ${t.source?.name}`
                          : `${t.source?.name} ➔ ${t.customer?.name}`
                        }
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                        {t.mode}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${getStatusBgColor(t.status)}`}>
                        {t.status === 'RUNNING' && <span className="live-dot" />}
                        {t.status}
                      </span>
                    </td>
                    <td style={{ minWidth: '140px' }}>
                      <div className="progress-bar" style={{ marginBottom: '4px' }}>
                        <div
                          className={`progress-bar-fill ${t.status === 'COMPLETED' ? 'completed' : t.status === 'FAILED' ? 'failed' : ''}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{progress}%</span>
                    </td>
                    <td>
                      <span style={{ fontSize: '13px' }}>
                        {formatBytes(t.transferredBytes)} / {formatBytes(t.totalBytes)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        {formatDate(t.createdAt)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {['QUEUED', 'PAUSED', 'FAILED', 'SCHEDULED'].includes(t.status) && (
                          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => handleAction(t.id, t.status === 'FAILED' ? 'retry' : 'start')}>
                            {t.status === 'FAILED' ? 'Retry' : 'Start'}
                          </button>
                        )}
                        {['PAUSED', 'FAILED', 'SCHEDULED'].includes(t.status) && (
                          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)' }} onClick={() => handleAction(t.id, 'queue')}>
                            Queue
                          </button>
                        )}
                        {t.status === 'RUNNING' && (
                          <>
                            <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => handleAction(t.id, 'pause')}>Pause</button>
                            <button className="btn-danger" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => handleAction(t.id, 'stop')}>Stop</button>
                          </>
                        )}
                        {t.status !== 'RUNNING' && (
                          <button className="btn-danger" style={{ padding: '4px 10px', fontSize: '12px', background: 'transparent', border: '1px solid var(--accent-red)', color: 'var(--accent-red)' }} onClick={() => handleAction(t.id, 'delete')}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
          <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: '13px' }} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span style={{ padding: '6px 14px', fontSize: '13px', color: 'var(--text-secondary)' }}>Page {page}</span>
          <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: '13px' }} disabled={transfers.length < 20} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
