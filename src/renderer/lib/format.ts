import type { SessionListItem } from '@shared/types';

/** A session's elapsed time (live sessions count up to now). */
export function durationMs(s: SessionListItem): number {
  if (!s.startedAt) return 0;
  return Math.max(0, (s.endedAt ?? Date.now()) - s.startedAt);
}

export function fmtDur(ms: number): string {
  if (ms < 1000) return '—';
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

export function fmtHours(ms: number): string {
  return `${(ms / 3_600_000).toFixed(1)}h`;
}
