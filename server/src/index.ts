import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { APP_NAME } from '@runway/shared';

const app = new Hono();
app.get('/api/health', (c) => c.json({ ok: true, app: APP_NAME }));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => console.log(`${APP_NAME} server on http://127.0.0.1:${port}`));
