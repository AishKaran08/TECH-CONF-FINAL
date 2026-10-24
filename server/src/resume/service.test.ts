import { describe, expect, it, vi } from 'vitest';
import { EventHub } from '../events';
import { createJsonStore } from '../store';
import { Workspace } from '../workspace';
import { ResumeService } from './service';

const TEXT = new TextEncoder().encode('Asha K\n\nSKILLS\nPython, SQL, Pandas\n\nPROJECTS\nSales dashboard\n- Built a dashboard for 3 stores');

function setup(aiAvailable: boolean) {
  const ws = new Workspace(createJsonStore(null), new EventHub(), { aiAvailable, model: 'm', defaultSyncInterval: 15 });
  return ws;
}

describe('ResumeService', () => {
  it('parses once and skips re-parsing when the file hash is unchanged', async () => {
    const ws = setup(false);
    const svc = new ResumeService(ws);
    const a = await svc.ingest('cv.txt', TEXT);
    expect(a).toMatchObject({ unchanged: false, parsedBy: 'heuristic' });
    expect(a.record.profile.skills).toEqual(expect.arrayContaining(['Python', 'SQL']));
    const b = await svc.ingest('cv.txt', TEXT);
    expect(b.unchanged).toBe(true);
    expect(ws.status('resume').state).toBe('connected');
  });

  it('uses AI only after the privacy notice is acknowledged, and falls back on failure', async () => {
    const ws = setup(true);
    const ai = vi.fn().mockRejectedValue(new Error('network'));
    const svc = new ResumeService(ws, ai);
    await svc.ingest('cv.txt', TEXT);
    expect(ai).not.toHaveBeenCalled(); // notice not acknowledged yet

    ws.updateSettings({ aiNoticeAck: true });
    const r = await svc.ingest('cv2.txt', new TextEncoder().encode(new TextDecoder().decode(TEXT) + '\nGit'));
    expect(ai).toHaveBeenCalledTimes(1);
    expect(r.parsedBy).toBe('heuristic');

    ws.updateSettings({ localOnly: true });
    await svc.ingest('cv3.txt', new TextEncoder().encode(new TextDecoder().decode(TEXT) + '\nLinux'));
    expect(ai).toHaveBeenCalledTimes(1);
  });

  it('records AI output when the model succeeds', async () => {
    const ws = setup(true);
    ws.updateSettings({ aiNoticeAck: true });
    const svc = new ResumeService(ws, async () => ({ name: 'Asha', email: null, education: [], skills: ['Python'], projects: [], experience: [], links: [] }));
    const r = await svc.ingest('cv.txt', TEXT);
    expect(r.parsedBy).toBe('ai');
    expect(ws.resume()!.profile.name).toBe('Asha');
    expect(ws.resumeText()).toContain('Sales dashboard');
  });
});
