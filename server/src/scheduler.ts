import { schedule, type ScheduledTask } from 'node-cron';
import type { SourceId } from '@runway/shared';
import { logInfo } from './log';
import type { SyncService } from './sync';
import type { Workspace } from './workspace';

/** Cron expression for "every N minutes" (N ≥ 60 rounds to whole hours). */
export function cronFor(minutes: number): string {
  const m = Math.max(5, Math.round(minutes));
  if (m < 60) return `*/${m} * * * *`;
  const h = Math.max(1, Math.min(23, Math.round(m / 60)));
  return `0 */${h} * * *`;
}

/** Background refresh of GitHub and Codeforces. Pushes updates to browsers through the normal sync events. */
export class Scheduler {
  private task: ScheduledTask | null = null;

  constructor(
    private readonly ws: Workspace,
    private readonly sync: SyncService,
  ) {}

  start(minutes: number): void {
    this.stop();
    const expr = cronFor(minutes);
    this.task = schedule(expr, () => this.tick(), { name: 'runway-refresh' });
    logInfo('scheduler', `refreshing GitHub and Codeforces every ${minutes} min (${expr})`);
  }

  reschedule(minutes: number): void {
    this.start(minutes);
  }

  stop(): void {
    void this.task?.stop();
    this.task = null;
  }

  /** One scheduled run: skipped in demo mode, while another sync runs, or when nothing is set up. */
  tick(): void {
    if (this.ws.mode() === 'demo' || this.sync.running) return;
    const wanted: SourceId[] = ['github', 'codeforces'];
    const sources = this.sync.configuredSources().filter((s) => wanted.includes(s));
    if (sources.length === 0) return;
    this.sync.start(sources, 'scheduler');
  }
}
