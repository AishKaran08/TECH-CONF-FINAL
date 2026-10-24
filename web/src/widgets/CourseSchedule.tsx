import { clockToMinutes, WEEKDAYS_SHORT, weekdayIndex, type Dashboard } from '@runway/shared';
import { Button, Card, Empty, SourceLine } from '../components/ui';
import { clsx } from '../lib/format';
import { useNow } from '../lib/motion';
import { openConnections } from '../panels/panelState';

const HOUR_PX = 34;
const TINTS = ['bg-emerald-500/15 border-emerald-400/40 text-emerald-100', 'bg-teal-500/15 border-teal-400/40 text-teal-100', 'bg-sky-500/15 border-sky-400/40 text-sky-100', 'bg-violet-500/15 border-violet-400/40 text-violet-100', 'bg-amber-500/10 border-amber-400/40 text-amber-100'];

function tintFor(title: string): string {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length]!;
}

export function CourseSchedule({ d, index }: { d: Dashboard; index: number }) {
  const now = useNow(60_000);
  const classes = d.classes;
  const days = [0, 1, 2, 3, 4, ...(classes.some((c) => c.day === 5) ? [5] : []), ...(classes.some((c) => c.day === 6) ? [6] : [])];
  const startH = classes.length ? Math.min(8, Math.floor(Math.min(...classes.map((c) => clockToMinutes(c.start))) / 60)) : 8;
  const endH = classes.length ? Math.max(17, Math.ceil(Math.max(...classes.map((c) => clockToMinutes(c.end))) / 60)) : 17;
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
  const today = weekdayIndex(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = nowMin >= startH * 60 && nowMin <= endH * 60;

  return (
    <Card
      title="Course schedule"
      icon="clock"
      index={index}
      className="md:col-span-6 lg:col-span-6"
      actions={<Button size="sm" variant="ghost" icon="plus" onClick={() => openConnections('timetable')} aria-label="Add a class">Add</Button>}
      footer={classes.length > 0 && <SourceLine origins={classes.map((c) => c.origin)} />}
    >
      {classes.length === 0 ? (
        <Empty icon="clock" title="Your week is empty" action={<Button size="sm" icon="plus" onClick={() => openConnections('timetable')}>Add classes</Button>}>
          Add your classes by hand or import a .ics file from your college portal or calendar app.
        </Empty>
      ) : (
        <div className="scrollbar-thin -mx-1 overflow-x-auto px-1">
          <div className="grid min-w-[520px]" style={{ gridTemplateColumns: `2.25rem repeat(${days.length}, minmax(0, 1fr))` }} role="table" aria-label="Weekly class schedule">
            <div role="row" className="contents">
              <span role="columnheader" />
              {days.map((di) => (
                <span key={di} role="columnheader" className={clsx('pb-2 text-center text-xs', di === today ? 'font-medium text-emerald-300' : 'text-zinc-400')}>
                  {WEEKDAYS_SHORT[di]}
                  {di === today && <span className="sr-only"> (today)</span>}
                </span>
              ))}
            </div>
            <div className="relative" style={{ height: hours.length * HOUR_PX }} aria-hidden="true">
              {hours.map((h, i) => (
                <span key={h} className="num absolute right-1.5 -translate-y-1/2 text-[0.625rem] text-zinc-400" style={{ top: i * HOUR_PX }}>
                  {String(h).padStart(2, '0')}
                </span>
              ))}
            </div>
            {days.map((di) => (
              <div key={di} role="row" className={clsx('relative border-l border-zinc-800/80', di === today && 'bg-emerald-400/[0.04]')} style={{ height: hours.length * HOUR_PX }}>
                {hours.map((h, i) => (
                  <span key={h} className="absolute inset-x-0 border-t border-zinc-800/50" style={{ top: i * HOUR_PX }} aria-hidden="true" />
                ))}
                {classes
                  .filter((c) => c.day === di)
                  .map((c) => {
                    const top = ((clockToMinutes(c.start) - startH * 60) / 60) * HOUR_PX;
                    const height = Math.max(18, ((clockToMinutes(c.end) - clockToMinutes(c.start)) / 60) * HOUR_PX - 3);
                    return (
                      <div
                        key={c.id}
                        role="cell"
                        className={clsx('absolute inset-x-1 overflow-hidden rounded-md border px-1.5 py-1 text-[0.6875rem] leading-tight', tintFor(c.title))}
                        style={{ top: top + 1.5, height }}
                        title={`${c.title}, ${WEEKDAYS_SHORT[di]} ${c.start}–${c.end}${c.location ? `, ${c.location}` : ''}`}
                      >
                        <p className="truncate font-medium">{c.title}</p>
                        {height > 30 && (
                          <p className="num truncate opacity-80">
                            {c.start}
                            {c.location ? ` ${c.location}` : ''}
                          </p>
                        )}
                        <span className="sr-only">
                          {WEEKDAYS_SHORT[di]} {c.start} to {c.end}
                          {c.location ? ` in ${c.location}` : ''}
                        </span>
                      </div>
                    );
                  })}
                {di === today && showNow && <span className="absolute inset-x-0 z-10 h-px bg-emerald-300" style={{ top: ((nowMin - startH * 60) / 60) * HOUR_PX }} aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
