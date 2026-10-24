import type { ContributionCalendar, Streak } from '../schemas';
import { addDays, parseDateOnly, toDateOnly } from './time';

/**
 * Streak from a verified contribution calendar. Returns null when the data cannot support it
 * (no calendar, or no active day at all). Today not yet having activity does not break the streak.
 */
export function computeStreak(calendar: ContributionCalendar | null, now: Date): Streak | null {
  if (!calendar || calendar.days.length === 0) return null;
  const active = new Set(calendar.days.filter((d) => d.count > 0).map((d) => d.date));
  if (active.size === 0) return null;

  // Longest run inside the covered range.
  let longest = 0;
  let run = 0;
  for (let d = parseDateOnly(calendar.from); toDateOnly(d) <= calendar.to; d = addDays(d, 1)) {
    if (active.has(toDateOnly(d))) {
      run += 1;
      longest = Math.max(longest, run);
    } else run = 0;
  }

  // Current run ending today (or yesterday if today has no activity yet).
  const today = toDateOnly(now);
  let cursor = active.has(today) ? now : addDays(now, -1);
  let current = 0;
  while (active.has(toDateOnly(cursor)) && toDateOnly(cursor) >= calendar.from) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, longest, from: calendar.from, to: calendar.to, basis: calendar.basis };
}

/** Totals for the heatmap header. */
export function calendarTotals(calendar: ContributionCalendar | null): { contributions: number; activeDays: number } | null {
  if (!calendar) return null;
  let contributions = 0;
  let activeDays = 0;
  for (const d of calendar.days) {
    contributions += d.count;
    if (d.count > 0) activeDays += 1;
  }
  return { contributions, activeDays };
}
