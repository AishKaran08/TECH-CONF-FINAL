import type { Dashboard } from '@runway/shared';
import { RingArc } from '../components/Ring';
import { Button, Card, Empty, SourceLine } from '../components/ui';
import { useInView, useTween } from '../lib/motion';
import { openConnections } from '../panels/panelState';

const ROWS = [
  { key: 'easy', total: 'totalEasy', label: 'Easy', color: '#2dd4bf', dot: 'bg-teal-400' },
  { key: 'medium', total: 'totalMedium', label: 'Medium', color: '#fbbf24', dot: 'bg-amber-400' },
  { key: 'hard', total: 'totalHard', label: 'Hard', color: '#fb7185', dot: 'bg-rose-400' },
] as const;

function Count({ v }: { v: number }) {
  const t = useTween(v);
  return <>{Math.round(t)}</>;
}

export function LeetcodeProgress({ d, index }: { d: Dashboard; index: number }) {
  const lc = d.leetcode;
  const [ref, inView] = useInView<HTMLDivElement>();
  const solved = lc ? lc.easy + lc.medium + lc.hard : 0;
  const total = lc ? lc.totalEasy + lc.totalMedium + lc.totalHard : 0;

  return (
    <Card
      title="LeetCode progress"
      icon="code"
      index={index}
      className="md:col-span-3 lg:col-span-3"
      actions={lc && <Button size="sm" variant="ghost" icon="edit" onClick={() => openConnections('leetcode')} aria-label="Update LeetCode counts">Update</Button>}
      footer={lc && <SourceLine origins={[d.mode === 'demo' ? 'demo' : 'manual']} syncedAt={lc.updatedAt} verb="updated" />}
    >
      {!lc ? (
        <Empty icon="code" title="Add your solved counts" action={<Button size="sm" icon="plus" onClick={() => openConnections('leetcode')}>Enter counts</Button>}>
          LeetCode does not offer a public API, so Runway never scrapes it. Enter your Easy, Medium and Hard counts yourself.
        </Empty>
      ) : (
        <div ref={ref} className="flex flex-1 flex-col items-center gap-4 sm:flex-row lg:flex-col 2xl:flex-row">
          <div className="relative shrink-0">
            <svg viewBox="0 0 140 140" className="h-36 w-36" role="img" aria-label={`${solved} of ${total} problems solved: ${lc.easy} easy, ${lc.medium} medium, ${lc.hard} hard`}>
              {ROWS.map((row, i) => (
                <RingArc key={row.key} cx={70} cy={70} r={62 - i * 14} stroke={9} progress={lc[row.key] / Math.max(1, lc[row.total])} color={row.color} visible={inView} delayMs={i * 120} />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="num text-xl font-medium text-zinc-50">
                <Count v={solved} />
              </span>
              <span className="text-[0.625rem] text-zinc-400">solved</span>
            </div>
          </div>
          <ul className="flex w-full max-w-[16rem] flex-col gap-2.5">
            {ROWS.map((row) => (
              <li key={row.key} className="flex items-center gap-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${row.dot}`} aria-hidden="true" />
                <span className="flex-1 text-zinc-300">{row.label}</span>
                <span className="num text-zinc-50">
                  <Count v={lc[row.key]} />
                </span>
                <span className="num whitespace-nowrap text-xs text-zinc-400">/ {lc[row.total]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
