import {
  DeadlineKind,
  formatDue,
  parseDue,
  planWeek,
  SortScope,
} from '@runway/shared';
import { z } from 'zod';
import { buildDashboard } from '../dashboard';
import { createDeadline, createTask } from '../routes/data';
import type { Services } from '../services';

/** Due value accepted from the model: "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" (local time). */
const Due = z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, 'Use YYYY-MM-DD or YYYY-MM-DDTHH:MM');

export interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  input: S;
  /** Mutating tools never run without the user's approval. */
  mutating: boolean;
  /** Plain-language description of the exact change, shown on the confirmation card. */
  describe?: (input: z.infer<S>, s: Services) => string;
  run: (input: z.infer<S>, s: Services) => Promise<{ result: unknown; summary: string }>;
}

const def = <S extends z.ZodType>(t: ToolDef<S>): ToolDef<S> => t;

const whenText = (due: string) => {
  const d = parseDue(due);
  return `${formatDue(d)}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

export const TOOLS = [
  /* ---------------- read-only ---------------- */
  def({
    name: 'get_profile',
    description: 'Resume profile, target role, skills with evidence sources, and projects in their current order.',
    input: z.object({}),
    mutating: false,
    run: async (_i, s) => {
      const d = buildDashboard(s.ws);
      const p = d.resume?.profile ?? null;
      return {
        result: {
          targetRole: d.settings.targetRole || null,
          hasResume: !!p,
          name: p?.name ?? null,
          education: p?.education ?? [],
          experience: p?.experience.map((e) => ({ title: e.title, org: e.org, period: e.period, bullets: e.bullets.slice(0, 4) })) ?? [],
          skills: d.skills.slice(0, 40).map((k) => ({ name: k.name, evidence: k.evidence, count: k.evidenceCount })),
          projects: d.projects.slice(0, 20).map((x) => ({ id: x.id, name: x.name, description: x.description, language: x.language, tech: x.tech.slice(0, 8), stars: x.stars, pushedAt: x.pushedAt, sources: x.origins })),
        },
        summary: `${p ? 'Resume' : 'No resume'}, ${d.skills.length} skills, ${d.projects.length} projects`,
      };
    },
  }),
  def({
    name: 'get_deadlines',
    description: 'Upcoming exams and deadlines entered by the user or imported from a calendar.',
    input: z.object({}),
    mutating: false,
    run: async (_i, s) => {
      const now = Date.now();
      const list = s.ws.deadlines().filter((d) => parseDue(d.due).getTime() > now - 86400_000).sort((a, b) => a.due.localeCompare(b.due));
      return { result: list.map((d) => ({ id: d.id, title: d.title, kind: d.kind, due: d.due, location: d.location })), summary: `${list.length} upcoming` };
    },
  }),
  def({
    name: 'list_tasks',
    description: 'Tasks with due dates, estimated hours, done state and how often they were postponed.',
    input: z.object({ includeDone: z.boolean().optional() }),
    mutating: false,
    run: async (i, s) => {
      const tasks = buildDashboard(s.ws).tasks.filter((t) => i.includeDone || !t.done);
      return { result: tasks.map((t) => ({ id: t.id, title: t.title, due: t.due, estimateHours: t.estimateHours, done: t.done, postponedCount: t.postponedCount })), summary: `${tasks.length} tasks` };
    },
  }),
  def({
    name: 'get_activity',
    description: 'Recent GitHub and Codeforces activity: contribution totals, streak, recent submissions, rating, and share of recent activity per area.',
    input: z.object({}),
    mutating: false,
    run: async (_i, s) => {
      const d = buildDashboard(s.ws);
      return {
        result: {
          github: d.github.profile ? { login: d.github.profile.login, totals: d.github.totals, streak: d.github.streak, calendarBasis: d.github.calendar?.basis ?? null, recentRepos: d.github.repos.slice(0, 6).map((r) => ({ name: r.name, language: r.language, pushedAt: r.pushedAt })) } : null,
          codeforces: d.codeforces.user ? { handle: d.codeforces.user.handle, rating: d.codeforces.user.rating, rank: d.codeforces.user.rank } : null,
          recentSubmissions: d.submissions.slice(0, 10).map((x) => ({ problem: x.problemName, verdict: x.verdictText, time: x.time, source: x.origin })),
          leetcode: d.leetcode ? { easy: d.leetcode.easy, medium: d.leetcode.medium, hard: d.leetcode.hard, enteredByUser: true } : null,
          activityShare: d.radar.map((a) => ({ area: a.axis, share: Math.round(a.share * 100) / 100, evidence: a.evidence })),
          sources: d.sources.map((x) => ({ source: x.source, state: x.state, lastSyncedAt: x.lastSyncedAt })),
        },
        summary: `${d.submissions.length} recent submissions, ${d.github.totals?.contributions ?? 0} contributions`,
      };
    },
  }),
  def({
    name: 'check_week_fit',
    description: 'Places task hours into the next 7 days before each deadline (earliest deadline first) and reports whether the week fits, per-day blocks, shortfalls and deadlines with no prep task.',
    input: z.object({}),
    mutating: false,
    run: async (_i, s) => {
      const fit = planWeek(s.ws.tasks(), s.ws.deadlines(), { now: new Date(), studyHoursPerDay: s.ws.settings().studyHoursPerDay });
      return { result: fit, summary: fit.fits ? `Fits: ${fit.totalNeeded}h of ${fit.totalFree}h free` : `Tight: ${fit.shortfalls.length} task(s) short` };
    },
  }),
  /* ---------------- mutating (always confirmed) ---------------- */
  def({
    name: 'create_task',
    description: 'Create a task. Needs the user’s approval.',
    input: z.object({ title: z.string().min(1).max(200), due: Due.nullable().optional(), estimateHours: z.number().min(0.25).max(100).optional(), deadlineId: z.string().max(80).optional() }),
    mutating: true,
    describe: (i) => `Create task "${i.title}"${i.due ? `, due ${whenText(i.due)}` : ''}, about ${i.estimateHours ?? 1}h`,
    run: async (i, s) => {
      const t = createTask(s, { title: i.title, due: i.due ?? null, estimateHours: i.estimateHours, deadlineId: i.deadlineId ?? null });
      return { result: { id: t.id }, summary: `Created "${t.title}"` };
    },
  }),
  def({
    name: 'update_task',
    description: 'Change a task’s title, due date, estimate or done state. Needs the user’s approval.',
    input: z.object({ id: z.string().max(80), title: z.string().min(1).max(200).optional(), due: Due.nullable().optional(), estimateHours: z.number().min(0.25).max(100).optional(), done: z.boolean().optional() }),
    mutating: true,
    describe: (i, s) => {
      const t = s.ws.tasks().find((x) => x.id === i.id);
      const parts: string[] = [];
      if (i.title) parts.push(`rename to "${i.title}"`);
      if (i.due !== undefined) parts.push(i.due ? `move due date to ${whenText(i.due)}` : 'remove the due date');
      if (i.estimateHours) parts.push(`set estimate to ${i.estimateHours}h`);
      if (i.done !== undefined) parts.push(i.done ? 'mark as done' : 'mark as not done');
      return `Update task "${t?.title ?? i.id}": ${parts.join(', ') || 'no changes'}`;
    },
    run: async (i, s) => {
      const tasks = s.ws.tasks();
      const t = tasks.find((x) => x.id === i.id);
      if (!t) throw new Error('No task with that id');
      if (i.title) t.title = i.title;
      if (i.due !== undefined) {
        t.due = i.due;
        t.postponedCount = 0;
      }
      if (i.estimateHours) t.estimateHours = i.estimateHours;
      if (i.done !== undefined) t.done = i.done;
      s.ws.setTasks(tasks);
      s.ws.changed('tasks');
      return { result: { ok: true }, summary: `Updated "${t.title}"` };
    },
  }),
  def({
    name: 'reorder',
    description: 'Set the order of tasks, projects or skills (ids in the new order; projects/tasks by id, skills by name). Needs the user’s approval and can be undone from Smart sort.',
    input: z.object({ scope: SortScope, ids: z.array(z.string().max(80)).min(1).max(100) }),
    mutating: true,
    describe: (i, s) => {
      const d = buildDashboard(s.ws);
      const name = (id: string) => (i.scope === 'tasks' ? d.tasks.find((t) => t.id === id)?.title : i.scope === 'projects' ? d.projects.find((p) => p.id === id)?.name : id) ?? id;
      return `Reorder ${i.scope}: ${i.ids.slice(0, 5).map(name).join(', ')}${i.ids.length > 5 ? ', …' : ''} first`;
    },
    run: async (i, s) => {
      if (!s.sort) throw new Error('Sorting unavailable');
      s.sort.setScope(i.scope, i.ids);
      return { result: { ok: true }, summary: `Reordered ${i.scope}` };
    },
  }),
  def({
    name: 'add_deadline',
    description: 'Add an exam or deadline with a date. Needs the user’s approval.',
    input: z.object({ title: z.string().min(1).max(160), kind: DeadlineKind, due: Due, location: z.string().max(120).nullable().optional() }),
    mutating: true,
    describe: (i) => `Add ${i.kind} "${i.title}" on ${whenText(i.due)}${i.location ? ` at ${i.location}` : ''}`,
    run: async (i, s) => {
      const d = createDeadline(s, { title: i.title, kind: i.kind, due: i.due, location: i.location ?? null });
      return { result: { id: d.id }, summary: `Added "${d.title}"` };
    },
  }),
  def({
    name: 'set_target_role',
    description: 'Set the target role used to rank projects. Needs the user’s approval.',
    input: z.object({ role: z.string().min(2).max(80) }),
    mutating: true,
    describe: (i, s) => `Set target role to "${i.role}"${s.ws.settings().targetRole ? ` (was "${s.ws.settings().targetRole}")` : ''}`,
    run: async (i, s) => {
      s.ws.updateSettings({ targetRole: i.role });
      s.ws.changed('settings');
      return { result: { ok: true }, summary: `Target role is now ${i.role}` };
    },
  }),
  def({
    name: 'run_sync',
    description: 'Sync all connected sources (GitHub, Codeforces, resume, calendar link) and return what changed. Needs the user’s approval.',
    input: z.object({}),
    mutating: true,
    describe: (_i, s) => {
      const list = s.ws.mode() === 'demo' ? ['demo data'] : (s.sync?.configuredSources() ?? []);
      return `Sync now: ${list.join(', ') || 'nothing is connected yet'}`;
    },
    run: async (_i, s) => {
      if (!s.sync) throw new Error('Sync unavailable');
      const r = s.sync.start(undefined, 'agent');
      if (r.syncId === null) return { result: { message: r.message }, summary: r.message };
      const out = await r.done;
      return { result: out.summary, summary: out.text };
    },
  }),
] as const;

export type AnyTool = ToolDef;
export const TOOL_MAP = new Map<string, AnyTool>(TOOLS.map((t) => [t.name, t as unknown as AnyTool]));
export const READ_ONLY = TOOLS.filter((t) => !t.mutating).map((t) => t.name);
