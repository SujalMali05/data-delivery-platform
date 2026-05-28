'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { customersApi, gdriveApi, transfersApi } from '@/lib/api-client';
import { ArrowLeft, Send, Loader2, Clock, Plus } from 'lucide-react';
import Link from 'next/link';
import FolderBrowser from '@/components/FolderBrowser';

export default function NewTransferPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [clickedMode, setClickedMode] = useState<'CREATE' | 'START' | 'QUEUE'>('START');

  const [form, setForm] = useState({
    name: '',
    direction: 'PUSH',
    sourceId: '',
    customerId: '',
    destinationPath: '',
    mode: 'COPY',
    concurrency: 32,
    checkers: 32,
    retries: 50,
    bandwidthLimit: '',
  });

  useEffect(() => {
    Promise.all([
      customersApi.list(),
      gdriveApi.sources(),
    ]).then(([custRes, srcRes]) => {
      setCustomers(custRes.data);
      setSources(srcRes.data);
    });
  }, []);

  // Auto-fill destination when customer is selected
  useEffect(() => {
    if (form.customerId) {
      const customer = customers.find((c: any) => c.id === form.customerId);
      if (customer?.prefixPath) {
        setForm((prev) => ({ ...prev, destinationPath: customer.prefixPath }));
      }
    }
  }, [form.customerId, customers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
 
    try {
      const response = await transfersApi.create({
        ...form,
        launchMode: clickedMode,
        bandwidthLimit: form.bandwidthLimit || undefined,
      });
      router.push(`/dashboard/transfers/${response.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create transfer');
      setLoading(false);
    }
  };

  const selectedCustomer = customers.find((c: any) => c.id === form.customerId);

  return (
    <div className="animate-fadeIn" style={{ maxWidth: '720px' }}>
      <Link href="/dashboard/transfers" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-tertiary)', fontSize: '13px', textDecoration: 'none', marginBottom: '20px' }}>
        <ArrowLeft size={14} />
        Back to Transfers
      </Link>
 
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>Create Transfer</h1>
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px' }}>
        {form.direction === 'PULL'
          ? 'Set up a new data transfer from Customer S3 to Google Drive'
          : 'Set up a new data transfer from Google Drive to Customer S3'
        }
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Transfer Name */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
            Transfer Name *
          </label>
          <input
            className="input"
            placeholder="e.g., Stark_Maptix Delivery"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>

        {/* Transfer Direction */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
            Transfer Direction *
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-secondary)' }}>
            <button
              type="button"
              onClick={() => setForm({ ...form, direction: 'PUSH', sourceId: '' })}
              style={{
                padding: '10px',
                borderRadius: '6px',
                border: 'none',
                background: form.direction === 'PUSH' ? 'var(--gradient-primary)' : 'transparent',
                color: form.direction === 'PUSH' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              Google Drive ➔ Customer S3 (Push)
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, direction: 'PULL', sourceId: '' })}
              style={{
                padding: '10px',
                borderRadius: '6px',
                border: 'none',
                background: form.direction === 'PULL' ? 'var(--gradient-primary)' : 'transparent',
                color: form.direction === 'PULL' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              Customer S3 ➔ Google Drive (Pull)
            </button>
          </div>
        </div>

        {/* Source + Customer (2 columns) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              {form.direction === 'PULL' ? 'Google Drive Destination *' : 'Google Drive Source *'}
            </label>
            <select className="select" value={form.sourceId} onChange={(e) => setForm({ ...form, sourceId: e.target.value })} required>
              <option value="">Select source...</option>
              {sources
                .filter((s: any) => form.direction === 'PULL' ? s.authType === 'OAUTH' : s.authType === 'SERVICE_ACCOUNT')
                .map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.drivePath})</option>
                ))
              }
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              {form.direction === 'PULL' ? 'Customer S3 Source *' : 'Customer S3 Destination *'}
            </label>
            <select className="select" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} required>
              <option value="">Select customer...</option>
              {customers.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name} ({c.bucketName})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Destination Path */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
            {form.direction === 'PULL' ? 'Source Path (S3 Prefix) *' : 'Destination Path (S3 Prefix) *'}
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input className="input" placeholder="e.g., Stark_Maptix/Audio/" value={form.destinationPath} onChange={(e) => setForm({ ...form, destinationPath: e.target.value })} required />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (!form.customerId) {
                  alert('Please select a customer first to browse their S3 bucket.');
                  return;
                }
                setIsBrowserOpen(true);
              }}
              style={{ padding: '0 14px' }}
            >
              Browse
            </button>
          </div>
        </div>

        {/* Mode + Performance (3 columns) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Transfer Mode
            </label>
            <select className="select" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              <option value="COPY">COPY</option>
              <option value="SYNC">SYNC</option>
              <option value="MOVE">MOVE</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Concurrency
            </label>
            <input className="input" type="number" min={1} max={128} value={form.concurrency} onChange={(e) => setForm({ ...form, concurrency: parseInt(e.target.value) || 32 })} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Retries
            </label>
            <input className="input" type="number" min={1} max={100} value={form.retries} onChange={(e) => setForm({ ...form, retries: parseInt(e.target.value) || 50 })} />
          </div>
        </div>

        {/* Bandwidth Limit */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
            Bandwidth Limit (optional)
          </label>
          <input className="input" placeholder="e.g., 100M for 100 MB/s (leave empty for unlimited)" value={form.bandwidthLimit} onChange={(e) => setForm({ ...form, bandwidthLimit: e.target.value })} />
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--accent-red)', fontSize: '13px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
          <button
            type="submit"
            className="btn-primary"
            onClick={() => setClickedMode('START')}
            disabled={loading}
            style={{ opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {loading && clickedMode === 'START' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Start Transfer
          </button>

          <button
            type="submit"
            className="btn-secondary"
            onClick={() => setClickedMode('QUEUE')}
            disabled={loading}
            style={{ opacity: loading ? 0.7 : 1, border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {loading && clickedMode === 'QUEUE' ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />}
            Queue Transfer
          </button>

          <button
            type="submit"
            className="btn-secondary"
            onClick={() => setClickedMode('CREATE')}
            disabled={loading}
            style={{ opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {loading && clickedMode === 'CREATE' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Create Transfer
          </button>

          <Link href="/dashboard/transfers" className="btn-secondary" style={{ display: 'flex', alignItems: 'center' }}>
            Cancel
          </Link>
        </div>
      </form>

      <FolderBrowser
        isOpen={isBrowserOpen}
        onClose={() => setIsBrowserOpen(false)}
        onSelect={(path) => setForm({ ...form, destinationPath: path ? path + '/' : '' })}
        type="s3"
        s3Params={
          selectedCustomer
            ? {
                roleArn: selectedCustomer.roleArn,
                bucketName: selectedCustomer.bucketName,
                region: selectedCustomer.region,
                externalId: selectedCustomer.externalId || undefined,
              }
            : undefined
        }
        initialPath={form.destinationPath}
      />
    </div>
  );
}
