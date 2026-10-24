import { createHash } from 'node:crypto';

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const MAX_RESUME_CHARS = 40_000;

export type ResumeKind = 'pdf' | 'docx' | 'txt' | 'md';

export class ResumeError extends Error {}

export function sha256(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** Detect the file type from its name and magic bytes (never trust the extension alone). */
export function detectKind(fileName: string, buf: Uint8Array): ResumeKind {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  const head = Buffer.from(buf.subarray(0, 5)).toString('latin1');
  if (head.startsWith('%PDF')) return 'pdf';
  if (head.startsWith('PK') && ext === 'docx') return 'docx';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'txt' || ext === 'text') return 'txt';
  if (head.startsWith('PK')) throw new ResumeError('Only .docx Word files are supported (older .doc files are not).');
  throw new ResumeError('Upload a PDF, DOCX, TXT or Markdown file.');
}

async function pdfText(buf: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const lines: string[] = [];
  try {
    const pages = Math.min(doc.numPages, 10);
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let line = '';
      let lastY: number | null = null;
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y = item.transform[5] as number;
        if (lastY !== null && Math.abs(y - lastY) > 2 && line.trim()) {
          lines.push(line.trim());
          line = '';
        }
        line += item.str;
        if (item.hasEOL) {
          lines.push(line.trim());
          line = '';
        } else if (item.str && !item.str.endsWith(' ')) line += ' ';
        lastY = y;
      }
      if (line.trim()) lines.push(line.trim());
      lines.push('');
    }
  } finally {
    await task.destroy();
  }
  return lines.join('\n').replace(/[ \t]{2,}/g, ' ');
}

async function docxText(buf: Uint8Array): Promise<string> {
  const mammoth = await import('mammoth');
  const res = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
  return res.value;
}

/** Extract plain text from a resume file. Throws ResumeError with a plain-language message. */
export async function extractResumeText(fileName: string, buf: Uint8Array): Promise<{ kind: ResumeKind; text: string }> {
  if (buf.byteLength === 0) throw new ResumeError('That file is empty.');
  if (buf.byteLength > MAX_RESUME_BYTES) throw new ResumeError('That file is larger than 5 MB.');
  const kind = detectKind(fileName, buf);
  let text: string;
  try {
    text = kind === 'pdf' ? await pdfText(buf) : kind === 'docx' ? await docxText(buf) : Buffer.from(buf).toString('utf8');
  } catch (err) {
    if (err instanceof ResumeError) throw err;
    throw new ResumeError(kind === 'pdf' ? 'Could not read that PDF. If it is a scanned image, export a text PDF instead.' : 'Could not read that file.');
  }
  text = text.replaceAll(String.fromCharCode(0), '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 40) throw new ResumeError('Very little text was found. If the PDF is a scanned image, export a text-based PDF instead.');
  return { kind, text: text.slice(0, MAX_RESUME_CHARS) };
}
