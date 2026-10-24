import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { readJson } from '../http';
import type { Services } from '../services';

export function sortRoutes(s: Services): Hono {
  const r = new Hono();
  const svc = () => s.sort ?? (() => { throw new HTTPException(503, { message: 'Smart sort is not available.' }); })();
  r.post('/sort/preview', async (c) => c.json(await svc().preview()));
  r.post('/sort/apply', async (c) => {
    const { id } = await readJson(c, z.object({ id: z.string().min(1).max(64) }));
    const res = svc().apply(id);
    if (!res) throw new HTTPException(409, { message: 'That preview expired. Open Smart sort again.' });
    return c.json(res);
  });
  r.post('/sort/undo', (c) => {
    const res = svc().undo();
    if (!res) throw new HTTPException(409, { message: 'Nothing to undo.' });
    return c.json(res);
  });
  return r;
}
