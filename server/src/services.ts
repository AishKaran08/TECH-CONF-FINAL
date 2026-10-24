import type { Settings } from '@runway/shared';
import type { BriefingService } from './ai/briefing';
import type { EventHub } from './events';
import type { Workspace } from './workspace';

/** Long-lived services shared by the routes. Optional ones are added by later modules. */
export interface Services {
  ws: Workspace;
  hub: EventHub;
  scheduler?: { reschedule(minutes: number): void; stop(): void };
  briefing?: BriefingService;
  onSettingsChanged?: (before: Settings, after: Settings) => void;
}
