import { useMemo, useState } from 'react';
import { checkTasks, describeCountdown, parseDue, urgencyOf, type Dashboard, type Task, type TaskFlag } from '@runway/shared';
import { Icon } from '../components/Icon';
import { Button, Card, Empty, inputClass, SourceTag, UrgencyBadge } from '../components/ui';
import { api } from '../lib/api';
import { clsx } from '../lib/format';
import { useFlip, useNow } from '../lib/motion';
import { refresh, toast } from '../lib/store';

async function run(fn: () => Promise<unknown>, ok?: string) {
  try {
    await fn();
    if (ok) toast(ok, 'success');
    await refresh();
  } catch (err) {
    toast((err as Error).message, 'error');
  }
}

function FlagNote({ flag, task }: { flag: TaskFlag; task: Task }) {
  const [date, setDate] = useState('');
  const [picking, setPicking] = useState(false);
  return (
    <div className={clsx('mt-2 rounded-lg border px-2.5 py-2 text-xs leading-relaxed', flag.kind === 'at_risk' ? 'border-amber-500/30 bg-amber-500/5 text-amber-100' : 'border-zinc-700 bg-zinc-900/60 text-zinc-300')}>
      <p className="flex items-start gap-1.5">
        <Icon name={flag.kind === 'at_risk' ? 'alert' : 'split'} size={13} className="mt-0.5 shrink-0" />
        <span>
          <span className="font-medium">{flag.kind === 'at_risk' ? 'Tight on time. ' : 'Keeps moving. '}</span>
          {flag.message}
        </span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {flag.options.includes('split') && (
          <Button size="sm" icon="split" onClick={() => run(() => api.post(`/tasks/${task.id}/split`), 'Split into two smaller tasks')}>
            Split
          </Button>
        )}
        {flag.options.includes('reschedule') &&
          (picking ? (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (date) void run(() => api.patch(`/tasks/${task.id}`, { due: date, reschedule: true }), 'New date saved');
              }}
            >
              <label className="sr-only" htmlFor={`resched-${task.id}`}>
                New date for {task.title}
              </label>
              <input id={`resched-${task.id}`} type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className={clsx(inputClass, 'h-8 w-auto text-xs')} required />
              <Button size="sm" variant="primary" type="submit">
                Save date
              </Button>
            </form>
          ) : (
            <Button size="sm" icon="calendar" onClick={() => setPicking(true)}>
              Reschedule
            </Button>
          ))}
        {flag.options.includes('drop') && (
          <Button size="sm" variant="ghost" icon="trash" onClick={() => run(() => api.del(`/tasks/${task.id}`), 'Dropped. One less thing.')}>
            Drop
          </Button>
        )}
      </div>
    </div>
  );
}

function AddTask() {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [hours, setHours] = useState('1');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-3 flex flex-col gap-2 border-t border-zinc-800/80 pt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        await run(() => api.post('/tasks', { title: title.trim(), due: due || null, estimateHours: Number(hours) || 1 }));
        setBusy(false);
        setTitle('');
        setDue('');
        setHours('1');
      }}
    >
      <label htmlFor="new-task" className="sr-only">
        New task
      </label>
      <input id="new-task" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task" className={clsx(inputClass, 'w-full')} maxLength={200} />
      <div className="flex gap-2">
        <label htmlFor="new-task-due" className="sr-only">
          Due date
        </label>
        <input id="new-task-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={clsx(inputClass, 'w-full min-w-0 flex-1 px-2 text-xs [color-scheme:dark]')} />
        <label htmlFor="new-task-hours" className="sr-only">
          Estimated hours
        </label>
        <input id="new-task-hours" type="number" min={0.25} max={200} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} className={clsx(inputClass, 'num w-16 shrink-0 text-xs')} title="Estimated hours" />
        <Button type="submit" variant="secondary" icon="plus" busy={busy} disabled={!title.trim() || busy} aria-label="Add task" />
      </div>
    </form>
  );
}

export function TasksPanel({ d, index }: { d: Dashboard; index: number }) {
  const now = useNow(60_000);
  const flags = useMemo(() => checkTasks(d.tasks, { now, studyHoursPerDay: d.settings.studyHoursPerDay }), [d.tasks, now, d.settings.studyHoursPerDay]);
  const open = d.tasks.filter((t) => !t.done);
  const done = d.tasks.filter((t) => t.done);
  const ordered = [...open, ...done];
  const flipRef = useFlip<HTMLUListElement>(ordered.map((t) => `${t.id}:${t.done}`).join('|'));

  return (
    <Card title="Tasks" icon="check" index={index} className="md:col-span-6 lg:col-span-4" actions={<span className="num text-xs text-zinc-400">{open.length} open</span>}>
      {d.tasks.length === 0 ? (
        <Empty icon="check" title="Nothing on your list">
          Add a task, or ask the agent to plan your week around an exam or a project.
        </Empty>
      ) : (
        <ul ref={flipRef} className="scrollbar-thin -mr-2 flex max-h-[22rem] flex-col gap-1.5 overflow-y-auto pr-2">
          {ordered.map((t) => {
            const due = t.due ? parseDue(t.due) : null;
            const tFlags = flags.filter((f) => f.taskId === t.id);
            return (
              <li key={t.id} data-flip-key={t.id} className={clsx('tr rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-2.5', t.done && 'opacity-60')}>
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={(e) => void run(() => api.patch(`/tasks/${t.id}`, { done: e.target.checked }))}
                    aria-label={`Mark "${t.title}" as ${t.done ? 'not done' : 'done'}`}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-400"
                  />
                  <div className="min-w-0 flex-1">
                    <p className={clsx('text-sm leading-snug text-zinc-100', t.done && 'line-through decoration-zinc-500')}>{t.title}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
                      {due ? <UrgencyBadge urgency={t.done ? 'past' : urgencyOf(due, now)} text={describeCountdown(due, now)} /> : <span>No date</span>}
                      <span className="num">{t.estimateHours}h</span>
                      {t.postponedCount > 0 && <span>moved {t.postponedCount}×</span>}
                      {t.origin !== 'manual' && <SourceTag origin={t.origin} />}
                    </div>
                  </div>
                  {!t.done && (
                    <div className="flex shrink-0 gap-0.5">
                      {due && (
                        <button type="button" onClick={() => void run(() => api.patch(`/tasks/${t.id}`, { postpone: true }))} className="tr rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" aria-label={`Postpone "${t.title}" by one day`} title="Postpone one day">
                          <Icon name="arrowDown" size={14} />
                        </button>
                      )}
                      <button type="button" onClick={() => void run(() => api.del(`/tasks/${t.id}`))} className="tr rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-red-300" aria-label={`Delete "${t.title}"`} title="Delete">
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  )}
                </div>
                {!t.done && tFlags.map((f) => <FlagNote key={f.kind} flag={f} task={t} />)}
              </li>
            );
          })}
        </ul>
      )}
      <AddTask />
    </Card>
  );
}
