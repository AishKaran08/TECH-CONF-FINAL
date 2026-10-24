import { serve } from '@hono/node-server';
import { APP_NAME } from '@runway/shared';
import { createBriefingService } from './ai/briefing';
import { createAi } from './ai/client';
import { rankProjectsWithAi } from './ai/rank';
import { extractProfileWithAi } from './ai/resume';
import { AgentService } from './agent/agent';
import { writeBriefingWithAi } from './ai/briefingAi';
import { createApp } from './app';
import { config } from './config';
import { EventHub } from './events';
import { handleSettingsChange } from './routes/sources';
import { Scheduler } from './scheduler';
import type { Services } from './services';
import { ResumeService } from './resume/service';
import { SortService } from './sort';
import { createStore } from './store';
import { codeforcesRunner, githubRunner, SyncService, timetableRunner } from './sync';
import { Workspace } from './workspace';

const store = createStore(config.dataDir);
const hub = new EventHub();
const ws = new Workspace(store, hub, { aiAvailable: Boolean(config.anthropicApiKey), model: config.model, defaultSyncInterval: config.syncIntervalMinutes });

const ai = createAi(config.anthropicApiKey, config.model);
const resume = new ResumeService(ws, ai ? (text) => extractProfileWithAi(ai, text) : undefined);

const sync = new SyncService(ws, hub, {
  github: githubRunner(ws, fetch),
  codeforces: codeforcesRunner(ws, fetch),
  resume: resume.runner(),
  timetable: timetableRunner(ws, fetch),
});
const scheduler = new Scheduler(ws, sync);

const sort = new SortService(ws, ai ? (p, role, skills) => rankProjectsWithAi(ai, p, role, skills) : undefined);
const services: Services = { ws, hub, sync, scheduler, resume, sort, briefing: createBriefingService(ws, ai ? (ctx) => writeBriefingWithAi(ai, ctx) : undefined) };
services.agent = new AgentService(services, ai);
services.onSettingsChanged = (before, after) => handleSettingsChange(services, before, after);

const app = createApp(services);
scheduler.start(ws.settings().syncIntervalMinutes);

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`${APP_NAME} API listening on http://${config.host}:${info.port} (store: ${store.kind}, AI: ${config.anthropicApiKey ? config.model : 'off, using local fallbacks'})`);
});

const shutdown = () => {
  scheduler.stop();
  server.close();
  store.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
