'use client';

import { useEffect, useState } from 'react';
import { customersApi } from '@/lib/api-client';
import { formatDate, cn } from '@/lib/utils';
import {
  Plus,
  Shield,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import FolderBrowser from '@/components/FolderBrowser';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '', roleArn: '', bucketName: '', region: 'ap-south-1', prefixPath: '', externalId: '',
  });

  const fetchCustomers = async () => {
    try {
      const response = await customersApi.list();
      setCustomers(response.data);
    } catch (err) {
      console.error('Failed to fetch customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCustomers(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await customersApi.create({
        ...formData,
        externalId: formData.externalId || undefined,
      });
      setShowForm(false);
      setFormData({ name: '', roleArn: '', bucketName: '', region: 'ap-south-1', prefixPath: '', externalId: '' });
      fetchCustomers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to create customer');
    }
  };

  const handleValidate = async (id: string) => {
    setValidating(id);
    setValidationResult(null);
    try {
      const response = await customersApi.validate(id);
      setValidationResult({ id, ...response.data });
      fetchCustomers();
    } catch (err: any) {
      setValidationResult({ id, success: false, message: err.message });
    } finally {
      setValidating(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this customer configuration?')) return;
    try {
      await customersApi.delete(id);
      fetchCustomers();
    } catch (err) {
      console.error('Failed to delete customer:', err);
    }
  };

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Customer Configuration</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Manage customer AWS S3 access (AssumeRole)
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} />
          Add Customer
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>New Customer</h3>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>Customer Name *</label>
                <input className="input" placeholder="e.g., Maptix" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>IAM Role ARN *</label>
                <input className="input" placeholder="arn:aws:iam::748576367658:role/..." value={formData.roleArn} onChange={(e) => setFormData({ ...formData, roleArn: e.target.value })} required />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>S3 Bucket *</label>
                <input className="input" placeholder="e.g., hl-stark" value={formData.bucketName} onChange={(e) => setFormData({ ...formData, bucketName: e.target.value })} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>Region *</label>
                <input className="input" value={formData.region} onChange={(e) => setFormData({ ...formData, region: e.target.value })} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>Prefix Path</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input className="input" placeholder="e.g., Stark_Maptix/" value={formData.prefixPath} onChange={(e) => setFormData({ ...formData, prefixPath: e.target.value })} />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      if (!formData.roleArn || !formData.bucketName || !formData.region) {
                        alert('Please fill out IAM Role ARN, S3 Bucket, and Region first to browse.');
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
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="submit" className="btn-primary">Create Customer</button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Customer Cards */}
      <div style={{ display: 'grid', gap: '16px' }}>
        {customers.map((customer: any) => (
          <div key={customer.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <Shield size={18} style={{ color: 'var(--accent-blue)' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 600 }}>{customer.name}</h3>
                {customer.isValidated ? (
                  <span className="badge" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', borderColor: 'rgba(16,185,129,0.3)' }}>
                    <CheckCircle2 size={12} /> Validated
                  </span>
                ) : (
                  <span className="badge" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>
                    <XCircle size={12} /> Not Validated
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                {[
                  ['Role ARN', customer.roleArn],
                  ['Bucket', customer.bucketName],
                  ['Region', customer.region],
                  ['Prefix', customer.prefixPath || '—'],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{label}</p>
                    <p style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Validation Result */}
              {validationResult?.id === customer.id && (
                <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: validationResult.success ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${validationResult.success ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`, fontSize: '13px', color: validationResult.success ? '#10b981' : '#ef4444' }}>
                  {validationResult.message}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginLeft: '20px' }}>
              <button className="btn-secondary" style={{ padding: '8px 14px', fontSize: '13px' }} onClick={() => handleValidate(customer.id)} disabled={validating === customer.id}>
                {validating === customer.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Validate
              </button>
              <button className="btn-danger" style={{ padding: '8px 14px', fontSize: '13px' }} onClick={() => handleDelete(customer.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <FolderBrowser
        isOpen={isBrowserOpen}
        onClose={() => setIsBrowserOpen(false)}
        onSelect={(path) => setFormData({ ...formData, prefixPath: path ? path + '/' : '' })}
        type="s3"
        s3Params={{
          roleArn: formData.roleArn,
          bucketName: formData.bucketName,
          region: formData.region,
          externalId: formData.externalId || undefined,
        }}
        initialPath={formData.prefixPath}
      />
    </div>
  );
}
