import type { Education, Experience, ResumeProfile, ResumeProject } from '../schemas';
import { canonicalSkill, detectSkills } from './taxonomy';

/**
 * Heuristic resume parser used when AI is unavailable or disabled.
 * Finds sections by their headings, then reads lines and bullets inside each section.
 */

type Section = 'header' | 'education' | 'skills' | 'projects' | 'experience' | 'links' | 'other';

const HEADINGS: [RegExp, Section][] = [
  [/^(education|academics?|academic background|qualifications?)$/, 'education'],
  [/^(technical skills|skills|core skills|skills (and|&) tools|technologies|tech stack|tools)$/, 'skills'],
  [/^(projects|personal projects|academic projects|selected projects|key projects)$/, 'projects'],
  [/^(experience|work experience|professional experience|internships?|employment|work history)$/, 'experience'],
  [/^(links|profiles|online profiles|contact|socials?)$/, 'links'],
  [/^(certifications?|achievements|awards|honou?rs|summary|objective|profile|about( me)?|activities|extracurriculars?|publications|courses|coursework|relevant coursework|interests|languages known)$/, 'other'],
];

const BULLET_RE = /^\s*(?:[-*•●▪◦‣–—]|\d+[.)])\s+/;
const URL_RE = /\b(?:https?:\/\/[^\s)>,]+|(?:www\.)?(?:github\.com|linkedin\.com|gitlab\.com|leetcode\.com|codeforces\.com)\/[^\s)>,]+)/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const PERIOD_RE = new RegExp(
  `((?:${MONTH}\\s+)?(?:19|20)\\d{2}\\s*(?:[-–—]|to)\\s*(?:(?:${MONTH}\\s+)?(?:19|20)\\d{2}|present|current|now|ongoing)|(?:${MONTH}\\s+)?(?:19|20)\\d{2})`,
  'i',
);
const INSTITUTION_RE = /\b(university|college|institute|school|academy|iit|nit|iiit|bits|polytechnic|vidyalaya)\b/i;
const DEGREE_RE = /\b(b\.?\s?tech|b\.?\s?e\b|bachelor|master|m\.?\s?tech|m\.?\s?s\b|b\.?\s?sc|m\.?\s?sc|bca|mca|ph\.?\s?d|diploma|hsc|ssc|class (x|xii|10|12)|cbse|icse|cgpa|gpa)/i;

