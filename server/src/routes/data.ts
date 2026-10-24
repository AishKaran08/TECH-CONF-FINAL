import { Hono } from 'hono';
import {
  addDays,
  ClassInput,
  DeadlineInput,
  LeetcodeInput,
  parseDue,
  TaskInput,
  TaskPatch,
  toDateOnly,
  toLocalDateTime,
  type Briefing,
  type ClassSession,
  type Deadline,
  type Task,
} from '@runway/shared';
import { z } from 'zod';
import { notFound, readJson } from '../http';
import type { Services } from '../services';
import { newId } from '../workspace';

const IdParam = z.string().min(1).max(80);

/** Tasks, deadlines, classes, LeetCode counts and the daily briefing. */
export function dataRoutes(s: Services): Hono {
  const r = new Hono();
  const { ws } = s;

  /* ---------------- tasks ---------------- */

  r.post('/tasks', async (c) => {
    const input = await readJson(c, TaskInput);
    const task = createTask(s, input);
    return c.json(task, 201);
  });

  r.patch('/tasks/:id', async (c) => {
    const id = IdParam.parse(c.req.param('id'));
    const patch = await readJson(c, TaskPatch);
    const tasks = ws.tasks();
    const t = tasks.find((x) => x.id === id) ?? notFound('Task');
    if (patch.title !== undefined) t.title = patch.title;
    if (patch.estimateHours !== undefined) t.estimateHours = patch.estimateHours;
    if (patch.done !== undefined) t.done = patch.done;
    if (patch.due !== undefined) {
      t.due = patch.due;
      if (patch.reschedule) t.postponedCount = 0;
    }
    if (patch.postpone) {
      const base = t.due ? parseDue(t.due) : new Date();
      t.due = toLocalDateTime(addDays(base, 1));
      t.postponedCount += 1;
    }
    ws.setTasks(tasks);
    ws.changed('tasks');
    return c.json(t);
  });

  r.delete('/tasks/:id', (c) => {
    const id = IdParam.parse(c.req.param('id'));
    const tasks = ws.tasks();
    if (!tasks.some((t) => t.id === id)) notFound('Task');
    ws.setTasks(tasks.filter((t) => t.id !== id));
    ws.setOrders({ ...ws.orders(), tasks: ws.orders().tasks.filter((x) => x !== id) });
    ws.changed('tasks');
    return c.json({ ok: true });
  });

  /** Split a task into two halves (used when a task keeps getting postponed). */
  r.post('/tasks/:id/split', (c) => {
    const id = IdParam.parse(c.req.param('id'));
    const tasks = ws.tasks();
    const i = tasks.findIndex((t) => t.id === id);
    if (i < 0) notFound('Task');
    const t = tasks[i]!;
    const half = Math.max(0.25, Math.round((t.estimateHours / 2) * 4) / 4);
    const now = new Date().toISOString();
    const a: Task = { ...t, id: newId('task'), title: `${t.title} (part 1)`, estimateHours: half, postponedCount: 0, createdAt: now, origin: 'manual' };
    const b: Task = { ...t, id: newId('task'), title: `${t.title} (part 2)`, estimateHours: half, postponedCount: 0, createdAt: now, origin: 'manual' };
    tasks.splice(i, 1, a, b);
    ws.setTasks(tasks);
    const orders = ws.orders();
    ws.setOrders({ ...orders, tasks: orders.tasks.flatMap((x) => (x === id ? [a.id, b.id] : [x])) });
    ws.changed('tasks');
    return c.json([a, b]);
  });

  /* ---------------- deadlines and classes ---------------- */

  r.post('/deadlines', async (c) => {
    const input = await readJson(c, DeadlineInput);
    const d = createDeadline(s, input);
    return c.json(d, 201);
  });

  r.delete('/deadlines/:id', (c) => {
    const id = IdParam.parse(c.req.param('id'));
    const list = ws.deadlines();
    if (!list.some((d) => d.id === id)) notFound('Deadline');
    ws.setDeadlines(list.filter((d) => d.id !== id));
    ws.changed('deadlines');
    return c.json({ ok: true });
  });

  r.post('/classes', async (c) => {
    const input = await readJson(c, ClassInput);
    if (input.end <= input.start) return c.json({ error: 'The class must end after it starts.' }, 400);
    const cls: ClassSession = { ...input, id: newId('class'), origin: 'manual' };
    ws.setClasses([...ws.classes(), cls]);
    markTimetable(s);
    ws.changed('classes');
    return c.json(cls, 201);
  });

  r.delete('/classes/:id', (c) => {
    const id = IdParam.parse(c.req.param('id'));
    const list = ws.classes();
    if (!list.some((x) => x.id === id)) notFound('Class');
    ws.setClasses(list.filter((x) => x.id !== id));
    ws.changed('classes');
    return c.json({ ok: true });
  });

  /* ---------------- LeetCode (manual only) ---------------- */

  r.put('/leetcode', async (c) => {
    const input = await readJson(c, LeetcodeInput);
    for (const [k, total] of [['easy', 'totalEasy'], ['medium', 'totalMedium'], ['hard', 'totalHard']] as const) {
      if (input[k] > input[total]) return c.json({ error: `Solved ${k} (${input[k]}) is more than the total available (${input[total]}).` }, 400);
    }
    const now = new Date().toISOString();
    ws.setLeetcode({ ...input, updatedAt: now });
    ws.setStatus('leetcode', { state: 'connected', lastSyncedAt: now, lastError: null, detail: `${input.easy + input.medium + input.hard} solved, entered by you` });
    ws.changed('leetcode');
    return c.json(ws.leetcode());
  });

  /* ---------------- daily briefing ---------------- */

  r.post('/briefing', async (c) => {
    const { auto } = await readJson(c, z.object({ auto: z.boolean().optional() }));
    if (!s.briefing) return c.json({ error: 'Briefing is not available.' }, 503);
    const b = await s.briefing.generate({ auto: auto ?? false });
    ws.changed('briefing');
    return c.json(b);
  });

  r.put('/briefing', async (c) => {
    const { text } = await readJson(c, z.object({ text: z.string().max(2000) }));
    const b: Briefing = { date: toDateOnly(new Date()), text: text.trim(), generatedBy: 'user', dismissed: false, generatedAt: new Date().toISOString() };
    ws.setBriefing(b);
    ws.changed('briefing');
    return c.json(b);
  });

  r.post('/briefing/dismiss', (c) => {
    const b = ws.briefing();
    if (b) ws.setBriefing({ ...b, dismissed: true });
    ws.changed('briefing');
    return c.json({ ok: true });
  });

  return r;
}

/* Shared by the routes and the agent's mutating tools. */

export function createTask(s: Services, input: z.infer<typeof TaskInput>): Task {
  const task: Task = {
    id: newId('task'),
    title: input.title,
    due: input.due ?? null,
    estimateHours: input.estimateHours ?? 1,
    postponedCount: 0,
    done: false,
    deadlineId: input.deadlineId ?? null,
    createdAt: new Date().toISOString(),
    origin: 'manual',
  };
  s.ws.setTasks([...s.ws.tasks(), task]);
  s.ws.changed('tasks');
  return task;
}

export function createDeadline(s: Services, input: z.infer<typeof DeadlineInput>): Deadline {
  const d: Deadline = { ...input, id: newId('deadline'), origin: 'manual' };
  s.ws.setDeadlines([...s.ws.deadlines(), d]);
  markTimetable(s);
  s.ws.changed('deadlines');
  return d;
}

function markTimetable(s: Services): void {
  const st = s.ws.status('timetable');
  s.ws.setStatus('timetable', { state: st.state === 'error' ? 'error' : 'connected', lastSyncedAt: new Date().toISOString(), detail: `${s.ws.classes().length} classes, ${s.ws.deadlines().length} dates` });
}
