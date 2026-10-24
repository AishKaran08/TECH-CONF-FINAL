import { useEffect, useState } from 'react';
import type { ScopePreview, SortPreview } from '@runway/shared';
import { Icon } from '../components/Icon';
import { Button, ErrorNote, Modal, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { clsx } from '../lib/format';
import { refresh, toast, useApp } from '../lib/store';
import { requireAiNotice } from './AiNotice';
import { closeSort, openConnections, usePanels } from './panelState';

const SCOPE_TITLE: Record<ScopePreview['scope'], string> = { tasks: 'Tasks and deadlines', projects: 'Projects', skills: 'Skills' };
const METHOD: Record<ScopePreview['method'], string> = { deterministic: 'Earliest deadline first', ai: 'Ranked by the agent', heuristic: 'Keyword match with your skills' };

function ScopeBlock({ s }: { s: ScopePreview }) {
  const shown = s.moves.slice(0, 6);
  return (
    <section className="rounded-xl border border-zinc-800 p-3.5">
      <header className="mb-2 flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-medium text-zinc-100">{SCOPE_TITLE[s.scope]}</h3>
        <span className="text-xs text-zinc-400">{s.scope === 'skills' ? 'Strongest evidence first' : METHOD[s.method]}</span>
        <span className="num ml-auto text-xs text-zinc-400">{s.moves.length} move{s.moves.length === 1 ? '' : 's'}</span>
      </header>
      {s.moves.length === 0 ? (
        <p className="text-xs text-zinc-400">{s.after.length ? 'Already in the best order.' : 'Nothing to sort yet.'}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {shown.map((m) => (
            <li key={m.id} className="flex items-start gap-2.5 text-sm">
              <span className={clsx('mt-0.5 flex shrink-0 items-center gap-0.5 text-xs', m.to < m.from ? 'text-emerald-300' : 'text-zinc-400')}>
                <Icon name={m.to < m.from ? 'arrowUp' : 'arrowDown'} size={12} />
                <span className="num">
                  {m.from + 1}→{m.to + 1}
                </span>
                <span className="sr-only">{m.to < m.from ? 'moves up' : 'moves down'}</span>
              </span>
              <div className="min-w-0">
                <p className="truncate text-zinc-100">{m.label}</p>
                {m.reason && <p className="text-xs leading-relaxed text-zinc-400">{m.reason}</p>}
              </div>
            </li>
          ))}
          {s.moves.length > shown.length && <li className="text-xs text-zinc-400">and {s.moves.length - shown.length} more</li>}
        </ol>
      )}
    </section>
  );
}

export function SortModal() {
  const { sort } = usePanels();
  const canUndo = useApp((s) => s.dashboard?.canUndoSort ?? false);
  const role = useApp((s) => s.dashboard?.settings.targetRole ?? '');
  const [preview, setPreview] = useState<SortPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sort) return;
    let alive = true;
    setPreview(null);
    setError(null);
    void (async () => {
      await requireAiNotice();
      try {
        const p = await api.post<SortPreview>('/sort/preview');
        if (alive) setPreview(p);
      } catch (err) {
        if (alive) setError((err as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [sort]);

  const apply = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await api.post('/sort/apply', { id: preview.id });
      closeSort();
      await refresh();
      toast('Sorted. Open Smart sort again to undo.', 'success');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const undo = async () => {
    setBusy(true);
    try {
      await api.post('/sort/undo');
      closeSort();
      await refresh();
      toast('Previous order restored.', 'info');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const total = preview?.scopes.reduce((n, s) => n + s.moves.length, 0) ?? 0;

  return (
    <Modal
      open={sort}
      onClose={closeSort}
      title="Smart sort"
      wide
      footer={
        <>
          {canUndo && (
            <Button variant="ghost" icon="undo" onClick={() => void undo()} disabled={busy} className="mr-auto">
              Undo last sort
            </Button>
          )}
          <Button variant="ghost" onClick={closeSort}>
            Cancel
          </Button>
          <Button variant="primary" icon="sort" onClick={() => void apply()} disabled={!preview || busy || total === 0} busy={busy}>
            {total === 0 && preview ? 'Nothing to change' : `Apply ${total} move${total === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      {!preview && !error && (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Working out the new order">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {preview && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-zinc-300">
            Here is what would move and why. Projects are ranked for <span className="text-zinc-100">{preview.targetRole}</span>
            {!role && (
              <>
                {' '}(default).{' '}
                <button type="button" className="text-teal-300 underline-offset-2 hover:underline" onClick={() => openConnections('settings')}>
                  Set your target role
                </button>
              </>
            )}
            .
          </p>
          {preview.flags.length > 0 && (
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-100">
                <Icon name="alert" size={14} /> Worth a look
              </h3>
              <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-amber-100/90">
                {preview.flags.map((f) => (
                  <li key={`${f.taskId}-${f.kind}`}>{f.message} You can split, drop or reschedule it from the Tasks card.</li>
                ))}
              </ul>
            </section>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {preview.scopes.map((s) => (
              <ScopeBlock key={s.scope} s={s} />
            ))}
            {preview.bullets.length > 0 && (
              <section className="rounded-xl border border-zinc-800 p-3.5">
                <h3 className="mb-2 text-sm font-medium text-zinc-100">Resume bullets, strongest first</h3>
                <ol className="flex list-decimal flex-col gap-2 pl-4 text-sm marker:text-zinc-500">
                  {preview.bullets.slice(0, 5).map((b, i) => (
                    <li key={i}>
                      <p className="text-zinc-200">{b.text}</p>
                      <p className="text-xs text-zinc-400">{b.reason}</p>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
