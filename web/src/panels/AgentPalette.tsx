import { useEffect, useRef, useState } from 'react';
import { APP_NAME, type AgentStep } from '@runway/shared';
import { Icon } from '../components/Icon';
import { Button, Modal } from '../components/ui';
import { api } from '../lib/api';
import { clsx } from '../lib/format';
import { clearAgentRuns, startAgentRun, toast, useApp, type AgentRun } from '../lib/store';
import { requireAiNotice } from './AiNotice';
import { closeAgent, usePanels } from './panelState';

const EXAMPLES = [
  'I have an exam in 6 days and a project due in 4, plan my week',
  'Sync everything and tell me what changed',
  'Which projects should I put first for a backend internship?',
  'What is missing from my resume for a data role?',
];

const TOOL_LABEL: Record<string, string> = {
  get_profile: 'Read your profile',
  get_deadlines: 'Read your dates',
  list_tasks: 'Read your tasks',
  get_activity: 'Read recent activity',
  check_week_fit: 'Checked how the week fits',
  create_task: 'Create task',
  update_task: 'Update task',
  reorder: 'Reorder',
  add_deadline: 'Add date',
  set_target_role: 'Set target role',
  run_sync: 'Sync',
};

function Text({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm leading-relaxed text-zinc-100">
      {text.split('\n').filter(Boolean).map((l, i) =>
        /^[-*•]\s/.test(l) ? (
          <p key={i} className="flex gap-2 pl-1">
            <span className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-emerald-300" aria-hidden="true" />
            <span>{l.replace(/^[-*•]\s/, '')}</span>
          </p>
        ) : (
          <p key={i}>{l}</p>
        ),
      )}
    </div>
  );
}

function Step({ run, step }: { run: AgentRun; step: AgentStep }) {
  const [busy, setBusy] = useState(false);
  if (step.kind === 'text') return <Text text={step.text} />;
  if (step.kind === 'thinking') return <p className="text-xs italic text-zinc-400">{step.text}</p>;
  if (step.kind === 'tool')
    return (
      <p className="flex items-center gap-2 text-xs text-zinc-400">
        <Icon name={step.status === 'done' ? 'check' : step.status === 'error' ? 'alertCircle' : 'sync'} size={13} className={clsx(step.status === 'done' && 'text-emerald-300', step.status === 'error' && 'text-red-300', step.status === 'running' && 'animate-spin motion-reduce:animate-none')} />
        <span className="text-zinc-300">{TOOL_LABEL[step.tool] ?? step.tool}</span>
        {step.summary && <span className="truncate">{step.summary}</span>}
      </p>
    );
  const answer = async (approve: boolean) => {
    setBusy(true);
    try {
      await api.post(`/agent/${run.runId}/confirm`, { callId: step.callId, approve });
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={clsx('rounded-xl border p-3', step.status === 'pending' ? 'border-amber-400/40 bg-amber-500/5' : 'border-zinc-800 bg-zinc-900/50')}>
      <p className="mb-1 text-xs text-zinc-400">{step.status === 'pending' ? 'Approve this change?' : step.status === 'approved' ? 'Approved' : step.status === 'rejected' ? 'Rejected, nothing changed' : 'No answer, nothing changed'}</p>
      <p className="text-sm text-zinc-100">{step.description}</p>
      {step.status === 'pending' && (
        <div className="mt-2.5 flex gap-2">
          <Button size="sm" variant="primary" icon="check" disabled={busy} onClick={() => void answer(true)}>
            Approve
          </Button>
          <Button size="sm" variant="ghost" icon="x" disabled={busy} onClick={() => void answer(false)}>
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

export function AgentPalette() {
  const { agent, agentPrompt } = usePanels();
  const runs = useApp((s) => s.agentRuns);
  const ai = useApp((s) => (s.dashboard ? s.dashboard.settings.aiAvailable && !s.dashboard.settings.localOnly : false));
  const [text, setText] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const running = runs.some((r) => r.status === 'running');

  useEffect(() => {
    if (agent) {
      setText(agentPrompt);
      setTimeout(() => input.current?.focus(), 30);
    }
  }, [agent, agentPrompt]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [runs]);

  const send = async (message: string) => {
    const m = message.trim();
    if (m.length < 2 || running) return;
    if (!(await requireAiNotice())) return;
    const runId = crypto.randomUUID();
    startAgentRun(runId, m);
    setText('');
    try {
      await api.post('/agent', { message: m, runId });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  return (
    <Modal open={agent} onClose={closeAgent} title={`Ask ${APP_NAME}`} wide>
      <div className="flex flex-col gap-4">
        {runs.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-zinc-300">Plan, sort or sync in plain words. Nothing changes until you approve it.</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" onClick={() => void send(e)} className="control tr rounded-lg bg-zinc-900/70 px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800">
                  {e}
                </button>
              ))}
            </div>
            {!ai && <p className="text-xs text-zinc-400">AI is off, so the local planner answers these requests with the same steps and approvals.</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-5" aria-live="polite">
            {runs.map((r) => (
              <article key={r.runId} className="flex flex-col gap-2.5">
                <p className="self-end rounded-xl bg-zinc-800 px-3 py-2 text-sm text-zinc-100">{r.prompt}</p>
                {r.steps.filter(Boolean).map((s, i) => (
                  <Step key={i} run={r} step={s} />
                ))}
                {r.liveText && <Text text={r.liveText} />}
                {r.status === 'running' && !r.steps.some((s) => s?.kind === 'confirm' && s.status === 'pending') && (
                  <p className="flex items-center gap-2 text-xs text-zinc-400">
                    <Icon name="sync" size={13} className="animate-spin motion-reduce:animate-none" /> Working
                  </p>
                )}
                {r.status === 'error' && <p className="text-xs text-red-200">{r.error ?? 'The agent stopped unexpectedly.'}</p>}
              </article>
            ))}
            <div ref={end} />
          </div>
        )}
        <form
          className="sticky bottom-0 flex items-end gap-2 bg-zinc-950/95 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <label htmlFor="agent-input" className="sr-only">
            Message
          </label>
          <textarea
            id="agent-input"
            ref={input}
            rows={2}
            value={text}
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            placeholder="I have an exam in 6 days…"
            className="control scrollbar-thin min-h-[2.75rem] flex-1 resize-none rounded-lg bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-400"
          />
          {runs.length > 0 && !running && <Button variant="ghost" icon="trash" onClick={clearAgentRuns} aria-label="Clear conversation" />}
          <Button type="submit" variant="primary" icon="send" disabled={running || text.trim().length < 2} aria-label="Send" />
        </form>
      </div>
    </Modal>
  );
}
