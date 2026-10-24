import { describe, expect, it } from 'vitest';
import type { PortfolioProject, ResumeProfile, Skill } from '../schemas';
import { applyOrder, diffOrder, orderBullets, rankProjectsHeuristic, rankSkills, resumeGaps } from './sorter';

const now = new Date(2026, 9, 24);
const proj = (id: string, name: string, language: string | null, tech: string[], description = '', daysAgo = 200): PortfolioProject => ({
  id,
  name,
  description,
  url: null,
  language,
  tech,
  stars: 0,
  pushedAt: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
  origins: ['github'],
});
const skill = (name: string, evidence: Skill['evidence'], evidenceCount = 1, lastSeen: string | null = null): Skill => ({ name, evidence, evidenceCount, lastSeen });

describe('applyOrder', () => {
  it('orders by saved ids and keeps unknown items after, in original order', () => {
    const items = ['a', 'b', 'c', 'd'];
    expect(applyOrder(items, ['c', 'a'], (x) => x)).toEqual(['c', 'a', 'b', 'd']);
  });
});

describe('diffOrder', () => {
  it('reports only items whose position changed', () => {
    const moves = diffOrder(['a', 'b', 'c'], ['c', 'b', 'a'], { a: 'A', c: 'C' }, { c: 'why' });
    expect(moves).toEqual([
      { id: 'c', label: 'C', from: 2, to: 0, reason: 'why' },
      { id: 'a', label: 'A', from: 0, to: 2, reason: '' },
    ]);
  });
});

describe('rankProjectsHeuristic', () => {
  const projects = [
    proj('web', 'portfolio-site', 'HTML', ['css']),
    proj('api', 'orders-api', 'Go', ['rest-api', 'postgresql', 'docker'], 'REST API with Postgres'),
    proj('ml', 'sentiment', 'Jupyter Notebook', ['pytorch']),
  ];
  it('puts backend projects first for a backend internship, with a reason', () => {
    const ranked = rankProjectsHeuristic(projects, 'Backend internship', [], now);
    expect(ranked[0]!.id).toBe('api');
    expect(ranked[0]!.reason).toMatch(/^Backend match: /);
  });
  it('ranks ML work first for an ML role', () => {
    expect(rankProjectsHeuristic(projects, 'machine learning intern', [], now)[0]!.id).toBe('ml');
  });
});

describe('rankSkills', () => {
  it('orders by evidence strength, then recency', () => {
    const { order, reasons } = rankSkills([
      skill('Rust', ['resume']),
      skill('Go', ['resume', 'github'], 3, '2026-10-20T00:00:00Z'),
      skill('Python', ['resume', 'github'], 3, '2026-10-22T00:00:00Z'),
      skill('C++', ['github', 'codeforces', 'resume'], 40),
    ]);
    expect(order).toEqual(['C++', 'Python', 'Go', 'Rust']);
    expect(reasons['C++']).toMatch(/GitHub \+ Codeforces \+ Resume/);
  });
});

describe('orderBullets and resumeGaps', () => {
  const profile: ResumeProfile = {
    name: 'A',
    email: null,
    education: [],
    skills: ['Go', 'Docker'],
    projects: [],
    experience: [{ title: 'Intern', org: 'X', period: null, bullets: ['Helped with documentation', 'Built a Go service handling 2,000 requests/s in Docker'] }],
    links: [],
  };
  const skills = [skill('Go', ['resume', 'github'], 2), skill('Docker', ['resume'])];
  it('puts bullets with backed skills and numbers first', () => {
    const out = orderBullets(profile, skills);
    expect(out[0]!.text).toMatch(/^Built a Go service/);
    expect(out[0]!.reason).toMatch(/Go backed by synced activity/);
  });
  it('finds missing and weakly evidenced skills for a data role', () => {
    const gaps = resumeGaps('data analyst', [skill('Python', ['resume']), skill('SQL', ['resume', 'github'])], profile);
    expect(gaps.role).toBe('Data');
    expect(gaps.have).toContain('SQL');
    expect(gaps.weak).toContain('Python');
    expect(gaps.missing).toContain('Pandas');
    expect(gaps.suggestions.join(' ')).toMatch(/GitHub|portfolio/);
  });
});
