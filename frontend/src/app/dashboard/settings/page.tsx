'use client';

import { Settings, Bell, Mail, MessageSquare, Send } from 'lucide-react';

export default function SettingsPage() {
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
