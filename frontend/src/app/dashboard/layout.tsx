'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Users,
  HardDrive,
  CalendarClock,
  ScrollText,
  Settings,
  LogOut,
  Database,
  ChevronRight,
  Calculator,
  Sun,
  Moon,
  FileCheck,
  Volume2,
  Trash2,
  Boxes,
} from 'lucide-react';
import { getSavedThemeSettings, saveThemeSettings } from '../../lib/theme';

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  {
    type: 'group',
    title: 'Data Transfer',
    items: [
      { href: '/dashboard/transfers', label: 'Transfers', icon: ArrowLeftRight },
      { href: '/dashboard/customers', label: 'Customers', icon: Users },
      { href: '/dashboard/gdrive', label: 'Google Drive', icon: HardDrive },
    ],
  },
  {
    type: 'group',
    title: 'Utilities & System',
    items: [
      { href: '/dashboard/calculator', label: 'Size Calculator', icon: Calculator },
      { href: '/dashboard/audio-analyzer', label: 'Audio Analyzer', icon: Volume2 },
      { href: '/dashboard/s3-browser', label: 'S3 Browser', icon: Database },
      { href: '/dashboard/validation', label: 'Folder Validation', icon: FileCheck },
      { href: '/dashboard/batch-operations', label: 'Batch Operations', icon: Boxes },
      { href: '/dashboard/schedules', label: 'Schedules', icon: CalendarClock },
      { href: '/dashboard/logs', label: 'Logs', icon: ScrollText },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const currentSettings = getSavedThemeSettings();
    setTheme(currentSettings.mode);

    const syncTheme = () => {
      const settings = getSavedThemeSettings();
      setTheme(settings.mode);
    };

    window.addEventListener('ddp_theme_change', syncTheme);
    window.addEventListener('storage', syncTheme);

    return () => {
      window.removeEventListener('ddp_theme_change', syncTheme);
      window.removeEventListener('storage', syncTheme);
    };
  }, []);

  const toggleTheme = () => {
    const settings = getSavedThemeSettings();
    const nextMode = settings.mode === 'dark' ? 'light' : 'dark';
    saveThemeSettings({
      ...settings,
      mode: nextMode,
    });
  };

  useEffect(() => {
    const token = localStorage.getItem('ddp_token');
    const userData = localStorage.getItem('ddp_user');

    if (!token) {
      router.push('/login');
      return;
    }

    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('ddp_token');
    localStorage.removeItem('ddp_user');
    router.push('/login');
  };

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  // Build breadcrumb
  const breadcrumbs = pathname
    .split('/')
    .filter(Boolean)
    .map((segment, idx, arr) => ({
      label: segment.charAt(0).toUpperCase() + segment.slice(1),
      href: '/' + arr.slice(0, idx + 1).join('/'),
      isLast: idx === arr.length - 1,
    }));

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* ── Sidebar ──────────────────────────── */}
      <aside
        style={{
          width: '260px',
          minWidth: '260px',
          background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border-secondary)',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 16px',
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 50,
        }}
      >
        {/* Logo */}
        <Link
          href="/dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 8px 24px',
            textDecoration: 'none',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'var(--gradient-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 12px rgba(99, 102, 241, 0.3)',
            }}
          >
            <Database size={18} color="white" />
          </div>
          <span
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            DataBridge
          </span>
        </Link>

        {/* Nav Links */}
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
          {navItems.map((item: any) => {
            if (item.type === 'group') {
              return (
                <div key={item.title} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div className="sidebar-section-header">{item.title}</div>
                  {item.items.map((subItem: any) => {
                    const Icon = subItem.icon;
                    const active = isActive(subItem.href);
                    return (
                      <Link
                        key={subItem.href}
                        href={subItem.href}
                        className={`sidebar-link ${active ? 'active' : ''}`}
                      >
                        <Icon size={18} />
                        {subItem.label}
                      </Link>
                    );
                  })}
                </div>
              );
            }

            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${active ? 'active' : ''}`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User Info + Logout */}
        <div
          style={{
            borderTop: '1px solid var(--border-secondary)',
            paddingTop: '16px',
          }}
        >
          {user && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px',
                marginBottom: '8px',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'var(--gradient-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'white',
                }}
              >
                {user.name?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                  }}
                >
                  {user.name}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {user.role}
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="sidebar-link"
            style={{
              width: '100%',
              border: 'none',
              cursor: 'pointer',
              background: 'none',
              color: 'var(--text-secondary)',
              fontFamily: 'inherit',
            }}
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────── */}
      <main
        style={{
          flex: 1,
          marginLeft: '260px',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
      >
        {/* Header / Breadcrumb */}
        <header
          style={{
            height: '56px',
            borderBottom: '1px solid var(--border-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 32px',
            background: 'var(--bg-secondary)',
            position: 'sticky',
            top: 0,
            zIndex: 40,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {breadcrumbs.map((crumb) => (
              <span key={crumb.href} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {crumb.isLast ? (
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {crumb.label}
                  </span>
                ) : (
                  <>
                    <Link
                      href={crumb.href}
                      style={{
                        fontSize: '14px',
                        color: 'var(--text-tertiary)',
                        textDecoration: 'none',
                      }}
                    >
                      {crumb.label}
                    </Link>
                    <ChevronRight
                      size={14}
                      style={{ color: 'var(--text-muted)' }}
                    />
                  </>
                )}
              </span>
            ))}
          </div>

          <button
            onClick={toggleTheme}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: '1px solid var(--border-secondary)',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              outline: 'none',
            }}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>

        {/* Page Content */}
        <div
          style={{
            flex: 1,
            padding: '32px',
            background: 'var(--bg-primary)',
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
