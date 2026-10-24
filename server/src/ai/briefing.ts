import { toDateOnly, type Briefing } from '@runway/shared';
import type { Workspace } from '../workspace';
import { localBriefing, type BriefingContext } from './briefingLocal';

export interface BriefingService {
  generate(opts: { auto: boolean }): Promise<Briefing>;
}

export function briefingContext(ws: Workspace, now = new Date()): BriefingContext {
  const events = ws.events();
  const last = events.reduce<string | null>((m, e) => (!m || e.createdAt > m ? e.createdAt : m), null);
  return {
    now,
    tasks: ws.tasks(),
    deadlines: ws.deadlines(),
    classes: ws.classes(),
    studyHoursPerDay: ws.settings().studyHoursPerDay,
    submissions: ws.cfSubmissions().slice(0, 50),
    lastGithubActivity: last,
  };
}

/**
 * Writes today's plan. `aiWriter` (optional) is tried first when AI is enabled; the local
 * planner is always the fallback. Auto runs never use AI until the privacy notice was acknowledged.
 */
export function createBriefingService(ws: Workspace, aiWriter?: (ctx: BriefingContext) => Promise<string>): BriefingService {
  return {
    async generate({ auto }) {
      const now = new Date();
      const ctx = briefingContext(ws, now);
      let text: string | null = null;
      let by: Briefing['generatedBy'] = ws.mode() === 'demo' ? 'demo' : 'heuristic';
      const allowAi = aiWriter && ws.aiEnabled() && ws.mode() === 'real' && (!auto || ws.settings().aiNoticeAck);
      if (allowAi) {
        try {
          text = await aiWriter(ctx);
          by = 'ai';
        } catch (err) {
          console.warn('[briefing] AI unavailable, using local planner:', (err as Error).message);
        }
      }
      const b: Briefing = { date: toDateOnly(now), text: text ?? localBriefing(ctx), generatedBy: by, dismissed: false, generatedAt: now.toISOString() };
      ws.setBriefing(b);
      return b;
    },
  };
}
