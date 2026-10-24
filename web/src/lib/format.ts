import { STALE_AFTER_MS, type RecordOrigin } from '@runway/shared';

export function timeAgo(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return 'never';
  const ms = now.getTime() - new Date(iso).getTime();
  if (ms < 45_000) return 'just now';
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function isStale(iso: string | null | undefined, now = new Date()): boolean {
  return !!iso && now.getTime() - new Date(iso).getTime() > STALE_AFTER_MS;
}

export function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function rangeLabel(fromYmd: string, toYmd: string): string {
  const f = new Date(`${fromYmd}T00:00`);
  const t = new Date(`${toYmd}T00:00`);
  const sameYear = f.getFullYear() === t.getFullYear();
  const fmt = (d: Date, withYear: boolean) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  return `${fmt(f, !sameYear)} – ${fmt(t, true)}`;
}

export const ORIGIN_LABEL: Record<RecordOrigin, string> = {
  github: 'GitHub',
  codeforces: 'Codeforces',
  resume: 'Resume',
  manual: 'Entered by you',
  ics: 'Calendar file',
  demo: 'Demo data',
};

export function clsx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function pluralize(n: number, word: string, plural = `${word}s`): string {
  return `${n} ${n === 1 ? word : plural}`;
}
