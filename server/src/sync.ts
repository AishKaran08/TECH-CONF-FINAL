import { randomUUID } from 'node:crypto';
import { verdictToWords, type SourceId, type Submission, type SyncSummaryItem } from '@runway/shared';
import { CodeforcesClient, fetchCodeforces, RateQueue } from './adapters/codeforces';
import { calendarFromEvents, fetchGithub, GithubClient, SourceError } from './adapters/github';
import { fetchIcs, mergeIcs, parseIcs } from './adapters/ics';
import type { EventHub } from './events';
import { logInfo } from './log';
import type { Workspace } from './workspace';

export type Report = (progress: number, message: string) => void;

export interface SourceRunner {
  /** Whether the user has set this source up. */
  configured(): boolean;
  /** Fetch and store. Returns a short summary like "+12 events". Throws SourceError on failure. */
  run(report: Report): Promise<{ summary: string; detail?: string }>;
}

export const SOURCE_NAMES: Record<SourceId, string> = { github: 'GitHub', codeforces: 'Codeforces', leetcode: 'LeetCode', resume: 'Resume', timetable: 'Timetable' };

export interface SyncOutcome {
  syncId: string;
  summary: SyncSummaryItem[];
  text: string;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* ------------------------------------------------------------------ */
/* Runners for each source                                             */
/* ------------------------------------------------------------------ */

export function githubRunner(ws: Workspace, fetchImpl: typeof fetch): SourceRunner {
  return {
    configured: () => ws.settings().githubUsername.length > 0,
    async run(report) {
      const { githubUsername, githubToken } = ws.settings();
      const client = new GithubClient(fetchImpl, ws.store, githubToken);
      const now = new Date();
      try {
        const snap = await fetchGithub(client, githubUsername, { now, useGraphql: githubToken.length > 0, onStep: report });
        ws.store.setDoc('github:profile', snap.profile);
        const repoRes = ws.store.upsertRecords('github:repo', snap.repos.map((r) => ({ id: r.id, data: r })));
        ws.store.pruneRecords('github:repo', snap.repos.map((r) => r.id));
        const evRes = ws.store.upsertRecords('github:event', snap.events.map((e) => ({ id: e.id, data: e })));
        // Keep 90 days of events; earlier syncs accumulate, so the heatmap can hold more than one API page.
        const since = now.getTime() - 90 * 86400_000;
        const kept = ws.store.listRecords<{ id: string; createdAt: string }>('github:event').filter((e) => Date.parse(e.createdAt) >= since);
        ws.store.pruneRecords('github:event', kept.map((e) => e.id));
        const calendar = snap.calendar.basis === 'events' ? calendarFromEvents(ws.store.listRecords('github:event'), now) : snap.calendar;
        ws.store.setDoc('github:calendar', calendar);
        if (snap.rate) ws.store.setDoc('github:rate', snap.rate);
        const parts = [`+${plural(evRes.added, 'event')}`];
        if (repoRes.added) parts.push(`+${plural(repoRes.added, 'repo')}`);
        return { summary: parts.join(', '), detail: `@${snap.profile.login}, ${plural(snap.repos.length, 'repo')}` };
      } catch (err) {
        if (client.rate) ws.store.setDoc('github:rate', client.rate);
        throw err;
      }
    },
  };
}

/** One queue per process: every Codeforces call waits its turn (1 request per 2 seconds). */
export const codeforcesQueue = new RateQueue(2000);

export function codeforcesRunner(ws: Workspace, fetchImpl: typeof fetch, queue = codeforcesQueue): SourceRunner {
  return {
    configured: () => ws.settings().codeforcesHandle.length > 0,
    async run(report) {
      const handle = ws.settings().codeforcesHandle;
      const snap = await fetchCodeforces(new CodeforcesClient(fetchImpl, queue), handle, report);
      ws.store.setDoc('codeforces:user', snap.user);
      ws.store.setDoc('codeforces:ratings', snap.ratings);
      const res = ws.store.upsertRecords('codeforces:submission', snap.submissions.map((s) => ({ id: s.id, data: s })));
      return { summary: `+${plural(res.added, 'submission')}`, detail: `${snap.user.handle}${snap.user.rating ? `, rating ${snap.user.rating}` : ''}` };
    },
  };
}

export function timetableRunner(ws: Workspace, fetchImpl: typeof fetch): SourceRunner {
  return {
    configured: () => ws.settings().icsUrl.length > 0,
    async run(report) {
      report(0.2, 'Downloading calendar');
      const body = await fetchIcs(fetchImpl, ws.settings().icsUrl);
      report(0.6, 'Reading events');
      const parsed = parseIcs(body, new Date());
      const c = mergeIcs(ws.classes(), parsed.classes);
      const d = mergeIcs(ws.deadlines(), parsed.deadlines);
      ws.setClasses(c.merged);
      ws.setDeadlines(d.merged);
      const added = c.added + d.added;
      return { summary: added ? `+${plural(added, 'item')}` : 'unchanged', detail: `${plural(ws.classes().length, 'class')}, ${plural(ws.deadlines().length, 'date')}` };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Orchestrator                                                        */
/* ------------------------------------------------------------------ */

export class SyncService {
  private current: { syncId: string; done: Promise<SyncOutcome> } | null = null;

  constructor(
    private readonly ws: Workspace,
    private readonly hub: EventHub,
    readonly runners: Partial<Record<SourceId, SourceRunner>>,
  ) {}

  get running(): boolean {
    return this.current !== null;
  }

  /** Sources that are set up and can be synced right now. */
  configuredSources(): SourceId[] {
    return (Object.keys(this.runners) as SourceId[]).filter((s) => this.runners[s]!.configured());
  }

  /**
   * Start a sync. Returns at once with the id; progress and the result arrive over SSE.
   * A sync already in progress is joined instead of starting a second one.
   */
  start(requested: SourceId[] | undefined, trigger: 'manual' | 'scheduler' | 'agent'): { syncId: string; sources: SourceId[]; done: Promise<SyncOutcome> } | { syncId: null; message: string } {
    if (this.current) return { ...this.current, sources: [] };
    if (this.ws.mode() === 'demo') return this.startDemo(trigger);
    const configured = this.configuredSources();
    const sources = (requested ?? configured).filter((s) => configured.includes(s));
    if (sources.length === 0) {
      return { syncId: null, message: 'Nothing to sync yet. Add a GitHub username, a Codeforces handle, a resume or a calendar link in Connections.' };
    }
    const syncId = randomUUID();
    const done = this.execute(syncId, sources, trigger).finally(() => {
      this.current = null;
    });
    this.current = { syncId, done };
    return { syncId, sources, done };
  }

  private async execute(syncId: string, sources: SourceId[], trigger: 'manual' | 'scheduler' | 'agent'): Promise<SyncOutcome> {
    const started = Date.now();
    this.hub.emit({ type: 'sync.start', syncId, sources, trigger });
    const results = await Promise.all(
      sources.map(async (source): Promise<SyncSummaryItem> => {
        const runner = this.runners[source]!;
        const hadData = this.ws.status(source).lastSyncedAt !== null;
        const report: Report = (progress, message) => this.hub.emit({ type: 'sync.progress', syncId, source, state: 'syncing', progress, message });
        this.ws.setStatus(source, { state: 'syncing' });
        report(0.02, 'Starting');
        try {
          const r = await runner.run(report);
          this.ws.setStatus(source, { state: 'connected', lastSyncedAt: new Date().toISOString(), lastError: null, detail: r.detail ?? this.ws.status(source).detail });
          this.hub.emit({ type: 'sync.progress', syncId, source, state: 'connected', progress: 1, message: r.summary });
          return { source, ok: true, text: `${SOURCE_NAMES[source]} ${r.summary}` };
        } catch (err) {
          const msg = err instanceof SourceError ? err.message : 'Something unexpected went wrong.';
          if (!(err instanceof SourceError)) console.warn(`[sync] ${source} failed:`, (err as Error).message);
          // Keep the last good snapshot: stored data is untouched on failure.
          this.ws.setStatus(source, { state: 'error', lastError: msg });
          this.hub.emit({ type: 'sync.progress', syncId, source, state: 'error', progress: 1, message: msg });
          return { source, ok: false, text: `${SOURCE_NAMES[source]} failed: ${msg}${hadData ? ' Showing the last good data.' : ''}` };
        }
      }),
    );
    const failed = results.filter((r) => !r.ok);
    const okText = results.filter((r) => r.ok).map((r) => r.text).join(', ');
    const text = failed.length === 0 ? okText : [okText, ...failed.map((f) => f.text)].filter(Boolean).join('. ');
    logInfo('sync', `${trigger} sync of ${sources.join(',')} finished in ${Date.now() - started}ms (${failed.length} failed)`);
    this.hub.emit({ type: 'sync.done', syncId, summary: results, text });
    this.ws.changed('all');
    return { syncId, summary: results, text };
  }

  /** Demo mode: a short simulated sync over the sample data, so the UI can be shown end to end offline. */
  private startDemo(trigger: 'manual' | 'scheduler' | 'agent') {
    const syncId = randomUUID();
    const sources: SourceId[] = ['github', 'codeforces', 'resume', 'timetable'];
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const done = (async (): Promise<SyncOutcome> => {
      this.hub.emit({ type: 'sync.start', syncId, sources, trigger });
      const steps: Record<string, [number, string][]> = {
        github: [[0.3, 'Reading repositories'], [0.7, 'Reading recent events']],
        codeforces: [[0.2, 'Queued (1 request per 2 s)'], [0.6, 'Reading recent submissions']],
        resume: [[0.5, 'Checking file hash']],
        timetable: [[0.5, 'Checking calendar']],
      };
      const results = await Promise.all(
        sources.map(async (source, i) => {
          for (const [p, m] of steps[source]!) {
            await sleep(350 + i * 120);
            this.hub.emit({ type: 'sync.progress', syncId, source, state: 'syncing', progress: p, message: m });
          }
          await sleep(300 + i * 150);
          let summary = 'unchanged';
          if (source === 'codeforces') {
            const extra = this.ws.store.getDoc<Submission[]>('demo:extraSubmissions') ?? [];
            const n = extra.length;
            const sub: Submission = {
              id: `demo-live-${n}`,
              origin: 'demo',
              problemName: ['Two Arrays and Swaps', 'Make It Increasing', 'Permutation Swap'][n % 3]!,
              problemId: `2000${String.fromCharCode(65 + (n % 5))}`,
              url: null,
              tags: ['greedy', 'sortings'],
              verdict: n % 2 === 0 ? 'OK' : 'WRONG_ANSWER',
              accepted: n % 2 === 0,
              verdictText: verdictToWords(n % 2 === 0 ? 'OK' : 'WRONG_ANSWER', 4),
              language: 'GNU C++17',
              difficulty: '1300',
              time: new Date().toISOString(),
            };
            this.ws.store.setDoc('demo:extraSubmissions', [sub, ...extra].slice(0, 10));
            summary = '+1 submission';
          }
          if (source === 'github') summary = '+0 events';
          this.hub.emit({ type: 'sync.progress', syncId, source, state: 'connected', progress: 1, message: summary });
          return { source, ok: true, text: `${SOURCE_NAMES[source]} ${summary}` };
        }),
      );
      this.ws.store.setDoc('demo:lastSync', new Date().toISOString());
      const text = `Demo data: ${results.map((r) => r.text).join(', ')}`;
      this.hub.emit({ type: 'sync.done', syncId, summary: results, text });
      this.ws.changed('all');
      return { syncId, summary: results, text };
    })().finally(() => {
      this.current = null;
    });
    this.current = { syncId, done };
    return { syncId, sources, done };
  }
}
