import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number | string): string {
  const b = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (!b || b === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i > 2 ? 2 : 0)} ${units[i]}`;
}

export function formatSpeed(speed: string | null): string {
  return speed || '0 B/s';
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(startDate: string, endDate?: string): string {
  const start = new Date(startDate).getTime();
  const end = endDate ? new Date(endDate).getTime() : Date.now();
  const diff = end - start;

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    RUNNING: 'text-emerald-400',
    QUEUED: 'text-amber-400',
    COMPLETED: 'text-blue-400',
    FAILED: 'text-red-400',
    PAUSED: 'text-orange-400',
    CANCELLED: 'text-zinc-400',
    RETRYING: 'text-yellow-400',
    SCHEDULED: 'text-purple-400',
  };
  return colors[status] || 'text-zinc-400';
}

export function getStatusBgColor(status: string): string {
  const colors: Record<string, string> = {
    RUNNING: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    QUEUED: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    COMPLETED: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    FAILED: 'bg-red-500/10 border-red-500/30 text-red-400',
    PAUSED: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
    CANCELLED: 'bg-zinc-500/10 border-zinc-500/30 text-zinc-400',
    RETRYING: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    SCHEDULED: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
  };
  return colors[status] || 'bg-zinc-500/10 border-zinc-500/30 text-zinc-400';
}

export function getProgressPercentage(transferred: string | number, total: string | number): number {
  const t = typeof transferred === 'string' ? parseInt(transferred, 10) : transferred;
  const tot = typeof total === 'string' ? parseInt(total, 10) : total;
  if (!tot || tot === 0) return 0;
  return Math.min(Math.round((t / tot) * 100), 100);
}
