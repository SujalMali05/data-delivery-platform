'use client';

import { Settings, Bell, Mail, MessageSquare, Send, Sun, Moon } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  getSavedThemeSettings,
  saveThemeSettings,
  ACCENTS,
  ThemeSettings,
  AccentPreset,
} from '../../../lib/theme';

export default function SettingsPage() {
  const [themeSettings, setThemeSettings] = useState<ThemeSettings | null>(null);

  useEffect(() => {
    setThemeSettings(getSavedThemeSettings());

    const syncTheme = () => {
      setThemeSettings(getSavedThemeSettings());
    };
    window.addEventListener('ddp_theme_change', syncTheme);
    return () => window.removeEventListener('ddp_theme_change', syncTheme);
  }, []);

  return (
    <div className="animate-fadeIn" style={{ maxWidth: '720px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>Settings</h1>
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px' }}>
        Platform configuration and notification settings
      </p>

      {/* Notification Settings */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <Bell size={18} style={{ color: 'var(--accent-amber)' }} />
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Notifications</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Email */}
          <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <Mail size={16} style={{ color: 'var(--accent-blue)' }} />
              <span style={{ fontSize: '14px', fontWeight: 600 }}>Email (SMTP)</span>
              <span className="badge" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)', marginLeft: 'auto' }}>
                Configure in .env
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
              Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in your environment variables
            </p>
          </div>

          {/* Slack */}
          <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <MessageSquare size={16} style={{ color: '#10b981' }} />
              <span style={{ fontSize: '14px', fontWeight: 600 }}>Slack</span>
              <span className="badge" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)', marginLeft: 'auto' }}>
                Configure in .env
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
              Set SLACK_WEBHOOK_URL in your environment variables
            </p>
          </div>

          {/* Telegram */}
          <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <Send size={16} style={{ color: '#06b6d4' }} />
              <span style={{ fontSize: '14px', fontWeight: 600 }}>Telegram</span>
              <span className="badge" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)', marginLeft: 'auto' }}>
                Configure in .env
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
              Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in your environment variables
            </p>
          </div>
        </div>
      </div>

      {/* Theme & Appearance */}
      {themeSettings && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <Settings size={18} style={{ color: 'var(--accent-blue)' }} />
            <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Theme & Appearance</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Theme Mode Grid */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '10px' }}>
                Theme Mode
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* Light Mode Card */}
                <div
                  onClick={() => {
                    saveThemeSettings({ ...themeSettings, mode: 'light' });
                  }}
                  style={{
                    padding: '20px',
                    borderRadius: '12px',
                    background: themeSettings.mode === 'light' ? 'var(--bg-tertiary)' : 'var(--bg-input)',
                    border: themeSettings.mode === 'light' ? '2px solid var(--accent-blue)' : '1px solid var(--border-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'all 0.2s ease',
                    boxShadow: themeSettings.mode === 'light' ? '0 4px 12px var(--accent-blue-glow)' : 'none',
                  }}
                >
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: themeSettings.mode === 'light' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#f59e0b',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <Sun size={24} style={{ filter: themeSettings.mode === 'light' ? 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.5))' : 'none' }} />
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Light Mode</span>
                </div>

                {/* Dark Mode Card */}
                <div
                  onClick={() => {
                    saveThemeSettings({ ...themeSettings, mode: 'dark' });
                  }}
                  style={{
                    padding: '20px',
                    borderRadius: '12px',
                    background: themeSettings.mode === 'dark' ? 'var(--bg-tertiary)' : 'var(--bg-input)',
                    border: themeSettings.mode === 'dark' ? '2px solid var(--accent-blue)' : '1px solid var(--border-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'all 0.2s ease',
                    boxShadow: themeSettings.mode === 'dark' ? '0 4px 12px var(--accent-blue-glow)' : 'none',
                  }}
                >
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: themeSettings.mode === 'dark' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#6366f1',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <Moon size={24} style={{ filter: themeSettings.mode === 'dark' ? 'drop-shadow(0 0 8px rgba(99, 102, 241, 0.5))' : 'none' }} />
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Dark Mode</span>
                </div>
              </div>
            </div>

            {/* Accent Color Preset Row */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Accent Color
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                {(['indigo', 'emerald', 'cyan', 'amber', 'crimson'] as AccentPreset[]).map((preset) => {
                  const label = preset.charAt(0).toUpperCase() + preset.slice(1);
                  const color = ACCENTS[themeSettings.mode][preset].accent;
                  const glow = ACCENTS[themeSettings.mode][preset].glow;
                  const isSelected = themeSettings.accent === preset;
                  
                  return (
                    <button
                      key={preset}
                      onClick={() => {
                        saveThemeSettings({ ...themeSettings, accent: preset });
                      }}
                      title={label}
                      style={{
                        position: 'relative',
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        background: color,
                        border: isSelected ? '3px solid var(--text-primary)' : '1px solid var(--border-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: isSelected ? `0 0 16px ${glow}` : 'none',
                        transition: 'all 0.2s ease',
                        padding: 0,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      {isSelected && (
                        <div style={{ color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Vibrancy Profile Selector */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '10px' }}>
                Vibrancy Profile
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                {([
                  { id: 'slate', title: 'Subtle Slate', desc: 'Muted slate accents' },
                  { id: 'vibrant', title: 'Vibrant Tint', desc: 'Deep color accents' },
                  { id: 'glass', title: 'Aero Glass', desc: 'Glassmorphic transparency' },
                ] as const).map((profile) => {
                  const isSelected = themeSettings.vibrancy === profile.id;
                  return (
                    <div
                      key={profile.id}
                      onClick={() => {
                        saveThemeSettings({ ...themeSettings, vibrancy: profile.id });
                      }}
                      style={{
                        padding: '14px',
                        borderRadius: '10px',
                        background: isSelected ? 'var(--bg-tertiary)' : 'var(--bg-input)',
                        border: isSelected ? '2px solid var(--accent-blue)' : '1px solid var(--border-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        transition: 'all 0.2s ease',
                        boxShadow: isSelected ? '0 4px 12px var(--accent-blue-glow)' : 'none',
                      }}
                    >
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{profile.title}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{profile.desc}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Platform Info */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Settings size={18} style={{ color: 'var(--text-tertiary)' }} />
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Platform Information</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            ['Platform', 'DataBridge - Data Delivery Platform'],
            ['Version', '1.0.0'],
            ['Backend', 'NestJS + PostgreSQL + BullMQ'],
            ['Frontend', 'Next.js + Tailwind CSS'],
            ['Transfer Engine', 'rclone RC API'],
            ['Auth', 'AWS STS AssumeRole (Cross-Account)'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{k}</span>
              <span style={{ fontSize: '13px' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
