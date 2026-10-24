import { useMemo } from 'react';
import { planWeek, type Dashboard } from '@runway/shared';
import { Icon } from '../components/Icon';
import { clsx } from '../lib/format';
import { useNow } from '../lib/motion';

/** Seven-day view from the local planner: planned hours vs free hours, and dated deadlines. */
export function WeekStrip({ d }: { d: Dashboard }) {
  const now = useNow(60_000);
  const week = useMemo(() => planWeek(d.tasks, d.deadlines, { now, studyHoursPerDay: d.settings.studyHoursPerDay }), [d.tasks, d.deadlines, now, d.settings.studyHoursPerDay]);
  const maxCap = Math.max(1, d.settings.studyHoursPerDay);

  return (
    <div className="mt-auto pt-5">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium text-zinc-300">This week</h3>
        <p className={clsx('flex items-center gap-1 text-xs', week.fits ? 'text-zinc-400' : 'text-amber-200')}>
          <Icon name={week.fits ? 'checkCircle' : 'alert'} size={12} />
          {week.fits ? (
            <span>
              Fits: <span className="num">{week.totalNeeded}h</span> planned of <span className="num">{week.totalFree}h</span> free
            </span>
          ) : (
            <span>
              Tight: about <span className="num">{week.shortfalls.reduce((s, x) => s + x.hoursShort, 0).toFixed(1)}h</span> more than fits before the deadlines
            </span>
          )}
        </p>
      </div>
      <ol className="grid grid-cols-7 gap-1.5" aria-label="Planned hours for the next seven days">
        {week.days.map((day, i) => {
          const planned = day.blocks.reduce((s, b) => s + b.hours, 0);
          const capPct = Math.min(1, day.capacityHours / maxCap);
          const usedPct = Math.min(1, planned / maxCap);
          const label = i === 0 ? 'Today' : new Date(`${day.date}T00:00`).toLocaleDateString(undefined, { weekday: 'short' });
          const desc = `${label}: ${planned.toFixed(1)} of ${day.capacityHours} free hours planned${day.deadlines.length ? `; due: ${day.deadlines.map((x) => x.title).join(', ')}` : ''}${day.blocks.length ? `; work on ${day.blocks.map((b) => b.title).join(', ')}` : ''}`;
          return (
            <li key={day.date} className="flex min-w-0 flex-col items-center gap-1.5" title={desc} aria-label={desc}>
              <div className="relative flex h-14 w-full items-end overflow-hidden rounded-md bg-zinc-800/50" aria-hidden="true">
                <div className="absolute inset-x-0 bottom-0 bg-zinc-700/40" style={{ height: `${capPct * 100}%` }} />
                <div className="tr relative w-full origin-bottom rounded-t-[3px] bg-emerald-400/80" style={{ height: '100%', transform: `scaleY(${usedPct})` }} />
              </div>
              <span className={clsx('text-[0.6875rem]', i === 0 ? 'font-medium text-zinc-100' : 'text-zinc-400')}>{label}</span>
              <span className="num text-[0.625rem] text-zinc-400">{planned ? `${planned.toFixed(planned % 1 ? 1 : 0)}h` : '–'}</span>
              {day.deadlines.length > 0 && (
                <span className="flex items-center gap-0.5 text-[0.625rem] text-amber-200">
                  <Icon name="calendar" size={10} />
                  {day.deadlines.length}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
