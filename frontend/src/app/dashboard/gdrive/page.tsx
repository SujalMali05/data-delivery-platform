'use client';

import { useEffect, useState } from 'react';
import { gdriveApi } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { Plus, HardDrive, Trash2, Cloud, FolderOpen, KeyRound, UserCheck } from 'lucide-react';
import FolderBrowser from '@/components/FolderBrowser';

export default function GdrivePage() {
  const [sources, setSources] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'PULL' | 'PUSH'>('PULL');
  const [formData, setFormData] = useState({
    name: '',
    drivePath: '',
    driveType: 'MY_DRIVE',
    sharedDriveId: '',
    authType: 'OAUTH',
  });

  useEffect(() => {
    gdriveApi.status().then((r) => setStatus(r.data)).catch(() => {});
    gdriveApi.sources().then((r) => setSources(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      authType: 'OAUTH',
    }));
  }, [activeTab]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await gdriveApi.createSource({
        ...formData,
        direction: activeTab,
        sharedDriveId: formData.sharedDriveId || undefined,
      });
      setShowForm(false);
      setFormData({
        name: '', drivePath: '', driveType: 'MY_DRIVE', sharedDriveId: '',
        authType: 'OAUTH',
      });
      const r = await gdriveApi.sources();
      setSources(r.data);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to add source');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this source?')) return;
    await gdriveApi.deleteSource(id);
    const r = await gdriveApi.sources();
    setSources(r.data);
  };

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Google Drive</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>Manage Google Drive sources for transfers</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> Add Source
        </button>
      </div>

      {/* Connection Status */}
      <div className="card" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Cloud size={20} style={{ color: status?.rcloneConnected ? 'var(--accent-emerald)' : 'var(--accent-red)' }} />
        <div>
          <p style={{ fontSize: '14px', fontWeight: 500 }}>
            rclone: {status?.rcloneConnected ? '✅ Connected' : '❌ Not Connected'}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            OAuth2 Token: {status?.oauthConfigured ? 'Configured' : 'Not Configured'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-secondary)', marginBottom: '20px', paddingBottom: '2px' }}>
        <button
          onClick={() => setActiveTab('PULL')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'PULL' ? 'var(--accent-blue)' : 'var(--text-tertiary)',
            borderBottom: activeTab === 'PULL' ? '2px solid var(--accent-blue)' : '2px solid transparent',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Pull Sources (S3 ➔ Google Drive)
        </button>
        <button
          onClick={() => setActiveTab('PUSH')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'PUSH' ? 'var(--accent-blue)' : 'var(--text-tertiary)',
            borderBottom: activeTab === 'PUSH' ? '2px solid var(--accent-blue)' : '2px solid transparent',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Push Sources (Google Drive ➔ S3)
        </button>
      </div>

      {/* Add Source Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
            Add Google Drive Source ({activeTab === 'PULL' ? 'Pull (S3 ➔ GDrive)' : 'Push (GDrive ➔ S3)'})
          </h3>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>Source Name *</label>
                <input className="input" placeholder="e.g., Client Audio Files" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>Drive Path *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input className="input" placeholder="e.g., ClientAssets/Audio" value={formData.drivePath} onChange={(e) => setFormData({ ...formData, drivePath: e.target.value })} required />
                  <button type="button" className="btn-secondary" onClick={() => setIsBrowserOpen(true)} style={{ padding: '0 14px' }}>Browse</button>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>Drive Type</label>
                <select className="select" value={formData.driveType} onChange={(e) => setFormData({ ...formData, driveType: e.target.value })}>
                  <option value="MY_DRIVE">My Drive</option>
                  <option value="SHARED_DRIVE">Shared Drive</option>
                </select>
              </div>
              {formData.driveType === 'SHARED_DRIVE' && (
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>Shared Drive ID</label>
                  <input className="input" placeholder="Drive ID" value={formData.sharedDriveId} onChange={(e) => setFormData({ ...formData, sharedDriveId: e.target.value })} />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="submit" className="btn-primary">Add Source</button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Sources List */}
      <div style={{ display: 'grid', gap: '12px' }}>
        {sources
          .filter((source: any) => {
            const dir = source.direction || (source.authType === 'OAUTH' ? 'PULL' : 'PUSH');
            return dir === activeTab;
          })
          .map((source: any) => (
            <div key={source.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserCheck size={18} style={{ color: 'var(--accent-emerald)' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600 }}>{source.name}</h3>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'rgba(16,185,129,0.15)',
                      color: 'var(--accent-emerald)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      OAuth2
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                    {source.drivePath} · {source.driveType === 'SHARED_DRIVE' ? 'Shared Drive' : 'My Drive'}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{source._count?.transfers || 0} transfers</span>
                <button className="btn-danger" style={{ padding: '6px 10px' }} onClick={() => handleDelete(source.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        {sources.filter((source: any) => {
          const dir = source.direction || (source.authType === 'OAUTH' ? 'PULL' : 'PUSH');
          return dir === activeTab;
        }).length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
            <HardDrive size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <p>No {activeTab === 'PULL' ? 'Pull' : 'Push'} sources configured yet</p>
          </div>
        )}
      </div>

      <FolderBrowser
        isOpen={isBrowserOpen}
        onClose={() => setIsBrowserOpen(false)}
        onSelect={(path) => setFormData({ ...formData, drivePath: path })}
        type="gdrive"
        sharedDriveId={formData.driveType === 'SHARED_DRIVE' ? formData.sharedDriveId : undefined}
        gdriveAuthType={formData.authType}
        initialPath={formData.drivePath}
      />
    </div>
  );
}
