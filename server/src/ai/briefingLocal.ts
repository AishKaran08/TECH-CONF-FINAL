import { describeCountdown, formatDue, parseDue, planWeek, weekdayIndex, type ClassSession, type Deadline, type Submission, type Task } from '@runway/shared';

export interface BriefingContext {
  now: Date;
  tasks: Task[];
  deadlines: Deadline[];
  classes: ClassSession[];
  studyHoursPerDay: number;
  submissions: Submission[];
  lastGithubActivity: string | null;
}

/** Deterministic daily plan in calm, forgiving language. Used without AI and as the AI's fallback. */
export function localBriefing(ctx: BriefingContext): string {
  const { now } = ctx;
  const lines: string[] = [];
  const today = weekdayIndex(now);
  const todaysClasses = ctx.classes.filter((c) => c.day === today).sort((a, b) => a.start.localeCompare(b.start));
  const week = planWeek(ctx.tasks, ctx.deadlines, { now, studyHoursPerDay: ctx.studyHoursPerDay });
  const todayBlocks = week.days[0]?.blocks ?? [];
  const soon = ctx.deadlines
    .map((d) => ({ d, due: parseDue(d.due) }))
    .filter((x) => x.due.getTime() > now.getTime() && x.due.getTime() - now.getTime() < 8 * 86400_000)
    .sort((a, b) => a.due.getTime() - b.due.getTime());

  const busy = todayBlocks.reduce((s, b) => s + b.hours, 0);
  lines.push(
    todayBlocks.length === 0 && soon.length === 0
      ? 'A light day with nothing urgent. A good time for something you enjoy building.'
      : busy > ctx.studyHoursPerDay * 0.8
        ? 'A full day. Take it one block at a time; whatever you finish counts.'
        : 'A manageable day. Here is a gentle order to take things in:',
  );

  if (todaysClasses.length) lines.push(`- Classes: ${todaysClasses.map((c) => `${c.title} at ${c.start}`).join(', ')}.`);

  for (const b of todayBlocks.slice(0, 3)) {
    const t = ctx.tasks.find((x) => x.id === b.taskId);
    const due = t?.due ? ` (due ${formatDue(parseDue(t.due))})` : '';
    lines.push(`- About ${b.hours}h on "${b.title}"${due}.`);
  }

  const unprepared = week.unprepared.slice(0, 2);
  for (const u of unprepared) {
    lines.push(`- ${u.title} is ${describeCountdown(parseDue(u.due), now)}. A short review session now makes the later ones easier.`);
  }
  if (!unprepared.length && soon[0] && !todayBlocks.length) lines.push(`- Next up: ${soon[0].d.title}, ${describeCountdown(soon[0].due, now)}.`);

  if (!week.fits && week.shortfalls[0]) {
    lines.push(`- This week looks tight for "${week.shortfalls[0].title}". Smart sort can suggest splitting it or moving a date.`);
  }

  const solvedYesterday = ctx.submissions.filter((s) => s.accepted && now.getTime() - Date.parse(s.time) < 36 * 3600_000).length;
  if (solvedYesterday > 0) lines.push(`- You solved ${solvedYesterday} problem${solvedYesterday === 1 ? '' : 's'} recently. One more today keeps the rhythm, if you feel like it.`);
  else if (ctx.submissions.length > 0) lines.push('- If you have 30 spare minutes, one practice problem is plenty.');

  if (lines.length === 1) lines.push('- Add a task or an exam date and this plan will fill in.');
  return lines.join('\n');
}
