import { describe, expect, it } from 'vitest';
import type { ServerEvent } from '@runway/shared';
import { SourceError } from './adapters/github';
import { EventHub } from './events';
import { cronFor } from './scheduler';
import { createJsonStore } from './store';
import { SyncService, type SourceRunner } from './sync';
import { Workspace } from './workspace';

function setup(runners: Record<string, SourceRunner>) {
  const hub = new EventHub();
  const ws = new Workspace(createJsonStore(null), hub, { aiAvailable: false, model: 't', defaultSyncInterval: 15 });
  const events: ServerEvent[] = [];
  hub.subscribe((e) => events.push(e));
  return { ws, hub, events, sync: new SyncService(ws, hub, runners) };
}

const runner = (summary: string, fail?: string): SourceRunner => ({
  configured: () => true,
  run: async (report) => {
    report(0.5, 'halfway');
    if (fail) throw new SourceError(fail, 'network');
    return { summary };
  },
});

describe('SyncService', () => {
  it('runs sources in parallel, streams progress and writes one summary line', async () => {
    const { sync, events, ws } = setup({ github: runner('+12 events'), codeforces: runner('+3 submissions') });
    const res = sync.start(undefined, 'manual');
    if (res.syncId === null) throw new Error('expected start');
    const out = await res.done;
    expect(out.text).toBe('GitHub +12 events, Codeforces +3 submissions');
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['sync.start', 'sync.progress', 'sync.done', 'data.changed']));
    expect(ws.status('github').state).toBe('connected');
    expect(ws.status('github').lastSyncedAt).not.toBeNull();
  });

  it('keeps going when one source fails and marks it as an error', async () => {
    const { sync, ws } = setup({ github: runner('+1 event'), codeforces: runner('', 'Could not reach Codeforces.') });
    const res = sync.start(undefined, 'manual');
    if (res.syncId === null) throw new Error('expected start');
    const out = await res.done;
    expect(out.summary.map((s) => s.ok)).toEqual([true, false]);
    expect(out.text).toMatch(/Codeforces failed: Could not reach Codeforces\. Kept the last good data\./);
    expect(ws.status('codeforces')).toMatchObject({ state: 'error', lastError: 'Could not reach Codeforces.' });
  });

  it('joins a sync that is already running instead of starting another', async () => {
    const { sync } = setup({ github: runner('+0 events') });
    const a = sync.start(undefined, 'manual');
    const b = sync.start(undefined, 'manual');
    expect(a.syncId).not.toBeNull();
    expect(b.syncId).toBe(a.syncId);
    if (a.syncId) await a.done;
    expect(sync.running).toBe(false);
  });

  it('explains when nothing is set up', () => {
    const { sync } = setup({ github: { configured: () => false, run: async () => ({ summary: '' }) } });
    const r = sync.start(undefined, 'manual');
    expect(r.syncId).toBeNull();
  });
});

describe('cronFor', () => {
  it('builds cron expressions for the refresh interval', () => {
    expect(cronFor(15)).toBe('*/15 * * * *');
    expect(cronFor(1)).toBe('*/5 * * * *');
    expect(cronFor(120)).toBe('0 */2 * * *');
  });
});
