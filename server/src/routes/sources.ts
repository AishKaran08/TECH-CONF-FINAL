import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { SourceId, type Settings } from '@runway/shared';
import { mergeIcs, parseIcs } from '../adapters/ics';
import { SourceError } from '../adapters/github';
import { parseParam } from '../http';
import type { Services } from '../services';
import type { Workspace } from '../workspace';

/** Remove synced data for a source (used on disconnect and when the username/handle changes). */
export function clearSource(ws: Workspace, source: SourceId): void {
  const st = ws.store;
  switch (source) {
    case 'github':
      st.clearNamespace('github:repo');
      st.clearNamespace('github:event');
      for (const k of ['github:profile', 'github:calendar', 'github:rate']) st.deleteDoc(k);
      break;
    case 'codeforces':
      st.clearNamespace('codeforces:submission');
      st.deleteDoc('codeforces:user');
      st.deleteDoc('codeforces:ratings');
      break;
    case 'resume':
      for (const k of ['resume', 'resume:text', 'resume:file']) st.deleteDoc(k);
      break;
    case 'leetcode':
      st.deleteDoc('real:leetcode');
      break;
    case 'timetable':
      ws.setClasses(ws.classes().filter((c) => c.origin !== 'ics'));
      ws.setDeadlines(ws.deadlines().filter((d) => d.origin !== 'ics'));
      break;
  }
  st.deleteDoc(`status:${source}`);
}

/** React to settings changes: new usernames start fresh and sync right away. */
export function handleSettingsChange(s: Services, before: Settings, after: Settings): void {
  const toSync: SourceId[] = [];
  if (before.githubUsername.toLowerCase() !== after.githubUsername.toLowerCase()) {
    clearSource(s.ws, 'github');
    if (after.githubUsername) toSync.push('github');
  } else if (before.githubToken !== after.githubToken && after.githubUsername) {
    s.ws.store.deleteDoc('github:calendar');
    toSync.push('github');
  }
  if (before.codeforcesHandle.toLowerCase() !== after.codeforcesHandle.toLowerCase()) {
    clearSource(s.ws, 'codeforces');
    if (after.codeforcesHandle) toSync.push('codeforces');
  }
  if (before.icsUrl !== after.icsUrl && after.icsUrl) toSync.push('timetable');
  // In demo mode the real data waits until Demo data is turned off and the user syncs.
  if (s.ws.mode() === 'real' && toSync.length && s.sync && !s.sync.running) s.sync.start(toSync, 'manual');
}

export function sourceRoutes(s: Services): Hono {
  const r = new Hono();

  r.delete('/sources/:source', (c) => {
    const source = parseParam(SourceId, c.req.param('source'), 'source');
    if (s.ws.mode() === 'demo') throw new HTTPException(400, { message: 'Turn off Demo data to change real connections.' });
    if (source === 'github') s.ws.updateSettings({ githubUsername: '', githubToken: '' });
    if (source === 'codeforces') s.ws.updateSettings({ codeforcesHandle: '' });
    if (source === 'timetable') s.ws.updateSettings({ icsUrl: '' });
    clearSource(s.ws, source);
    s.ws.changed('all');
    return c.json({ ok: true });
  });

  /** Import an .ics file. Replaces earlier imported items; keeps everything entered by hand. */
  r.post('/timetable/ics', async (c) => {
    const body = await c.req.parseBody();
    const file = body['file'];
    if (!(file instanceof File)) throw new HTTPException(400, { message: 'Choose an .ics file to import.' });
    if (file.size > 2 * 1024 * 1024) throw new HTTPException(400, { message: 'That calendar file is larger than 2 MB.' });
    let parsed;
    try {
      parsed = parseIcs(await file.text(), new Date());
    } catch (err) {
      throw new HTTPException(400, { message: err instanceof SourceError ? err.message : 'Could not read that calendar file.' });
    }
    const cl = mergeIcs(s.ws.classes(), parsed.classes);
    const dl = mergeIcs(s.ws.deadlines(), parsed.deadlines);
    s.ws.setClasses(cl.merged);
    s.ws.setDeadlines(dl.merged);
    s.ws.setStatus('timetable', { state: 'connected', lastSyncedAt: new Date().toISOString(), lastError: null, detail: `${s.ws.classes().length} classes, ${s.ws.deadlines().length} dates` });
    s.ws.changed('classes', 'deadlines');
    return c.json({ classes: parsed.classes.length, deadlines: parsed.deadlines.length });
  });

  return r;
}
