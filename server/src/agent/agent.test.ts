import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AgentStep, ServerEvent } from '@runway/shared';
import { EventHub } from '../events';
import type { Services } from '../services';
import { SortService } from '../sort';
import { createJsonStore } from '../store';
import { SyncService } from '../sync';
import { Workspace } from '../workspace';
import { AgentService } from './agent';
import { parseRelativeDeadlines, roleFromMessage } from './local';

function setup() {
  const hub = new EventHub();
  const ws = new Workspace(createJsonStore(null), hub, { aiAvailable: false, model: 'm', defaultSyncInterval: 15 });
  const s: Services = { ws, hub };
  s.sort = new SortService(ws);
  s.sync = new SyncService(ws, hub, {});
  const agent = new AgentService(s, null);
  const events: ServerEvent[] = [];
  hub.subscribe((e) => events.push(e));
  return { ws, hub, agent, events, s };
}

/** Run the agent, auto-answering confirmations, and return the final steps. */
async function drive(agent: AgentService, hub: EventHub, message: string, approve: (step: Extract<AgentStep, { kind: 'confirm' }>) => boolean) {
  const steps: AgentStep[] = [];
  const runId = randomUUID();
  const done = new Promise<void>((resolve) => {
    hub.subscribe((e) => {
      if (e.type === 'agent.step' && e.runId === runId) {
        steps[e.index] = e.step;
        if (e.step.kind === 'confirm' && e.step.status === 'pending') setTimeout(() => agent.confirm(runId, e.step.kind === 'confirm' ? e.step.callId : '', approve(e.step as never)), 0);
      }
      if (e.type === 'agent.done' && e.runId === runId) resolve();
    });
  });
  agent.start(message, runId);
  await done;
  return steps;
}

describe('local agent', () => {
  it('parses relative deadlines and roles', () => {
    expect(parseRelativeDeadlines('I have an exam in 6 days and a project due in 4, plan my week')).toEqual([
      { kind: 'exam', title: 'Exam', days: 6 },
      { kind: 'project', title: 'Project', days: 4 },
    ]);
    expect(parseRelativeDeadlines('OS exam in six days and a project due in 4 days')).toEqual([
      { kind: 'exam', title: 'OS exam', days: 6 },
      { kind: 'project', title: 'Project', days: 4 },
    ]);
    expect(roleFromMessage('which projects should I put first for a backend internship?')).toBe('backend internship');
    expect(roleFromMessage('what is missing from my resume for a data role?')).toBe('data');
  });

  it('plans a week: adds dates and prep tasks only after approval, then checks the fit', async () => {
    const { ws, agent, hub } = setup();
    const steps = await drive(agent, hub, 'I have an exam in 6 days and a project due in 4 days, plan my week', () => true);
    const confirms = steps.filter((s) => s.kind === 'confirm');
    expect(confirms.map((c) => c.kind === 'confirm' && c.tool)).toEqual(['add_deadline', 'add_deadline', 'create_task', 'create_task']);
    expect(confirms.every((c) => c.kind === 'confirm' && c.status === 'approved')).toBe(true);
    expect(ws.deadlines()).toHaveLength(2);
    expect(ws.tasks()).toHaveLength(2);
    const last = steps[steps.length - 1]!;
    expect(last.kind).toBe('text');
    expect(last.kind === 'text' && last.text).toMatch(/week/);
    expect(steps.filter((s) => s.kind === 'tool' || s.kind === 'confirm').length).toBeLessThanOrEqual(8 + 4);
  });

  it('changes nothing when the user rejects', async () => {
    const { ws, agent, hub } = setup();
    await drive(agent, hub, 'I have an exam in 6 days, plan my week', () => false);
    expect(ws.deadlines()).toHaveLength(0);
    expect(ws.tasks()).toHaveLength(0);
  });

  it('ranks projects for a role and asks before reordering', async () => {
    const { ws, agent, hub } = setup();
    ws.setDemoMode(true);
    const steps = await drive(agent, hub, 'which projects should I put first for a backend internship?', () => true);
    const tools = steps.filter((s) => s.kind === 'confirm').map((s) => s.kind === 'confirm' && s.tool);
    expect(tools).toEqual(['set_target_role', 'reorder']);
    expect(ws.settings().targetRole).toBe('backend internship');
    const text = steps.find((s) => s.kind === 'text');
    expect(text?.kind === 'text' && text.text).toMatch(/campus-eats-api/);
  });

  it('reports resume gaps for a data role', async () => {
    const { ws, agent, hub } = setup();
    ws.setDemoMode(true);
    const steps = await drive(agent, hub, 'what is missing from my resume for a data role?', () => true);
    const text = steps.filter((s) => s.kind === 'text').pop();
    expect(text?.kind === 'text' && text.text).toMatch(/Not mentioned yet: .*Pandas/);
  });

  it('syncs only after approval and reports what changed', async () => {
    const { ws, agent, hub } = setup();
    ws.setDemoMode(true);
    const steps = await drive(agent, hub, 'sync everything and tell me what changed', () => true);
    expect(steps.some((s) => s.kind === 'confirm' && s.tool === 'run_sync' && s.status === 'approved')).toBe(true);
    const text = steps.filter((s) => s.kind === 'text').pop();
    expect(text?.kind === 'text' && text.text).toMatch(/Sync finished/);
  }, 15000);
});
