import type { GithubEvent, GithubRepo, LeetcodeLogEntry, RadarAxis, Submission } from '../schemas';
import { RECENT_WINDOW_DAYS } from '../constants';
import { axisMatcher } from './taxonomy';
import { DAY_MS, parseDateOnly } from './time';

export interface RadarInput {
  axes: string[];
  repos: GithubRepo[];
  events: GithubEvent[];
  submissions: Submission[];
  logs: LeetcodeLogEntry[];
  now: Date;
  windowDays?: number;
}

function repoMatchesAxis(repo: GithubRepo, axis: string): boolean {
  const m = axisMatcher(axis);
  const lang = repo.language?.toLowerCase() ?? '';
  if (lang && m.languages.includes(lang)) return true;
  return repo.topics.some((t) => m.topics.includes(t.toLowerCase()));
}

function tagsMatchAxis(tags: string[], axis: string): boolean {
  const m = axisMatcher(axis);
  if (m.tags.includes('*')) return true;
  return tags.some((t) => m.tags.includes(t.toLowerCase()));
}

/**
 * "Share of Recent Activity": counts evidence per axis over the window, then normalizes
 * to the user's own busiest axis (1.0). This is a share of *activity*, not a skill score.
 */
export function computeRadar(input: RadarInput): RadarAxis[] {
  const windowDays = input.windowDays ?? RECENT_WINDOW_DAYS;
  const since = input.now.getTime() - windowDays * DAY_MS;
  const recentRepos = input.repos.filter((r) => !r.fork && r.pushedAt && new Date(r.pushedAt).getTime() >= since);
  const reposByName = new Map(input.repos.map((r) => [r.fullName.toLowerCase(), r]));
  const recentEvents = input.events.filter((e) => new Date(e.createdAt).getTime() >= since);
  const recentSubs = input.submissions.filter((s) => new Date(s.time).getTime() >= since);
  const recentLogs = input.logs.filter((l) => parseDateOnly(l.date).getTime() >= since);

  const raw = input.axes.map((axis) => {
    const repos = recentRepos.filter((r) => repoMatchesAxis(r, axis)).length;
    let commits = 0;
    for (const e of recentEvents) {
      const repo = reposByName.get(e.repo.toLowerCase());
      if (repo && repoMatchesAxis(repo, axis)) commits += e.count;
    }
    const submissions = recentSubs.filter((s) => tagsMatchAxis(s.tags, axis)).length;
    const logs = recentLogs.filter((l) => tagsMatchAxis(l.tags, axis)).length;
    // Weighting: a recently pushed repo is a bigger unit of work than a single commit or submission.
    const score = repos * 5 + commits + submissions + logs;
    return { axis, score, evidence: { repos, commits, submissions, logs } };
  });

  const max = Math.max(0, ...raw.map((r) => r.score));
  return raw.map((r) => ({ axis: r.axis, share: max > 0 ? r.score / max : 0, evidence: r.evidence }));
}

/** True when there is any evidence at all (otherwise the UI shows an empty state). */
export function radarHasData(axes: RadarAxis[]): boolean {
  return axes.some((a) => a.share > 0);
}
