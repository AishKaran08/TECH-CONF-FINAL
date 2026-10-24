import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { EventHub } from './events';
import { createJsonStore } from './store';
import { Workspace } from './workspace';
import type { Dashboard, PublicSettings } from '@runway/shared';

function setup() {
  const hub = new EventHub();
  const ws = new Workspace(createJsonStore(null), hub, { aiAvailable: false, model: 'test', defaultSyncInterval: 15 });
  return { app: createApp({ ws, hub }), ws, hub };
}

describe('core API', () => {
  it('returns an honest empty dashboard in real mode', async () => {
    const { app } = setup();
    const res = await app.request('/api/dashboard');
    expect(res.status).toBe(200);
    const d = (await res.json()) as Dashboard;
    expect(d.mode).toBe('real');
    expect(d.github.profile).toBeNull();
    expect(d.github.streak).toBeNull();
    expect(d.submissions).toEqual([]);
    expect(d.radar.every((a) => a.share === 0)).toBe(true);
    expect(d.sources.every((s) => s.state === 'not_connected')).toBe(true);
  });

  it('masks the GitHub token and never returns it', async () => {
    const { app } = setup();
    const res = await app.request('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ githubUsername: '@octocat', githubToken: 'ghp_abcdefghijklmnopqrstuvwxyz1234' }),
    });
    const s = (await res.json()) as PublicSettings & { githubToken?: string };
    expect(s.githubUsername).toBe('octocat');
    expect(s.githubToken).toBeUndefined();
    expect(s.hasGithubToken).toBe(true);
    expect(s.githubTokenMasked).toBe('ghp_••••••••1234');
    expect(JSON.stringify(await (await app.request('/api/dashboard')).json())).not.toContain('abcdefghijklmnop');
  });

  it('rejects invalid settings with a readable message', async () => {
    const { app } = setup();
    const res = await app.request('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ syncIntervalMinutes: 1 }) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/syncIntervalMinutes/);
  });

  it('demo toggle loads badged sample data and keeps it separate from real data', async () => {
    const { app, hub } = setup();
    const seen: string[] = [];
    hub.subscribe((e) => seen.push(e.type));
    const on = (await (await app.request('/api/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true }) })).json()) as Dashboard;
    expect(on.mode).toBe('demo');
    expect(on.github.calendar?.basis).toBe('demo');
    expect(on.tasks.every((t) => t.origin === 'demo')).toBe(true);
    expect(on.projects.length).toBeGreaterThan(3);
    expect(seen).toContain('data.changed');
    const off = (await (await app.request('/api/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: false }) })).json()) as Dashboard;
    expect(off.mode).toBe('real');
    expect(off.tasks).toEqual([]);
  });
});
