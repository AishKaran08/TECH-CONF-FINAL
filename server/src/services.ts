import type { Settings } from '@runway/shared';
import type { AgentService } from './agent/agent';
import type { BriefingService } from './ai/briefing';
import type { EventHub } from './events';
import type { ResumeService } from './resume/service';
import type { SortService } from './sort';
import type { SyncService } from './sync';
import type { Workspace } from './workspace';

/** Long-lived services shared by the routes. Optional ones are added by later modules. */
export interface Services {
  ws: Workspace;
  hub: EventHub;
  scheduler?: { reschedule(minutes: number): void; stop(): void };
  briefing?: BriefingService;
  sync?: SyncService;
  resume?: ResumeService;
  sort?: SortService;
  agent?: AgentService;
  onSettingsChanged?: (before: Settings, after: Settings) => void;
}
