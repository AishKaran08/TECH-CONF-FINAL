import { describe, expect, it } from 'vitest';
import type { ContributionCalendar } from '../schemas';
import { calendarTotals, computeStreak } from './streak';

const cal = (counts: number[], to = '2026-10-24'): ContributionCalendar => {
  const end = new Date(2026, 9, 24);
  const days = counts.map((count, i) => {
    const d = new Date(end);
    d.setDate(end.getDate() - (counts.length - 1 - i));
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { date, count };
  });
  return { basis: 'events', from: days[0]!.date, to, days };
};

describe('computeStreak', () => {
  const now = new Date(2026, 9, 24, 18, 0);
  it('counts the current run ending today', () => {
    expect(computeStreak(cal([1, 0, 2, 3, 1]), now)).toMatchObject({ current: 3, longest: 3 });
  });
  it('does not break the streak when today has no activity yet', () => {
    expect(computeStreak(cal([2, 2, 2, 0]), now)).toMatchObject({ current: 3 });
  });
  it('reports the longest run separately', () => {
    expect(computeStreak(cal([1, 1, 1, 1, 0, 0, 1]), now)).toMatchObject({ current: 1, longest: 4 });
  });
  it('returns null when the data cannot support a streak', () => {
    expect(computeStreak(null, now)).toBeNull();
    expect(computeStreak(cal([0, 0, 0]), now)).toBeNull();
  });
  it('totals contributions and active days', () => {
    expect(calendarTotals(cal([1, 0, 2]))).toEqual({ contributions: 3, activeDays: 2 });
  });
});
