import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatBytes(value: number | null | undefined): string {
  if (value == null) return '--';
  const num = +value;
  if (num !== num) return '--';

  if (num < 1024) {
    return `${num} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let size = num / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '--';
  const num = +seconds;
  if (num !== num) return '--';

  if (num < 60) {
    return `${num.toFixed(num % 1 === 0 ? 0 : 1)}s`;
  }

  const mins = Math.floor(num / 60);
  const rest = Math.round(num % 60);
  return `${mins}m ${rest}s`;
}

export function formatDateTime(value: string | null | undefined, locale?: string): string {
  if (!value) {
    return '--';
  }

  return new Date(value).toLocaleString(locale);
}
