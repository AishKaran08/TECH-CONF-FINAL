/** Date helpers. All "local" helpers use the machine's local time zone (the app is single-user and local). */

const DAY_MS = 24 * 60 * 60 * 1000;
export { DAY_MS };

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local calendar date as YYYY-MM-DD. */
export function toDateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local "YYYY-MM-DDTHH:MM". */
export function toLocalDateTime(d: Date): string {
  return `${toDateOnly(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Parse a YYYY-MM-DD date as local midnight. */
export function parseDateOnly(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/**
 * Parse a due value: "YYYY-MM-DD" (treated as 09:00 local, a typical exam/submission time)
 * or "YYYY-MM-DDTHH:MM" local, or a full ISO string with offset.
 */
export function parseDue(due: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    const d = parseDateOnly(due);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  const local = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(due);
  if (local) {
    const [, y, mo, d, h, mi] = local.map(Number) as [number, number, number, number, number, number];
    return new Date(y, mo - 1, d, h, mi);
  }
  return new Date(due);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** Whole calendar days from `from` to `to` (local), e.g. today->tomorrow = 1. */
export function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/** Monday = 0 ... Sunday = 6. */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Minutes since midnight for "HH:MM". */
export function clockToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Human countdown like "in 3 days", "in 5 hours", "tomorrow", "overdue by 2 days". */
export function describeCountdown(due: Date, now: Date): string {
  const diff = due.getTime() - now.getTime();
  const days = calendarDaysBetween(now, due);
  if (diff < 0) {
    const ago = Math.max(1, calendarDaysBetween(due, now));
    return diff > -DAY_MS && days === 0 ? 'passed today' : `passed ${ago} day${ago === 1 ? '' : 's'} ago`;
  }
  if (days === 0) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    if (hours >= 1) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
    const mins = Math.max(1, Math.floor(diff / 60000));
    return `in ${mins} min`;
  }
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

export type Urgency = 'calm' | 'soon' | 'urgent' | 'past';

/** Urgency bucket for countdowns. Always paired with words + an icon in the UI. */
export function urgencyOf(due: Date, now: Date): Urgency {
  const ms = due.getTime() - now.getTime();
  if (ms < 0) return 'past';
  if (ms <= 2 * DAY_MS) return 'urgent';
  if (ms <= 7 * DAY_MS) return 'soon';
  return 'calm';
}
