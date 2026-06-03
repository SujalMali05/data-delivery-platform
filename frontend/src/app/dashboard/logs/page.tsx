'use client';

import { useEffect, useState, useCallback } from 'react';
import { logsApi } from '@/lib/api-client';
import { Search, Download, Filter } from 'lucide-react';

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 50 };
      if (search) params.search = search;
      if (levelFilter) params.level = levelFilter;
      const response = await logsApi.list(params);
      setLogs(response.data.data);
      setTotal(response.data.total);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, levelFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const levels = ['', 'INFO', 'WARN', 'ERROR'];

  return (
    <div className="animate-fadeIn">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Logs</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          View and search transfer logs ({total} entries)
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingLeft: '36px' }}
            placeholder="Search logs..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        {levels.map((l) => (
          <button
            key={l || 'all'}
            onClick={() => { setLevelFilter(l); setPage(1); }}
            style={{
              padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
              border: '1px solid', fontFamily: 'inherit', transition: 'all 0.15s ease',
              borderColor: levelFilter === l ? 'var(--accent-blue)' : 'var(--border-secondary)',
              background: levelFilter === l ? 'rgba(99,102,241,0.1)' : 'transparent',
              color: levelFilter === l ? 'var(--accent-blue)' : 'var(--text-secondary)',
            }}
          >
            {l || 'All'}
          </button>
        ))}
      </div>

      {/* Log Viewer */}
      <div className="card" style={{ padding: '0' }}>
        <div style={{ maxHeight: '600px', overflow: 'auto', padding: '16px', fontFamily: 'monospace', fontSize: '13px' }}>
          {logs.map((log: any) => (
            <div key={log.id} style={{
              display: 'flex', gap: '12px', padding: '8px 0',
              borderBottom: '1px solid var(--border-secondary)',
            }}>
              <span style={{ color: 'var(--text-muted)', minWidth: '150px', flexShrink: 0, fontSize: '12px' }}>
                {new Date(log.timestamp).toLocaleString()}
              </span>
              <span style={{
                minWidth: '48px', fontWeight: 600, flexShrink: 0,
                color: log.level === 'ERROR' ? 'var(--accent-red)' : log.level === 'WARN' ? 'var(--accent-amber)' : 'var(--accent-emerald)',
              }}>
                {log.level}
              </span>
              <span style={{ color: 'var(--accent-blue)', minWidth: '120px', flexShrink: 0, fontSize: '12px' }}>
                {log.transfer?.name || '—'}
              </span>
              <span style={{ color: 'var(--text-secondary)', flex: 1, minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>{log.message}</span>
            </div>
          ))}
          {logs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
              No logs found
            </div>
          )}
        </div>
      </div>

      {total > 50 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
          <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: '13px' }} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span style={{ padding: '6px 14px', fontSize: '13px', color: 'var(--text-secondary)' }}>Page {page}</span>
          <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: '13px' }} disabled={logs.length < 50} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
