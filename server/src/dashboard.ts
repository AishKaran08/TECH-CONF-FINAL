import {
  applyOrder,
  buildSkills,
  calendarTotals,
  computeRadar,
  computeStreak,
  mergeProjects,
  orderSkills,
  parseDue,
  toDateOnly,
  type Dashboard,
  type Submission,
} from '@runway/shared';
import type { Workspace } from './workspace';

const FEED_LIMIT = 30;

/** LeetCode log entries as feed items, clearly labelled as entered by the user. */
function leetcodeFeed(ws: Workspace): Submission[] {
  const lc = ws.leetcode();
  if (!lc) return [];
  return lc.log.map((l) => ({
    id: `lc:${l.id}`,
    origin: ws.mode() === 'demo' ? 'demo' : 'manual',
    problemName: l.title,
    problemId: l.title,
    url: null,
    tags: l.tags,
    verdict: 'SOLVED',
    accepted: true,
    verdictText: 'Solved (LeetCode, entered by you)',
    language: null,
    difficulty: l.difficulty,
    time: parseDue(`${l.date}T12:00`).toISOString(),
  }));
}

/** Everything the dashboard needs in one snapshot. Derived numbers are computed from stored data only. */
export function buildDashboard(ws: Workspace, now = new Date()): Dashboard {
  const settings = ws.publicSettings();
  const repos = ws.repos();
  const events = ws.events();
  const cfSubs = ws.cfSubmissions();
  const leetcode = ws.leetcode();
  const resume = ws.resume();
  const calendar = ws.calendar();
  const orders = ws.orders();

  const skillsRaw = buildSkills({ profile: resume?.profile ?? null, repos, submissions: cfSubs, leetcode });
  const skillsDefault = orderSkills(skillsRaw).map((s) => s.skill);
  const skills = orders.skills.length ? applyOrder(skillsDefault, orders.skills, (s) => s.name) : skillsDefault;

  const projectsDefault = mergeProjects(repos, resume?.profile.projects ?? []);
  const projects = applyOrder(projectsDefault, orders.projects, (p) => p.id);

  const tasks = applyOrder(ws.tasks(), orders.tasks, (t) => t.id);
  const deadlines = [...ws.deadlines()].sort((a, b) => parseDue(a.due).getTime() - parseDue(b.due).getTime());

  const radar = computeRadar({ axes: settings.radarAxes, repos, events, submissions: cfSubs, logs: leetcode?.log ?? [], now });

  const submissions = [...cfSubs, ...leetcodeFeed(ws)].sort((a, b) => b.time.localeCompare(a.time)).slice(0, FEED_LIMIT);

  const briefing = ws.briefing();

  return {
    mode: ws.mode(),
    generatedAt: now.toISOString(),
    settings,
    sources: ws.statuses(),
    github: {
      profile: ws.githubProfile(),
      repos: [...repos].sort((a, b) => (b.pushedAt ?? '').localeCompare(a.pushedAt ?? '')),
      calendar,
      totals: calendarTotals(calendar),
      streak: computeStreak(calendar, now),
      rateLimit: ws.githubRateLimit(),
    },
    codeforces: { user: ws.cfUser(), ratings: ws.ratings() },
    submissions,
    leetcode,
    resume,
    skills,
    projects,
    radar,
    classes: ws.classes(),
    deadlines,
    tasks,
    orders,
    canUndoSort: ws.undoStack().length > 0,
    briefing: briefing && briefing.date === toDateOnly(now) ? briefing : null,
  };
}
