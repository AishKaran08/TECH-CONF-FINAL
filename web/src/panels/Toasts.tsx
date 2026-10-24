import { Icon } from '../components/Icon';
import { clsx } from '../lib/format';
import { dismissToast, useApp } from '../lib/store';

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const live = useApp((s) => s.liveMessage);
  return (
    <>
      {/* Screen-reader announcements for sync status and results. */}
      <div aria-live="polite" role="status" className="sr-only">
        {live}
      </div>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'glass rise pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm shadow-xl',
              t.tone === 'error' && 'border-red-500/40',
              t.tone === 'success' && 'border-emerald-500/30',
            )}
          >
            <Icon name={t.tone === 'error' ? 'alertCircle' : t.tone === 'success' ? 'checkCircle' : 'dot'} size={16} className={clsx('mt-0.5 shrink-0', t.tone === 'error' ? 'text-red-300' : t.tone === 'success' ? 'text-emerald-300' : 'text-zinc-400')} />
            <p className="flex-1 leading-relaxed text-zinc-100">{t.text}</p>
            <button type="button" onClick={() => dismissToast(t.id)} className="tr -m-1 rounded-md p-1 text-zinc-400 hover:text-zinc-100" aria-label="Dismiss">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