function headingOf(line: string): Section | null {
  const clean = line.replace(/[:|_=\-–—•]+$/g, '').replace(/^[#\s*]+/, '').trim().toLowerCase();
  if (clean.length === 0 || clean.length > 40) return null;
  for (const [re, sec] of HEADINGS) if (re.test(clean)) return sec;
  return null;
}

function stripBullet(line: string): string {
  return line.replace(BULLET_RE, '').trim();
}

function normalizeUrl(u: string): string {
  const t = u.replace(/[.;:]+$/, '');
  return /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^www\./i, '')}`;
}

function extractPeriod(line: string): { period: string | null; rest: string } {
  const m = PERIOD_RE.exec(line);
  if (!m) return { period: null, rest: line };
  return { period: m[1]!.replace(/\s+/g, ' ').trim(), rest: line.replace(m[0], ' ').replace(/[,|()–—-]\s*$/, '').replace(/\s{2,}/g, ' ').trim() };
}

function splitSkillTokens(line: string): string[] {
  const body = line.includes(':') ? line.slice(line.indexOf(':') + 1) : line;
  return body
    .split(/[,;|•·●▪]|\s\/\s|\band\b/)
    .map((t) => t.replace(/[()[\]]/g, '').trim())
    .filter((t) => t.length > 0 && t.length <= 30);
}

export function parseResumeHeuristic(text: string): ResumeProfile {
  const rawLines = text.replace(/\r/g, '').split('\n').map((l) => l.replace(/\t/g, ' ').trimEnd());
  const sections: Record<Section, string[]> = { header: [], education: [], skills: [], projects: [], experience: [], links: [], other: [] };
  let current: Section = 'header';
  for (const line of rawLines) {
    if (!line.trim()) continue;
    const h = headingOf(line.trim());
    if (h) {
      current = h;
      continue;
    }
    sections[current].push(line.trim());
  }

  // Name: first header line that looks like a name (2-4 alphabetic words, no digits/@/urls).
  const name =
    sections.header.find((l) => /^[A-Za-z][A-Za-z.'-]*(\s+[A-Za-z][A-Za-z.'-]*){1,3}$/.test(l) && !EMAIL_RE.test(l)) ?? null;
  const email = EMAIL_RE.exec(text)?.[0] ?? null;
  const links = [...new Set((text.match(URL_RE) ?? []).map(normalizeUrl))].slice(0, 12);

  // Skills: tokens in the skills section + well-known skills anywhere in the text.
  const skillSet = new Map<string, string>();
  for (const line of sections.skills) {
    for (const tok of splitSkillTokens(stripBullet(line))) {
      const c = canonicalSkill(tok) ?? (detectSkills(tok, false)[0] || null) ?? (tok.split(' ').length <= 3 ? tok : null);
      if (c) skillSet.set(c.toLowerCase(), c);
    }
  }
  for (const s of detectSkills(text, true)) if (!skillSet.has(s.toLowerCase())) skillSet.set(s.toLowerCase(), s);

  // Education.
  const education: Education[] = [];
  for (const line of sections.education) {
    const l = stripBullet(line);
    const { period, rest } = extractPeriod(l);
    if (INSTITUTION_RE.test(rest) || education.length === 0) {
      const degreeInline = DEGREE_RE.test(rest) && !INSTITUTION_RE.test(rest);
      education.push({
        institution: degreeInline ? '' : rest.split(/[|,–—]/)[0]!.trim() || rest,
        degree: degreeInline ? rest : null,
        period,
        detail: null,
      });
    } else {
      const e = education[education.length - 1]!;
      if (!e.degree && DEGREE_RE.test(rest)) e.degree = rest;
      else e.detail = e.detail ? `${e.detail}; ${rest}` : rest;
      if (!e.period && period) e.period = period;
    }
  }

  // Projects: non-bullet lines are titles, bullets attach to the latest title.
  const projects: ResumeProject[] = [];
  for (const line of sections.projects) {
    const isBullet = BULLET_RE.test(line);
    const l = stripBullet(line);
    const url = (l.match(URL_RE) ?? [])[0];
    if (!isBullet || projects.length === 0) {
      const withoutUrl = l.replace(URL_RE, '').trim();
      const [title, ...restParts] = withoutUrl.split(/\s[|–—-]\s|:\s|\s\|\s?/);
      const rest = restParts.join(' ').trim();
      projects.push({
        name: (title ?? withoutUrl).replace(/[,(]+$/, '').trim().slice(0, 80) || 'Untitled project',
        description: rest || null,
        url: url ? normalizeUrl(url) : null,
        tech: detectSkills(rest, false),
        bullets: [],
      });
    } else {
      const p = projects[projects.length - 1]!;
      p.bullets.push(l);
      if (!p.url && url) p.url = normalizeUrl(url);
      p.tech = [...new Set([...p.tech, ...detectSkills(l)])];
    }
  }

  // Experience: same shape. Title lines carry role, organisation and period.
  const experience: Experience[] = [];
  for (const line of sections.experience) {
    const isBullet = BULLET_RE.test(line);
    const l = stripBullet(line);
    if (!isBullet || experience.length === 0) {
      const { period, rest } = extractPeriod(l);
      const at = /\s+at\s+/i.exec(rest);
      let title = rest;
      let org: string | null = null;
      if (at) {
        title = rest.slice(0, at.index).trim();
        org = rest.slice(at.index + at[0].length).trim();
      } else {
        const parts = rest.split(/\s[|–—-]\s|,\s/);
        if (parts.length > 1) {
          title = parts[0]!.trim();
          org = parts.slice(1).join(', ').trim();
        }
      }
      // A non-bullet line right after a title without org/period is often the org/period line.
      const prev = experience[experience.length - 1];
      if (prev && !isBullet && prev.bullets.length === 0 && (!prev.org || !prev.period) && (period || !org)) {
        if (!prev.org) prev.org = rest || null;
        if (!prev.period) prev.period = period;
        continue;
      }
      experience.push({ title: title || rest, org: org || null, period, bullets: [] });
    } else {
      experience[experience.length - 1]!.bullets.push(l);
    }
  }

  return {
    name,
    email,
    education: education.filter((e) => e.institution || e.degree),
    skills: [...skillSet.values()],
    projects,
    experience,
    links,
  };
}
