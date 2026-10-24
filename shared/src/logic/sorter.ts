import type { PortfolioProject, ResumeProfile, ScopePreview, Skill, SortMove, SortScope } from '../schemas';
import { orderSkills } from './profile';
import { detectSkills, resolveRole, ROLES } from './taxonomy';
import { DAY_MS } from './time';

/** Sort items by an explicit id order; ids not in the order keep their relative position after ordered ones. */
export function applyOrder<T>(items: T[], order: string[], idOf: (t: T) => string): T[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  return items
    .map((item, i) => ({ item, i, p: pos.get(idOf(item)) }))
    .sort((a, b) => {
      if (a.p !== undefined && b.p !== undefined) return a.p - b.p;
      if (a.p !== undefined) return -1;
      if (b.p !== undefined) return 1;
      return a.i - b.i;
    })
    .map((x) => x.item);
}

/** Moves between two orders, for the preview ("what moves and why"). */
export function diffOrder(before: string[], after: string[], labels: Record<string, string>, reasons: Record<string, string>): SortMove[] {
  const from = new Map(before.map((id, i) => [id, i]));
  const moves: SortMove[] = [];
  after.forEach((id, to) => {
    const f = from.get(id);
    if (f === undefined || f === to) return;
    moves.push({ id, label: labels[id] ?? id, from: f, to, reason: reasons[id] ?? '' });
  });
  return moves;
}

export function buildScopePreview(
  scope: SortScope,
  before: string[],
  after: string[],
  labels: Record<string, string>,
  reasons: Record<string, string>,
  method: ScopePreview['method'],
): ScopePreview {
  return { scope, before, after, moves: diffOrder(before, after, labels, reasons), reasons, method };
}

/* ------------------------------------------------------------------ */
/* Projects by relevance to a target role (keyword fallback)           */
/* ------------------------------------------------------------------ */

export interface ProjectScore {
  id: string;
  score: number;
  reason: string;
}

function projectText(p: PortfolioProject): string {
  return [p.name.replace(/[-_]/g, ' '), p.description ?? '', p.language ?? '', ...p.tech.map((t) => t.replace(/-/g, ' '))].join(' ').toLowerCase();
}

function hasWord(text: string, kw: string): boolean {
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9+#])${esc}(?=$|[^a-z0-9+#])`).test(text);
}

/**
 * Keyword-overlap relevance: role keywords found in the project, plus a smaller boost for overlap
 * with skills the user has evidence for, plus recency. Deterministic.
 */
export function rankProjectsHeuristic(projects: PortfolioProject[], targetRole: string, skills: Skill[], now: Date): ProjectScore[] {
  const roleKey = resolveRole(targetRole || 'software engineer');
  const role = ROLES[roleKey]!;
  const skillNames = new Set(skills.map((s) => s.name.toLowerCase()));
  return projects
    .map((p, i) => {
      const text = projectText(p);
      const hits = role.keywords.filter((k) => hasWord(text, k));
      const tech = detectSkills(text, false).filter((s) => skillNames.has(s.toLowerCase()));
      const recent = p.pushedAt ? now.getTime() - Date.parse(p.pushedAt) < 90 * DAY_MS : false;
      const score = hits.length * 3 + tech.length + (recent ? 1.5 : 0) + Math.log2(1 + (p.stars ?? 0)) * 0.5;
      const label = role.label;
      const reason =
        hits.length > 0
          ? `${label} match: ${hits.slice(0, 4).join(', ')}${recent ? '; active recently' : ''}`
          : recent
            ? `No clear ${label.toLowerCase()} keywords, but active recently`
            : `Few ${label.toLowerCase()} signals in its description or tech`;
      return { id: p.id, score, reason, i };
    })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ id, score, reason }) => ({ id, score: Math.round(score * 10) / 10, reason }));
}

/* ------------------------------------------------------------------ */
/* Skills and resume bullets                                           */
/* ------------------------------------------------------------------ */

export function rankSkills(skills: Skill[]): { order: string[]; reasons: Record<string, string> } {
  const ordered = orderSkills(skills);
  return {
    order: ordered.map((o) => o.skill.name),
    reasons: Object.fromEntries(ordered.map((o) => [o.skill.name, o.reason])),
  };
}

