import { useState } from 'react';
import { radarHasData, type Dashboard, type RadarAxis } from '@runway/shared';
import { Card, Empty, SourceLine } from '../components/ui';
import { clsx, pluralize } from '../lib/format';
import { useInView } from '../lib/motion';

const SIZE = 220;
const C = SIZE / 2;
const R = 78;

function point(i: number, n: number, r: number): [number, number] {
  const a = (Math.PI * 2 * i) / n - Math.PI / 2;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function evidenceText(a: RadarAxis): string {
  const parts: string[] = [];
  if (a.evidence.repos) parts.push(pluralize(a.evidence.repos, 'repo'));
  if (a.evidence.commits) parts.push(pluralize(a.evidence.commits, 'commit'));
  if (a.evidence.submissions) parts.push(pluralize(a.evidence.submissions, 'submission'));
  if (a.evidence.logs) parts.push(pluralize(a.evidence.logs, 'logged problem'));
  return parts.length ? parts.join(', ') : 'No activity in this area';
}

export function ActivityRadar({ d, index }: { d: Dashboard; index: number }) {
  const axes = d.radar;
  const [ref, inView] = useInView<HTMLDivElement>();
  const [focus, setFocus] = useState<number | null>(null);
  const has = radarHasData(axes);
  const n = axes.length;
  const top = axes.reduce((best, a, i) => (a.share > (axes[best]?.share ?? -1) ? i : best), 0);
  const shown = axes[focus ?? top];
  const origins = d.mode === 'demo' ? (['demo'] as const) : ([...(d.github.profile ? ['github' as const] : []), ...(d.codeforces.user ? ['codeforces' as const] : []), ...(d.leetcode ? ['manual' as const] : [])]);

  return (
    <Card
      title="Share of recent activity"
      icon="target"
      index={index}
      className="md:col-span-3 lg:col-span-3"
      footer={has && <SourceLine origins={[...origins]} extra={<span>Last 90 days, scaled to your busiest area</span>} />}
    >
      {!has ? (
        <Empty icon="target" title="No recent activity to compare yet">
          This shows where your last 90 days went, based on repo languages and topics, Codeforces tags and problems you log. It is not a skill score.
        </Empty>
      ) : (
        <div ref={ref} className="flex flex-1 flex-col items-center">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[240px]" role="img" aria-label={`Activity share: ${axes.map((a) => `${a.axis} ${Math.round(a.share * 100)} percent of busiest`).join(', ')}`}>
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <polygon key={f} points={axes.map((_, i) => point(i, n, R * f).join(',')).join(' ')} fill="none" stroke="#27272a" strokeWidth={1} />
            ))}
            {axes.map((_, i) => {
              const [x, y] = point(i, n, R);
              return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="#27272a" strokeWidth={1} />;
            })}
            <g className="tr" style={{ transformOrigin: `${C}px ${C}px`, transform: inView ? 'scale(1)' : 'scale(0.2)', opacity: inView ? 1 : 0, transitionDuration: '0.9s' }}>
              <polygon points={axes.map((a, i) => point(i, n, R * Math.max(0.04, a.share)).join(',')).join(' ')} fill="rgb(45 212 191 / 0.18)" stroke="#2dd4bf" strokeWidth={1.5} strokeLinejoin="round" />
              {axes.map((a, i) => {
                const [x, y] = point(i, n, R * Math.max(0.04, a.share));
                return <circle key={i} cx={x} cy={y} r={focus === i ? 4 : 2.5} fill="#5eead4" />;
              })}
            </g>
            {axes.map((a, i) => {
              const [x, y] = point(i, n, R + 18);
              return (
                <g
                  key={a.axis}
                  tabIndex={0}
                  role="button"
                  aria-label={`${a.axis}: ${evidenceText(a)}`}
                  onMouseEnter={() => setFocus(i)}
                  onMouseLeave={() => setFocus(null)}
                  onFocus={() => setFocus(i)}
                  onBlur={() => setFocus(null)}
                  className="cursor-default outline-none"
                >
                  <title>{`${a.axis}: ${evidenceText(a)}`}</title>
                  <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" className={clsx('text-[9.5px]', focus === i ? 'fill-zinc-50' : 'fill-zinc-400')}>
                    {a.axis}
                  </text>
                </g>
              );
            })}
          </svg>
          {shown && (
            <p className="mt-2 min-h-[2.5rem] text-center text-xs leading-relaxed text-zinc-400" aria-live="polite">
              <span className="font-medium text-zinc-200">{shown.axis}</span>
              <br />
              {evidenceText(shown)}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
