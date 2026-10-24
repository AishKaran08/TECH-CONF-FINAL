import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { readJson } from '../http';
import type { Services } from '../services';

export function agentRoutes(s: Services): Hono {
  const r = new Hono();
  r.post('/agent', async (c) => {
    if (!s.agent) throw new HTTPException(503, { message: 'The agent is not available.' });
    const { message, runId } = await readJson(c, z.object({ message: z.string().trim().min(2).max(1000), runId: z.string().uuid().optional() }));
    return c.json({ runId: s.agent.start(message, runId) }, 202);
  });
  r.post('/agent/:runId/confirm', async (c) => {
    if (!s.agent) throw new HTTPException(503, { message: 'The agent is not available.' });
    const { callId, approve } = await readJson(c, z.object({ callId: z.string().min(1).max(40), approve: z.boolean() }));
    if (!s.agent.confirm(c.req.param('runId'), callId, approve)) throw new HTTPException(409, { message: 'That request already finished or expired.' });
    return c.json({ ok: true });
  });
  return r;
}
