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
  ignoreExtension: boolean;
  sourceType: string;
  sourceId: string;
  sourcePath: string;
  destType: string;
  destId: string;
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
  sourceGDrive?: { name: string; drivePath: string } | null;
  sourceCustomer?: { name: string; bucketName: string } | null;
  destGDrive?: { name: string; drivePath: string } | null;
  destCustomer?: { name: string; bucketName: string } | null;
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
    sourceType: 'GDrive', // 'GDrive' | 'S3'
    sourceId: '',
    sourcePath: '',
    destType: 'S3', // 'GDrive' | 'S3'
    destId: '',
    destinationPath: '',
    oneWay: false,
    ignoreExtension: false,
  });

  // Folder Browser Modal State
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [browserTarget, setBrowserTarget] = useState<'source' | 'dest'>('source');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchValidations(true);
    fetchDropdowns();
  }, []);

  useEffect(() => {
    const hasActive = validations.some((v) => ['PENDING', 'RUNNING'].includes(v.status));
    if (!hasActive) return;

    const interval = setInterval(() => {
      fetchValidations(false);
    }, 4000);

    return () => clearInterval(interval);
  }, [validations]);

  // Auto-fill destinationPath when destId changes and destType is S3
  useEffect(() => {
    if (formData.destType === 'S3' && formData.destId) {
      const customer = customers.find((c: any) => c.id === formData.destId);
      if (customer?.prefixPath) {
        setFormData((prev) => ({ ...prev, destinationPath: customer.prefixPath }));
      } else {
        setFormData((prev) => ({ ...prev, destinationPath: '' }));
      }
    }
  }, [formData.destId, formData.destType, customers]);

  const fetchValidations = async (showLoading = false) => {
    if (showLoading) setLoading(true);
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
    if (!formData.name || !formData.sourceId || !formData.destId) {
      alert('Please fill out all required fields.');
      return;
    }

    setSubmitLoading(true);
    setError('');
    try {
      await validationApi.create(formData);
      setFormData({
        name: '',
        sourceType: 'GDrive',
        sourceId: '',
        sourcePath: '',
        destType: 'S3',
        destId: '',
        destinationPath: '',
        oneWay: false,
        ignoreExtension: false,
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

  const openBrowser = (target: 'source' | 'dest') => {
    const isSource = target === 'source';
    const type = isSource ? formData.sourceType : formData.destType;
    const id = isSource ? formData.sourceId : formData.destId;
    if (!id) {
      alert(`Please select a ${type === 'GDrive' ? 'Google Drive' : 'Customer S3'} connection first.`);
      return;
    }
    setBrowserTarget(target);
    setIsBrowserOpen(true);
  };

  const getSelectedSource = () => {
    const activeId = browserTarget === 'source' ? formData.sourceId : formData.destId;
    if (activeId.startsWith('GLOBAL_')) {
      return {
        id: activeId,
        name: 'Global User Account',
        authType: 'OAUTH',
        drivePath: '',
      };
    }
    return sources.find((s) => s.id === activeId);
  };

  const getSelectedCustomer = () => {
    const activeId = browserTarget === 'source' ? formData.sourceId : formData.destId;
    return customers.find((c) => c.id === activeId);
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

  const browserType = browserTarget === 'source'
    ? (formData.sourceType === 'GDrive' ? 'gdrive' : 's3')
    : (formData.destType === 'GDrive' ? 'gdrive' : 's3');

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
            Integrity checks, file matching, and validation reports between Google Drive and Amazon S3
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
              {/* Source Configuration */}
              <div className="card" style={{ padding: '16px', border: '1px solid var(--border-secondary)', background: 'rgba(255,255,255,0.01)' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  {formData.sourceType === 'GDrive' ? <HardDrive size={16} color="var(--accent-blue)" /> : <Database size={16} color="var(--accent-blue)" />}
                  Source Connection
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className={`btn-secondary`}
                      onClick={() => setFormData({ ...formData, sourceType: 'GDrive', sourceId: '', sourcePath: '' })}
                      style={{ flex: 1, border: formData.sourceType === 'GDrive' ? '2px solid var(--accent-blue)' : '1px solid var(--border-secondary)', background: formData.sourceType === 'GDrive' ? 'rgba(59,130,246,0.05)' : 'transparent' }}
                    >
                      Google Drive
                    </button>
                    <button
                      type="button"
                      className={`btn-secondary`}
                      onClick={() => setFormData({ ...formData, sourceType: 'S3', sourceId: '', sourcePath: '' })}
                      style={{ flex: 1, border: formData.sourceType === 'S3' ? '2px solid var(--accent-blue)' : '1px solid var(--border-secondary)', background: formData.sourceType === 'S3' ? 'rgba(59,130,246,0.05)' : 'transparent' }}
                    >
                      Amazon S3
                    </button>
                  </div>

                  {formData.sourceType === 'GDrive' ? (
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Select GDrive Source *</label>
                      <select
                        className="select"
                        value={formData.sourceId}
                        onChange={(e) => setFormData({ ...formData, sourceId: e.target.value, sourcePath: '' })}
                        required
                      >
                        <option value="">Select source connection...</option>
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
                  ) : (
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Select Customer S3 *</label>
                      <select
                        className="select"
                        value={formData.sourceId}
                        onChange={(e) => setFormData({ ...formData, sourceId: e.target.value, sourcePath: '' })}
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
                  )}

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
                        onClick={() => openBrowser('source')}
                        disabled={!formData.sourceId}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <FolderOpen size={14} /> Browse
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Destination Configuration */}
              <div className="card" style={{ padding: '16px', border: '1px solid var(--border-secondary)', background: 'rgba(255,255,255,0.01)' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  {formData.destType === 'GDrive' ? <HardDrive size={16} color="var(--accent-blue)" /> : <Database size={16} color="var(--accent-blue)" />}
                  Destination Connection
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className={`btn-secondary`}
                      onClick={() => setFormData({ ...formData, destType: 'GDrive', destId: '', destinationPath: '' })}
                      style={{ flex: 1, border: formData.destType === 'GDrive' ? '2px solid var(--accent-blue)' : '1px solid var(--border-secondary)', background: formData.destType === 'GDrive' ? 'rgba(59,130,246,0.05)' : 'transparent' }}
                    >
                      Google Drive
                    </button>
                    <button
                      type="button"
                      className={`btn-secondary`}
                      onClick={() => setFormData({ ...formData, destType: 'S3', destId: '', destinationPath: '' })}
                      style={{ flex: 1, border: formData.destType === 'S3' ? '2px solid var(--accent-blue)' : '1px solid var(--border-secondary)', background: formData.destType === 'S3' ? 'rgba(59,130,246,0.05)' : 'transparent' }}
                    >
                      Amazon S3
                    </button>
                  </div>

                  {formData.destType === 'GDrive' ? (
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Select GDrive Destination *</label>
                      <select
                        className="select"
                        value={formData.destId}
                        onChange={(e) => setFormData({ ...formData, destId: e.target.value, destinationPath: '' })}
                        required
                      >
                        <option value="">Select destination connection...</option>
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
                  ) : (
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Select Customer S3 *</label>
                      <select
                        className="select"
                        value={formData.destId}
                        onChange={(e) => setFormData({ ...formData, destId: e.target.value, destinationPath: '' })}
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
                  )}

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
                        onClick={() => openBrowser('dest')}
                        disabled={!formData.destId}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <FolderOpen size={14} /> Browse
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="oneWay"
                  checked={formData.oneWay}
                  onChange={(e) => setFormData({ ...formData, oneWay: e.target.checked })}
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="oneWay" style={{ fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                  <strong>One-Way Validation Check</strong> (Verify that all files in Source are correctly present on Destination. Ignore extra objects on Destination.)
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="ignoreExtension"
                  checked={formData.ignoreExtension}
                  onChange={(e) => setFormData({ ...formData, ignoreExtension: e.target.checked })}
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="ignoreExtension" style={{ fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                  <strong>Ignore File Extensions</strong> (Compare base filenames only, ignoring extensions like .json, .wav, etc.)
                </label>
              </div>
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
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-tertiary)' }}>Sizing (Src ➔ Dst)</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-tertiary)' }}>Audit Results (Differ / Missing)</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-tertiary)', width: '130px' }}>Status</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-tertiary)', width: '160px' }}>Execution Date</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-tertiary)', width: '180px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {validations.map((v) => {
                  const hasStats = v.status === 'COMPLETED';

                  const sourceName = v.sourceType === 'GDrive' ? (v.sourceGDrive?.name || 'Drive') : (v.sourceCustomer?.name || 'S3');
                  const destName = v.destType === 'GDrive' ? (v.destGDrive?.name || 'Drive') : (v.destCustomer?.name || 'S3');

                  const pathSource = `${sourceName}:${v.sourcePath || '/'}`;
                  const pathDest = `${destName}:${v.destinationPath || '/'}`;

                  return (
                    <tr key={v.id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                      <td style={{ padding: '14px 20px', fontWeight: 500, color: 'var(--text-primary)' }}>
                        <div>{v.name}</div>
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                          {v.oneWay ? 'One-Way Audit' : 'Two-Way Full Audit'}
                          {v.ignoreExtension ? ' (No Ext)' : ''}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxWidth: '300px' }}>
                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: '12px' }} title={pathSource}>
                            🟢 {pathSource}
                          </span>
                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: '12px' }} title={pathDest}>
                            🔵 {pathDest}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 20px', color: 'var(--text-secondary)' }}>
                        {hasStats ? (
                          <div style={{ display: 'flex', flexDirection: 'column', fontSize: '11px', gap: '2px' }}>
                            <span>Src: {v.srcTotalFiles} ({formatBytes(v.srcTotalBytes)})</span>
                            <span>Dst: {v.dstTotalFiles} ({formatBytes(v.dstTotalBytes)})</span>
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
                              <span style={{ color: 'var(--accent-purple)', fontWeight: 600 }}>{v.missingDstCount} unique in Source</span>
                            ) : null}
                            {!v.oneWay && v.missingSrcCount > 0 ? (
                              <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{v.missingSrcCount} unique in Destination</span>
                            ) : null}
                            {v.differCount === 0 && v.missingDstCount === 0 && (v.oneWay || v.missingSrcCount === 0) && v.srcTotalFiles === v.dstTotalFiles && Number(v.srcTotalBytes) === Number(v.dstTotalBytes) ? (
                              <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>✅ 100% In Sync</span>
                            ) : (
                              v.differCount === 0 && v.missingDstCount === 0 && (v.oneWay || v.missingSrcCount === 0) ? (
                                <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>⚠️ Sizing/Count Mismatch</span>
                              ) : null
                            )}
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
                      <td style={{ padding: '14px 20px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                          <Link
                            href={`/dashboard/validation/${v.id}`}
                            className="btn-secondary"
                            style={{
                              padding: '6px 12px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              border: '1px solid var(--accent-blue)',
                              color: 'var(--accent-blue)',
                              whiteSpace: 'nowrap',
                              fontSize: '12px',
                              textDecoration: 'none'
                            }}
                          >
                            <Eye size={13} /> {v.status === 'COMPLETED' ? 'View Report' : ['PENDING', 'RUNNING'].includes(v.status) ? 'Checking...' : 'View Details'}
                          </Link>
                          <button
                            className="btn-danger"
                            style={{
                              padding: '6px 8px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            onClick={() => handleDelete(v.id)}
                          >
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
      {isBrowserOpen && (browserType === 's3' ? getSelectedCustomer() : getSelectedSource()) && (
        <FolderBrowser
          isOpen={isBrowserOpen}
          onClose={() => setIsBrowserOpen(false)}
          onSelect={(selectedPath) => {
            const isSource = browserTarget === 'source';
            const isGDrive = isSource ? formData.sourceType === 'GDrive' : formData.destType === 'GDrive';

            if (isGDrive) {
              const cleanPath = selectedPath.replace(/^\//, '').replace(/\/+$/, '');
              const drivePath = getSelectedSource()?.drivePath?.replace(/^\//, '').replace(/\/+$/, '') || '';
              
              if (drivePath && (cleanPath === drivePath || cleanPath.startsWith(drivePath + '/'))) {
                const relativePath = cleanPath === drivePath ? '' : cleanPath.substring(drivePath.length + 1);
                if (isSource) {
                  setFormData({ ...formData, sourcePath: relativePath });
                } else {
                  setFormData({ ...formData, destinationPath: relativePath });
                }
              } else {
                if (isSource) {
                  setFormData({ ...formData, sourcePath: cleanPath });
                } else {
                  setFormData({ ...formData, destinationPath: cleanPath });
                }
              }
            } else {
              if (isSource) {
                setFormData({ ...formData, sourcePath: selectedPath });
              } else {
                setFormData({ ...formData, destinationPath: selectedPath });
              }
            }
          }}
          type={browserType}
          initialPath={
            browserType === 'gdrive'
              ? (() => {
                  const drivePath = getSelectedSource()?.drivePath?.replace(/^\//, '').replace(/\/+$/, '') || '';
                  const rawPath = browserTarget === 'source' ? formData.sourcePath : formData.destinationPath;
                  const startPath = rawPath.replace(/^\//, '').replace(/\/+$/, '');
                  return drivePath ? (startPath ? `${drivePath}/${startPath}` : drivePath) : startPath;
                })()
              : (browserTarget === 'source' ? formData.sourcePath : formData.destinationPath)
          }
          s3Params={
            browserType === 's3' && getSelectedCustomer()
              ? {
                  roleArn: getSelectedCustomer().roleArn,
                  bucketName: getSelectedCustomer().bucketName,
                  region: getSelectedCustomer().region,
                  externalId: getSelectedCustomer().externalId || undefined,
                }
              : undefined
          }
          gdriveAuthType={browserType === 'gdrive' && getSelectedSource() ? getSelectedSource().authType : undefined}
          sharedDriveId={browserType === 'gdrive' && getSelectedSource()?.driveType === 'SHARED_DRIVE' ? getSelectedSource().sharedDriveId : undefined}
        />
      )}
    </div>
  );
}
