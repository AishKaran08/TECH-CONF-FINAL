import type { EvidenceSource, GithubRepo, LeetcodeStats, PortfolioProject, RecordOrigin, ResumeProfile, ResumeProject, Skill, Submission } from '../schemas';
import { canonicalSkill, detectSkills } from './taxonomy';

/* ------------------------------------------------------------------ */
/* Skills with evidence                                                */
/* ------------------------------------------------------------------ */

interface SkillAcc {
  name: string;
  evidence: Set<EvidenceSource>;
  count: number;
  lastSeen: number | null;
}

function topicToSkill(topic: string): string | null {
  return canonicalSkill(topic) ?? canonicalSkill(topic.replace(/-/g, ' '));
}

/**
 * Merge skills from the resume, GitHub repos (language + topics), Codeforces and LeetCode
 * into one list with evidence sources, counts and last-seen dates.
 */
export function buildSkills(input: {
  profile: ResumeProfile | null;
  repos: GithubRepo[];
  submissions: Submission[];
  leetcode: LeetcodeStats | null;
}): Skill[] {
  const acc = new Map<string, SkillAcc>();
  const add = (raw: string, src: EvidenceSource, when: string | null, n = 1) => {
    const name = canonicalSkill(raw) ?? raw.trim();
    if (!name || name.length > 40) return;
    const key = name.toLowerCase();
    let s = acc.get(key);
    if (!s) {
      s = { name, evidence: new Set(), count: 0, lastSeen: null };
      acc.set(key, s);
    }
    s.evidence.add(src);
    s.count += n;
    const t = when ? Date.parse(when) : NaN;
    if (!Number.isNaN(t)) s.lastSeen = Math.max(s.lastSeen ?? 0, t);
  };

  if (input.profile) {
    for (const s of input.profile.skills) add(s, 'resume', null);
    for (const p of input.profile.projects) for (const t of p.tech) add(t, 'resume', null);
  }
  for (const r of input.repos) {
    if (r.fork) continue;
    const seen = new Set<string>();
    if (r.language) {
      const s = canonicalSkill(r.language) ?? r.language;
      seen.add(s.toLowerCase());
      add(s, 'github', r.pushedAt);
    }
    for (const t of r.topics) {
      const s = topicToSkill(t);
      if (s && !seen.has(s.toLowerCase())) {
        seen.add(s.toLowerCase());
        add(s, 'github', r.pushedAt);
      }
    }
  }
  const cfAccepted = input.submissions.filter((s) => (s.origin === 'codeforces' || s.origin === 'demo') && s.accepted);
  if (cfAccepted.length > 0) {
    const latest = cfAccepted.reduce((m, s) => (s.time > m ? s.time : m), cfAccepted[0]!.time);
    add('Algorithms', 'codeforces', latest, cfAccepted.length);
    add('Data Structures', 'codeforces', latest, cfAccepted.length);
  }
  const lc = input.leetcode;
  if (lc && lc.easy + lc.medium + lc.hard > 0) {
    const solved = lc.easy + lc.medium + lc.hard;
    add('Algorithms', 'leetcode', lc.updatedAt, solved);
    add('Data Structures', 'leetcode', lc.updatedAt, solved);
  }

  return [...acc.values()].map((s) => ({
    name: s.name,
    evidence: [...s.evidence],
    evidenceCount: s.count,
    lastSeen: s.lastSeen ? new Date(s.lastSeen).toISOString() : null,
  }));
}

const SOURCE_LABEL: Record<EvidenceSource, string> = {
  resume: 'Resume',
  github: 'GitHub',
  codeforces: 'Codeforces',
  leetcode: 'LeetCode',
  manual: 'Entered by you',
};

export function evidenceLabel(src: EvidenceSource): string {
  return SOURCE_LABEL[src];
}

function skillScore(s: Skill): number {
  // External evidence (GitHub/CF/LC) counts more than a resume mention alone.
  const external = s.evidence.filter((e) => e !== 'resume').length;
  return s.evidence.length * 10 + external * 5 + Math.log2(1 + s.evidenceCount) * 2;
}

/** Skills ordered by evidence strength, then recency, then name. */
export function orderSkills(skills: Skill[]): { skill: Skill; reason: string }[] {
  return [...skills]
    .sort((a, b) => {
      const d = skillScore(b) - skillScore(a);
      if (Math.abs(d) > 1e-9) return d;
      const ra = a.lastSeen ? Date.parse(a.lastSeen) : 0;
      const rb = b.lastSeen ? Date.parse(b.lastSeen) : 0;
      if (rb !== ra) return rb - ra;
      return a.name.localeCompare(b.name);
    })
    .map((skill) => ({
      skill,
      reason: `Backed by ${skill.evidence.map(evidenceLabel).join(' + ')}${skill.evidenceCount > 1 ? ` (${skill.evidenceCount} pieces of evidence)` : ''}`,
    }));
}

/* ------------------------------------------------------------------ */
/* Projects: resume + GitHub merge                                     */
/* ------------------------------------------------------------------ */

export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'project';
}

/** Merge resume projects with GitHub repos, matched by normalized name or URL; no duplicates. */
export function mergeProjects(repos: GithubRepo[], resumeProjects: ResumeProject[]): PortfolioProject[] {
  const out: PortfolioProject[] = [];
  const byName = new Map<string, PortfolioProject>();
  const byUrl = new Map<string, PortfolioProject>();

  for (const r of repos) {
    if (r.fork) continue;
    const p: PortfolioProject = {
      id: `gh:${r.id}`,
      name: r.name,
      description: r.description,
      url: r.url,
      language: r.language,
      tech: [...new Set([...(r.language ? [r.language] : []), ...r.topics])],
      stars: r.stars,
      pushedAt: r.pushedAt,
      origins: ['github'],
    };
    out.push(p);
    byName.set(normalizeName(r.name), p);
    byUrl.set(r.url.toLowerCase().replace(/\/+$/, ''), p);
  }

  for (const rp of resumeProjects) {
    const url = rp.url?.toLowerCase().replace(/\/+$/, '') ?? null;
    const match = (url && byUrl.get(url)) || byName.get(normalizeName(rp.name));
    if (match) {
      if (!match.origins.includes('resume')) match.origins.push('resume');
      if (!match.description && rp.description) match.description = rp.description;
      match.tech = [...new Set([...match.tech, ...rp.tech])];
      continue;
    }
    const p: PortfolioProject = {
      id: `resume:${slug(rp.name)}`,
      name: rp.name,
      description: rp.description ?? rp.bullets[0] ?? null,
      url: rp.url,
      language: null,
      tech: rp.tech.length ? rp.tech : detectSkills(`${rp.description ?? ''} ${rp.bullets.join(' ')}`),
      stars: null,
      pushedAt: null,
      origins: ['resume' as RecordOrigin],
    };
    out.push(p);
    byName.set(normalizeName(rp.name), p);
  }

  return out.sort((a, b) => (b.pushedAt ?? '').localeCompare(a.pushedAt ?? ''));
}
