'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Plus,
  Trash2,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  HardDrive,
  Database,
  Eye,
  RefreshCw,
  FolderOpen,
  FileCheck,
  ArrowRight,
  Info,
} from 'lucide-react';
import { validationApi, customersApi, gdriveApi } from '@/lib/api-client';
import FolderBrowser from '@/components/FolderBrowser';

interface ValidationItem {
  id: string;
  name: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  oneWay: boolean;
  sourceId: string;
  sourcePath: string;
  customerId: string;
  destinationPath: string;
  srcTotalBytes: string;
  srcTotalFiles: number;
  dstTotalBytes: string;
  dstTotalFiles: number;
  matchCount: number;
  differCount: number;
  missingSrcCount: number;
  missingDstCount: number;
  errorCount: number;
  errorMessage?: string;
  createdAt: string;
  source: { name: string; drivePath: string };
  customer: { name: string; bucketName: string };
}

export default function ValidationPage() {
  const [validations, setValidations] = useState<ValidationItem[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    sourceId: '',
    sourcePath: '',
    customerId: '',
    destinationPath: '',
    oneWay: false,
  });

  // Folder Browser Modal State
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [browserTarget, setBrowserTarget] = useState<'gdrive' | 's3'>('gdrive');
  const [gdriveFromRoot, setGdriveFromRoot] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchValidations();
    fetchDropdowns();
  }, []);

  // Auto-fill destinationPath when customer changes
  useEffect(() => {
    if (formData.customerId) {
      const customer = customers.find((c: any) => c.id === formData.customerId);
      if (customer?.prefixPath) {
        setFormData((prev) => ({ ...prev, destinationPath: customer.prefixPath }));
      } else {
        setFormData((prev) => ({ ...prev, destinationPath: '' }));
      }
    }
  }, [formData.customerId, customers]);

  const fetchValidations = async () => {
    setLoading(true);
    try {
      const res = await validationApi.list();
      setValidations(res.data);
    } catch (err: any) {
      console.error('Failed to load validations:', err);
      setError('Failed to load validation history.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDropdowns = async () => {
    try {
      const [custRes, srcRes] = await Promise.all([
        customersApi.list(),
        gdriveApi.sources(),
      ]);
      setCustomers(custRes.data);
      setSources(srcRes.data);
    } catch (err) {
      console.error('Failed to load dropdown sources:', err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.sourceId || !formData.customerId) {
      alert('Please fill out all required fields.');
      return;
    }

    setSubmitLoading(true);
    setError('');
    try {
      await validationApi.create(formData);
      setFormData({
        name: '',
        sourceId: '',
        sourcePath: '',
        customerId: '',
        destinationPath: '',
        oneWay: false,
      });
      setShowForm(false);
      fetchValidations();
    } catch (err: any) {
      console.error('Failed to create validation:', err);
      setError(err.response?.data?.message || 'Failed to start folder validation.');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this validation run and its report?')) return;
    try {
      await validationApi.delete(id);
      fetchValidations();
    } catch (err) {
      console.error('Failed to delete validation:', err);
      alert('Failed to delete validation run.');
    }
  };

  const openBrowser = (target: 'gdrive' | 's3') => {
    if (target === 'gdrive' && !formData.sourceId) {
      alert('Please select a Google Drive source first.');
      return;
    }
    if (target === 's3' && !formData.customerId) {
      alert('Please select a Customer S3 configuration first.');
      return;
    }
    setBrowserTarget(target);
    setIsBrowserOpen(true);
  };

  const getSelectedSource = () => {
    return sources.find((s) => s.id === formData.sourceId);
  };

  const getSelectedCustomer = () => {
    return customers.find((c) => c.id === formData.customerId);
  };

  const formatBytes = (bytesStr: string) => {
    const bytes = parseInt(bytesStr) || 0;
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="badge badge-emerald" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle2 size={12} /> Completed
          </span>
        );
      case 'RUNNING':
        return (
          <span className="badge badge-blue animate-pulse" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Loader2 size={12} className="animate-spin" /> Running
          </span>
        );
      case 'PENDING':
        return (
          <span className="badge badge-amber" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <RefreshCw size={12} className="animate-spin" style={{ animationDuration: '4s' }} /> Pending
          </span>
        );
      case 'FAILED':
        return (
          <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <XCircle size={12} /> Failed
          </span>
        );
      default:
        return <span className="badge">{status}</span>;
    }
  };

  return (
    <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '20px', minHeight: 'calc(100vh - 120px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileCheck size={26} color="var(--accent-blue)" />
            Folder Validation & Difference Reports
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Integrity checks, file matching, and validation reports between Google Drive and S3
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> New Folder Validation
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--accent-red)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Submission Form */}
      {showForm && (
        <div className="card animate-fadeIn">
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Configure Directory Integrity Check</h3>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Validation Run Name *
              </label>
              <input
                className="input"
                placeholder="e.g., Weekly Audio Collection Audit"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Google Drive Configuration */}
              <div className="card" style={{ padding: '16px', border: '1px solid var(--border-secondary)', background: 'rgba(255,255,255,0.01)' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <HardDrive size={16} color="var(--accent-blue)" />
                  Google Drive (Source)
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Select GDrive Source *</label>
                    <select
                      className="select"
                      value={formData.sourceId}
                      onChange={(e) => {
                        setFormData({ ...formData, sourceId: e.target.value, sourcePath: '' });
                        setGdriveFromRoot(false);
                      }}
                      required
                    >
                      <option value="">Select source connection...</option>
                      {sources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.drivePath})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Folder Sub-Path (Optional)</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        className="input"
                        placeholder="Root level (leave empty)"
                        value={formData.sourcePath}
                        onChange={(e) => setFormData({ ...formData, sourcePath: e.target.value })}
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => openBrowser('gdrive')}
                        disabled={!formData.sourceId}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <FolderOpen size={14} /> Browse
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                    <input
                      type="checkbox"
                      id="gdriveFromRoot"
                      checked={gdriveFromRoot}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        setGdriveFromRoot(isChecked);
                        if (isChecked) {
                          if (!formData.sourcePath.startsWith('/')) {
                            setFormData((prev) => ({ ...prev, sourcePath: '/' + prev.sourcePath.replace(/^\//, '') }));
                          }
                        } else {
                          setFormData((prev) => ({ ...prev, sourcePath: prev.sourcePath.replace(/^\//, '') }));
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                    <label htmlFor="gdriveFromRoot" style={{ fontSize: '11px', color: 'var(--text-tertiary)', cursor: 'pointer', userSelect: 'none' }}>
                      Custom Path from Root (Ignore source default path)
                    </label>
                  </div>
                </div>
              </div>

              {/* S3 Configuration */}
              <div className="card" style={{ padding: '16px', border: '1px solid var(--border-secondary)', background: 'rgba(255,255,255,0.01)' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <Database size={16} color="var(--accent-blue)" />
                  Amazon S3 (Destination)
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Select Customer S3 *</label>
                    <select
                      className="select"
                      value={formData.customerId}
                      onChange={(e) => setFormData({ ...formData, customerId: e.target.value, destinationPath: '' })}
                      required
                    >
                      <option value="">Select customer bucket...</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.bucketName})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Prefix Sub-Path (Optional)</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        className="input"
                        placeholder="Root level (leave empty)"
                        value={formData.destinationPath}
                        onChange={(e) => setFormData({ ...formData, destinationPath: e.target.value })}
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => openBrowser('s3')}
                        disabled={!formData.customerId}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <FolderOpen size={14} /> Browse
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="oneWay"
                checked={formData.oneWay}
                onChange={(e) => setFormData({ ...formData, oneWay: e.target.checked })}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="oneWay" style={{ fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                <strong>One-Way Validation Check</strong> (Verify that all files in Google Drive are correctly present on S3. Ignore extra objects on S3.)
              </label>
            </div>

            <div style={{ display: 'flex', gap: '12px', borderTop: '1px solid var(--border-secondary)', paddingTop: '16px', marginTop: '4px' }}>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitLoading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: submitLoading ? 0.7 : 1 }}
              >
                {submitLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                Run Validation
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowForm(false)}
                disabled={submitLoading}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* History List */}
      <div className="glass" style={{ borderRadius: '12px', border: '1px solid var(--border-primary)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-secondary)', background: 'rgba(255,255,255,0.01)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Validation History</h3>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '12px' }}>
            <Loader2 className="animate-spin" size={32} color="var(--accent-blue)" />
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Loading folder check history...</span>
          </div>
        ) : validations.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: '12px', textAlign: 'center' }}>
            <FileCheck size={40} color="var(--text-muted)" style={{ opacity: 0.3 }} />
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '300px' }}>
              No folder validation checks run yet. Click "New Folder Validation" to start auditing.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-secondary)', background: 'rgba(255,255,255,0.01)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-tertiary)' }}>Run Name</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-tertiary)' }}>Folders Path Mapping</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-tertiary)' }}>Sizing (Drive ➔ S3)</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-tertiary)' }}>Audit Results (Differ / Missing)</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-tertiary)', width: '130px' }}>Status</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-tertiary)', width: '160px' }}>Execution Date</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-tertiary)', width: '140px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {validations.map((v) => {
                  const hasStats = v.status === 'COMPLETED';
                  const pathGoogle = `${v.source?.name}:${v.sourcePath || '/'}`;
                  const pathS3 = `${v.customer?.name}:${v.destinationPath || '/'}`;

                  return (
                    <tr key={v.id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                      <td style={{ padding: '14px 20px', fontWeight: 500, color: 'var(--text-primary)' }}>
                        <div>{v.name}</div>
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                          {v.oneWay ? 'One-Way Audit' : 'Two-Way Full Audit'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxWidth: '300px' }}>
                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: '12px' }} title={pathGoogle}>
                            🟢 {pathGoogle}
                          </span>
                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: '12px' }} title={pathS3}>
                            🔵 {pathS3}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 20px', color: 'var(--text-secondary)' }}>
                        {hasStats ? (
                          <div style={{ display: 'flex', flexDirection: 'column', fontSize: '11px', gap: '2px' }}>
                            <span>GDrive: {v.srcTotalFiles} ({formatBytes(v.srcTotalBytes)})</span>
                            <span>S3: {v.dstTotalFiles} ({formatBytes(v.dstTotalBytes)})</span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        {hasStats ? (
                          <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
                            {v.differCount > 0 ? (
                              <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>{v.differCount} diff</span>
                            ) : null}
                            {v.missingDstCount > 0 ? (
                              <span style={{ color: 'var(--accent-purple)', fontWeight: 600 }}>{v.missingDstCount} unique in Drive</span>
                            ) : null}
                            {!v.oneWay && v.missingSrcCount > 0 ? (
                              <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{v.missingSrcCount} unique in S3</span>
                            ) : null}
                            {v.differCount === 0 && v.missingDstCount === 0 && (v.oneWay || v.missingSrcCount === 0) ? (
                              <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>✅ 100% In Sync</span>
                            ) : null}
                          </div>
                        ) : v.status === 'FAILED' ? (
                          <span style={{ color: 'var(--accent-red)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }} title={v.errorMessage}>
                            <Info size={13} /> Hover for error info
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 20px' }}>{getStatusBadge(v.status)}</td>
                      <td style={{ padding: '14px 20px', color: 'var(--text-muted)', fontSize: '12px' }}>
                        {new Date(v.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          {hasStats ? (
                            <Link href={`/dashboard/validation/${v.id}`} className="btn-secondary" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)' }}>
                              <Eye size={13} /> View Report
                            </Link>
                          ) : (
                            <button className="btn-secondary" disabled style={{ padding: '6px 10px', opacity: 0.5 }}>
                              <Eye size={13} /> Report
                            </button>
                          )}
                          <button className="btn-danger" style={{ padding: '6px 8px' }} onClick={() => handleDelete(v.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Directory Browser Modal */}
      {isBrowserOpen && (browserTarget === 's3' ? getSelectedCustomer() : getSelectedSource()) && (
        <FolderBrowser
          isOpen={isBrowserOpen}
          onClose={() => setIsBrowserOpen(false)}
          onSelect={(selectedPath) => {
            if (browserTarget === 'gdrive') {
              const cleanPath = selectedPath.replace(/^\//, '').replace(/\/+$/, '');
              const drivePath = getSelectedSource()?.drivePath?.replace(/^\//, '').replace(/\/+$/, '') || '';
              
              if (gdriveFromRoot) {
                setFormData({ ...formData, sourcePath: '/' + cleanPath });
              } else if (drivePath && (cleanPath === drivePath || cleanPath.startsWith(drivePath + '/'))) {
                const relativePath = cleanPath === drivePath ? '' : cleanPath.substring(drivePath.length + 1);
                setFormData({ ...formData, sourcePath: relativePath });
              } else {
                setGdriveFromRoot(true);
                setFormData({ ...formData, sourcePath: '/' + cleanPath });
              }
            } else {
              setFormData({ ...formData, destinationPath: selectedPath });
            }
          }}
          type={browserTarget}
          initialPath={
            browserTarget === 'gdrive'
              ? (gdriveFromRoot
                  ? formData.sourcePath.replace(/^\//, '')
                  : (() => {
                      const drivePath = getSelectedSource()?.drivePath?.replace(/^\//, '').replace(/\/+$/, '') || '';
                      const startPath = formData.sourcePath.replace(/^\//, '').replace(/\/+$/, '');
                      return drivePath ? (startPath ? `${drivePath}/${startPath}` : drivePath) : startPath;
                    })()
                )
              : formData.destinationPath
          }
          s3Params={
            browserTarget === 's3' && getSelectedCustomer()
              ? {
                  roleArn: getSelectedCustomer().roleArn,
                  bucketName: getSelectedCustomer().bucketName,
                  region: getSelectedCustomer().region,
                  externalId: getSelectedCustomer().externalId || undefined,
                }
              : undefined
          }
          gdriveAuthType={browserTarget === 'gdrive' && getSelectedSource() ? getSelectedSource().authType : undefined}
          sharedDriveId={browserTarget === 'gdrive' && getSelectedSource()?.driveType === 'SHARED_DRIVE' ? getSelectedSource().sharedDriveId : undefined}
        />
      )}
    </div>
  );
}
