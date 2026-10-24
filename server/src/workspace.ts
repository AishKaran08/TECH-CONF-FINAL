import {
  generateDemoData,
  Settings,
  toDateOnly,
  type Briefing,
  type ClassSession,
  type CodeforcesUser,
  type ContributionCalendar,
  type Deadline,
  type DemoData,
  type GithubEvent,
  type GithubProfile,
  type GithubRepo,
  type LeetcodeStats,
  type Orders,
  type PublicSettings,
  type RatingChange,
  type ResumeRecord,
  type SettingsPatch,
  type SourceId,
  type SourceStatus,
  type Submission,
  type Task,
} from '@runway/shared';
import { randomUUID } from 'node:crypto';
import type { EventHub } from './events';
import type { Store } from './store';

export type Mode = 'real' | 'demo';

const EMPTY_ORDERS: Orders = { tasks: [], projects: [], skills: [], reasons: {}, sortedAt: null };
const UNDO_LIMIT = 20;
export const SOURCES: SourceId[] = ['github', 'codeforces', 'leetcode', 'resume', 'timetable'];

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

export function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 12) return '••••••••';
  return `${token.slice(0, 4)}••••••••${token.slice(-4)}`;
}

/**
 * Data access for everything the app keeps. User-entered data (tasks, deadlines, classes,
 * LeetCode, orders, briefing) is stored per mode, so Demo data never mixes with real data.
 * Synced data (GitHub, Codeforces, resume) is real-only; in demo mode it comes from the generator.
 */
export class Workspace {
  private demoCache: { day: string; data: DemoData } | null = null;

  constructor(
    readonly store: Store,
    readonly hub: EventHub,
    readonly env: { aiAvailable: boolean; model: string; defaultSyncInterval: number },
  ) {}

  /* ---------------- settings ---------------- */

  settings(): Settings {
    const raw = this.store.getDoc<Partial<Settings>>('settings') ?? {};
    const parsed = Settings.safeParse({ syncIntervalMinutes: this.env.defaultSyncInterval, ...raw });
    return parsed.success ? parsed.data : Settings.parse({ syncIntervalMinutes: this.env.defaultSyncInterval });
  }

  updateSettings(patch: SettingsPatch): Settings {
    const next = Settings.parse({ ...this.settings(), ...patch });
    this.store.setDoc('settings', next);
    return next;
  }

  publicSettings(): PublicSettings {
    const { githubToken, ...rest } = this.settings();
    return { ...rest, githubTokenMasked: maskToken(githubToken), hasGithubToken: githubToken.length > 0, aiAvailable: this.env.aiAvailable, model: this.env.model };
  }

  /**
   * AI may be used: a key is configured, the user has not chosen Local only, and the one-time
   * privacy notice was acknowledged. Enforced here on the server, not only in the UI.
   */
  aiEnabled(): boolean {
    const s = this.settings();
    return this.env.aiAvailable && !s.localOnly && s.aiNoticeAck;
  }

  mode(): Mode {
    return this.settings().demoMode ? 'demo' : 'real';
  }

  private k(name: string, mode: Mode = this.mode()): string {
    return `${mode}:${name}`;
  }

  /* ---------------- demo ---------------- */

  demo(now = new Date()): DemoData {
    const day = toDateOnly(now);
    if (!this.demoCache || this.demoCache.day !== day) this.demoCache = { day, data: generateDemoData(now) };
    return this.demoCache.data;
  }

  /** Turning demo on (re)seeds the demo copies of user-editable data with fresh relative dates. */
  setDemoMode(on: boolean, now = new Date()): void {
    if (on) {
      this.demoCache = null;
      const d = this.demo(now);
      this.store.setDoc(this.k('tasks', 'demo'), d.tasks);
      this.store.setDoc(this.k('deadlines', 'demo'), d.deadlines);
      this.store.setDoc(this.k('classes', 'demo'), d.classes);
      this.store.setDoc(this.k('leetcode', 'demo'), d.leetcode);
      this.store.setDoc(this.k('orders', 'demo'), EMPTY_ORDERS);
      this.store.setDoc(this.k('undo', 'demo'), []);
      this.store.deleteDoc(this.k('briefing', 'demo'));
      this.store.setDoc('demo:extraSubmissions', []);
    }
    this.updateSettings({ demoMode: on });
  }

  /* ---------------- user data (per mode) ---------------- */

