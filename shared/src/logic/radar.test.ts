import { describe, expect, it } from 'vitest';
import type { GithubRepo, Submission } from '../schemas';
import { computeRadar, radarHasData } from './radar';

const now = new Date('2026-10-24T12:00:00Z');
const repo = (name: string, language: string | null, topics: string[], daysAgo: number): GithubRepo => ({
  id: name,
  name,
  fullName: `me/${name}`,
  url: `https://github.com/me/${name}`,
  description: null,
  language,
  stars: 0,
  topics,
  pushedAt: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
  fork: false,
});
const sub = (tags: string[], daysAgo: number): Submission => ({
  id: String(Math.random()),
  origin: 'codeforces',
  problemName: 'p',
  problemId: '1A',
  url: null,
  tags,
  verdict: 'OK',
  accepted: true,
  verdictText: 'Accepted',
  language: null,
  difficulty: null,
  time: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
});

describe('computeRadar', () => {
  it('normalizes to the user’s own maximum and keeps evidence counts', () => {
    const out = computeRadar({
      axes: ['Web', 'Backend', 'Data Structures', 'DevOps'],
      repos: [repo('site', 'TypeScript', ['react'], 5), repo('api', 'Go', ['docker'], 10), repo('old', 'Go', [], 200)],
      events: [{ id: '1', type: 'PushEvent', repo: 'me/api', createdAt: new Date(now.getTime() - 86400000).toISOString(), count: 4 }],
      submissions: [sub(['dp'], 3), sub(['greedy'], 4), sub(['math'], 300)],
      logs: [],
      now,
    });
    const byAxis = Object.fromEntries(out.map((a) => [a.axis, a]));
    expect(Math.max(...out.map((a) => a.share))).toBe(1);
    expect(byAxis['Backend']!.evidence).toEqual({ repos: 1, commits: 4, submissions: 0, logs: 0 });
    expect(byAxis['Backend']!.share).toBe(1); // 5 + 4 = 9 is the max
    expect(byAxis['Data Structures']!.evidence.submissions).toBe(2); // old one excluded
    expect(byAxis['DevOps']!.evidence.repos).toBe(1); // docker topic
    expect(radarHasData(out)).toBe(true);
  });
  it('returns all zeros (and no data) without evidence', () => {
    const out = computeRadar({ axes: ['Web', 'Backend', 'Systems'], repos: [], events: [], submissions: [], logs: [], now });
    expect(out.every((a) => a.share === 0)).toBe(true);
    expect(radarHasData(out)).toBe(false);
  });
});
