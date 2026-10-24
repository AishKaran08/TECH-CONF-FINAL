import { describeCountdown, parseDue, urgencyOf, type Dashboard, type DeadlineKind } from '@runway/shared';
import { Icon } from '../components/Icon';
import { Button, Card, Empty, SourceLine, SourceTag, UrgencyBadge } from '../components/ui';
import { clsx } from '../lib/format';
import { useNow } from '../lib/motion';
import { openConnections } from '../panels/panelState';

const KIND_LABEL: Record<DeadlineKind, string> = { exam: 'Exam', project: 'Project', assignment: 'Assignment', other: 'Deadline' };

export function ExamTimetable({ d, index }: { d: Dashboard; index: number }) {
  // Countdowns refresh once a minute: no per-second ticking.
  const now = useNow(60_000);
  const upcoming = d.deadlines.filter((x) => parseDue(x.due).getTime() > now.getTime() - 12 * 3600_000).slice(0, 8);

  return (
    <Card
      title="Academic exam timetable"
      icon="calendar"
      index={index}
      className="md:col-span-6 lg:col-span-4"
      actions={<Button size="sm" variant="ghost" icon="plus" onClick={() => openConnections('timetable')} aria-label="Add an exam or deadline">Add</Button>}
      footer={upcoming.length > 0 && <SourceLine origins={upcoming.map((u) => u.origin)} extra={<span>Countdowns update every minute</span>} />}
    >
      {upcoming.length === 0 ? (
        <Empty icon="calendar" title="No upcoming exams or deadlines" action={<Button size="sm" icon="plus" onClick={() => openConnections('timetable')}>Add exam dates</Button>}>
          Add dates yourself or import a .ics calendar file. Countdowns only ever come from dates you enter.
        </Empty>
      ) : (
        <ol className="flex flex-col gap-2">
          {upcoming.map((x) => {
            const due = parseDue(x.due);
            const urgency = urgencyOf(due, now);
            return (
              <li key={x.id} className={clsx('tr flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-2.5', urgency === 'past' && 'opacity-60')}>
                <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-zinc-900 py-1.5" aria-hidden="true">
                  <span className="text-[0.625rem] text-zinc-400">{due.toLocaleDateString(undefined, { month: 'short' })}</span>
                  <span className="num text-lg font-medium leading-tight text-zinc-50">{due.getDate()}</span>
                  <span className="text-[0.625rem] text-zinc-400">{due.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-100">{x.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400">
                    <span>{KIND_LABEL[x.kind]}</span>
                    <span className="num">{due.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                    {x.location && (
                      <span className="flex items-center gap-0.5">
                        <Icon name="map" size={11} />
                        {x.location}
                      </span>
                    )}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <UrgencyBadge urgency={urgency} text={describeCountdown(due, now)} />
                    {x.origin !== 'manual' && <SourceTag origin={x.origin} />}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
