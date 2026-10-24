import { useEffect, useRef, useState } from 'react';
import { RingArc } from '../components/Ring';
import { Button, Card } from '../components/ui';
import { clsx } from '../lib/format';
import { toast } from '../lib/store';

const MODES = { focus: { label: 'Focus', minutes: 25 }, break: { label: 'Break', minutes: 5 } } as const;
type Mode = keyof typeof MODES;

/** Pomodoro-style timer. Ticks once per second; based on wall-clock time so it stays accurate in background tabs. */
export function FocusTimer({ index }: { index: number }) {
  const [mode, setMode] = useState<Mode>('focus');
  const total = MODES[mode].minutes * 60;
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  const endAt = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const remaining = Math.max(0, Math.round(((endAt.current ?? Date.now()) - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        setRunning(false);
        endAt.current = null;
        toast(mode === 'focus' ? 'Focus session done. A short break helps it stick.' : 'Break is over. Ready when you are.', 'success');
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [running, mode]);

  const start = () => {
    endAt.current = Date.now() + left * 1000;
    setRunning(true);
  };
  const pause = () => {
    setRunning(false);
    endAt.current = null;
  };
  const reset = (m: Mode = mode) => {
    setRunning(false);
    endAt.current = null;
    setMode(m);
    setLeft(MODES[m].minutes * 60);
  };

  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');

  return (
    <Card title="Focus timer" icon="clock" index={index} className="md:col-span-3 lg:col-span-3">
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div role="radiogroup" aria-label="Timer mode" className="flex rounded-lg bg-zinc-950/60 p-0.5">
          {(Object.keys(MODES) as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => reset(m)}
              className={clsx('tr rounded-md px-3 py-1 text-xs', mode === m ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-200')}
            >
              {MODES[m].label} {MODES[m].minutes}m
            </button>
          ))}
        </div>
        <div className="relative">
          <svg viewBox="0 0 160 160" className="h-40 w-40" aria-hidden="true">
            <RingArc cx={80} cy={80} r={70} stroke={6} progress={left / total} color={mode === 'focus' ? '#34d399' : '#38bdf8'} animate={false} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="num text-4xl font-medium tracking-tight text-zinc-50" role="timer" aria-label={`${Math.floor(left / 60)} minutes ${left % 60} seconds left`}>
              {mm}:{ss}
            </span>
            <span className="mt-1 text-xs text-zinc-400">{running ? (mode === 'focus' ? 'Focusing' : 'On a break') : left === total ? 'Ready' : 'Paused'}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {running ? (
            <Button icon="pause" onClick={pause}>
              Pause
            </Button>
          ) : (
            <Button variant="primary" icon="play" onClick={start} disabled={left === 0}>
              {left === total ? 'Start' : 'Resume'}
            </Button>
          )}
          <Button variant="ghost" icon="reset" onClick={() => reset()} disabled={left === total && !running} aria-label="Reset timer">
            Reset
          </Button>
        </div>
      </div>
    </Card>
  );
}
