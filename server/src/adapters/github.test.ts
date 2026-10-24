import { describe, expect, it, vi } from 'vitest';
import { createJsonStore } from '../store';
import { calendarFromEvents, fetchGithub, GithubClient, mapEvent, SourceError } from './github';

const json = (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) =>
  new Response(init.status === 304 ? null : JSON.stringify(body), { status: init.status ?? 200, headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '55', 'x-ratelimit-reset': '1793000000', ...init.headers } });

const now = new Date('2026-10-24T12:00:00Z');
const user = { login: 'octo', name: 'Octo', avatar_url: null, html_url: 'https://github.com/octo', public_repos: 2, followers: 1 };
const repos = [
  { id: 1, name: 'api', full_name: 'octo/api', html_url: 'https://github.com/octo/api', description: 'REST API', language: 'Go', stargazers_count: 3, topics: ['backend'], pushed_at: '2026-10-20T00:00:00Z', fork: false },
  { id: 2, name: 'old', full_name: 'octo/old', html_url: 'https://github.com/octo/old', description: null, language: null, stargazers_count: 0, pushed_at: null, fork: false, archived: true },
];
const events = [
  { id: 'e1', type: 'PushEvent', repo: { name: 'octo/api' }, created_at: '2026-10-23T10:00:00Z', payload: { size: 3, distinct_size: 2 } },
  { id: 'e2', type: 'PushEvent', repo: { name: 'octo/api' }, created_at: '2026-10-23T11:00:00Z', payload: {} },
  { id: 'e3', type: 'IssuesEvent', repo: { name: 'octo/api' }, created_at: '2026-10-21T11:00:00Z' },
  { id: 'old', type: 'PushEvent', repo: { name: 'octo/api' }, created_at: '2026-05-01T11:00:00Z', payload: { size: 1 } },
];

function router(routes: Record<string, () => Response>) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);
    for (const [k, f] of Object.entries(routes)) if (url.includes(k)) return f();
    throw new Error(`unexpected ${url}`);
  });
}

describe('GitHub adapter', () => {
  it('maps profile, repos (skipping archived) and recent events, and builds an honest events calendar', async () => {
    const f = router({ '/repos?': () => json(repos), '/events/public': () => json(events), '/users/octo': () => json(user) });
    const snap = await fetchGithub(new GithubClient(f as unknown as typeof fetch, createJsonStore(null), ''), 'octo', { now, useGraphql: false });
    expect(snap.profile.login).toBe('octo');
    expect(snap.repos.map((r) => r.name)).toEqual(['api']);
    expect(snap.events.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']); // older than 90 days dropped
    expect(snap.calendar.basis).toBe('events');
    expect(snap.calendar.days).toHaveLength(90);
    expect(snap.calendar.days.find((d) => d.date === '2026-10-23')!.count).toBe(3); // 2 distinct commits + 1
    expect(snap.rate).toEqual({ remaining: 55, resetAt: new Date(1793000000 * 1000).toISOString() });
  });

  it('sends If-None-Match and reuses the cached body on 304', async () => {
    const store = createJsonStore(null);
    let calls = 0;
    const f = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const h = new Headers(init?.headers);
      if (h.get('if-none-match') === '"abc"') return json(null, { status: 304 });
      return json(user, { headers: { etag: '"abc"' } });
    });
    const client = new GithubClient(f as unknown as typeof fetch, store, '');
    expect((await client.get<{ login: string }>('/users/octo')).login).toBe('octo');
    expect((await client.get<{ login: string }>('/users/octo')).login).toBe('octo');
    expect(calls).toBe(2);
    expect(new Headers(f.mock.calls[1]![1]!.headers).get('if-none-match')).toBe('"abc"');
  });

  it('turns rate limiting into a clear message that suggests a token', async () => {
    const f = router({ '/users/octo': () => json({ message: 'rate limit' }, { status: 403, headers: { 'x-ratelimit-remaining': '0' } }) });
    const client = new GithubClient(f as unknown as typeof fetch, createJsonStore(null), '');
    await expect(client.get('/users/octo')).rejects.toMatchObject({ kind: 'rate_limited' });
    await expect(client.get('/users/octo')).rejects.toThrow(/personal access token/);
  });

  it('reports a missing user and a bad token in plain words', async () => {
    const c404 = new GithubClient(router({ '/users/': () => json({}, { status: 404 }) }) as unknown as typeof fetch, createJsonStore(null), '');
    await expect(c404.get('/users/nobody')).rejects.toThrow('GitHub user not found');
    const c401 = new GithubClient(router({ '/users/': () => json({}, { status: 401 }) }) as unknown as typeof fetch, createJsonStore(null), 'bad');
    await expect(c401.get('/users/octo')).rejects.toBeInstanceOf(SourceError);
  });

  it('uses the GraphQL contribution calendar when a token is set', async () => {
    const f = router({
      '/graphql': () => json({ data: { user: { contributionsCollection: { contributionCalendar: { weeks: [{ contributionDays: [{ date: '2026-10-22', contributionCount: 4 }, { date: '2026-10-23', contributionCount: 0 }] }] } } } } }),
      '/repos?': () => json([]),
      '/events/public': () => json([]),
      '/users/octo': () => json(user),
    });
    const snap = await fetchGithub(new GithubClient(f as unknown as typeof fetch, createJsonStore(null), 'tok'), 'octo', { now, useGraphql: true });
    expect(snap.calendar).toEqual({ basis: 'graphql', from: '2026-10-22', to: '2026-10-23', days: [{ date: '2026-10-22', count: 4 }, { date: '2026-10-23', count: 0 }] });
    const gqlCall = f.mock.calls.find((c) => String(c[0]).includes('graphql'))!;
    expect(new Headers((gqlCall[1] as RequestInit).headers).get('authorization')).toBe('Bearer tok');
  });

  it('counts a push event once when GitHub omits commit details', () => {
    expect(mapEvent({ id: '1', type: 'PushEvent', repo: { name: 'a/b' }, created_at: now.toISOString(), payload: {} }).count).toBe(1);
    expect(calendarFromEvents([], now, 7).days).toHaveLength(7);
  });
});
