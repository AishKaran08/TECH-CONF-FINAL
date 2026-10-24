import { describe, expect, it } from 'vitest';
import { EventHub } from './events';
import { SortService } from './sort';
import { createJsonStore } from './store';
import { Workspace } from './workspace';
import { buildDashboard } from './dashboard';

function setup() {
  const ws = new Workspace(createJsonStore(null), new EventHub(), { aiAvailable: false, model: 'm', defaultSyncInterval: 15 });
  ws.setDemoMode(true);
  ws.updateSettings({ targetRole: 'Backend internship' });
  return { ws, sort: new SortService(ws) };
}

describe('SortService', () => {
  it('previews moves in three scopes with reasons, then applies and undoes', async () => {
    const { ws, sort } = setup();
    const before = buildDashboard(ws);
    const p = await sort.preview();
    expect(p.scopes.map((s) => s.scope)).toEqual(['tasks', 'projects', 'skills']);
    const tasks = p.scopes[0]!;
    expect(tasks.moves.length).toBeGreaterThan(0);
    expect(tasks.after[0]).toBe('demo-t3'); // CN quiz is due first
    const projects = p.scopes[1]!;
    expect(projects.method).toBe('heuristic');
    expect(projects.after[0]).toBe('gh:900000'); // campus-eats-api for backend
    expect(projects.reasons['gh:900000']).toMatch(/Backend match/);
    expect(p.flags.some((f) => f.kind === 'postponed_often')).toBe(true);
    expect(p.bullets.length).toBeGreaterThan(0);

    sort.apply(p.id);
    const after = buildDashboard(ws);
    expect(after.tasks[0]!.id).toBe('demo-t3');
    expect(after.projects[0]!.id).toBe('gh:900000');
    expect(after.canUndoSort).toBe(true);
    expect(sort.apply(p.id)).toBeNull(); // used once

    sort.undo();
    expect(buildDashboard(ws).tasks.map((t) => t.id)).toEqual(before.tasks.map((t) => t.id));
    expect(sort.undo()).toBeNull();
  });

  it('falls back to keyword ranking when the AI ranker fails', async () => {
    const ws = new Workspace(createJsonStore(null), new EventHub(), { aiAvailable: true, model: 'm', defaultSyncInterval: 15 });
    ws.setDemoMode(true);
    ws.updateSettings({ aiNoticeAck: true, targetRole: 'backend' });
    const sort = new SortService(ws, async () => {
      throw new Error('down');
    });
    expect((await sort.preview()).scopes[1]!.method).toBe('heuristic');
  });
});
