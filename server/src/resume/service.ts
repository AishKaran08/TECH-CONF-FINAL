import { parseResumeHeuristic, type ResumeProfile, type ResumeRecord } from '@runway/shared';
import type { SourceRunner } from '../sync';
import type { Workspace } from '../workspace';
import { extractResumeText, ResumeError, sha256 } from './extract';

export type AiExtractor = (text: string) => Promise<ResumeProfile>;

export interface IngestResult {
  unchanged: boolean;
  parsedBy: ResumeRecord['parsedBy'];
  record: ResumeRecord;
}

/** Upload → hash → (re)parse only when the file changed → store profile + text. */
export class ResumeService {
  constructor(
    private readonly ws: Workspace,
    private readonly aiExtract?: AiExtractor,
  ) {}

  async ingest(fileName: string, buf: Uint8Array): Promise<IngestResult> {
    const hash = sha256(buf);
    const existing = this.ws.store.getDoc<ResumeRecord>('resume');
    if (existing && existing.hash === hash) {
      return { unchanged: true, parsedBy: existing.parsedBy, record: existing };
    }
    const { text } = await extractResumeText(fileName, buf);
    let profile: ResumeProfile | null = null;
    let parsedBy: ResumeRecord['parsedBy'] = 'heuristic';
    if (this.aiExtract && this.ws.aiEnabled()) {
      try {
        profile = await this.aiExtract(text);
        parsedBy = 'ai';
      } catch (err) {
        console.warn('[resume] AI extraction failed, using the local parser:', (err as Error).message);
      }
    }
    profile ??= parseResumeHeuristic(text);
    const now = new Date().toISOString();
    const record: ResumeRecord = { fileName: fileName.slice(0, 120), hash, uploadedAt: now, parsedAt: now, parsedBy, charCount: text.length, profile };
    this.ws.store.setDoc('resume', record);
    this.ws.store.setDoc('resume:text', text);
    const p = profile;
    this.ws.setStatus('resume', {
      state: 'connected',
      lastSyncedAt: now,
      lastError: null,
      detail: `${p.skills.length} skills, ${p.projects.length} projects`,
    });
    this.ws.changed('resume');
    return { unchanged: false, parsedBy, record };
  }

  /** Sync step: the stored resume is re-read only when its file changes, so this reports its state. */
  runner(): SourceRunner {
    return {
      configured: () => this.ws.store.getDoc('resume') !== undefined,
      run: async (report) => {
        report(0.5, 'Checking file fingerprint');
        const r = this.ws.store.getDoc<ResumeRecord>('resume');
        if (!r) throw new ResumeError('No resume uploaded.');
        return { summary: 'unchanged', detail: `${r.profile.skills.length} skills, ${r.profile.projects.length} projects` };
      },
    };
  }
}
