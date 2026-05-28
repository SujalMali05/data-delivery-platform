'use client';

import { CalendarClock } from 'lucide-react';

export default function SchedulesPage() {
  return (
    <div className="animate-fadeIn">
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>Schedules</h1>
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px' }}>
        Manage scheduled and recurring transfers
      </p>

      <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
        <CalendarClock size={40} style={{ margin: '0 auto 16px', opacity: 0.3, color: 'var(--accent-purple)' }} />
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Scheduled Transfers</h3>
        <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', maxWidth: '400px', margin: '0 auto' }}>
          Create a transfer with a scheduled time to see it here.
          Supports one-time, daily, and weekly schedules.
        </p>
      </div>
    </div>
  );
}
