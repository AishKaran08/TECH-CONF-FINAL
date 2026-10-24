import { useEffect, useRef, useState } from 'react';
import type { Briefing, Dashboard } from '@runway/shared';
import { Button, Card, Skeleton, SourceTag } from '../components/ui';
import { api } from '../lib/api';
import { refresh, toast } from '../lib/store';
import { openAgent } from '../panels/panelState';
import { requireAiNotice } from '../panels/AiNotice';
import { WeekStrip } from './WeekStrip';

function BriefingText({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      items.push(
        <ul key={`u${items.length}`} className="flex flex-col gap-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-zinc-200">
              <span className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-emerald-300" aria-hidden="true" />
              <span>{b}</span>
            </li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const l of lines) {
    if (/^[-*•]\s+/.test(l)) bullets.push(l.replace(/^[-*•]\s+/, ''));
    else {
      flush();
      items.push(
        <p key={`p${items.length}`} className="text-sm leading-relaxed text-zinc-300">
          {l}
        </p>,
      );
    }
  }
  flush();
  return <div className="flex max-w-[72ch] flex-col gap-3">{items}</div>;
}

const BY_LABEL: Record<Briefing['generatedBy'], string> = { ai: 'Written by the agent', heuristic: 'Written by the local planner', user: 'Edited by you', demo: 'Demo data' };

export function TodayBriefing({ d, index }: { d: Dashboard; index: number }) {
  const b = d.briefing;
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const asked = useRef(false);

  const generate = async (auto = false) => {
    if (!auto && !(await requireAiNotice())) return;
    setBusy(true);
    try {
      await api.post('/briefing', { auto });
      await refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Write today's plan automatically the first time the dashboard opens each day.
  useEffect(() => {
    if (!b && !asked.current) {
      asked.current = true;
      void generate(true);
    }
     
  }, [b]);

  const today = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <Card
      title={`Today, ${today}`}
      icon="spark"
      index={index}
      className="md:col-span-6 lg:col-span-8"
      actions={
        b && !b.dismissed && !editing ? (
          <>
            <Button size="sm" variant="ghost" icon="edit" onClick={() => { setDraft(b.text); setEditing(true); }}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" icon="sync" busy={busy} onClick={() => void generate()} aria-label="Write a new plan">
              <span className="hidden sm:inline">Rewrite</span>
            </Button>
            <Button size="sm" variant="ghost" icon="x" onClick={() => void api.post('/briefing/dismiss').then(refresh)} aria-label="Dismiss today's plan" />
          </>
        ) : undefined
      }
      footer={b && !b.dismissed && (
        <p className="flex flex-wrap items-center gap-2">
          {b.generatedBy === 'demo' ? <SourceTag origin="demo" /> : <span>{BY_LABEL[b.generatedBy]}</span>}
          <span>Suggestions only. Change anything that does not fit your day.</span>
        </p>
      )}
    >
      {busy && !b ? (
        <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Writing today's plan">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : editing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await api.put('/briefing', { text: draft });
            setEditing(false);
            await refresh();
          }}
        >
          <label htmlFor="briefing-edit" className="sr-only">
            Today's plan
          </label>
          <textarea id="briefing-edit" value={draft} onChange={(e) => setDraft(e.target.value)} rows={6} maxLength={2000} className="control scrollbar-thin w-full resize-y rounded-lg bg-zinc-900 p-3 text-sm leading-relaxed text-zinc-100" />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm">
              Save plan
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : b && !b.dismissed ? (
        <BriefingText text={b.text} />
      ) : (
        <div className="flex flex-1 flex-col items-start justify-center gap-3">
          <p className="text-sm text-zinc-300">{b?.dismissed ? 'Plan put away for today.' : 'No plan for today yet.'}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon="spark" busy={busy} onClick={() => void generate()}>
              {b?.dismissed ? 'Bring it back' : "Write today's plan"}
            </Button>
            <Button size="sm" variant="ghost" icon="send" onClick={() => openAgent('Plan my week')}>
              Plan my week
            </Button>
          </div>
        </div>
      )}
      <WeekStrip d={d} />
    </Card>
  );
}
