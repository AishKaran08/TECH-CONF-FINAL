import { parseDue, planWeek, weekdayIndex } from '@runway/shared';
import { UNTRUSTED_DATA_RULES, type Ai } from './client';
import type { BriefingContext } from './briefingLocal';

/** Short agent-written plan for today. Suggestions only; calm, forgiving language. */
export async function writeBriefingWithAi(ai: Ai, ctx: BriefingContext): Promise<string> {
  const fit = planWeek(ctx.tasks, ctx.deadlines, { now: ctx.now, studyHoursPerDay: ctx.studyHoursPerDay });
  const data = {
    now: ctx.now.toString(),
    classesToday: ctx.classes.filter((c) => c.day === weekdayIndex(ctx.now)).map((c) => `${c.start}-${c.end} ${c.title}`),
    todayPlan: fit.days[0]?.blocks ?? [],
    upcoming: ctx.deadlines.filter((d) => parseDue(d.due).getTime() > ctx.now.getTime()).slice(0, 6).map((d) => ({ title: d.title, kind: d.kind, due: d.due })),
    weekFits: fit.fits,
    unprepared: fit.unprepared.map((u) => u.title),
    recentSubmissions: ctx.submissions.slice(0, 5).map((s) => ({ problem: s.problemName, verdict: s.verdictText, time: s.time })),
    lastGithubActivity: ctx.lastGithubActivity,
  };
  const res = await ai.client.messages.create({
    model: ai.model,
    max_tokens: 500,
    system: `Write a short plan for today for a student: one calm opening sentence, then 2-5 bullets starting with "- ". Concrete and kind. No guilt, no pressure, no exclamation marks, no emojis. Use only facts in the data.\n\n${UNTRUSTED_DATA_RULES}`,
    messages: [{ role: 'user', content: `<activity>\n${JSON.stringify(data)}\n</activity>` }],
  });
  const text = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').trim();
  if (!text) throw new Error('empty briefing');
  return text.slice(0, 2000);
}
