import { useSyncExternalStore } from 'react';
import type { AgentStep, Dashboard, ServerEvent, SourceId, SourceState } from '@runway/shared';
import { api } from './api';

export interface SyncProgress {
  state: SourceState;
  progress: number;
  message: string;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}

export interface AgentRun {
  runId: string;
  prompt: string;
  steps: AgentStep[];
  liveText: string;
  status: 'running' | 'done' | 'error';
  error?: string;
}

export interface AppState {
  dashboard: Dashboard | null;
  loadError: string | null;
  sseConnected: boolean;
  sync: { id: string; sources: SourceId[]; progress: Partial<Record<SourceId, SyncProgress>>; trigger: string } | null;
  /** Read by the aria-live region. */
  liveMessage: string;
  toasts: Toast[];
  agentRuns: AgentRun[];
}

let state: AppState = {
  dashboard: null,
  loadError: null,
  sseConnected: false,
  sync: null,
  liveMessage: '',
  toasts: [],
  agentRuns: [],
};

const listeners = new Set<() => void>();

function set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  for (const l of listeners) l();
}

export function getState(): AppState {
  return state;
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => selector(state),
  );
}

/* ---------------- toasts ---------------- */

let toastSeq = 0;
export function toast(text: string, tone: Toast['tone'] = 'info', ms = 5200): void {
  const id = ++toastSeq;
  set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }], liveMessage: text }));
  setTimeout(() => dismissToast(id), ms);
}
export function dismissToast(id: number): void {
  set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

/* ---------------- dashboard ---------------- */

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;

export async function refresh(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const dashboard = await api.get<Dashboard>('/dashboard');
      set({ dashboard, loadError: null });
    } catch (err) {
      set({ loadError: (err as Error).message });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Debounced refresh used for bursts of data.changed events. */
export function scheduleRefresh(delay = 120): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refresh();
  }, delay);
}

export function setDashboard(dashboard: Dashboard): void {
  set({ dashboard, loadError: null });
}

/* ---------------- actions ---------------- */

export async function syncAll(sources?: SourceId[]): Promise<void> {
  try {
    await api.post('/sync', sources ? { sources } : {});
  } catch (err) {
    toast((err as Error).message, 'error');
  }
}

/* ---------------- server events ---------------- */

function onEvent(e: ServerEvent): void {
  switch (e.type) {
    case 'hello':
      break;
    case 'data.changed':
      scheduleRefresh();
      break;
    case 'sync.start':
      set({
        sync: { id: e.syncId, sources: e.sources, trigger: e.trigger, progress: Object.fromEntries(e.sources.map((s) => [s, { state: 'syncing' as const, progress: 0, message: 'Waiting…' }])) },
        liveMessage: e.trigger === 'scheduler' ? 'Background refresh started' : `Syncing ${e.sources.length} source${e.sources.length === 1 ? '' : 's'}…`,
      });
      break;
    case 'sync.progress':
      set((s) => (s.sync && s.sync.id === e.syncId ? { sync: { ...s.sync, progress: { ...s.sync.progress, [e.source]: { state: e.state, progress: e.progress, message: e.message } } } } : {}));
      break;
    case 'sync.done': {
      const trigger = state.sync?.trigger;
      set({ sync: null });
      // Background refreshes stay quiet unless something failed.
      if (trigger !== 'scheduler' || e.summary.some((x) => !x.ok)) toast(e.text, e.summary.every((x) => x.ok) ? 'success' : 'error', 7000);
      else set({ liveMessage: e.text });
      scheduleRefresh(0);
      break;
    }
    case 'agent.step':
      set((s) => ({
        agentRuns: s.agentRuns.map((r) => {
          if (r.runId !== e.runId) return r;
          const steps = [...r.steps];
          steps[e.index] = e.step;
          return { ...r, steps, liveText: e.step.kind === 'text' ? '' : r.liveText };
        }),
      }));
      break;
    case 'agent.delta':
      set((s) => ({ agentRuns: s.agentRuns.map((r) => (r.runId === e.runId ? { ...r, liveText: r.liveText + e.text } : r)) }));
      break;
    case 'agent.done':
      set((s) => ({ agentRuns: s.agentRuns.map((r) => (r.runId === e.runId ? { ...r, status: e.ok ? 'done' : 'error', error: e.error, liveText: '' } : r)) }));
      break;
  }
}

export function startAgentRun(runId: string, prompt: string): void {
  set((s) => ({ agentRuns: [...s.agentRuns.slice(-9), { runId, prompt, steps: [], liveText: '', status: 'running' }] }));
}

export function clearAgentRuns(): void {
  set({ agentRuns: [] });
}

let source: EventSource | null = null;
export function connectEvents(): () => void {
  if (source) return () => {};
  const open = () => {
    source = new EventSource('/api/events');
    source.onopen = () => {
      const wasConnected = state.sseConnected;
      set({ sseConnected: true });
      if (!wasConnected) scheduleRefresh(0);
    };
    source.onmessage = (m) => {
      try {
        onEvent(JSON.parse(m.data as string) as ServerEvent);
      } catch {
        /* ignore malformed */
      }
    };
    source.onerror = () => set({ sseConnected: false }); // EventSource reconnects on its own
  };
  open();
  return () => {
    source?.close();
    source = null;
  };
}
