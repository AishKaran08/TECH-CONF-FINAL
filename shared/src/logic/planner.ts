import type { Deadline, Task, TaskFlag } from '../schemas';
import { addDays, calendarDaysBetween, parseDue, startOfDay, toDateOnly, WEEKDAYS_SHORT, weekdayIndex } from './time';

/** Study window used to spread daily free hours over a day (08:00–22:00). */
const DAY_START_H = 8;
const DAY_END_H = 22;

export interface PlannerOptions {
  now: Date;
  /** Realistic hours per day available for tasks, outside classes. */
  studyHoursPerDay: number;
}

export function formatDue(due: Date): string {
  return `${WEEKDAYS_SHORT[weekdayIndex(due)]} ${due.getDate()} ${due.toLocaleString('en', { month: 'short' })}`;
}

/**
 * Free hours between `now` and `due`, assuming `perDay` usable hours spread evenly over 08:00–22:00
 * each day. Partial days count proportionally.
 */
export function freeHoursBetween(now: Date, due: Date, perDay: number): number {
  if (due.getTime() <= now.getTime() || perDay <= 0) return 0;
  const windowH = DAY_END_H - DAY_START_H;
  let total = 0;
  for (let day = startOfDay(now); day.getTime() <= due.getTime(); day = addDays(day, 1)) {
    const winStart = new Date(day);
    winStart.setHours(DAY_START_H, 0, 0, 0);
    const winEnd = new Date(day);
    winEnd.setHours(DAY_END_H, 0, 0, 0);
    const from = Math.max(winStart.getTime(), now.getTime());
    const to = Math.min(winEnd.getTime(), due.getTime());
    if (to > from) total += perDay * ((to - from) / (windowH * 3600_000));
  }
  return Math.round(total * 10) / 10;
}

function dueOf(t: Task): number {
  return t.due ? parseDue(t.due).getTime() : Number.POSITIVE_INFINITY;
}

/** Earliest deadline first; undated tasks after dated ones; done tasks last. Ties: bigger task first. Stable. */
export function orderTasks(tasks: Task[]): Task[] {
  return tasks
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      if (a.t.done !== b.t.done) return a.t.done ? 1 : -1;
      const d = dueOf(a.t) - dueOf(b.t);
      if (d !== 0 && Number.isFinite(d)) return d;
      if (!Number.isFinite(dueOf(a.t)) && Number.isFinite(dueOf(b.t))) return 1;
      if (Number.isFinite(dueOf(a.t)) && !Number.isFinite(dueOf(b.t))) return -1;
      const e = b.t.estimateHours - a.t.estimateHours;
      if (e !== 0) return e;
      return a.i - b.i;
    })
    .map((x) => x.t);
}

export function taskOrderReason(t: Task, now: Date): string {
  if (t.done) return 'Done, moved to the end';
  if (!t.due) return 'No deadline, so it goes after dated tasks';
  const due = parseDue(t.due);
  const days = calendarDaysBetween(now, due);
  const when = days < 0 ? 'past due' : days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : `due ${formatDue(due)}`;
  return `${when[0]!.toUpperCase()}${when.slice(1)}, earliest deadline first`;
}

/**
 * Slack check in deadline order: cumulative hours needed vs free hours before each deadline.
 * Also flags tasks postponed 3+ times with split/drop/reschedule options.
 */
