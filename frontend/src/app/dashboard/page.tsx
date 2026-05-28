'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { dashboardApi } from '@/lib/api-client';
import { useSSE } from '@/hooks/use-sse';
import {
  formatBytes,
  formatDate,
  getStatusBgColor,
  getProgressPercentage,
} from '@/lib/utils';
import {
  Activity,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Zap,
  HardDrive,
  Plus,
  RefreshCw,
} from 'lucide-react';

interface DashboardData {
  metrics: {
    running: number;
    queued: number;
    failed: number;
    completed: number;
    totalTransferred: string;
  };
  recentTransfers: any[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveUpdates, setLiveUpdates] = useState<Record<string, any>>({});

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

  const fetchDashboard = useCallback(async () => {
    try {
      const response = await dashboardApi.overview();
      setData(response.data);
    } catch (error: any) {
      console.warn('Failed to fetch dashboard:', error.message || error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 10000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  // SSE for live transfer updates
  useSSE({
    url: '/transfers/stream/all',
    enabled: true,
    onMessage: (eventData) => {
      if (eventData.transferId) {
        setLiveUpdates((prev) => ({
          ...prev,
          [eventData.transferId]: eventData,
        }));
      }
    },
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <RefreshCw size={24} style={{ color: 'var(--accent-blue)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const metrics = data?.metrics;
  const transfers = data?.recentTransfers || [];

  const statCards = [
    {
      label: 'Running',
      value: metrics?.running || 0,
      icon: Activity,
      color: '#10b981',
      glow: 'rgba(16, 185, 129, 0.15)',
    },
    {
      label: 'Queued',
      value: metrics?.queued || 0,
      icon: Clock,
      color: '#f59e0b',
      glow: 'rgba(245, 158, 11, 0.15)',
    },
    {
      label: 'Completed',
      value: metrics?.completed || 0,
      icon: CheckCircle2,
      color: '#6366f1',
      glow: 'rgba(99, 102, 241, 0.15)',
    },
    {
      label: 'Failed',
      value: metrics?.failed || 0,
      icon: AlertTriangle,
      color: '#ef4444',
      glow: 'rgba(239, 68, 68, 0.15)',
    },
  ];

  return (
    <div className="animate-fadeIn">
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '28px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Dashboard</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Monitor your data delivery operations
          </p>
        </div>
        <Link href="/dashboard/transfers/new" className="btn-primary">
          <Plus size={16} />
          New Transfer
        </Link>
      </div>

      {/* ── Stats Cards ────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
          marginBottom: '28px',
        }}
      >
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="card-stat">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                      fontWeight: 500,
                      marginBottom: '8px',
                    }}
                  >
                    {card.label}
                  </p>
                  <p style={{ fontSize: '32px', fontWeight: 700 }}>
                    {card.value}
                  </p>
                </div>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: card.glow,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={22} color={card.color} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Total Transferred + Throughput ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          marginBottom: '28px',
        }}
      >
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <HardDrive size={16} style={{ color: 'var(--accent-cyan)' }} />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Total Data Transferred
            </span>
          </div>
          <p
            style={{
              fontSize: '36px',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #06b6d4, #10b981)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {formatBytes(metrics?.totalTransferred || '0')}
          </p>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Zap size={16} style={{ color: 'var(--accent-amber)' }} />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Active Transfers
            </span>
          </div>
          <p style={{ fontSize: '36px', fontWeight: 700 }}>
            {(metrics?.running || 0) + (metrics?.queued || 0)}
          </p>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
            {metrics?.running || 0} running · {metrics?.queued || 0} queued
          </p>
        </div>
      </div>

      {/* ── Recent Transfers Table ──────── */}
      <div style={{ marginBottom: '12px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Recent Transfers</h2>
          <Link
            href="/dashboard/transfers"
            style={{
              fontSize: '13px',
              color: 'var(--accent-blue)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              textDecoration: 'none',
            }}
          >
            View All
            <ArrowUpRight size={14} />
          </Link>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Transfer</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Speed / Duration</th>
                <th>ETA / Files</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {transfers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: 'center',
                      padding: '40px',
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    No transfers yet. Create your first transfer to get started.
                  </td>
                </tr>
              ) : (
                transfers.map((transfer: any) => {
                  const live = liveUpdates[transfer.id];
                  const status = live?.status || transfer.status;
                  const progress = status === 'COMPLETED' ? 100 : getProgressPercentage(
                    live?.transferredBytes || transfer.transferredBytes,
                    live?.totalBytes || transfer.totalBytes,
                  );
                  const speed = live?.speed || transfer.currentSpeed || '—';
                  const eta = live?.eta || transfer.eta || '—';

                  const isFinished = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status);

                  return (
                    <tr key={transfer.id}>
                      <td>
                        <Link
                          href={`/dashboard/transfers/${transfer.id}`}
                          style={{
                            color: 'var(--text-primary)',
                            textDecoration: 'none',
                            fontWeight: 500,
                          }}
                        >
                          {transfer.name}
                        </Link>
                        <div
                          style={{
                            fontSize: '12px',
                            color: 'var(--text-tertiary)',
                            marginTop: '2px',
                          }}
                        >
                          {transfer.direction === 'PULL'
                            ? `${transfer.customer?.name} ➔ ${transfer.source?.name}`
                            : `${transfer.source?.name} ➔ ${transfer.customer?.name}`
                          }
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${getStatusBgColor(status)}`}>
                          {status === 'RUNNING' && <span className="live-dot" />}
                          {status}
                        </span>
                      </td>
                      <td style={{ minWidth: '160px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div className="progress-bar" style={{ flex: 1 }}>
                            <div
                              className={`progress-bar-fill ${
                                status === 'COMPLETED'
                                  ? 'completed'
                                  : status === 'FAILED'
                                    ? 'failed'
                                    : ''
                              }`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: '12px',
                              color: 'var(--text-secondary)',
                              fontWeight: 500,
                              minWidth: '36px',
                            }}
                          >
                            {progress}%
                          </span>
                        </div>
                      </td>
                      <td>
                        {isFinished ? (
                          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {formatDuration(transfer.startedAt, transfer.completedAt)}
                          </span>
                        ) : (
                          <span style={{ fontSize: '13px', fontFamily: 'monospace' }}>
                            {speed}
                          </span>
                        )}
                      </td>
                      <td>
                        {isFinished ? (
                          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {(live?.transferredFiles ?? transfer.transferredFiles)} / {(live?.totalFiles ?? transfer.totalFiles)}
                          </span>
                        ) : (
                          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {eta}
                          </span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                          {formatDate(transfer.updatedAt)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