/**
 * Resume bullets ordered by evidence strength (skills mentioned that have outside evidence,
 * concrete numbers) and recency (earlier entries in a resume are usually the most recent).
 */
export function orderBullets(profile: ResumeProfile | null, skills: Skill[]): { text: string; reason: string }[] {
  if (!profile) return [];
  const strength = new Map(skills.map((s) => [s.name.toLowerCase(), s.evidence.filter((e) => e !== 'resume').length]));
  const bullets: { text: string; entryIndex: number }[] = [];
  profile.experience.forEach((e, i) => e.bullets.forEach((b) => bullets.push({ text: b, entryIndex: i })));
  profile.projects.forEach((p, i) => p.bullets.forEach((b) => bullets.push({ text: b, entryIndex: profile.experience.length + i })));

  // The user's own skills are matched too; very short names (Go, C, R) only when capitalised as written.
  const own = skills.map((s) => s.name);
  const mentions = (text: string): string[] => {
    const found = new Set(detectSkills(text));
    for (const name of own) {
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(^|[^A-Za-z0-9+#])${esc}(?=$|[^A-Za-z0-9+#])`, name.length <= 2 ? '' : 'i');
      if (re.test(text)) found.add(name);
    }
    return [...found];
  };

  return bullets
    .map((b, i) => {
      const mentioned = mentions(b.text);
      const backed = mentioned.filter((m) => (strength.get(m.toLowerCase()) ?? 0) > 0);
      const metric = /\d/.test(b.text);
      const score = backed.length * 3 + mentioned.length + (metric ? 2 : 0) - b.entryIndex * 0.25;
      const parts: string[] = [];
      if (backed.length) parts.push(`${backed.slice(0, 3).join(', ')} backed by synced activity`);
      else if (mentioned.length) parts.push(`mentions ${mentioned.slice(0, 3).join(', ')}`);
      if (metric) parts.push('has a concrete number');
      const reason = parts.length ? parts.join('; ') : 'no linked evidence yet';
      return { text: b.text, reason: reason[0]!.toUpperCase() + reason.slice(1), score, i };
    })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ text, reason }) => ({ text, reason }));
}

/* ------------------------------------------------------------------ */
/* Resume gap check                                                    */
/* ------------------------------------------------------------------ */

export interface GapReport {
  role: string;
  have: string[];
  missing: string[];
  weak: string[];
  suggestions: string[];
}

/** What a resume is missing for a role: expected skills with no evidence, and ones only claimed on the resume. */
export function resumeGaps(targetRole: string, skills: Skill[], profile: ResumeProfile | null): GapReport {
  const roleKey = resolveRole(targetRole);
  const role = ROLES[roleKey]!;
  const byName = new Map(skills.map((s) => [s.name.toLowerCase(), s]));
  const have: string[] = [];
  const missing: string[] = [];
  const weak: string[] = [];
  for (const exp of role.expectedSkills) {
    const s = byName.get(exp.toLowerCase());
    if (!s) missing.push(exp);
    else if (s.evidence.length === 1 && s.evidence[0] === 'resume') weak.push(exp);
    else have.push(exp);
  }
  const suggestions: string[] = [];
  if (missing.length) suggestions.push(`Add a small project or coursework line that shows ${missing.slice(0, 3).join(', ')}.`);
  if (weak.length) suggestions.push(`${weak.slice(0, 3).join(', ')} ${weak.length === 1 ? 'appears' : 'appear'} only on the resume; a public repo would back ${weak.length === 1 ? 'it' : 'them'} up.`);
  if (profile && !profile.experience.some((e) => e.bullets.some((b) => /\d/.test(b))) && !profile.projects.some((p) => p.bullets.some((b) => /\d/.test(b))))
    suggestions.push('Bullets read stronger with a concrete number (users, latency, dataset size, accuracy).');
  if (profile && profile.links.length === 0) suggestions.push('Add links to GitHub and a portfolio or LinkedIn.');
  if (!profile) suggestions.push('Upload a resume so this check can compare it with your activity.');
  return { role: role.label, have, missing, weak, suggestions };
}
