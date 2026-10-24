import { Hono } from 'hono';
import { SourceId } from '@runway/shared';
import { z } from 'zod';
import { readJson } from '../http';
import type { Services } from '../services';

export function syncRoutes(s: Services): Hono {
  const r = new Hono();

  /** Sync all (or the given) sources. Returns at once; progress arrives over /api/events. */
  r.post('/sync', async (c) => {
    const { sources } = await readJson(c, z.object({ sources: z.array(SourceId).max(5).optional() }));
    if (!s.sync) return c.json({ error: 'Sync is not available.' }, 503);
    const res = s.sync.start(sources, 'manual');
    if (res.syncId === null) return c.json({ error: res.message }, 400);
    return c.json({ syncId: res.syncId, sources: res.sources }, 202);
  });

  return r;
}