  tasks(): Task[] {
    return this.store.getDoc<Task[]>(this.k('tasks')) ?? [];
  }
  setTasks(tasks: Task[]): void {
    this.store.setDoc(this.k('tasks'), tasks);
  }
  deadlines(): Deadline[] {
    return this.store.getDoc<Deadline[]>(this.k('deadlines')) ?? [];
  }
  setDeadlines(d: Deadline[]): void {
    this.store.setDoc(this.k('deadlines'), d);
  }
  classes(): ClassSession[] {
    return this.store.getDoc<ClassSession[]>(this.k('classes')) ?? [];
  }
  setClasses(c: ClassSession[]): void {
    this.store.setDoc(this.k('classes'), c);
  }
  leetcode(): LeetcodeStats | null {
    return this.store.getDoc<LeetcodeStats>(this.k('leetcode')) ?? null;
  }
  setLeetcode(s: LeetcodeStats): void {
    this.store.setDoc(this.k('leetcode'), s);
  }
  orders(): Orders {
    return { ...EMPTY_ORDERS, ...(this.store.getDoc<Orders>(this.k('orders')) ?? {}) };
  }
  setOrders(o: Orders): void {
    this.store.setDoc(this.k('orders'), o);
  }
  undoStack(): Orders[] {
    return this.store.getDoc<Orders[]>(this.k('undo')) ?? [];
  }
  pushUndo(o: Orders): void {
    this.store.setDoc(this.k('undo'), [...this.undoStack(), o].slice(-UNDO_LIMIT));
  }
  popUndo(): Orders | null {
    const stack = this.undoStack();
    const last = stack.pop() ?? null;
    this.store.setDoc(this.k('undo'), stack);
    return last;
  }
  briefing(): Briefing | null {
    return this.store.getDoc<Briefing>(this.k('briefing')) ?? null;
  }
  setBriefing(b: Briefing): void {
    this.store.setDoc(this.k('briefing'), b);
  }

  /* ---------------- synced data ---------------- */

  githubProfile(): GithubProfile | null {
    return this.mode() === 'demo' ? this.demo().githubProfile : (this.store.getDoc<GithubProfile>('github:profile') ?? null);
  }
  repos(): GithubRepo[] {
    return this.mode() === 'demo' ? this.demo().repos : this.store.listRecords<GithubRepo>('github:repo');
  }
  events(): GithubEvent[] {
    return this.mode() === 'demo' ? this.demo().events : this.store.listRecords<GithubEvent>('github:event');
  }
  calendar(): ContributionCalendar | null {
    return this.mode() === 'demo' ? this.demo().calendar : (this.store.getDoc<ContributionCalendar>('github:calendar') ?? null);
  }
  githubRateLimit(): { remaining: number; resetAt: string } | null {
    return this.mode() === 'demo' ? null : (this.store.getDoc<{ remaining: number; resetAt: string }>('github:rate') ?? null);
  }
  cfUser(): CodeforcesUser | null {
    return this.mode() === 'demo' ? this.demo().cfUser : (this.store.getDoc<CodeforcesUser>('codeforces:user') ?? null);
  }
  ratings(): RatingChange[] {
    return this.mode() === 'demo' ? this.demo().ratings : (this.store.getDoc<RatingChange[]>('codeforces:ratings') ?? []);
  }
  /** Codeforces submissions (or demo ones), newest first. */
  cfSubmissions(): Submission[] {
    const list =
      this.mode() === 'demo'
        ? [...(this.store.getDoc<Submission[]>('demo:extraSubmissions') ?? []), ...this.demo().submissions]
        : this.store.listRecords<Submission>('codeforces:submission');
    return list.sort((a, b) => b.time.localeCompare(a.time));
  }
  resume(): ResumeRecord | null {
    return this.mode() === 'demo' ? this.demo().resume : (this.store.getDoc<ResumeRecord>('resume') ?? null);
  }
  /** Raw resume text, used only as untrusted data for AI extraction. Never sent to the browser. */
  resumeText(): string | null {
    return this.mode() === 'demo' ? null : (this.store.getDoc<string>('resume:text') ?? null);
  }

  /* ---------------- source status ---------------- */

  status(source: SourceId): SourceStatus {
    if (this.mode() === 'demo') {
      return { source, state: 'connected', lastSyncedAt: this.store.getDoc<string>('demo:lastSync') ?? new Date(Date.now() - 6 * 60_000).toISOString(), lastError: null, detail: 'Demo data' };
    }
    const s = this.store.getDoc<SourceStatus>(`status:${source}`);
    return s ?? { source, state: 'not_connected', lastSyncedAt: null, lastError: null, detail: null };
  }
  setStatus(source: SourceId, patch: Partial<Omit<SourceStatus, 'source'>>): SourceStatus {
    const next: SourceStatus = { ...this.status(source), ...patch, source };
    if (this.mode() !== 'demo') this.store.setDoc(`status:${source}`, next);
    return next;
  }
  statuses(): SourceStatus[] {
    return SOURCES.map((s) => this.status(s));
  }

  /** Tell browsers something changed; they refetch the dashboard. */
  changed(...scopes: string[]): void {
    this.hub.emit({ type: 'data.changed', scopes });
  }
}
