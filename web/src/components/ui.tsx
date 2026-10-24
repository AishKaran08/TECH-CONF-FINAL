import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { RecordOrigin } from '@runway/shared';
import { clsx, isStale, ORIGIN_LABEL, timeAgo } from '../lib/format';
import { Icon, type IconName } from './Icon';

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export interface CardProps {
  title: string;
  icon?: IconName;
  /** Stagger index for the load sequence. */
  index?: number;
  className?: string;
  actions?: ReactNode;
  /** Source + freshness line shown at the bottom of every data card. */
  footer?: ReactNode;
  children: ReactNode;
  id?: string;
}

export function Card({ title, icon, index = 0, className, actions, footer, children, id }: CardProps) {
  const hid = useId();
  return (
    <section
      id={id}
      aria-labelledby={hid}
      className={clsx('glass card rise flex min-w-0 flex-col rounded-2xl p-4 sm:p-5', className)}
      style={{ '--i': index } as React.CSSProperties}
    >
      <header className="mb-4 flex items-center gap-2">
        {icon && <Icon name={icon} size={16} className="shrink-0 text-zinc-400" />}
        <h2 id={hid} className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium tracking-tight text-zinc-100">
          {title}
        </h2>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {footer && <footer className="mt-4 border-t border-zinc-800/80 pt-3 text-xs text-zinc-400">{footer}</footer>}
    </section>
  );
}

/** "From GitHub, synced 4 min ago" + Stale marker. Used on every data card. */
export function SourceLine({ origins, syncedAt, verb = 'synced', extra }: { origins: RecordOrigin[]; syncedAt?: string | null; verb?: string; extra?: ReactNode }) {
  const stale = isStale(syncedAt);
  const unique = [...new Set(origins)];
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {unique.map((o) => (
        <SourceTag key={o} origin={o} />
      ))}
      {syncedAt !== undefined && (
        <span>
          {verb} {timeAgo(syncedAt)}
        </span>
      )}
      {stale && (
        <span className="inline-flex items-center gap-1 text-amber-300">
          <Icon name="clock" size={12} /> Stale, last update over a day ago
        </span>
      )}
      {extra}
    </p>
  );
}

const ORIGIN_STYLE: Record<RecordOrigin, string> = {
  github: 'text-zinc-300 bg-zinc-800/70',
  codeforces: 'text-zinc-300 bg-zinc-800/70',
  resume: 'text-zinc-300 bg-zinc-800/70',
  manual: 'text-teal-200 bg-teal-500/10',
  ics: 'text-zinc-300 bg-zinc-800/70',
  demo: 'text-violet-200 bg-violet-500/15 ring-1 ring-violet-400/30',
};

export function SourceTag({ origin, className }: { origin: RecordOrigin; className?: string }) {
  return <span className={clsx('inline-flex items-center rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium', ORIGIN_STYLE[origin], className)}>{ORIGIN_LABEL[origin]}</span>;
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-emerald-400 text-zinc-950 border-emerald-400 hover:bg-emerald-300 font-medium',
  secondary: 'control bg-zinc-900/80 text-zinc-100 hover:bg-zinc-800',
  ghost: 'border border-transparent text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100',
  danger: 'control bg-zinc-900/80 text-red-300 hover:bg-red-500/10',
};

export function Button({ variant = 'secondary', icon, size = 'md', className, children, busy, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: IconName; size?: 'sm' | 'md'; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      aria-busy={busy || undefined}
      className={clsx(
        'tr inline-flex select-none items-center justify-center gap-1.5 rounded-lg disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'border',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm',
        VARIANT[variant],
        className,
      )}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} className={busy && icon === 'sync' ? 'animate-spin motion-reduce:animate-none' : undefined} />}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest} className={clsx('control tr inline-flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900/80 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50', className)}>
      <Icon name={icon} size={16} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} aria-hidden="true" />;
}

export function Empty({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center">
      <Icon name={icon} size={20} className="text-zinc-500" />
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      {children && <div className="max-w-[34ch] text-xs leading-relaxed text-zinc-400">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-200">
      <Icon name="alertCircle" size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Modal (native <dialog>: focus trap, Esc and inert background built in) */
/* ------------------------------------------------------------------ */

export function Modal({ open, onClose, title, children, wide, labelledBy, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; labelledBy?: string; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy ?? titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={clsx(
        'm-auto max-h-[min(88dvh,820px)] w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/95 p-0 text-zinc-100 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm open:flex open:flex-col',
        wide ? 'max-w-3xl' : 'max-w-lg',
      )}
    >
      {open && (
        <>
          <div className="flex items-center gap-3 border-b border-zinc-800 px-5 py-4">
            <h2 id={titleId} className="flex-1 text-base font-medium tracking-tight">
              {title}
            </h2>
            <IconButton icon="x" label="Close" onClick={onClose} className="h-8 w-8" />
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-800 px-5 py-3">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Form fields                                                         */
/* ------------------------------------------------------------------ */

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-zinc-300">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-zinc-400">{hint}</p>}
    </div>
  );
}

export const inputClass =
  'control h-9 rounded-lg bg-zinc-900 px-3 text-sm text-zinc-100 placeholder:text-zinc-400 focus-visible:border-teal-400';

/* ------------------------------------------------------------------ */
/* Urgency (always words + icon, never color alone)                    */
/* ------------------------------------------------------------------ */

export function UrgencyBadge({ urgency, text }: { urgency: 'calm' | 'soon' | 'urgent' | 'past'; text: string }) {
  const map = {
    calm: { icon: 'clock' as const, cls: 'text-zinc-300 bg-zinc-800/70', word: '' },
    soon: { icon: 'clock' as const, cls: 'text-amber-200 bg-amber-500/10', word: 'Soon: ' },
    urgent: { icon: 'alert' as const, cls: 'text-red-200 bg-red-500/15', word: 'Urgent: ' },
    past: { icon: 'checkCircle' as const, cls: 'text-zinc-400 bg-zinc-800/50', word: '' },
  }[urgency];
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium', map.cls)}>
      <Icon name={map.icon} size={12} />
      {map.word}
      {text}
    </span>
  );
}
