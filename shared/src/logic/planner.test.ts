import { describe, expect, it } from 'vitest';
import type { Deadline, Task } from '../schemas';
import { checkTasks, freeHoursBetween, orderTasks, planWeek, taskOrderReason } from './planner';
import { toLocalDateTime } from './time';

const now = new Date(2026, 9, 24, 8, 0); // Sat 24 Oct 2026, 08:00 local
const at = (days: number, h = 9) => toLocalDateTime(new Date(2026, 9, 24 + days, h, 0));
const task = (id: string, due: string | null, estimateHours = 1, extra: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  due,
  estimateHours,
  postponedCount: 0,
  done: false,
  deadlineId: null,
  createdAt: now.toISOString(),
  origin: 'manual',
  ...extra,
});

describe('freeHoursBetween', () => {
  it('counts full days at the configured rate', () => {
    // 08:00 today → 08:00 two days later = two full 08-22 windows
    expect(freeHoursBetween(now, new Date(2026, 9, 26, 8, 0), 4)).toBe(8);
  });
  it('counts partial days proportionally', () => {
    // 08:00 → 15:00 = half of the 14h window
    expect(freeHoursBetween(now, new Date(2026, 9, 24, 15, 0), 4)).toBe(2);
  });
  it('is zero for past deadlines', () => {
    expect(freeHoursBetween(now, new Date(2026, 9, 23), 4)).toBe(0);
  });
});

describe('orderTasks', () => {
  it('orders earliest deadline first, undated after, done last', () => {
    const out = orderTasks([task('a', null), task('b', at(5)), task('c', at(1)), task('d', at(2), 1, { done: true })]);
    expect(out.map((t) => t.id)).toEqual(['c', 'b', 'a', 'd']);
  });
  it('breaks deadline ties with the bigger task first and stays stable otherwise', () => {
    const out = orderTasks([task('a', at(3), 1), task('b', at(3), 4), task('c', at(3), 1)]);
    expect(out.map((t) => t.id)).toEqual(['b', 'a', 'c']);
  });
  it('explains the position in plain words', () => {
    expect(taskOrderReason(task('x', at(1)), now)).toMatch(/^Due tomorrow/);
    expect(taskOrderReason(task('y', null), now)).toMatch(/No deadline/);
  });
});

describe('checkTasks', () => {
  it('flags a task when cumulative hours exceed free hours before its deadline', () => {
    const flags = checkTasks([task('a', at(1), 3), task('b', at(1, 12), 4)], { now, studyHoursPerDay: 4 });
    // Free until tomorrow 12:00 ≈ 4 + 4*(4/14) ≈ 5.1h; a needs 3 (ok), a+b needs 7 (at risk)
    expect(flags.map((f) => [f.taskId, f.kind])).toEqual([['b', 'at_risk']]);
    expect(flags[0]!.options).toContain('split');
  });
  it('prompts split/drop/reschedule after 3 postponements', () => {
    const flags = checkTasks([task('p', null, 1, { postponedCount: 3 })], { now, studyHoursPerDay: 4 });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.kind).toBe('postponed_often');
    expect(flags[0]!.options).toEqual(['split', 'drop', 'reschedule']);
  });
  it('does not flag tasks with enough slack', () => {
    expect(checkTasks([task('a', at(6), 5)], { now, studyHoursPerDay: 4 })).toEqual([]);
  });
});

describe('planWeek', () => {
  const deadlines: Deadline[] = [
    { id: 'exam', title: 'Operating Systems exam', kind: 'exam', due: at(6, 10), location: null, origin: 'manual' },
    { id: 'proj', title: 'Compiler project', kind: 'project', due: at(4, 17), location: null, origin: 'manual' },
  ];
  it('places hours before each deadline and reports fit', () => {
    const plan = planWeek([task('p', at(4, 17), 6, { title: 'Compiler project report' })], deadlines, { now, studyHoursPerDay: 4 });
    expect(plan.days).toHaveLength(7);
    expect(plan.fits).toBe(true);
    const placed = plan.days.flatMap((d) => d.blocks).reduce((s, b) => s + b.hours, 0);
    expect(placed).toBeCloseTo(6, 1);
    // nothing scheduled on or after the deadline day for this task
    expect(plan.days.slice(4).flatMap((d) => d.blocks)).toEqual([]);
  });
  it('lists deadlines without a prep task as unprepared', () => {
    const plan = planWeek([task('p', at(4, 17), 2, { title: 'Compiler project report' })], deadlines, { now, studyHoursPerDay: 4 });
    expect(plan.unprepared.map((u) => u.id)).toEqual(['exam']);
  });
  it('reports shortfalls when the week is overfull', () => {
    const plan = planWeek([task('big', at(2), 30)], [], { now, studyHoursPerDay: 4 });
    expect(plan.fits).toBe(false);
    expect(plan.shortfalls[0]!.hoursShort).toBeGreaterThan(20);
  });
});
