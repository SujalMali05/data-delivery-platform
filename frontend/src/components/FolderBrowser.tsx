'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { gdriveApi, customersApi } from '../lib/api-client';
import {
  Folder,
  X,
  Loader2,
  ArrowLeft,
  ChevronRight,
  FolderOpen,
} from 'lucide-react';

interface FolderBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  type: 'gdrive' | 's3';
  s3Params?: {
    roleArn: string;
    bucketName: string;
    region: string;
    externalId?: string;
  };
  gdriveAuthType?: string;
  sharedDriveId?: string;
  initialPath?: string;
}

interface DirectoryItem {
  name: string;
  path: string;
  id?: string | null;
}

export default function FolderBrowser({
  isOpen,
  onClose,
  onSelect,
  type,
  s3Params,
  gdriveAuthType,
  sharedDriveId,
  initialPath = '',
}: FolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setCurrentPath(initialPath);
      setSelectedPath(initialPath || '/');
      loadDirectory(initialPath);
    }
  }, [isOpen, initialPath]);

  // Prevent background body scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  const loadDirectory = async (path: string) => {
    setLoading(true);
    setError('');
    try {
      let folders: DirectoryItem[] = [];
      if (type === 'gdrive') {
        const response = await gdriveApi.browse({
          path,
          sharedDriveId,
          authType: gdriveAuthType,
        });
        folders = response.data;
      } else if (type === 's3') {
        if (!s3Params?.roleArn || !s3Params?.bucketName || !s3Params?.region) {
          throw new Error('S3 bucket parameters (Role ARN, Bucket, Region) must be fully configured to browse.');
        }
        const response = await customersApi.browse({
          roleArn: s3Params.roleArn,
          bucketName: s3Params.bucketName,
          region: s3Params.region,
          externalId: s3Params.externalId,
          path,
        });
        folders = response.data;
      }
      // Sort folders alphabetically
      folders.sort((a, b) => a.name.localeCompare(b.name));
      setItems(folders);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to list directory contents.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFolderDoubleClick = (folderPath: string) => {
    const cleanPath = folderPath.replace(/\/$/, '');
    setCurrentPath(cleanPath);
    setSelectedPath(cleanPath);
    loadDirectory(cleanPath);
  };

  const handleFolderClick = (folderPath: string) => {
    setSelectedPath(folderPath.replace(/\/$/, ''));
  };

  const navigateUp = () => {
    if (!currentPath || currentPath === '/' || currentPath === '') return;
    const parts = currentPath.split('/');
    parts.pop();
    const parentPath = parts.join('/');
    setCurrentPath(parentPath);
    setSelectedPath(parentPath || '/');
    loadDirectory(parentPath);
  };

  const navigateToBreadcrumb = (index: number) => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    const targetPath = parts.slice(0, index + 1).join('/');
    setCurrentPath(targetPath);
    setSelectedPath(targetPath || '/');
    loadDirectory(targetPath);
  };

  const handleSelect = () => {
    if (selectedPath !== null) {
      onSelect(selectedPath === '/' ? '' : selectedPath);
      onClose();
    }
  };

  if (!isOpen || !mounted) return null;

  const breadcrumbs = currentPath ? currentPath.split('/') : [];

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass animate-fadeIn"
        style={{
          width: '100%',
          maxWidth: '800px',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '85vh',
          boxShadow: '0 12px 48px rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--border-primary)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FolderOpen size={20} color="var(--accent-blue)" />
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>
              Browse {type === 'gdrive' ? 'Google Drive' : 'S3 Bucket'}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              padding: '4px',
              borderRadius: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Path Navigation bar */}
        <div
          style={{
            padding: '12px 24px',
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          <button
            disabled={!currentPath}
            onClick={navigateUp}
            style={{
              background: 'none',
              border: 'none',
              cursor: currentPath ? 'pointer' : 'default',
              color: currentPath ? 'var(--text-primary)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              padding: '2px',
            }}
            title="Up one level"
          >
            <ArrowLeft size={16} />
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              onClick={() => {
                setCurrentPath('');
                setSelectedPath('/');
                loadDirectory('');
              }}
              style={{
                cursor: 'pointer',
                color: currentPath ? 'var(--text-secondary)' : 'var(--accent-blue)',
                fontWeight: currentPath ? 400 : 600,
              }}
            >
              Root
            </span>

            {breadcrumbs.map((crumb, idx) => (
              <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ChevronRight size={14} color="var(--text-muted)" />
                <span
                  onClick={() => navigateToBreadcrumb(idx)}
                  style={{
                    cursor: 'pointer',
                    color: idx === breadcrumbs.length - 1 ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    fontWeight: idx === breadcrumbs.length - 1 ? 600 : 400,
                  }}
                >
                  {crumb}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Directory Contents */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 24px',
            minHeight: '260px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {loading ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
              <Loader2 className="animate-spin" size={24} color="var(--accent-blue)" />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Loading directory...</span>
            </div>
          ) : error ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
              <span style={{ fontSize: '14px', color: 'var(--accent-red)', marginBottom: '8px', fontWeight: 500 }}>
                Access Error
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '360px', lineHeight: 1.5 }}>
                {error}
              </span>
            </div>
          ) : items.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Folder size={32} color="var(--text-muted)" />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No subdirectories found here.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {items.map((item, idx) => {
                const isSelected = selectedPath === item.path;
                return (
                  <div
                    key={`${item.id || ''}_${item.path}_${idx}`}
                    onClick={() => handleFolderClick(item.path)}
                    onDoubleClick={() => handleFolderDoubleClick(item.path)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--accent-blue-glow)' : 'transparent',
                      border: isSelected ? '1px solid var(--accent-blue)' : '1px solid transparent',
                      transition: 'all 0.15s ease',
                    }}
                    className={!isSelected ? 'glass-hover' : ''}
                  >
                    <Folder size={16} color={isSelected ? 'var(--accent-blue)' : 'var(--text-secondary)'} />
                    <span
                      style={{
                        fontSize: '14px',
                        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                        userSelect: 'none',
                        fontWeight: isSelected ? 500 : 400,
                      }}
                    >
                      {item.name}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border-secondary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '480px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Selected: <span style={{ color: 'var(--text-secondary)' }}>{selectedPath || '/'}</span>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn-secondary" onClick={onClose} style={{ padding: '8px 16px', fontSize: '13px' }}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleSelect}
              disabled={loading || !!error}
              style={{ padding: '8px 16px', fontSize: '13px', opacity: (loading || !!error) ? 0.5 : 1 }}
            >
              Select Folder
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
