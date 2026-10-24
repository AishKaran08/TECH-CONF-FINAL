import { useEffect, useMemo, useRef } from 'react';
import { addDays, parseDateOnly, toDateOnly, weekdayIndex, type Dashboard } from '@runway/shared';
import { Icon } from '../components/Icon';
import { Button, Card, Empty, SourceLine } from '../components/ui';
import { clsx, rangeLabel } from '../lib/format';
import { useInView, useTween } from '../lib/motion';
import { openConnections } from '../panels/panelState';

const LEVELS = ['bg-zinc-800/80', 'bg-emerald-900', 'bg-emerald-700', 'bg-emerald-500', 'bg-emerald-300'];
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

function level(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  const r = count / max;
  if (r <= 0.25) return 1;
  if (r <= 0.5) return 2;
  if (r <= 0.75) return 3;
  return 4;
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  const v = useTween(value);
  return (
    <div className="min-w-0">
      <p className="num text-2xl font-medium leading-none text-zinc-50">
        {Math.round(v).toLocaleString()}
        {suffix && <span className="ml-1 text-sm text-zinc-400">{suffix}</span>}
      </p>
      <p className="mt-1.5 text-xs text-zinc-400">{label}</p>
    </div>
  );
}

export function GithubActivity({ d, index }: { d: Dashboard; index: number }) {
  const gh = d.github;
  const status = d.sources.find((s) => s.source === 'github');
  const [ref, inView] = useInView<HTMLDivElement>();
  const scroller = useRef<HTMLDivElement>(null);

  const grid = useMemo(() => {
    const cal = gh.calendar;
    if (!cal) return null;
    const byDate = new Map(cal.days.map((x) => [x.date, x.count]));
    const max = Math.max(1, ...cal.days.map((x) => x.count));
    const start = parseDateOnly(cal.from);
    const first = addDays(start, -weekdayIndex(start)); // align to Monday
    const end = parseDateOnly(cal.to);
    const weeks: { date: string; count: number; inRange: boolean }[][] = [];
    const months: { col: number; label: string }[] = [];
    for (let w = first, col = 0; w <= end; w = addDays(w, 7), col++) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        const day = addDays(w, i);
        const key = toDateOnly(day);
        week.push({ date: key, count: byDate.get(key) ?? 0, inRange: key >= cal.from && key <= cal.to });
        if (day.getDate() === 1 && key >= cal.from && key <= cal.to) months.push({ col, label: day.toLocaleDateString(undefined, { month: 'short' }) });
      }
      weeks.push(week);
    }
    return { weeks, months, max };
  }, [gh.calendar]);

  // Show the most recent weeks first on narrow screens.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [grid]);

  const basisNote =
    gh.calendar?.basis === 'graphql'
      ? 'Contribution calendar from GitHub'
      : gh.calendar?.basis === 'events'
        ? 'Built from public events only (GitHub keeps 90 days). Add a token in Connections for the full calendar.'
        : gh.calendar?.basis === 'demo'
          ? 'Sample activity'
          : '';

  return (
    <Card
      title="GitHub activity"
      icon="github"
      index={index}
      className="md:col-span-6 lg:col-span-6"
      actions={gh.profile && <a href={gh.profile.htmlUrl} target="_blank" rel="noreferrer" className="tr rounded-md px-1.5 py-0.5 text-xs text-zinc-400 hover:text-zinc-100">@{gh.profile.login}</a>}
      footer={gh.profile && <SourceLine origins={[d.mode === 'demo' ? 'demo' : 'github']} syncedAt={status?.lastSyncedAt} />}
    >
      {!gh.calendar || !grid ? (
        <Empty icon="github" title={gh.profile ? 'No public activity in the last 90 days' : 'Connect GitHub to see your activity'} action={!gh.profile && <Button size="sm" icon="plug" onClick={() => openConnections('github')}>Connect GitHub</Button>}>
          {gh.profile ? 'Push to a public repository, or add a token in Connections to include your full contribution calendar.' : 'A username is enough. Runway reads your public profile, repositories and events through the official API.'}
        </Empty>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat label={gh.calendar.basis === 'events' ? 'Commits and events' : 'Contributions'} value={gh.totals?.contributions ?? 0} />
            <Stat label="Active days" value={gh.totals?.activeDays ?? 0} />
            {gh.streak ? (
              <div className="min-w-0">
                <p className="num flex items-center gap-1.5 text-2xl font-medium leading-none text-zinc-50">
                  <Icon name="flame" size={18} className="text-emerald-300" />
                  <StreakValue v={gh.streak.current} />
                  <span className="text-sm text-zinc-400">{gh.streak.current === 1 ? 'day' : 'days'}</span>
                </p>
                <p className="mt-1.5 text-xs text-zinc-400">
                  Streak, longest <span className="num text-zinc-300">{gh.streak.longest}</span>
                </p>
              </div>
            ) : (
              <div className="text-xs leading-relaxed text-zinc-400">Streak hidden: not enough verified data yet.</div>
            )}
          </div>

          <div ref={ref} className={clsx('min-w-0', inView && 'in-view')}>
            <div ref={scroller} className="scrollbar-thin -mx-1 overflow-x-auto px-1 pb-2">
              <div
                role="img"
                aria-label={`${gh.totals?.contributions ?? 0} contributions on ${gh.totals?.activeDays ?? 0} active days, ${rangeLabel(gh.calendar.from, gh.calendar.to)}`}
                className="grid gap-y-[3px]"
                style={{ gridTemplateColumns: `1.75rem repeat(${grid.weeks.length}, minmax(0.625rem, 1.125rem))`, columnGap: '3px', minWidth: `${1.75 * 16 + grid.weeks.length * 13}px` }}
              >
                <span className="sticky left-0 z-10 bg-[#131316]" />
                {grid.weeks.map((_, col) => {
                  const m = grid.months.find((x) => x.col === col);
                  return (
                    <span key={col} className="h-3.5 overflow-visible whitespace-nowrap text-[0.625rem] leading-none text-zinc-400">
                      {m?.label ?? ''}
                    </span>
                  );
                })}
                {Array.from({ length: 7 }, (_, row) => (
                  <Row key={row} row={row} weeks={grid.weeks} max={grid.max} />
                ))}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.6875rem] text-zinc-400">
              <span>{rangeLabel(gh.calendar.from, gh.calendar.to)}</span>
              <span className="flex items-center gap-1" aria-hidden="true">
                Less
                {LEVELS.map((c) => (
                  <span key={c} className={clsx('h-2.5 w-2.5 rounded-[3px]', c)} />
                ))}
                More
              </span>
            </div>
            {basisNote && <p className="mt-2 text-xs leading-relaxed text-zinc-400">{basisNote}</p>}
            {gh.rateLimit && gh.rateLimit.remaining === 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-200">
                <Icon name="alert" size={12} /> GitHub's hourly limit is used up. Showing the last good snapshot until it resets.
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function StreakValue({ v }: { v: number }) {
  const t = useTween(v);
  return <>{Math.round(t)}</>;
}

function Row({ row, weeks, max }: { row: number; weeks: { date: string; count: number; inRange: boolean }[][]; max: number }) {
  return (
    <>
      <span className="sticky left-0 z-10 self-stretch bg-[#131316] pr-1 text-right text-[0.625rem] leading-[1.6] text-zinc-400">{DAY_LABELS[row]}</span>
      {weeks.map((week, col) => {
        const cell = week[row]!;
        if (!cell.inRange) return <span key={col} className="aspect-square w-full" />;
        const lvl = level(cell.count, max);
        return (
          <span
            key={col}
            title={`${cell.count} on ${new Date(`${cell.date}T00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`}
            className={clsx('cell aspect-square w-full rounded-[3px]', LEVELS[lvl])}
            style={{ transitionDelay: `${Math.min(col * 12, 500)}ms` }}
          />
        );
      })}
    </>
  );
}
