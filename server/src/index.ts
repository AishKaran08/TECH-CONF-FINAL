import { serve } from '@hono/node-server';
import { APP_NAME } from '@runway/shared';
import { createBriefingService } from './ai/briefing';
import { createApp } from './app';
import { config } from './config';
import { EventHub } from './events';
import { createStore } from './store';
import { Workspace } from './workspace';

const store = createStore(config.dataDir);
const hub = new EventHub();
const ws = new Workspace(store, hub, { aiAvailable: Boolean(config.anthropicApiKey), model: config.model, defaultSyncInterval: config.syncIntervalMinutes });

const briefing = createBriefingService(ws);
const app = createApp({ ws, hub, briefing });

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`${APP_NAME} API listening on http://${config.host}:${info.port} (store: ${store.kind}, AI: ${config.anthropicApiKey ? config.model : 'off, using local fallbacks'})`);
});

const shutdown = () => {
  server.close();
  store.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
