import { useState } from 'react';
import { APP_NAME, type Dashboard, type SourceId } from '@runway/shared';
import { Icon } from '../components/Icon';
import { Button, IconButton } from '../components/ui';
import { api } from '../lib/api';
import { clsx } from '../lib/format';
import { setDashboard, syncAll, toast, useApp } from '../lib/store';
import { openAgent, openConnections, openSort } from './panelState';

const SOURCE_LABEL: Record<SourceId, string> = { github: 'GitHub', codeforces: 'Codeforces', leetcode: 'LeetCode', resume: 'Resume', timetable: 'Timetable' };
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function DemoToggle({ d, compact }: { d: Dashboard | null; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const on = d?.mode === 'demo';
  const toggle = async () => {
    setBusy(true);
    try {
      setDashboard(await api.post<Dashboard>('/demo', { enabled: !on }));
      toast(on ? 'Back to your real data.' : 'Demo data on. Everything sample is badged "Demo data".', 'info');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy || !d}
      onClick={() => void toggle()}
      className={clsx('control tr inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm', on ? 'border-violet-400/50 bg-violet-500/10 text-violet-100' : 'bg-zinc-900/80 text-zinc-300')}
    >
      <span className={clsx('relative block h-4 w-7 shrink-0 rounded-full tr', on ? 'bg-violet-400' : 'bg-zinc-700')} aria-hidden="true">
        <span className="tr absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-zinc-50" style={{ transform: on ? 'translateX(12px)' : 'none' }} />
      </span>
      {compact ? <span className="sr-only">Demo data</span> : 'Demo data'}
    </button>
  );
}

function SyncButton({ compact }: { compact?: boolean }) {
  const sync = useApp((s) => s.sync);
  const done = sync ? Object.values(sync.progress).filter((p) => p && p.progress >= 1).length : 0;
  const label = sync ? `Syncing ${done}/${sync.sources.length}` : 'Sync all';
  return compact ? (
    <IconButton icon="sync" label={label} onClick={() => void syncAll()} disabled={!!sync} className={sync ? '[&_svg]:animate-spin motion-reduce:[&_svg]:animate-none' : undefined} />
  ) : (
    <Button icon="sync" busy={!!sync} onClick={() => void syncAll()} disabled={!!sync}>
      {label}
    </Button>
  );
}

export function Header({ d }: { d: Dashboard | null }) {
  const connected = useApp((s) => s.sseConnected);
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/60 bg-[#09090b]/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-zinc-900 focus:px-3 focus:py-2">
          Skip to dashboard
        </a>
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400 text-zinc-950" aria-hidden="true">
            <Icon name="logo" size={16} strokeWidth={2.25} />
          </span>
          <span className="text-[0.9375rem] font-semibold tracking-tight">{APP_NAME}</span>
          {d?.mode === 'demo' && <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[0.6875rem] font-medium text-violet-200 ring-1 ring-violet-400/30">Demo data</span>}
          {!connected && d && (
            <span className="flex items-center gap-1 text-xs text-amber-200" title="Live updates paused. Reconnecting…">
              <Icon name="wifiOff" size={13} />
              <span className="hidden sm:inline">Reconnecting</span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => openAgent()}
          className="control tr mx-auto hidden h-9 w-full max-w-md items-center gap-2 rounded-lg bg-zinc-900/70 px-3 text-left text-sm text-zinc-400 hover:bg-zinc-900 md:flex"
          aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
        >
          <Icon name="spark" size={15} className="text-emerald-300" />
          <span className="flex-1 truncate">Ask {APP_NAME} to plan, sort or sync</span>
          <kbd className="num rounded border border-zinc-700 px-1.5 py-0.5 text-[0.625rem] text-zinc-400">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
        </button>

        {/* Desktop actions */}
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <SyncButton />
          <Button icon="sort" onClick={openSort} disabled={!d}>
            Smart sort
          </Button>
          <div className="hidden xl:block">
            <DemoToggle d={d} />
          </div>
          <IconButton icon="plug" label="Connections and settings" onClick={() => openConnections('github')} />
        </div>

        {/* Mobile: icon buttons */}
        <div className="ml-auto flex items-center gap-1.5 md:hidden">
          <IconButton icon="spark" label={`Ask ${APP_NAME}`} onClick={() => openAgent()} />
          <SyncButton compact />
          <IconButton icon="sort" label="Smart sort" onClick={openSort} disabled={!d} />
          <IconButton icon="plug" label="Connections and settings" onClick={() => openConnections('github')} />
        </div>
      </div>
      <SyncBar />
    </header>
  );
}

function SyncBar() {
  const sync = useApp((s) => s.sync);
  if (!sync) return null;
  const items = sync.sources.map((src) => ({ src, p: sync.progress[src] }));
  const overall = items.reduce((s, x) => s + (x.p?.progress ?? 0), 0) / Math.max(1, items.length);
  return (
    <div className="border-t border-zinc-800/60">
      <div className="h-0.5 w-full overflow-hidden bg-zinc-900" role="progressbar" aria-label="Sync progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(overall * 100)}>
        <div className="tr h-full origin-left bg-emerald-400" style={{ transform: `scaleX(${Math.max(0.04, overall)})` }} />
      </div>
      <div className="mx-auto flex max-w-[1400px] flex-wrap gap-2 px-4 py-2 sm:px-6">
        {items.map(({ src, p }) => {
          const state = p?.state ?? 'syncing';
          return (
            <span
              key={src}
              className={clsx(
                'rise inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
                state === 'error' ? 'bg-red-500/15 text-red-200' : state === 'connected' ? 'bg-emerald-500/10 text-emerald-200' : 'bg-zinc-800/80 text-zinc-300',
              )}
            >
              <Icon name={state === 'error' ? 'alertCircle' : state === 'connected' ? 'check' : 'sync'} size={12} className={state === 'syncing' ? 'animate-spin motion-reduce:animate-none' : undefined} />
              <span className="font-medium">{SOURCE_LABEL[src]}</span>
              <span className="max-w-[16rem] truncate text-zinc-400">{p?.message ?? 'Waiting'}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
