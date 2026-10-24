import { describe, expect, it } from 'vitest';
import type { GithubRepo } from '../schemas';
import { buildSkills, mergeProjects } from './profile';
import { generateDemoData } from '../demo';

const repo = (name: string, url = `https://github.com/me/${name}`): GithubRepo => ({
  id: name,
  name,
  fullName: `me/${name}`,
  url,
  description: null,
  language: 'Go',
  stars: 1,
  topics: ['docker'],
  pushedAt: '2026-10-01T00:00:00Z',
  fork: false,
});

describe('mergeProjects', () => {
  it('merges resume projects with repos by name or URL without duplicates', () => {
    const out = mergeProjects(
      [repo('campus-eats-api'), repo('cli-tool')],
      [
        { name: 'Campus Eats API', description: 'x', url: null, tech: ['PostgreSQL'], bullets: [] },
        { name: 'Different name', description: null, url: 'https://github.com/me/cli-tool/', tech: [], bullets: [] },
        { name: 'Offline only', description: 'Not on GitHub', url: null, tech: ['React'], bullets: [] },
      ],
    );
    expect(out).toHaveLength(3);
    expect(out.find((p) => p.name === 'campus-eats-api')!.origins).toEqual(['github', 'resume']);
    expect(out.find((p) => p.name === 'campus-eats-api')!.tech).toContain('PostgreSQL');
    expect(out.find((p) => p.name === 'cli-tool')!.origins).toEqual(['github', 'resume']);
    expect(out.find((p) => p.name === 'Offline only')!.origins).toEqual(['resume']);
  });
});

describe('buildSkills', () => {
  it('combines evidence from resume, GitHub and Codeforces', () => {
    const skills = buildSkills({
      profile: { name: null, email: null, education: [], skills: ['go', 'Python'], projects: [], experience: [], links: [] },
      repos: [repo('a'), repo('b')],
      submissions: [],
      leetcode: { easy: 3, medium: 0, hard: 0, totalEasy: 10, totalMedium: 10, totalHard: 10, log: [], updatedAt: null },
    });
    const go = skills.find((s) => s.name === 'Go')!;
    expect(go.evidence.sort()).toEqual(['github', 'resume']);
    expect(go.evidenceCount).toBe(3);
    expect(skills.find((s) => s.name === 'Docker')!.evidence).toEqual(['github']);
    expect(skills.find((s) => s.name === 'Algorithms')!.evidence).toEqual(['leetcode']);
  });
});

describe('generateDemoData', () => {
  it('produces dates relative to now', () => {
    const now = new Date();
    const d = generateDemoData(now);
    expect(d.calendar.to).toBe(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
    expect(d.deadlines.every((x) => new Date(x.due).getTime() > now.getTime())).toBe(true);
    expect(d.repos.length).toBeGreaterThan(3);
  });
});
