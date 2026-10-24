import { useSyncExternalStore } from 'react';

export type ConnectionsTab = 'github' | 'codeforces' | 'leetcode' | 'resume' | 'timetable' | 'settings';
export interface PanelState {
  connections: ConnectionsTab | null;
  sort: boolean;
  agent: boolean;
  agentPrompt: string;
}

let s: PanelState = { connections: null, sort: false, agent: false, agentPrompt: '' };
const ls = new Set<() => void>();
const set = (p: Partial<PanelState>) => {
  s = { ...s, ...p };
  ls.forEach((l) => l());
};

export function usePanels(): PanelState {
  return useSyncExternalStore(
    (cb) => {
      ls.add(cb);
      return () => ls.delete(cb);
    },
    () => s,
  );
}

export const openConnections = (tab: ConnectionsTab = 'github') => set({ connections: tab });
export const closeConnections = () => set({ connections: null });
export const openSort = () => set({ sort: true });
export const closeSort = () => set({ sort: false });
export const openAgent = (prompt = '') => set({ agent: true, agentPrompt: prompt });
export const closeAgent = () => set({ agent: false, agentPrompt: '' });
