'use client';

import { useEffect, useState } from 'react';
import { customersApi } from '@/lib/api-client';
import {
  Database,
  Folder,
  File,
  ChevronRight,
  ArrowUp,
  Search,
  Loader2,
  AlertTriangle,
  FolderOpen,
  Download,
} from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  bucketName: string;
  region: string;
  prefixPath?: string;
}

interface S3Item {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modTime: string | null;
}

export default function S3BrowserPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [path, setPath] = useState<string>('');
  const [items, setItems] = useState<S3Item[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Pagination & Filtering state
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(50);
  const [filterText, setFilterText] = useState<string>('');

  // Download tracking state
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});

  // Load customers list on mount
  useEffect(() => {
    customersApi.list()
      .then((res) => {
        setCustomers(res.data);
      })
      .catch((err) => {
        console.error('Failed to load customers:', err);
        setError('Failed to retrieve customers list.');
      });
  }, []);

  // Fetch objects when customer, path, page, or limit changes
  useEffect(() => {
    if (!selectedCustomerId) {
      setItems([]);
      setTotal(0);
      return;
    }
    fetchObjects();
  }, [selectedCustomerId, path, page, limit]);

  const fetchObjects = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await customersApi.listObjects({
        customerId: selectedCustomerId,
        path,
        page,
        limit,
      });
      setItems(response.data.items || []);
      setTotal(response.data.total || 0);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to list bucket objects.');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  // Bytes formatting helper
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Date formatting helper
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return dateStr;
    }
  };

  // Navigation helpers
  const handleFolderClick = (folderPath: string) => {
    setPath(folderPath);
    setPage(1); // Reset page to 1 on path change
  };

  const handleNavigateUp = () => {
    if (!path) return;
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    setPath(parts.join('/'));
    setPage(1);
  };

  const handleBreadcrumbClick = (index: number) => {
    const parts = path.split('/').filter(Boolean);
    const targetPath = parts.slice(0, index + 1).join('/');
    setPath(targetPath);
    setPage(1);
  };

  const handleBreadcrumbRootClick = () => {
    setPath('');
    setPage(1);
  };

  const handleDownload = async (fileKey: string, fileName: string) => {
    setDownloading((prev) => ({ ...prev, [fileKey]: true }));
    try {
      const response = await customersApi.downloadObject(selectedCustomerId, fileKey);
      
      const contentTypeHeader = response.headers ? response.headers['content-type'] : undefined;
      const contentType = typeof contentTypeHeader === 'string' ? contentTypeHeader : 'application/octet-stream';
      
      const blob = new Blob([response.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Download failed:', err);
      alert(`Download failed: ${err.response?.data?.message || err.message || 'Unknown error'}`);
    } finally {
      setDownloading((prev) => ({ ...prev, [fileKey]: false }));
    }
  };

  // Filter items locally by search query
  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(filterText.toLowerCase())
  );

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '20px', minHeight: 'calc(100vh - 120px)' }}>
      {/* Page Header */}
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Database size={24} color="var(--accent-blue)" />
          S3 File Explorer
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          Browse files, folder structures, and object sizes dynamically for any customer S3 bucket.
        </p>
      </div>

      {/* Control panel (Dropdown + Filter) */}
      <div className="glass" style={{ padding: '20px', borderRadius: '12px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1, minWidth: '300px' }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            Customer Bucket:
          </span>
          <select
            className="select"
            value={selectedCustomerId}
            onChange={(e) => {
              setSelectedCustomerId(e.target.value);
              setPath('');
              setPage(1);
              setFilterText('');
            }}
            style={{ maxWidth: '320px', margin: 0 }}
          >
            <option value="">Select customer bucket...</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.bucketName})
              </option>
            ))}
          </select>
        </div>

        {selectedCustomerId && (
          <div style={{ position: 'relative', width: '260px' }}>
            <input
              className="input"
              type="text"
              placeholder="Search current folder..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              style={{ paddingLeft: '36px', margin: 0, fontSize: '13px' }}
            />
            <Search size={16} color="var(--text-tertiary)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          </div>
        )}
      </div>

      {/* S3 File Explorer Body */}
      {selectedCustomerId ? (
        <div className="glass" style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-primary)', display: 'flex', flexDirection: 'column', flex: 1 }}>
          
          {/* Breadcrumbs Navigation Bar */}
          <div style={{ padding: '12px 20px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-secondary)', display: 'flex', alignItems: 'center', gap: '12px', overflowX: 'auto' }}>
            <button
              onClick={handleNavigateUp}
              disabled={!path || loading}
              className="btn-secondary"
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                opacity: (!path || loading) ? 0.5 : 1,
                cursor: (!path || loading) ? 'not-allowed' : 'pointer',
              }}
              title="Go back one folder"
            >
              <ArrowUp size={14} />
              Up
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <span
                onClick={!loading ? handleBreadcrumbRootClick : undefined}
                style={{
                  cursor: !loading ? 'pointer' : 'default',
                  color: !path ? 'var(--accent-blue)' : 'var(--text-primary)',
                  fontWeight: !path ? 600 : 400,
                }}
              >
                {selectedCustomer?.bucketName
                  ? `${selectedCustomer.bucketName}${selectedCustomer.prefixPath ? '/' + selectedCustomer.prefixPath.replace(/^\/|\/$/g, '') : ''}`
                  : 's3-bucket'}
              </span>

              {path.split('/').filter(Boolean).map((part, idx, arr) => (
                <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ChevronRight size={14} color="var(--text-muted)" />
                  <span
                    onClick={!loading && idx < arr.length - 1 ? () => handleBreadcrumbClick(idx) : undefined}
                    style={{
                      cursor: (!loading && idx < arr.length - 1) ? 'pointer' : 'default',
                      color: idx === arr.length - 1 ? 'var(--accent-blue)' : 'var(--text-primary)',
                      fontWeight: idx === arr.length - 1 ? 600 : 400,
                    }}
                  >
                    {part}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Directory Listings Table */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: '300px', position: 'relative' }}>
            {loading ? (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', background: 'rgba(10, 10, 15, 0.4)', backdropFilter: 'blur(4px)' }}>
                <Loader2 className="animate-spin" size={32} color="var(--accent-blue)" />
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>Scanning S3 directory...</span>
              </div>
            ) : error ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center', gap: '12px' }}>
                <AlertTriangle size={36} color="var(--accent-red)" />
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Access Connection Error</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: 1.5 }}>
                  {error}
                </p>
                <button className="btn-primary" onClick={fetchObjects} style={{ marginTop: '8px', padding: '8px 20px' }}>
                  Retry Connection
                </button>
              </div>
            ) : filteredItems.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: '12px' }}>
                <FolderOpen size={48} color="var(--text-muted)" style={{ opacity: 0.4 }} />
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  {filterText ? 'No matching objects found in current directory.' : 'This directory level is empty.'}
                </p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-secondary)', background: 'rgba(255,255,255,0.01)' }}>
                    <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-tertiary)' }}>Name</th>
                    <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-tertiary)', width: '120px' }}>Size</th>
                    <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-tertiary)', width: '200px' }}>Last Modified</th>
                    <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-tertiary)', width: '120px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, idx) => (
                    <tr
                      key={`${item.path}_${idx}`}
                      onClick={item.isDir ? () => handleFolderClick(item.path) : undefined}
                      className={item.isDir ? 'glass-hover' : ''}
                      style={{
                        borderBottom: '1px solid var(--border-secondary)',
                        cursor: item.isDir ? 'pointer' : 'default',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Name */}
                      <td style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: item.isDir ? 500 : 400 }}>
                        {item.isDir ? (
                          <Folder size={16} color="var(--accent-blue)" style={{ minWidth: '16px' }} />
                        ) : (
                          <File size={16} color="var(--text-tertiary)" style={{ minWidth: '16px' }} />
                        )}
                        <span style={{
                          color: item.isDir ? 'var(--text-primary)' : 'var(--text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '480px'
                        }}>
                          {item.name}
                        </span>
                      </td>

                      {/* Size */}
                      <td style={{ padding: '12px 20px', color: 'var(--text-secondary)' }}>
                        {item.isDir ? '—' : formatBytes(item.size)}
                      </td>

                      {/* Last Modified */}
                      <td style={{ padding: '12px 20px', color: 'var(--text-tertiary)' }}>
                        {item.isDir ? '—' : formatDate(item.modTime)}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                        {!item.isDir && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(item.path, item.name);
                            }}
                            className="btn-secondary"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              height: '28px',
                              cursor: downloading[item.path] ? 'not-allowed' : 'pointer'
                            }}
                            disabled={downloading[item.path]}
                          >
                            {downloading[item.path] ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Download size={12} />
                            )}
                            Download
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer Controls: Pagination + Limit */}
          <div
            style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--border-secondary)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            {/* Status info */}
            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
              Showing{' '}
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                {total === 0 ? 0 : (page - 1) * limit + 1}
              </span>{' '}
              to{' '}
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                {Math.min(page * limit, total)}
              </span>{' '}
              of{' '}
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{total}</span>{' '}
              items
            </div>

            {/* Pagination & Limit dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {/* Page Limit Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                <span>Limit:</span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1); // Reset page to 1
                  }}
                  style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    color: 'var(--text-secondary)',
                    padding: '4px 8px',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value={500}>500</option>
                </select>
              </div>

              {/* Prev / Next buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page <= 1 || loading}
                  className="btn-secondary"
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    opacity: (page <= 1 || loading) ? 0.5 : 1,
                    cursor: (page <= 1 || loading) ? 'not-allowed' : 'pointer',
                  }}
                >
                  Previous
                </button>
                <span style={{ fontSize: '12px', display: 'flex', alignItems: 'center', padding: '0 6px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={page >= totalPages || loading}
                  className="btn-secondary"
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    opacity: (page >= totalPages || loading) ? 0.5 : 1,
                    cursor: (page >= totalPages || loading) ? 'not-allowed' : 'pointer',
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>

        </div>
      ) : (
        <div className="glass" style={{ border: '1px dashed var(--border-secondary)', borderRadius: '12px', padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', color: 'var(--text-tertiary)', flex: 1 }}>
          <FolderOpen size={48} style={{ opacity: 0.3 }} />
          <div style={{ textAlign: 'center', maxWidth: '320px', lineHeight: 1.5, fontSize: '13px' }}>
            Please select a customer bucket from the dropdown menu to start exploring S3 directory structures.
          </div>
        </div>
      )}
    </div>
  );
}
