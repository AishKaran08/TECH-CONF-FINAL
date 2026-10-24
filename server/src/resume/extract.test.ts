import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseResumeHeuristic } from '@runway/shared';
import { detectKind, extractResumeText, ResumeError } from './extract';

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, 'fixtures', name)));

describe('resume text extraction', () => {
  it('reads a text PDF and the heuristic parser finds its sections', async () => {
    const { kind, text } = await extractResumeText('resume.pdf', fixture('resume.pdf'));
    expect(kind).toBe('pdf');
    expect(text).toContain('Priya Raman');
    const p = parseResumeHeuristic(text);
    expect(p.name).toBe('Priya Raman');
    expect(p.skills).toEqual(expect.arrayContaining(['C++', 'Go', 'Docker']));
    expect(p.projects[0]!.name).toBe('Campus Eats API');
    expect(p.experience[0]!.org).toBe('Example Labs');
  });

  it('reads a DOCX file', async () => {
    const { kind, text } = await extractResumeText('resume.docx', fixture('resume.docx'));
    expect(kind).toBe('docx');
    expect(text).toContain('TECHNICAL SKILLS');
  });

  it('reads Markdown and plain text', async () => {
    const md = new TextEncoder().encode('# Asha K\n\n## Skills\nPython, SQL, Pandas\n\n## Projects\nSales dashboard\n- Built a dashboard for 3 stores');
    const { kind, text } = await extractResumeText('cv.md', md);
    expect(kind).toBe('md');
    expect(parseResumeHeuristic(text).skills).toEqual(expect.arrayContaining(['Python', 'SQL', 'Pandas']));
  });

  it('rejects unsupported and disguised files with clear messages', async () => {
    expect(() => detectKind('cv.doc', new Uint8Array([0x50, 0x4b, 3, 4]))).toThrow(/\.docx/);
    expect(() => detectKind('cv.exe', new Uint8Array([1, 2, 3]))).toThrow(ResumeError);
    await expect(extractResumeText('cv.txt', new Uint8Array())).rejects.toThrow('empty');
    await expect(extractResumeText('cv.txt', new TextEncoder().encode('hi'))).rejects.toThrow(/Very little text/);
  });
});
