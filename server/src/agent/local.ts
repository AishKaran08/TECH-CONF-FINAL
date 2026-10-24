import {
  addDays,
  formatDue,
  parseDue,
  rankProjectsHeuristic,
  resolveRole,
  resumeGaps,
  ROLES,
  toDateOnly,
  type DeadlineKind,
  type WeekFit,
} from '@runway/shared';
import { buildDashboard } from '../dashboard';
import type { AgentRun } from './agent';

/**
 * Rule-based agent used without an API key (or when AI is off). It follows the same rules as
 * the AI agent: read-only tools run freely, every change goes through a confirmation card.
 */

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, couple: 2, few: 3 };
const STOP = new Set(['i', 'have', 'has', 'an', 'a', 'my', 'the', 'and', 'got', 'there', 'is', 'also', 'with', 'one', 'big', 'final']);

export interface RelativeItem {
  kind: DeadlineKind;
  title: string;
  days: number;
}

function toNumber(w: string): number | null {
  if (/^\d+$/.test(w)) return Number(w);
  return NUMBER_WORDS[w.toLowerCase()] ?? null;
}

/** "an exam in 6 days and a project due in 4" → [{exam, 6}, {project, 4}] */
export function parseRelativeDeadlines(message: string): RelativeItem[] {
  const out: RelativeItem[] = [];
  const re = /((?:[\w.+#-]+\s+){0,3}?)(exam|test|quiz|mid[\s-]?sem|end[\s-]?sem|midterm|project|assignment|submission|report|presentation|viva)s?\b([^.;!?]*?)\b(?:(?:due|is|in|on)\s+)*(?:in\s+)?(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|couple|few)\s*(?:of\s+)?(days?|weeks?)?\b(?!\s*(?:h|hours?|am|pm|:))|((?:[\w.+#-]+\s+){0,3}?)(exam|test|quiz|project|assignment)s?\b[^.;!?]*?\b(tomorrow)\b/gi;
  for (const m of message.matchAll(re)) {
    const word = (m[2] ?? m[7] ?? '').toLowerCase();
    const prefix = (m[1] ?? m[6] ?? '').trim().split(/\s+/).filter((w) => w && !STOP.has(w.toLowerCase()));
    let days: number | null;
    if (m[8]) days = 1;
    else {
      const n = toNumber(m[4] ?? '');
      days = n === null ? null : /week/i.test(m[5] ?? '') ? n * 7 : n;
    }
    if (days === null || days < 0 || days > 120) continue;
    const kind: DeadlineKind = /exam|test|quiz|sem|midterm|viva/.test(word) ? 'exam' : /assignment|submission|report/.test(word) ? 'assignment' : 'project';
    const noun = word.replace(/\b\w/, (c) => c.toUpperCase());
    const title = prefix.length ? `${prefix.join(' ')} ${word}`.replace(/^\w/, (c) => c.toUpperCase()) : noun;
    out.push({ kind, title, days });
  }
  return out;
}

/** "…for a backend internship?" → "backend internship" */
export function roleFromMessage(message: string): string | null {
  const m = /\bfor (?:an? |the |my )?([a-z][\w\s/+.-]{1,60}?)\s*[?.!]*$/i.exec(message.trim());
  if (!m) return null;
  return m[1]!.replace(/\s+role$/i, '').trim() || null;
}

const atTime = (d: Date, h: number, m = 0) => `${toDateOnly(d)}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

function describeWeek(fit: WeekFit): string[] {
  const lines: string[] = [];
  for (const day of fit.days) {
    const parts = day.blocks.map((b) => `${b.hours}h ${b.title}`);
    const dl = day.deadlines.map((d) => `${d.title} (${d.kind})`);
    if (!parts.length && !dl.length) continue;
    lines.push(`- ${day.label}: ${[...parts, ...(dl.length ? [`due: ${dl.join(', ')}`] : [])].join('; ')}`);
  }
  return lines;
}

async function planWeekFlow(run: AgentRun, message: string): Promise<void> {
  const items = parseRelativeDeadlines(message);
  const now = new Date();
  run.think(items.length ? `Reading your message: ${items.map((i) => `${i.title.toLowerCase()} in ${i.days} day${i.days === 1 ? '' : 's'}`).join(', ')}.` : 'Planning the next seven days from your tasks and dates.');
  await run.callTool('get_deadlines', {});
  await run.callTool('list_tasks', {});

  // Add any new dates (skip ones that already exist within a day).
  for (const it of items.slice(0, 2)) {
    const day = addDays(now, it.days);
    const due = atTime(day, it.kind === 'exam' ? 9 : 17);
    const exists = run.s.ws.deadlines().some((d) => d.kind === it.kind && Math.abs(parseDue(d.due).getTime() - parseDue(due).getTime()) < 36 * 3600_000);
    if (exists) {
      run.think(`${it.title} on ${formatDue(day)} is already on your timetable.`);
      continue;
    }
    await run.callTool('add_deadline', { title: it.title, kind: it.kind, due });
  }

  const fitRes = await run.callTool('check_week_fit', {});
  const fit = fitRes.result as WeekFit;
  let created = 0;
  for (const u of fit.unprepared.slice(0, 2)) {
    const due = parseDue(u.due);
    const isExam = u.kind === 'exam';
    const prepDue = isExam ? atTime(addDays(due, -1), 20) : atTime(due, Math.max(8, due.getHours() - 2));
    const days = Math.max(1, Math.round((due.getTime() - now.getTime()) / 86400_000));
    const hours = isExam ? Math.min(8, Math.max(3, days)) : Math.min(10, Math.max(3, days * 1.5));
    const r = await run.callTool('create_task', {
      title: isExam ? `Revise for ${u.title}` : `Work on ${u.title}`,
      due: prepDue,
      estimateHours: Math.round(hours * 2) / 2,
      deadlineId: u.id,
    });
    if (r.ok) created++;
  }
  const final = created ? ((await run.callTool('check_week_fit', {})).result as WeekFit) : fit;
  const lines = describeWeek(final);
  const head = final.fits
    ? `Here is a week that fits: about ${final.totalNeeded}h of work across ${final.totalFree}h you have free.`
    : `This week is tight: about ${final.shortfalls.reduce((s, x) => s + x.hoursShort, 0).toFixed(1)}h more than fits before the deadlines. Smart sort can suggest splitting a task or moving a date.`;
  run.say([head, ...(lines.length ? lines : ['- Nothing scheduled yet. Add tasks with estimates and I will place them.']), 'Hours go to whatever is due first. Small, steady blocks beat one long night.'].join('\n'));
}

async function syncFlow(run: AgentRun): Promise<void> {
  const before = buildDashboard(run.s.ws);
  const r = await run.callTool('run_sync', {});
  if (!r.ok) {
    run.say('Nothing was synced. You can press Sync all whenever you are ready.');
    return;
  }
  await run.callTool('get_activity', {});
  const after = buildDashboard(run.s.ws);
  const newSubs = after.submissions.filter((x) => !before.submissions.some((b) => b.id === x.id));
  const lines = [`Sync finished: ${r.summary}`];
  if (newSubs.length) lines.push(...newSubs.slice(0, 5).map((x) => `- ${x.problemName}: ${x.verdictText}`));
  if (after.github.totals && before.github.totals && after.github.totals.contributions !== before.github.totals.contributions)
    lines.push(`- GitHub contributions in range: ${before.github.totals.contributions} → ${after.github.totals.contributions}`);
  if (lines.length === 1) lines.push('- No new activity since the last sync.');
  run.say(lines.join('\n'));
}

async function projectsFlow(run: AgentRun, message: string): Promise<void> {
  const role = roleFromMessage(message) ?? run.s.ws.settings().targetRole ?? '';
  const current = run.s.ws.settings().targetRole;
  if (role && resolveRole(role) !== resolveRole(current || '___')) await run.callTool('set_target_role', { role });
  await run.callTool('get_profile', {});
  const d = buildDashboard(run.s.ws);
  if (d.projects.length === 0) {
    run.say('I could not find any projects yet. Connect GitHub or upload a resume in Connections, then ask again.');
    return;
  }
  const effectiveRole = role || current || 'software engineer';
  const ranked = rankProjectsHeuristic(d.projects, effectiveRole, d.skills, new Date());
  const name = (id: string) => d.projects.find((p) => p.id === id)?.name ?? id;
  const top = ranked.slice(0, 3);
  run.say([`For ${ROLES[resolveRole(effectiveRole)]!.label.toLowerCase()} roles, I would lead with:`, ...top.map((r, i) => `${i + 1}. ${name(r.id)}: ${r.reason}`)].join('\n'));
  const currentTop = d.projects.slice(0, top.length).map((p) => p.id);
  if (top.map((t) => t.id).join() !== currentTop.join()) await run.callTool('reorder', { scope: 'projects', ids: ranked.map((r) => r.id) });
}

async function gapsFlow(run: AgentRun, message: string): Promise<void> {
  const role = roleFromMessage(message) ?? run.s.ws.settings().targetRole ?? 'software engineer';
  await run.callTool('get_profile', {});
  await run.callTool('get_activity', {});
  run.think(`Comparing your resume and activity with what ${role} roles usually look for.`);
  const d = buildDashboard(run.s.ws);
  const g = resumeGaps(role, d.skills, d.resume?.profile ?? null);
  const lines = [`For a ${g.role.toLowerCase()} role:`];
  if (g.have.length) lines.push(`- Already backed by your activity: ${g.have.join(', ')}.`);
  if (g.weak.length) lines.push(`- On the resume but not yet visible in your repos or practice: ${g.weak.join(', ')}.`);
  if (g.missing.length) lines.push(`- Not mentioned yet: ${g.missing.join(', ')}.`);
  lines.push(...g.suggestions.map((s) => `- ${s}`));
  lines.push('This compares keywords, so treat it as a checklist rather than a verdict.');
  run.say(lines.join('\n'));
}

async function overviewFlow(run: AgentRun): Promise<void> {
  await run.callTool('get_deadlines', {});
  const fit = (await run.callTool('check_week_fit', {})).result as WeekFit;
  const lines = describeWeek(fit);
  run.say(
    [
      'Here is your week so far:',
      ...(lines.length ? lines : ['- Nothing dated yet.']),
      'I can also: plan your week around an exam or project ("I have an exam in 6 days…"), sync everything and tell you what changed, rank your projects for a role, or check your resume for a role.',
    ].join('\n'),
  );
}

export async function runLocalAgent(run: AgentRun, message: string): Promise<void> {
  const m = message.toLowerCase();
  if (/\b(sync|refresh|fetch|update everything|pull)\b|what changed/.test(m)) return syncFlow(run);
  if (/missing|gap|lacking|improve|weak/.test(m) && /resume|cv|profile/.test(m)) return gapsFlow(run, message);
  if (/project/.test(m) && /(first|top|lead|order|rank|highlight|which|best|put)/.test(m) && !/due|in \d+ days/.test(m)) return projectsFlow(run, message);
  if (/plan|schedule|week|exam|due|deadline|organi[sz]e|study/.test(m) || parseRelativeDeadlines(message).length) return planWeekFlow(run, message);
  return overviewFlow(run);
}