export function checkTasks(tasks: Task[], opts: PlannerOptions): TaskFlag[] {
  const flags: TaskFlag[] = [];
  let cumulative = 0;
  for (const t of orderTasks(tasks)) {
    if (t.done) continue;
    cumulative += t.estimateHours;
    if (t.due) {
      const due = parseDue(t.due);
      const free = freeHoursBetween(opts.now, due, opts.studyHoursPerDay);
      if (cumulative > free + 1e-9) {
        flags.push({
          taskId: t.id,
          kind: 'at_risk',
          message:
            due.getTime() <= opts.now.getTime()
              ? `"${t.title}" is past its date. Pick a new date, split it, or let it go.`
              : `"${t.title}" needs about ${round1(cumulative)}h of work up to ${formatDue(due)} (counting earlier tasks), with about ${round1(free)}h free. A smaller step or a new date could help.`,
          options: ['split', 'reschedule', 'drop'],
        });
      }
    }
    if (t.postponedCount >= 3) {
      flags.push({
        taskId: t.id,
        kind: 'postponed_often',
        message: `"${t.title}" has moved ${t.postponedCount} times. That usually means it is too big or no longer needed. Split it, drop it, or choose a firm date?`,
        options: ['split', 'drop', 'reschedule'],
      });
    }
  }
  return flags;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface WeekDayPlan {
  date: string;
  label: string;
  capacityHours: number;
  blocks: { taskId: string; title: string; hours: number }[];
  deadlines: { id: string; title: string; kind: Deadline['kind'] }[];
}

export interface WeekFit {
  fits: boolean;
  totalNeeded: number;
  totalFree: number;
  days: WeekDayPlan[];
  /** Hours that could not be placed before their deadline, per task. */
  shortfalls: { taskId: string; title: string; hoursShort: number; due: string | null }[];
  /** Deadlines this week with no linked or similarly named task. */
  unprepared: { id: string; title: string; kind: Deadline['kind']; due: string }[];
}

/**
 * Greedy earliest-deadline-first schedule over the next `days` days.
 * Each task's hours are placed into the earliest days with capacity, never after its deadline day.
 */
export function planWeek(tasks: Task[], deadlines: Deadline[], opts: PlannerOptions & { days?: number }): WeekFit {
  const n = opts.days ?? 7;
  const today = startOfDay(opts.now);
  const days: WeekDayPlan[] = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(today, i);
    const endOfDay = addDays(d, 1);
    const cap = freeHoursBetween(i === 0 ? opts.now : d, endOfDay, opts.studyHoursPerDay);
    days.push({ date: toDateOnly(d), label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : formatDue(d), capacityHours: cap, blocks: [], deadlines: [] });
  }
  const remaining = days.map((d) => d.capacityHours);
  const horizonEnd = addDays(today, n).getTime();
  const shortfalls: WeekFit['shortfalls'] = [];
  let totalNeeded = 0;

  for (const t of orderTasks(tasks)) {
    if (t.done) continue;
    const dueMs = t.due ? parseDue(t.due).getTime() : Number.POSITIVE_INFINITY;
    // Tasks due inside the horizon count towards the fit; later/undated tasks only fill leftover capacity.
    const counts = dueMs < horizonEnd;
    if (counts) totalNeeded += t.estimateHours;
    let left = t.estimateHours;
    for (let i = 0; i < n && left > 1e-9; i++) {
      const dayStart = addDays(today, i);
      if (dayStart.getTime() >= dueMs) break;
      // On the deadline day, only the hours before the deadline time are usable.
      const dayEnd = addDays(dayStart, 1);
      const usable =
        dueMs < dayEnd.getTime()
          ? Math.min(remaining[i]!, freeHoursBetween(i === 0 ? opts.now : dayStart, new Date(dueMs), opts.studyHoursPerDay))
          : remaining[i]!;
      const take = Math.min(left, usable);
      if (take > 0.05) {
        days[i]!.blocks.push({ taskId: t.id, title: t.title, hours: round1(take) });
        remaining[i]! -= take;
        left -= take;
      }
    }
    if (counts && left > 0.05) shortfalls.push({ taskId: t.id, title: t.title, hoursShort: round1(left), due: t.due });
  }

  const unprepared: WeekFit['unprepared'] = [];
  for (const dl of deadlines) {
    const due = parseDue(dl.due);
    const idx = calendarDaysBetween(today, due);
    if (idx < 0 || idx >= n) continue;
    days[idx]!.deadlines.push({ id: dl.id, title: dl.title, kind: dl.kind });
    const words = dl.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const linked = tasks.some(
      (t) => !t.done && (t.deadlineId === dl.id || words.some((w) => t.title.toLowerCase().includes(w))),
    );
    if (!linked) unprepared.push({ id: dl.id, title: dl.title, kind: dl.kind, due: dl.due });
  }

  const totalFree = round1(days.reduce((s, d) => s + d.capacityHours, 0));
  return { fits: shortfalls.length === 0, totalNeeded: round1(totalNeeded), totalFree, days, shortfalls, unprepared };
}
