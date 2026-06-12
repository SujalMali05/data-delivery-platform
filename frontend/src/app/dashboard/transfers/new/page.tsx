'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { customersApi, gdriveApi, transfersApi } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';
import {
  ArrowLeft,
  ArrowRight,
  Send,
  Loader2,
  Clock,
  Plus,
  Upload,
  Download,
  Copy,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Info,
  ClipboardCheck,
  FolderOpen,
  HardDrive,
  Database,
  File,
  Folder,
} from 'lucide-react';
import Link from 'next/link';
import FolderBrowser from '@/components/FolderBrowser';

type WizardStep = 1 | 2 | 3 | 4;

export default function NewTransferPage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [isSourceBrowserOpen, setIsSourceBrowserOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Array<{ name: string; path: string; isDir: boolean }>>([]);
  const [clickedMode, setClickedMode] = useState<'CREATE' | 'START' | 'QUEUE'>('START');

  // Dry-run state
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRunReport, setDryRunReport] = useState<any>(null);
  const [dryRunError, setDryRunError] = useState('');
  const [skipDeletion, setSkipDeletion] = useState(false);

  const [form, setForm] = useState<{
    name: string;
    direction: string;
    sourceId: string;
    customerId: string;
    destinationPath: string;
    mode: string;
    concurrency: number | '';
    checkers: number;
    retries: number | '';
    bandwidthLimit: string;
  }>({
    name: '',
    direction: '',
    sourceId: '',
    customerId: '',
    destinationPath: '',
    mode: '',
    concurrency: 6,
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
    }).catch(err => {
      setError('Failed to fetch initial configuration data');
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
      const formattedSelectedItems = selectedItems.map((item) =>
        item.isDir ? `${item.path}/**` : item.path
      );
      const response = await transfersApi.create({
        ...form,
        concurrency: form.concurrency === '' ? 6 : form.concurrency,
        retries: form.retries === '' ? 50 : form.retries,
        launchMode: clickedMode,
        bandwidthLimit: form.bandwidthLimit || undefined,
        skipDeletion: form.mode === 'SYNC' ? skipDeletion : false,
        dryRunReport: form.mode === 'SYNC' ? dryRunReport : undefined,
        selectedItems: formattedSelectedItems.length > 0 ? formattedSelectedItems : undefined,
      });
      router.push(`/dashboard/transfers/${response.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create transfer');
      setLoading(false);
    }
  };

  const handleDryRun = async () => {
    setDryRunLoading(true);
    setDryRunError('');
    setDryRunReport(null);

    try {
      const formattedSelectedItems = selectedItems.map((item) =>
        item.isDir ? `${item.path}/**` : item.path
      );
      const response = await transfersApi.dryRun({
        ...form,
        concurrency: form.concurrency === '' ? 6 : form.concurrency,
        retries: form.retries === '' ? 50 : form.retries,
        selectedItems: formattedSelectedItems.length > 0 ? formattedSelectedItems : undefined,
      });
      setDryRunReport(response.data);
      setStep(4);
    } catch (err: any) {
      setDryRunError(err.response?.data?.message || 'Failed to generate dry-run report');
    } finally {
      setDryRunLoading(false);
    }
  };

  const selectedCustomer = customers.find((c: any) => c.id === form.customerId);

  // Filter sources based on direction
  const filteredSources = sources.filter((s: any) => {
    const sourceDir = s.direction || (s.authType === 'OAUTH' ? 'PULL' : 'PUSH');
    return sourceDir === form.direction;
  });

  const canProceedStep3 =
    form.name && form.sourceId && form.customerId && form.destinationPath;

  const stepLabels = ['Direction', 'Operation', 'Configure', ...(form.mode === 'SYNC' ? ['Report'] : [])];

  return (
    <div className="animate-fadeIn" style={{ maxWidth: '100%', margin: '0 auto', padding: '12px 0 40px' }}>
      
      {/* Title Header (NO SUBTITLE AS REQUESTED) */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
          Create Data Transfer
        </h1>
      </div>

      {/* Two Column Layout: Left Stepper Sidebar, Right Form Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '32px', alignItems: 'start' }}>
        
        {/* Left Side: Vertical Stepper */}
        <div style={{
          position: 'sticky',
          top: '20px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-secondary)',
          borderRadius: '16px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        }}>
          <h3 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
            Setup Progress
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {stepLabels.map((label, index) => {
              const stepNumber = index + 1;
              const isCompleted = step > stepNumber;
              const isActive = step === stepNumber;

              return (
                <div key={label} style={{ display: 'flex', gap: '14px', position: 'relative' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 700,
                      border: '2px solid',
                      borderColor: isCompleted 
                        ? 'var(--accent-emerald)' 
                        : (isActive ? 'var(--accent-blue)' : 'var(--border-primary)'),
                      background: isCompleted 
                        ? 'rgba(16,185,129,0.1)' 
                        : (isActive ? 'rgba(99,102,241,0.15)' : 'var(--bg-secondary)'),
                      color: isCompleted 
                        ? 'var(--accent-emerald)' 
                        : (isActive ? 'var(--accent-blue)' : 'var(--text-tertiary)'),
                      boxShadow: isActive ? '0 0 10px var(--accent-blue-glow)' : 'none',
                      zIndex: 2,
                      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}>
                      {isCompleted ? <CheckCircle2 size={14} /> : stepNumber}
                    </div>

                    {index < stepLabels.length - 1 && (
                      <div style={{
                        width: '2px',
                        height: '36px',
                        background: isCompleted 
                          ? 'var(--accent-emerald)' 
                          : 'var(--border-secondary)',
                        opacity: 0.6,
                        marginTop: '4px',
                        marginBottom: '-4px',
                        zIndex: 1,
                      }} />
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    }}>
                      {label}
                    </span>
                    <span style={{
                      fontSize: '10px',
                      color: isActive ? 'var(--accent-blue)' : 'var(--text-muted)',
                      marginTop: '1px',
                    }}>
                      {index === 0 && 'Select direction'}
                      {index === 1 && 'Copy or sync'}
                      {index === 2 && 'Configuration'}
                      {index === 3 && 'Sync preview'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Step Content Panels */}
        <div style={{ flex: 1 }}>
          
          {/* ═══════════════════════════════════════════════════ */}
          {/* STEP 1: Direction Selection                        */}
          {/* ═══════════════════════════════════════════════════ */}
          {step === 1 && (
            <div className="animate-fadeIn" style={{ animationDuration: '0.3s' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Choose Data Direction
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                Select the source and target destination for this data pipeline.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Push Card */}
                <div
                  onClick={() => {
                    setForm(prev => ({ ...prev, direction: 'PUSH', sourceId: '' }));
                    setStep(2);
                  }}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-secondary)',
                    borderRadius: '16px',
                    padding: '32px 28px',
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.borderColor = 'var(--accent-blue)';
                    e.currentTarget.style.boxShadow = '0 12px 28px rgba(99,102,241,0.12)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = 'var(--border-secondary)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: 'rgba(99,102,241,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Upload size={22} style={{ color: 'var(--accent-blue)' }} />
                  </div>

                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                      Push Pipeline
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                      Google Drive ➔ Customer AWS S3
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: '1.6', marginTop: '10px' }}>
                      Transfers data from internal shared drives to a secure client S3 bucket. Ideal for delivering reports, logs, or assets.
                    </p>
                  </div>

                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: '8px',
                    background: 'rgba(99,102,241,0.08)',
                    color: 'var(--accent-blue)',
                    alignSelf: 'flex-start',
                  }}>
                    <Shield size={12} /> User OAuth2 Credentials
                  </div>
                </div>

                {/* Pull Card */}
                <div
                  onClick={() => {
                    setForm(prev => ({ ...prev, direction: 'PULL', sourceId: '' }));
                    setStep(2);
                  }}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-secondary)',
                    borderRadius: '16px',
                    padding: '32px 28px',
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.borderColor = 'var(--accent-emerald)';
                    e.currentTarget.style.boxShadow = '0 12px 28px rgba(16,185,129,0.12)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = 'var(--border-secondary)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: 'rgba(16,185,129,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Download size={22} style={{ color: 'var(--accent-emerald)' }} />
                  </div>

                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                      Pull Pipeline
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                      Customer AWS S3 ➔ Google Drive
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: '1.6', marginTop: '10px' }}>
                      Retrieves files directly from customer S3 buckets and imports them into team shared folders. Used for data ingest.
                    </p>
                  </div>

                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: '8px',
                    background: 'rgba(16,185,129,0.08)',
                    color: 'var(--accent-emerald)',
                    alignSelf: 'flex-start',
                  }}>
                    <Shield size={12} /> User OAuth2 Credentials
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════ */}
          {/* STEP 2: Operation Selection                        */}
          {/* ═══════════════════════════════════════════════════ */}
          {step === 2 && (
            <div className="animate-fadeIn" style={{ animationDuration: '0.3s' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Select Transfer Mode
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                Choose how files should behave at the destination path.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Copy Card */}
                <div
                  onClick={() => {
                    setForm(prev => ({ ...prev, mode: 'COPY' }));
                    setStep(3);
                  }}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-secondary)',
                    borderRadius: '16px',
                    padding: '32px 28px',
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.borderColor = 'var(--accent-blue)';
                    e.currentTarget.style.boxShadow = '0 12px 28px rgba(99,102,241,0.12)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = 'var(--border-secondary)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: 'rgba(99,102,241,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Copy size={22} style={{ color: 'var(--accent-blue)' }} />
                  </div>

                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                      Copy Mode
                    </h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: '1.6', marginTop: '10px' }}>
                      Copies new and updated files. Files already existing in the destination folder are kept as-is. <strong>Additive only</strong>—safe for archival purposes.
                    </p>
                  </div>

                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: '8px',
                    background: 'rgba(16,185,129,0.08)',
                    color: 'var(--accent-emerald)',
                    alignSelf: 'flex-start',
                  }}>
                    <CheckCircle2 size={12} /> Additive & Safe
                  </div>
                </div>

                {/* Sync Card */}
                <div
                  onClick={() => {
                    setForm(prev => ({ ...prev, mode: 'SYNC' }));
                    setStep(3);
                  }}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-secondary)',
                    borderRadius: '16px',
                    padding: '32px 28px',
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.borderColor = 'var(--accent-amber)';
                    e.currentTarget.style.boxShadow = '0 12px 28px rgba(245,158,11,0.12)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = 'var(--border-secondary)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: 'rgba(245,158,11,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <RefreshCw size={22} style={{ color: 'var(--accent-amber)' }} />
                  </div>

                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                      Sync Mode
                    </h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: '1.6', marginTop: '10px' }}>
                      Mirrors the source to destination exactly. Files at the destination that do not exist at the source are deleted to maintain a perfect sync. Generates a preview dry-run report.
                    </p>
                  </div>

                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: '8px',
                    background: 'rgba(59,130,246,0.08)',
                    color: 'var(--accent-blue)',
                    alignSelf: 'flex-start',
                  }}>
                    <Info size={12} /> Standard Mirror Sync
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '32px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setStep(1)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '10px' }}
                >
                  <ArrowLeft size={16} /> Back
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════ */}
          {/* STEP 3: Configuration Form                         */}
          {/* ═══════════════════════════════════════════════════ */}
          {step === 3 && (
            <div className="animate-fadeIn" style={{ animationDuration: '0.3s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Configure Parameters
                </h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: form.direction === 'PULL' ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)',
                    color: form.direction === 'PULL' ? 'var(--accent-emerald)' : 'var(--accent-blue)'
                  }}>
                    {form.direction === 'PULL' ? '⬇ Pull' : '⬆ Push'}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: 'var(--border-primary)',
                    color: 'var(--text-secondary)'
                  }}>
                    {form.mode} Mode
                  </span>
                </div>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                
                {/* Combined Form Card (combining Path Config and Concurrency inside one single visual container card) */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px', background: 'var(--bg-card)', borderRadius: '16px' }}>
                  
                  {/* Part 1: Path Configuration */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '10px' }}>
                      Path Configuration
                    </h3>

                    {/* Transfer Name */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Transfer Label / Name *
                      </label>
                      <input
                        type="text"
                        style={{
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '10px',
                          color: 'var(--text-primary)',
                          padding: '12px 16px',
                          fontSize: '14px',
                          width: '100%',
                          outline: 'none',
                          transition: 'all 0.2s ease',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = 'var(--accent-blue)';
                          e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-blue-glow)';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border-primary)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                        placeholder="e.g., Stark_Maptix Data Delivery"
                        value={form.name}
                        onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                        required
                      />
                    </div>

                    {/* Source & Customer Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {form.direction === 'PULL' ? 'Target Google Drive Bucket *' : 'Source Google Drive Bucket *'}
                        </label>
                        <select
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '10px',
                            color: 'var(--text-primary)',
                            padding: '12px 16px',
                            fontSize: '14px',
                            width: '100%',
                            outline: 'none',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = 'var(--accent-blue)';
                            e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-blue-glow)';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-primary)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                          value={form.sourceId}
                          onChange={(e) => setForm(prev => ({ ...prev, sourceId: e.target.value }))}
                          required
                        >
                          <option value="">Select connection...</option>
                          {filteredSources.map((s: any) => (
                            <option key={s.id} value={s.id}>{s.name} ({s.drivePath})</option>
                          ))}
                        </select>
                        {filteredSources.length === 0 && (
                          <span style={{ fontSize: '11px', color: 'var(--accent-amber)', marginTop: '4px' }}>
                            No Google Drive sources configured for this direction.
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {form.direction === 'PULL' ? 'Source Customer AWS S3 *' : 'Target Customer AWS S3 *'}
                        </label>
                        <select
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '10px',
                            color: 'var(--text-primary)',
                            padding: '12px 16px',
                            fontSize: '14px',
                            width: '100%',
                            outline: 'none',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = 'var(--accent-blue)';
                            e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-blue-glow)';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-primary)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                          value={form.customerId}
                          onChange={(e) => setForm(prev => ({ ...prev, customerId: e.target.value }))}
                          required
                        >
                          <option value="">Select customer...</option>
                          {customers.map((c: any) => (
                            <option key={c.id} value={c.id}>{c.name} ({c.bucketName})</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* S3 Prefix Path */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {form.direction === 'PULL' ? 'Source S3 Path (Prefix) *' : 'Destination S3 Path (Prefix) *'}
                      </label>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <input
                          type="text"
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '10px',
                            color: 'var(--text-primary)',
                            padding: '12px 16px',
                            fontSize: '14px',
                            flex: 1,
                            outline: 'none',
                            transition: 'all 0.2s ease',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = 'var(--accent-blue)';
                            e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-blue-glow)';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-primary)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                          placeholder="e.g., Stark_Maptix/Delivery_Folder/"
                          value={form.destinationPath}
                          onChange={(e) => setForm(prev => ({ ...prev, destinationPath: e.target.value }))}
                          required
                        />
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => {
                            if (!form.customerId) {
                              alert('Select a customer first to browse their bucket.');
                              return;
                            }
                            setIsBrowserOpen(true);
                          }}
                          style={{
                            padding: '0 20px',
                            borderRadius: '10px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          <FolderOpen size={16} /> Browse
                        </button>
                      </div>
                    </div>

                    {/* Source Items Selector */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Items to Transfer (Source Scope)
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => {
                              if (form.direction === 'PUSH' && !form.sourceId) {
                                alert('Select a source Google Drive connection first.');
                                return;
                              }
                              if (form.direction === 'PULL' && !form.customerId) {
                                alert('Select a source Customer bucket first.');
                                return;
                              }
                              setIsSourceBrowserOpen(true);
                            }}
                            style={{
                              padding: '10px 16px',
                              borderRadius: '10px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              border: selectedItems.length > 0 ? '1px solid var(--accent-blue)' : '1px solid var(--border-secondary)',
                              color: selectedItems.length > 0 ? 'var(--accent-blue)' : 'inherit',
                            }}
                          >
                            <FolderOpen size={16} />
                            {selectedItems.length > 0 ? `Change Selected Items (${selectedItems.length})` : 'Select Specific Files/Folders (Optional)'}
                          </button>
                          
                          {selectedItems.length > 0 && (
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => setSelectedItems([])}
                              style={{
                                padding: '10px 16px',
                                borderRadius: '10px',
                                color: 'var(--accent-red)',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                              }}
                            >
                              <Trash2 size={16} style={{ display: 'inline', marginRight: '4px' }} />
                              Reset to All Files
                            </button>
                          )}
                        </div>

                        {selectedItems.length > 0 ? (
                          <div style={{
                            background: 'rgba(255, 255, 255, 0.02)',
                            border: '1px solid var(--border-secondary)',
                            borderRadius: '10px',
                            padding: '12px 16px',
                            maxHeight: '180px',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                          }}>
                            {selectedItems.map((item, idx) => (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                                  {item.isDir ? <Folder size={14} color="var(--accent-blue)" /> : <File size={14} color="var(--text-tertiary)" />}
                                  <span style={{ fontFamily: 'monospace' }}>
                                    {item.path} {item.isDir ? '(Recursive)' : ''}
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setSelectedItems((prev) => prev.filter((_, i) => i !== idx))}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                  }}
                                  className="btn-secondary-hover"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '0' }}>
                            Currently copying all files and folders under the source root directory.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Part 2: Concurrency & Bandwidth Tuning (separated by border, inside same card) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', borderTop: '1px solid var(--border-secondary)', paddingTop: '20px', marginTop: '4px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Concurrency & Bandwidth Tuning
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          Max Concurrently Transferred Files
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={128}
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '10px',
                            color: 'var(--text-primary)',
                            padding: '12px 16px',
                            fontSize: '14px',
                            outline: 'none',
                            transition: 'all 0.2s ease',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = 'var(--accent-blue)';
                            e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-blue-glow)';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-primary)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                          value={form.concurrency}
                          onChange={(e) => {
                            const val = e.target.value;
                            setForm(prev => ({ ...prev, concurrency: val === '' ? '' : parseInt(val, 10) }));
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          Max Retries
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '10px',
                            color: 'var(--text-primary)',
                            padding: '12px 16px',
                            fontSize: '14px',
                            outline: 'none',
                            transition: 'all 0.2s ease',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = 'var(--accent-blue)';
                            e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-blue-glow)';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-primary)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                          value={form.retries}
                          onChange={(e) => {
                            const val = e.target.value;
                            setForm(prev => ({ ...prev, retries: val === '' ? '' : parseInt(val, 10) }));
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          Bandwidth Limit (optional)
                        </label>
                        <input
                          type="text"
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '10px',
                            color: 'var(--text-primary)',
                            padding: '12px 16px',
                            fontSize: '14px',
                            outline: 'none',
                            transition: 'all 0.2s ease',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = 'var(--accent-blue)';
                            e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-blue-glow)';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-primary)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                          placeholder="e.g., 50M or 1G"
                          value={form.bandwidthLimit}
                          onChange={(e) => setForm(prev => ({ ...prev, bandwidthLimit: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                </div>

                {error && (
                  <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--accent-red)', fontSize: '13px' }}>
                    {error}
                  </div>
                )}

                {/* Step 3 Action Buttons */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginTop: '8px' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setStep(2)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '10px' }}
                  >
                    <ArrowLeft size={16} /> Back
                  </button>

                  {form.mode === 'SYNC' ? (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleDryRun}
                      disabled={!canProceedStep3 || dryRunLoading}
                      style={{
                        opacity: (!canProceedStep3 || dryRunLoading) ? 0.6 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px 24px',
                        borderRadius: '10px'
                      }}
                    >
                      {dryRunLoading ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}
                      {dryRunLoading ? 'Running Dry-run Scan...' : 'Generate Sync Preview Report'}
                    </button>
                  ) : (
                    <>
                      <button
                        type="submit"
                        className="btn-primary"
                        onClick={() => setClickedMode('START')}
                        disabled={loading}
                        style={{ opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '10px' }}
                      >
                        {loading && clickedMode === 'START' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        Start Transfer Now
                      </button>

                      <button
                        type="submit"
                        className="btn-secondary"
                        onClick={() => setClickedMode('QUEUE')}
                        disabled={loading}
                        style={{ opacity: loading ? 0.6 : 1, border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '10px' }}
                      >
                        {loading && clickedMode === 'QUEUE' ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />}
                        Queue Transfer
                      </button>

                      <button
                        type="submit"
                        className="btn-secondary"
                        onClick={() => setClickedMode('CREATE')}
                        disabled={loading}
                        style={{ opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '10px' }}
                      >
                        {loading && clickedMode === 'CREATE' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        Create Config Only
                      </button>
                    </>
                  )}
                </div>

                {dryRunError && (
                  <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--accent-red)', fontSize: '13px' }}>
                    {dryRunError}
                  </div>
                )}
              </form>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════ */}
          {/* STEP 4: Sync Dry-Run Report Dashboard              */}
          {/* ═══════════════════════════════════════════════════ */}
          {step === 4 && dryRunReport && (
            <div className="animate-fadeIn" style={{ animationDuration: '0.4s', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Sync Preview Dashboard
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Validate your sync details, directories, and projected changes before committing the job.
                </p>
              </div>

              {/* ── Directory Paths Mapping (Validation style) ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Source Card */}
                <div className="card" style={{ padding: '16px 20px', borderRadius: '12px' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                    {dryRunReport.source.type === 's3' ? 'AWS S3 Source' : 'Google Drive Source'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: '13px', color: 'var(--text-primary)' }}>
                    {dryRunReport.source.type === 's3' ? <Database size={16} color="var(--accent-blue)" /> : <HardDrive size={16} color="var(--accent-blue)" />}
                    <strong>{dryRunReport.source.name}</strong>
                  </div>
                  <div style={{
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    background: 'rgba(255,255,255,0.02)',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    marginTop: '8px',
                    color: 'var(--text-secondary)',
                    wordBreak: 'break-all'
                  }}>
                    {dryRunReport.source.type === 's3' 
                      ? `s3://${dryRunReport.source.bucket}/${dryRunReport.source.path || ''}`
                      : `gdrive://${dryRunReport.source.path || '/'}`
                    }
                  </div>
                </div>

                {/* Destination Card */}
                <div className="card" style={{ padding: '16px 20px', borderRadius: '12px' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                    {dryRunReport.destination.type === 's3' ? 'AWS S3 Destination' : 'Google Drive Destination'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: '13px', color: 'var(--text-primary)' }}>
                    {dryRunReport.destination.type === 's3' ? <Database size={16} color="var(--accent-blue)" /> : <HardDrive size={16} color="var(--accent-blue)" />}
                    <strong>{dryRunReport.destination.name}</strong>
                  </div>
                  <div style={{
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    background: 'rgba(255,255,255,0.02)',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    marginTop: '8px',
                    color: 'var(--text-secondary)',
                    wordBreak: 'break-all'
                  }}>
                    {dryRunReport.destination.type === 's3' 
                      ? `s3://${dryRunReport.destination.bucket}/${dryRunReport.destination.path || ''}`
                      : `gdrive://${dryRunReport.destination.path || '/'}`
                    }
                  </div>
                </div>
              </div>

              {/* ── Stats Counters Grid (STYLING FROM FOLDER VALIDATION REPORT, EXCLUDING SOURCE & DESTINATION SIZES AS REQUESTED) ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                
                {/* Files to Transfer */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '4px solid var(--accent-cyan)', padding: '16px 20px', borderRadius: '12px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>To Transfer</span>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-blue)' }}>{dryRunReport.summary.filesToTransfer.toLocaleString()}</h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatBytes(dryRunReport.summary.bytesToTransfer)} volume</span>
                </div>

                {/* Files to Delete (RED COLOR ALWAYS AS REQUESTED) */}
                <div className="card" style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  borderLeft: '4px solid var(--accent-red)',
                  padding: '16px 20px',
                  borderRadius: '12px',
                }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>To Delete</span>
                  <h3 style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    color: 'var(--accent-red)'
                  }}>
                    {dryRunReport.summary.filesToDelete.toLocaleString()}
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {skipDeletion ? '0 (Blocked)' : 'on destination'}
                  </span>
                </div>

                {/* Files Compared */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '4px solid var(--accent-emerald)', padding: '16px 20px', borderRadius: '12px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Compared</span>
                  <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{dryRunReport.summary.checksPerformed.toLocaleString()}</h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>integrity checks</span>
                </div>

                {/* Scan Errors */}
                <div className="card" style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  borderLeft: dryRunReport.summary.errors > 0 ? '4px solid var(--accent-red)' : '4px solid var(--border-primary)',
                  padding: '16px 20px',
                  borderRadius: '12px',
                }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Errors</span>
                  <h3 style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    color: dryRunReport.summary.errors > 0 ? 'var(--accent-red)' : 'inherit'
                  }}>
                    {dryRunReport.summary.errors}
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>during scan</span>
                </div>
              </div>

              {/* ── Checkbox Safe Mode block (ONLY SHOW IF FILES TO DELETE > 0 AS REQUESTED) ── */}
              {dryRunReport.summary.filesToDelete > 0 && (
                <div style={{
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid',
                  borderColor: skipDeletion ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.3)',
                  background: skipDeletion ? 'rgba(16, 185, 129, 0.03)' : 'rgba(59, 130, 246, 0.03)',
                  transition: 'all 0.25s ease',
                }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      checked={skipDeletion}
                      onChange={(e) => setSkipDeletion(e.target.checked)}
                      style={{
                        width: '18px',
                        height: '18px',
                        accentColor: 'var(--accent-emerald)',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: 700,
                        color: skipDeletion ? 'var(--accent-emerald)' : 'var(--accent-blue)',
                      }}>
                        Do not delete anything on destination (Safe Sync Mode)
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {skipDeletion
                          ? 'Safe Sync — nothing will be deleted on destination.'
                          : `Full Sync — files not in source will be deleted from destination (${dryRunReport.summary.filesToDelete} file(s) affected).`
                        }
                      </span>
                    </div>
                  </label>
                </div>
              )}

              {/* Action buttons */}
              {error && (
                <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--accent-red)', fontSize: '13px' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setStep(3);
                    setDryRunReport(null);
                    setDryRunError('');
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '10px' }}
                >
                  <ArrowLeft size={16} /> Back to Edit
                </button>

                <button
                  type="button"
                  className="btn-primary"
                  onClick={(e) => {
                    setClickedMode('START');
                    handleSubmit(e as any);
                  }}
                  disabled={loading}
                  style={{ opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '10px' }}
                >
                  {loading && clickedMode === 'START' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Confirm & Start Sync
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={(e) => {
                    setClickedMode('QUEUE');
                    handleSubmit(e as any);
                  }}
                  disabled={loading}
                  style={{ opacity: loading ? 0.6 : 1, border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '10px', background: 'transparent' }}
                >
                  {loading && clickedMode === 'QUEUE' ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />}
                  Queue Sync Job
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={(e) => {
                    setClickedMode('CREATE');
                    handleSubmit(e as any);
                  }}
                  disabled={loading}
                  style={{ opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '10px' }}
                >
                  {loading && clickedMode === 'CREATE' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Create Config Only
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      <FolderBrowser
        isOpen={isBrowserOpen}
        onClose={() => setIsBrowserOpen(false)}
        onSelect={(path) => setForm(prev => ({ ...prev, destinationPath: path ? path + '/' : '' }))}
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

      {/* Source Browser Modal for Push/Pull Selective transfers */}
      <FolderBrowser
        isOpen={isSourceBrowserOpen}
        onClose={() => setIsSourceBrowserOpen(false)}
        type={form.direction === 'PULL' ? 's3' : 'gdrive'}
        showFiles={true}
        multiSelect={true}
        onSelectMultiple={(items) => setSelectedItems(items)}
        initialPath=""
        s3Params={
          form.direction === 'PULL' && selectedCustomer
            ? {
                roleArn: selectedCustomer.roleArn,
                bucketName: selectedCustomer.bucketName,
                region: selectedCustomer.region,
                externalId: selectedCustomer.externalId || undefined,
              }
            : undefined
        }
        gdriveAuthType={
          form.direction === 'PUSH' && sources.find((s: any) => s.id === form.sourceId)?.authType || undefined
        }
        sharedDriveId={
          form.direction === 'PUSH' && form.sourceId
            ? sources.find((s: any) => s.id === form.sourceId)?.sharedDriveId || undefined
            : undefined
        }
      />
    </div>
  );
}
