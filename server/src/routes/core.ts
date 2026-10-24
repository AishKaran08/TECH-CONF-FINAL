import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { APP_NAME, SettingsPatch, type ServerEvent } from '@runway/shared';
import { z } from 'zod';
import { buildDashboard } from '../dashboard';
import { readJson } from '../http';
import type { Services } from '../services';

export function coreRoutes(s: Services): Hono {
  const r = new Hono();

  r.get('/health', (c) => c.json({ ok: true, app: APP_NAME, store: s.ws.store.kind, ai: s.ws.aiEnabled() }));

  r.get('/dashboard', (c) => c.json(buildDashboard(s.ws)));

  /** Server-Sent Events: sync progress, data changes and agent steps. */
  r.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      const queue: ServerEvent[] = [];
      let wake: (() => void) | null = null;
      const unsubscribe = s.hub.subscribe((e) => {
        queue.push(e);
        wake?.();
      });
      let closed = false;
      stream.onAbort(() => {
        closed = true;
        unsubscribe();
        wake?.();
      });
      await stream.writeSSE({ event: 'message', data: JSON.stringify({ type: 'hello', at: new Date().toISOString() } satisfies ServerEvent) });
      while (!closed) {
        if (queue.length === 0) {
          // Wait for an event or send a keep-alive comment every 20s.
          await new Promise<void>((resolve) => {
            wake = resolve;
            setTimeout(resolve, 20_000);
          });
          wake = null;
          if (queue.length === 0 && !closed) await stream.write(': keep-alive\n\n');
          continue;
        }
        const e = queue.shift()!;
        await stream.writeSSE({ event: 'message', data: JSON.stringify(e) });
      }
    }),
  );

  r.get('/settings', (c) => c.json(s.ws.publicSettings()));

  r.put('/settings', async (c) => {
    const patch = await readJson(c, SettingsPatch.omit({ demoMode: true }));
    const before = s.ws.settings();
    // An empty token string clears it; a masked placeholder from the UI is ignored.
    if (patch.githubToken !== undefined && patch.githubToken.includes('••')) delete patch.githubToken;
    if (patch.githubUsername !== undefined) patch.githubUsername = patch.githubUsername.trim().replace(/^@/, '');
    if (patch.codeforcesHandle !== undefined) patch.codeforcesHandle = patch.codeforcesHandle.trim();
    s.ws.updateSettings(patch);
    const after = s.ws.settings();
    if (after.syncIntervalMinutes !== before.syncIntervalMinutes) s.scheduler?.reschedule(after.syncIntervalMinutes);
    s.onSettingsChanged?.(before, after);
    s.ws.changed('settings');
    return c.json(s.ws.publicSettings());
  });

  r.post('/demo', async (c) => {
    const { enabled } = await readJson(c, z.object({ enabled: z.boolean() }));
    s.ws.setDemoMode(enabled);
    s.ws.changed('all');
    return c.json(buildDashboard(s.ws));
  });

  return r;
}
