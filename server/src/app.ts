import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { coreRoutes } from './routes/core';
import { dataRoutes } from './routes/data';
import { sourceRoutes } from './routes/sources';
import { syncRoutes } from './routes/sync';
import type { Services } from './services';

export function createApp(s: Services): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error('[server] unexpected error:', err.message);
    return c.json({ error: 'Something went wrong on the server. Please try again.' }, 500);
  });

  const api = new Hono();
  api.route('/', coreRoutes(s));
  api.route('/', dataRoutes(s));
  api.route('/', syncRoutes(s));
  api.route('/', sourceRoutes(s));
  app.route('/api', api);
  app.notFound((c) => c.json({ error: 'Not found' }, 404));
  return app;
}
