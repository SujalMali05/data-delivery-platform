'use client';

import { useEffect, useState } from 'react';
import { customersApi, gdriveApi } from '@/lib/api-client';
import { Calculator, FolderOpen, Loader2, Info } from 'lucide-react';
import FolderBrowser from '@/components/FolderBrowser';

export default function SizeCalculatorPage() {
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ count: number; bytes: number } | null>(null);

  // Form state
  const [type, setType] = useState<'GDrive' | 'S3'>('S3');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [path, setPath] = useState('');
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);

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

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    try {
      if (type === 'S3') {
        const customer = customers.find((c: any) => c.id === selectedCustomerId);
        if (!customer) throw new Error('Please select a customer first.');

        const res = await customersApi.size({
          roleArn: customer.roleArn,
          bucketName: customer.bucketName,
          region: customer.region,
          externalId: customer.externalId || undefined,
          path: path,
        });
        setResult(res.data);
      } else {
        const source = selectedSourceId.startsWith('GLOBAL_')
          ? {
              id: selectedSourceId,
              authType: selectedSourceId === 'GLOBAL_SERVICE_ACCOUNT' ? 'SERVICE_ACCOUNT' : 'OAUTH',
              sharedDriveId: undefined,
            }
          : sources.find((s: any) => s.id === selectedSourceId);
        if (!source) throw new Error('Please select a Google Drive source first.');

        const res = await gdriveApi.size({
          path: path,
          sharedDriveId: source.sharedDriveId || undefined,
          authType: source.authType,
        });
        setResult(res.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to calculate size.');
    } finally {
      setLoading(false);
    }
  };

  const selectedCustomer = customers.find((c: any) => c.id === selectedCustomerId);
  const selectedSource = selectedSourceId.startsWith('GLOBAL_')
    ? {
        id: selectedSourceId,
        name: 'Global User Account',
        authType: 'OAUTH',
        drivePath: '',
      }
    : sources.find((s: any) => s.id === selectedSourceId);

  // Format bytes helper
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="animate-fadeIn" style={{ maxWidth: '720px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Calculator size={24} color="var(--accent-blue)" />
        Storage Size Calculator
      </h1>
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px' }}>
        Calculate the total file size and count of any folder in Customer S3 or Google Drive recursively.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
        {/* Form panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Storage Type */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Storage Type *
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-secondary)' }}>
              <button
                type="button"
                onClick={() => {
                  setType('S3');
                  setPath('');
                  setResult(null);
                  setError('');
                }}
                style={{
                  padding: '10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: type === 'S3' ? 'var(--gradient-primary)' : 'transparent',
                  color: type === 'S3' ? 'var(--text-primary)' : 'var(--text-secondary)',
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
                  setSelectedSourceId('GLOBAL_OAUTH');
                }}
                style={{
                  padding: '10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: type === 'GDrive' ? 'var(--gradient-primary)' : 'transparent',
                  color: type === 'GDrive' ? 'var(--text-primary)' : 'var(--text-secondary)',
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

          <form onSubmit={handleCalculate} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Source Selection */}
            {type === 'S3' ? (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Customer Bucket *
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
                  <option value="GLOBAL_OAUTH">Global User Account (OAuth2 Token)</option>
                  <optgroup label="Saved Pull Sources">
                    {sources
                      .filter((s: any) => (s.direction || (s.authType === 'OAUTH' ? 'PULL' : 'PUSH')) === 'PULL')
                      .map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.drivePath})</option>
                      ))
                    }
                  </optgroup>
                  <optgroup label="Saved Push Sources">
                    {sources
                      .filter((s: any) => (s.direction || (s.authType === 'OAUTH' ? 'PULL' : 'PUSH')) === 'PUSH')
                      .map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.drivePath})</option>
                      ))
                    }
                  </optgroup>
                </select>
              </div>
            )}

            {/* Folder Path */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Folder Path (Prefix)
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="input"
                  placeholder={type === 'S3' ? 'e.g., Stark_Maptix/Audio' : 'e.g., Audio/Project Marvel'}
                  value={path}
                  onChange={(e) => {
                    setPath(e.target.value);
                    setResult(null);
                  }}
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
                  style={{ padding: '0 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <FolderOpen size={16} />
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
              style={{ opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Calculating Size (walking folder)...
                </>
              ) : (
                'Calculate Size'
              )}
            </button>
          </form>
        </div>

        {/* Results / Help panel */}
        <div>
          {result ? (
            <div className="glass" style={{ padding: '24px', borderRadius: '16px', border: '1px solid var(--border-primary)', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-secondary)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '10px', marginBottom: '4px' }}>
                Calculation Results
              </h3>
              
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Recursive Size</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-blue)', marginTop: '4px' }}>
                  {formatBytes(result.bytes)}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Files Count</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                  {result.count.toLocaleString()} files
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Exact Bytes</div>
                <div style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {result.bytes.toLocaleString()} bytes
                </div>
              </div>

              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-tertiary)', display: 'flex', gap: '6px', alignItems: 'flex-start', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px' }}>
                <Info size={14} style={{ minWidth: '14px', marginTop: '2px' }} />
                <span>This size includes all files recursively inside subfolders. Empty directories are not counted.</span>
              </div>
            </div>
          ) : (
            <div className="glass" style={{ padding: '24px', borderRadius: '16px', border: '1px dashed var(--border-secondary)', color: 'var(--text-tertiary)', textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
              <Calculator size={36} style={{ opacity: 0.3 }} />
              <div style={{ fontSize: '13px' }}>
                Select a folder path and click "Calculate Size" to view storage statistics.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Browser Popup */}
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
