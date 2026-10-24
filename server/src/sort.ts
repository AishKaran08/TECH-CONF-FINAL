import { randomUUID } from 'node:crypto';
import {
  applyOrder,
  buildScopePreview,
  checkTasks,
  orderBullets,
  orderTasks,
  rankProjectsHeuristic,
  rankSkills,
  taskOrderReason,
  type Orders,
  type PortfolioProject,
  type Skill,
  type SortPreview,
  type SortScope,
} from '@runway/shared';
import { buildDashboard } from './dashboard';
import type { Workspace } from './workspace';

export type AiProjectRanker = (projects: PortfolioProject[], role: string, skills: Skill[]) => Promise<{ id: string; score: number; reason: string }[]>;

interface Stored {
  preview: SortPreview;
  next: Orders;
}

/** Smart sort: preview what moves and why, apply it (with an undo stack), or undo. */
export class SortService {
  private previews = new Map<string, Stored>();

  constructor(
    private readonly ws: Workspace,
    private readonly aiRank?: AiProjectRanker,
  ) {}

  async preview(now = new Date()): Promise<SortPreview> {
    const d = buildDashboard(this.ws, now);
    const role = d.settings.targetRole || 'Software engineer';

    // (a) tasks: deterministic earliest-deadline-first + slack check
    const tasksBefore = d.tasks.map((t) => t.id);
    const tasksAfter = orderTasks(d.tasks).map((t) => t.id);
    const taskReasons = Object.fromEntries(d.tasks.map((t) => [t.id, taskOrderReason(t, now)]));
    const taskLabels = Object.fromEntries(d.tasks.map((t) => [t.id, t.title]));

    // (b) projects: relevance to the target role (AI when enabled, keyword overlap otherwise)
    let ranked = rankProjectsHeuristic(d.projects, role, d.skills, now);
    let method: 'ai' | 'heuristic' = 'heuristic';
    if (this.aiRank && this.ws.aiEnabled() && d.projects.length > 1) {
      try {
        const ai = await this.aiRank(d.projects, role, d.skills);
        const known = new Set(d.projects.map((p) => p.id));
        const valid = ai.filter((r) => known.has(r.id));
        if (valid.length) {
          const seen = new Set(valid.map((r) => r.id));
          ranked = [...valid.sort((a, b) => b.score - a.score), ...ranked.filter((r) => !seen.has(r.id))];
          method = 'ai';
        }
      } catch (err) {
        console.warn('[sort] AI ranking failed, using keyword overlap:', (err as Error).message);
      }
    }
    const projReasons = Object.fromEntries(ranked.map((r) => [r.id, r.reason]));
    const projLabels = Object.fromEntries(d.projects.map((p) => [p.id, p.name]));

    // (c) skills by evidence strength and recency
    const sk = rankSkills(d.skills);

    const preview: SortPreview = {
      id: randomUUID(),
      createdAt: now.toISOString(),
      targetRole: role,
      scopes: [
        buildScopePreview('tasks', tasksBefore, tasksAfter, taskLabels, taskReasons, 'deterministic'),
        buildScopePreview('projects', d.projects.map((p) => p.id), ranked.map((r) => r.id), projLabels, projReasons, method),
        buildScopePreview('skills', d.skills.map((s) => s.name), sk.order, Object.fromEntries(d.skills.map((s) => [s.name, s.name])), sk.reasons, 'deterministic'),
      ],
      flags: checkTasks(d.tasks, { now, studyHoursPerDay: d.settings.studyHoursPerDay }),
      bullets: orderBullets(d.resume?.profile ?? null, d.skills).slice(0, 8),
    };
    const next: Orders = { tasks: tasksAfter, projects: ranked.map((r) => r.id), skills: sk.order, reasons: { ...projReasons, ...sk.reasons }, sortedAt: now.toISOString() };
    this.previews.set(preview.id, { preview, next });
    if (this.previews.size > 10) this.previews.delete(this.previews.keys().next().value!);
    return preview;
  }

  apply(previewId: string): Orders | null {
    const p = this.previews.get(previewId);
    if (!p) return null;
    this.ws.pushUndo(this.ws.orders());
    this.ws.setOrders(p.next);
    this.previews.delete(previewId);
    this.ws.changed('orders');
    return p.next;
  }

  /** Set one scope's order directly (used by the agent's confirmed reorder tool). */
  setScope(scope: SortScope, ids: string[]): Orders {
    const cur = this.ws.orders();
    this.ws.pushUndo(cur);
    const d = buildDashboard(this.ws);
    const all = scope === 'tasks' ? d.tasks.map((t) => t.id) : scope === 'projects' ? d.projects.map((p) => p.id) : d.skills.map((s) => s.name);
    const order = applyOrder(all, ids, (x) => x);
    const next = { ...cur, [scope]: order, sortedAt: new Date().toISOString() };
    this.ws.setOrders(next);
    this.ws.changed('orders');
    return next;
  }

  undo(): Orders | null {
    const prev = this.ws.popUndo();
    if (!prev) return null;
    this.ws.setOrders(prev);
    this.ws.changed('orders');
    return prev;
  }
}
