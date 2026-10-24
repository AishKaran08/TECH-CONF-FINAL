import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_RADAR_AXES, type ClassInput, type Dashboard, type DeadlineKind, type PublicSettings, type SourceId, type SourceStatus } from '@runway/shared';
import { Icon, type IconName } from '../components/Icon';
import { Button, ErrorNote, Field, inputClass, Modal, SourceTag } from '../components/ui';
import { api } from '../lib/api';
import { clsx, isStale, timeAgo } from '../lib/format';
import { refresh, syncAll, toast, useApp } from '../lib/store';
import { requireAiNotice } from './AiNotice';
import { DemoToggle } from './Header';
import { closeConnections, openConnections, usePanels, type ConnectionsTab } from './panelState';

const TABS: { id: ConnectionsTab; label: string; icon: IconName }[] = [
  { id: 'github', label: 'GitHub', icon: 'github' },
  { id: 'codeforces', label: 'Codeforces', icon: 'code' },
  { id: 'leetcode', label: 'LeetCode', icon: 'code' },
  { id: 'resume', label: 'Resume', icon: 'file' },
  { id: 'timetable', label: 'Timetable', icon: 'calendar' },
  { id: 'settings', label: 'Settings', icon: 'plug' },
];

type Chip = { label: string; cls: string; icon: IconName };
function chipFor(st: SourceStatus | undefined, live: { state: string } | undefined): Chip {
  if (live?.state === 'syncing') return { label: 'Syncing', cls: 'bg-sky-500/10 text-sky-200', icon: 'sync' };
  if (!st || st.state === 'not_connected') return { label: 'Not connected', cls: 'bg-zinc-800 text-zinc-300', icon: 'plug' };
  if (st.state === 'error') return { label: 'Error', cls: 'bg-red-500/15 text-red-200', icon: 'alertCircle' };
  if (st.state === 'syncing') return { label: 'Syncing', cls: 'bg-sky-500/10 text-sky-200', icon: 'sync' };
  if (isStale(st.lastSyncedAt)) return { label: 'Stale', cls: 'bg-amber-500/10 text-amber-200', icon: 'clock' };
  return { label: 'Connected', cls: 'bg-emerald-500/10 text-emerald-200', icon: 'checkCircle' };
}

function StatusRow({ d, source, canRetry }: { d: Dashboard; source: SourceId; canRetry: boolean }) {
  const st = d.sources.find((s) => s.source === source);
  const live = useApp((s) => s.sync?.progress[source]);
  const chip = chipFor(st, live);
  return (
    <div className="mb-5 flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', chip.cls)}>
          <Icon name={chip.icon} size={12} className={chip.label === 'Syncing' ? 'animate-spin motion-reduce:animate-none' : undefined} />
          {chip.label}
        </span>
        {st?.detail && <span className="text-xs text-zinc-300">{st.detail}</span>}
        <span className="ml-auto text-xs text-zinc-400">{st?.lastSyncedAt ? `Last updated ${timeAgo(st.lastSyncedAt)}` : 'Never synced'}</span>
      </div>
      {live?.state === 'syncing' && (
        <div className="h-1 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
          <div className="tr h-full origin-left bg-sky-400" style={{ transform: `scaleX(${Math.max(0.05, (live as { progress?: number }).progress ?? 0)})` }} />
        </div>
      )}
      {st?.state === 'error' && st.lastError && <ErrorNote>{st.lastError}</ErrorNote>}
      {canRetry && st && st.state !== 'not_connected' && (
        <Button size="sm" icon="sync" className="self-start" disabled={!!live && live.state === 'syncing'} onClick={() => void syncAll([source])}>
          {st.state === 'error' ? 'Retry' : 'Sync now'}
        </Button>
      )}
    </div>
  );
}

async function saveSettings(patch: Partial<PublicSettings> & { githubToken?: string }, ok?: string): Promise<boolean> {
  try {
    await api.put('/settings', patch);
    if (ok) toast(ok, 'success');
    await refresh();
    return true;
  } catch (err) {
    toast((err as Error).message, 'error');
    return false;
  }
}

async function disconnect(source: SourceId, name: string) {
  try {
    await api.del(`/sources/${source}`);
    toast(`${name} disconnected. Its synced data was removed.`, 'info');
    await refresh();
  } catch (err) {
    toast((err as Error).message, 'error');
  }
}

/* ------------------------------------------------------------------ */

function GithubTab({ d }: { d: Dashboard }) {
  const s = d.settings;
  const [username, setUsername] = useState(s.githubUsername);
  const [token, setToken] = useState('');
  const uid = useId();
  return (
    <>
      <StatusRow d={d} source="github" canRetry />
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void saveSettings({ githubUsername: username, ...(token ? { githubToken: token } : {}) }, username ? 'Saved. Syncing GitHub now.' : 'Saved.');
          setToken('');
        }}
      >
        <Field label="GitHub username" htmlFor={`${uid}-u`} hint="No sign-in needed. Runway reads your public profile, repositories and recent public events through GitHub's official API.">
          <input id={`${uid}-u`} className={clsx(inputClass, 'w-full')} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="octocat" autoComplete="off" spellCheck={false} maxLength={39} />
        </Field>
        <Field
          label="Personal access token (optional)"
          htmlFor={`${uid}-t`}
          hint={
            <>
              Raises the hourly limit and unlocks your full contribution calendar. A fine-grained token with no extra permissions is enough; private contributions only appear if you turned that on in your GitHub profile settings. Stored only on this computer.
              {s.hasGithubToken && <span className="mt-1 block text-zinc-300">Saved token: {s.githubTokenMasked}</span>}
            </>
          }
        >
          <input id={`${uid}-t`} type="password" className={clsx(inputClass, 'w-full')} value={token} onChange={(e) => setToken(e.target.value)} placeholder={s.hasGithubToken ? 'Leave empty to keep the saved token' : 'github_pat_…'} autoComplete="off" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary">
            Save and sync
          </Button>
          {s.hasGithubToken && (
            <Button variant="ghost" onClick={() => void saveSettings({ githubToken: '' }, 'Token removed.')}>
              Remove token
            </Button>
          )}
          {s.githubUsername && (
            <Button variant="danger" icon="trash" onClick={() => void disconnect('github', 'GitHub')}>
              Disconnect
            </Button>
          )}
        </div>
      </form>
    </>
  );
}

function CodeforcesTab({ d }: { d: Dashboard }) {
  const [handle, setHandle] = useState(d.settings.codeforcesHandle);
  const uid = useId();
  return (
    <>
      <StatusRow d={d} source="codeforces" canRetry />
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void saveSettings({ codeforcesHandle: handle }, handle ? 'Saved. Syncing Codeforces now.' : 'Saved.');
        }}
      >
        <Field label="Codeforces handle" htmlFor={`${uid}-h`} hint="Uses the official public API (profile, rating history and your latest 100 submissions). Requests are queued to respect Codeforces' limit of one every two seconds.">
          <input id={`${uid}-h`} className={clsx(inputClass, 'w-full')} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="tourist" autoComplete="off" spellCheck={false} maxLength={24} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary">
            Save and sync
          </Button>
          {d.settings.codeforcesHandle && (
            <Button variant="danger" icon="trash" onClick={() => void disconnect('codeforces', 'Codeforces')}>
              Disconnect
            </Button>
          )}
        </div>
      </form>
    </>
  );
}

function LeetcodeTab({ d }: { d: Dashboard }) {
  const lc = d.leetcode;
  const [v, setV] = useState({
    easy: lc?.easy ?? 0,
    medium: lc?.medium ?? 0,
    hard: lc?.hard ?? 0,
    totalEasy: lc?.totalEasy ?? 900,
    totalMedium: lc?.totalMedium ?? 1900,
    totalHard: lc?.totalHard ?? 850,
  });
  const [log, setLog] = useState(lc?.log ?? []);
  const [entry, setEntry] = useState({ title: '', difficulty: 'Medium' as 'Easy' | 'Medium' | 'Hard', tags: '' });
  const uid = useId();
  const num = (k: keyof typeof v) => (
    <input
      id={`${uid}-${k}`}
      type="number"
      min={k.startsWith('total') ? 1 : 0}
      max={10000}
      className={clsx(inputClass, 'num w-full')}
      value={v[k]}
      onChange={(e) => setV({ ...v, [k]: Math.max(0, Number(e.target.value) || 0) })}
    />
  );
  const save = async (nextLog = log) => {
    try {
      await api.put('/leetcode', { ...v, log: nextLog });
      toast('LeetCode counts saved.', 'success');
      await refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };
  return (
    <>
      <p className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-xs leading-relaxed text-zinc-300">
        LeetCode has no public API and its terms do not allow scraping, so Runway never fetches it. Enter your counts from your profile page; the card shows "Entered by you" with the date you last updated them.
      </p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid grid-cols-3 gap-3">
          {(['easy', 'medium', 'hard'] as const).map((k) => (
            <Field key={k} label={`${k[0]!.toUpperCase()}${k.slice(1)} solved`} htmlFor={`${uid}-${k}`}>
              {num(k)}
            </Field>
          ))}
          {(['totalEasy', 'totalMedium', 'totalHard'] as const).map((k) => (
            <Field key={k} label={`${k.replace('total', '')} available`} htmlFor={`${uid}-${k}`}>
              {num(k)}
            </Field>
          ))}
        </div>
        <Button type="submit" variant="primary" className="self-start">
          Save counts
        </Button>
      </form>

      <h3 className="mb-2 mt-6 text-sm font-medium text-zinc-200">Problem log (optional)</h3>
      <p className="mb-3 text-xs leading-relaxed text-zinc-400">Logged problems appear in Recent submissions and count towards Share of recent activity, using the tags you give them.</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!entry.title.trim()) return;
          const today = new Date();
          const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          const next = [{ id: crypto.randomUUID().slice(0, 8), title: entry.title.trim(), difficulty: entry.difficulty, date, tags: entry.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10) }, ...log];
          setLog(next);
          setEntry({ title: '', difficulty: 'Medium', tags: '' });
          void save(next);
        }}
      >
        <div className="min-w-[10rem] flex-1">
          <Field label="Problem" htmlFor={`${uid}-lt`}>
            <input id={`${uid}-lt`} className={clsx(inputClass, 'w-full')} value={entry.title} onChange={(e) => setEntry({ ...entry, title: e.target.value })} placeholder="Two Sum" maxLength={160} />
          </Field>
        </div>
        <Field label="Difficulty" htmlFor={`${uid}-ld`}>
          <select id={`${uid}-ld`} className={inputClass} value={entry.difficulty} onChange={(e) => setEntry({ ...entry, difficulty: e.target.value as 'Easy' })}>
            <option>Easy</option>
            <option>Medium</option>
            <option>Hard</option>
          </select>
        </Field>
        <div className="min-w-[8rem] flex-1">
          <Field label="Tags" htmlFor={`${uid}-lg`}>
            <input id={`${uid}-lg`} className={clsx(inputClass, 'w-full')} value={entry.tags} onChange={(e) => setEntry({ ...entry, tags: e.target.value })} placeholder="dp, graphs" />
          </Field>
        </div>
        <Button type="submit" icon="plus">
          Log
        </Button>
      </form>
      {log.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-zinc-800 rounded-lg border border-zinc-800">
          {log.slice(0, 8).map((l) => (
            <li key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="flex-1 truncate text-zinc-200">{l.title}</span>
              <span className="text-xs text-zinc-400">{l.difficulty}</span>
              <span className="num text-xs text-zinc-400">{l.date}</span>
              <button
                type="button"
                className="tr rounded p-1 text-zinc-400 hover:text-red-300"
                aria-label={`Remove ${l.title}`}
                onClick={() => {
                  const next = log.filter((x) => x.id !== l.id);
                  setLog(next);
                  void save(next);
                }}
              >
                <Icon name="x" size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ResumeTab({ d }: { d: Dashboard }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const r = d.resume;
  const upload = async (file: File) => {
    if (!(await requireAiNotice())) {
      if (input.current) input.current.value = '';
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.upload<{ unchanged: boolean; parsedBy: string }>('/resume', form);
      toast(res.unchanged ? 'Same file as before, so nothing to re-read.' : `Resume read${res.parsedBy === 'ai' ? ' by the agent' : ' with the local parser'}.`, 'success');
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <>
      <StatusRow d={d} source="resume" canRetry={false} />
      <div className="flex flex-col gap-3">
        <p className="text-xs leading-relaxed text-zinc-400">PDF, DOCX, TXT or Markdown, up to 5 MB. The file is read on this computer; Runway keeps its fingerprint and only re-reads it when the file changes. {d.settings.aiAvailable && !d.settings.localOnly ? 'With AI on, the text is sent to the Anthropic API to extract a structured profile.' : 'The local parser reads sections like Education, Skills, Projects and Experience.'}</p>
        <input ref={input} type="file" accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" className="sr-only" id="resume-file" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} disabled={busy || d.mode === 'demo'} />
        <label htmlFor="resume-file" className={clsx('control tr flex cursor-pointer flex-col items-center gap-2 rounded-xl border-dashed bg-zinc-900/50 px-4 py-6 text-center text-sm text-zinc-300 hover:bg-zinc-900', (busy || d.mode === 'demo') && 'pointer-events-none opacity-60')}>
          <Icon name="upload" size={20} className="text-zinc-400" />
          {busy ? 'Reading your resume…' : r && d.mode !== 'demo' ? 'Upload a new version' : 'Choose a resume file'}
        </label>
        {d.mode === 'demo' && <p className="text-xs text-violet-200">Turn off Demo data to upload your own resume.</p>}
        {error && <ErrorNote>{error}</ErrorNote>}
        {r && (
          <div className="rounded-xl border border-zinc-800 p-3 text-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Icon name="file" size={14} className="text-zinc-400" />
              <span className="font-medium text-zinc-100">{r.fileName}</span>
              <SourceTag origin={d.mode === 'demo' ? 'demo' : 'resume'} />
              <span className="text-xs text-zinc-400">{r.parsedBy === 'ai' ? 'Read by the agent' : r.parsedBy === 'heuristic' ? 'Read by the local parser' : ''}</span>
            </div>
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-zinc-400">Name</dt>
              <dd className="text-zinc-200">{r.profile.name ?? 'Not found'}</dd>
              <dt className="text-zinc-400">Skills</dt>
              <dd className="text-zinc-200">{r.profile.skills.slice(0, 18).join(', ') || 'None found'}</dd>
              <dt className="text-zinc-400">Projects</dt>
              <dd className="text-zinc-200">{r.profile.projects.map((p) => p.name).join(', ') || 'None found'}</dd>
              <dt className="text-zinc-400">Experience</dt>
              <dd className="text-zinc-200">{r.profile.experience.map((x) => [x.title, x.org].filter(Boolean).join(' at ')).join('; ') || 'None found'}</dd>
              <dt className="text-zinc-400">Education</dt>
              <dd className="text-zinc-200">{r.profile.education.map((x) => x.institution || x.degree).join('; ') || 'None found'}</dd>
            </dl>
            {d.mode !== 'demo' && (
              <Button variant="danger" size="sm" icon="trash" className="mt-3" onClick={() => void disconnect('resume', 'Resume')}>
                Remove resume
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function TimetableTab({ d }: { d: Dashboard }) {
  const uid = useId();
  const [cls, setCls] = useState<ClassInput>({ title: '', day: 0, start: '09:00', end: '10:00', location: null });
  const [dl, setDl] = useState<{ title: string; kind: DeadlineKind; due: string; location: string }>({ title: '', kind: 'exam', due: '', location: '' });
  const [icsUrl, setIcsUrl] = useState(d.settings.icsUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const post = async (path: string, body: unknown, ok: string) => {
    try {
      await api.post(path, body);
      toast(ok, 'success');
      await refresh();
      return true;
    } catch (err) {
      toast((err as Error).message, 'error');
      return false;
    }
  };
  const remove = async (path: string) => {
    try {
      await api.del(path);
      await refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };
  const importFile = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    try {
      const r = await api.upload<{ classes: number; deadlines: number }>('/timetable/ics', form);
      toast(`Imported ${r.classes} class times and ${r.deadlines} upcoming dates.`, 'success');
      await refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <StatusRow d={d} source="timetable" canRetry={!!d.settings.icsUrl} />
      <Section title="Exams and deadlines">
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await post('/deadlines', { title: dl.title.trim(), kind: dl.kind, due: dl.due, location: dl.location.trim() || null }, 'Date added.')) setDl({ title: '', kind: 'exam', due: '', location: '' });
          }}
        >
          <Field label="Title" htmlFor={`${uid}-dt`}>
            <input id={`${uid}-dt`} required className={clsx(inputClass, 'w-full')} value={dl.title} onChange={(e) => setDl({ ...dl, title: e.target.value })} placeholder="Operating Systems mid-sem" maxLength={160} />
          </Field>
          <Field label="Type" htmlFor={`${uid}-dk`}>
            <select id={`${uid}-dk`} className={clsx(inputClass, 'w-full')} value={dl.kind} onChange={(e) => setDl({ ...dl, kind: e.target.value as DeadlineKind })}>
              <option value="exam">Exam</option>
              <option value="project">Project</option>
              <option value="assignment">Assignment</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Date and time" htmlFor={`${uid}-dd`}>
            <input id={`${uid}-dd`} required type="datetime-local" className={clsx(inputClass, 'w-full')} value={dl.due} onChange={(e) => setDl({ ...dl, due: e.target.value })} />
          </Field>
          <Field label="Place (optional)" htmlFor={`${uid}-dl`}>
            <input id={`${uid}-dl`} className={clsx(inputClass, 'w-full')} value={dl.location} onChange={(e) => setDl({ ...dl, location: e.target.value })} placeholder="Exam Hall A" maxLength={120} />
          </Field>
          <Button type="submit" icon="plus" className="self-end sm:col-span-2 sm:justify-self-start">
            Add date
          </Button>
        </form>
        <ItemList items={d.deadlines.map((x) => ({ id: x.id, label: x.title, meta: new Date(x.due.length === 10 ? `${x.due}T09:00` : x.due).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }), origin: x.origin }))} onRemove={(id) => void remove(`/deadlines/${id}`)} />
      </Section>

      <Section title="Weekly classes">
        <form
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await post('/classes', { ...cls, title: cls.title.trim(), location: cls.location?.trim() || null }, 'Class added.')) setCls({ ...cls, title: '', location: null });
          }}
        >
          <div className="col-span-2">
            <Field label="Course" htmlFor={`${uid}-ct`}>
              <input id={`${uid}-ct`} required className={clsx(inputClass, 'w-full')} value={cls.title} onChange={(e) => setCls({ ...cls, title: e.target.value })} placeholder="Data Structures" maxLength={120} />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Day" htmlFor={`${uid}-cd`}>
              <select id={`${uid}-cd`} className={clsx(inputClass, 'w-full')} value={cls.day} onChange={(e) => setCls({ ...cls, day: Number(e.target.value) })}>
                {DAYS.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Starts" htmlFor={`${uid}-cs`}>
            <input id={`${uid}-cs`} required type="time" className={clsx(inputClass, 'w-full')} value={cls.start} onChange={(e) => setCls({ ...cls, start: e.target.value })} />
          </Field>
          <Field label="Ends" htmlFor={`${uid}-ce`}>
            <input id={`${uid}-ce`} required type="time" className={clsx(inputClass, 'w-full')} value={cls.end} onChange={(e) => setCls({ ...cls, end: e.target.value })} />
          </Field>
          <div className="col-span-2">
            <Field label="Room (optional)" htmlFor={`${uid}-cl`}>
              <input id={`${uid}-cl`} className={clsx(inputClass, 'w-full')} value={cls.location ?? ''} onChange={(e) => setCls({ ...cls, location: e.target.value })} placeholder="LH-101" maxLength={120} />
            </Field>
          </div>
          <Button type="submit" icon="plus" className="col-span-2 justify-self-start">
            Add class
          </Button>
        </form>
        <ItemList items={[...d.classes].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)).map((c) => ({ id: c.id, label: c.title, meta: `${DAYS[c.day]!.slice(0, 3)} ${c.start}–${c.end}${c.location ? `, ${c.location}` : ''}`, origin: c.origin }))} onRemove={(id) => void remove(`/classes/${id}`)} />
      </Section>

      <Section title="Import a calendar">
        <p className="mb-3 text-xs leading-relaxed text-zinc-400">Repeating events become weekly classes. One-off events in the next six months become dates; titles with words like exam, quiz or mid-sem are marked as exams. Importing again replaces earlier imports and keeps what you entered by hand.</p>
        <input ref={fileRef} id={`${uid}-ics`} type="file" accept=".ics,text/calendar" className="sr-only" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
        <label htmlFor={`${uid}-ics`} className="control tr inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-900/80 px-3 text-sm text-zinc-100 hover:bg-zinc-800">
          <Icon name="upload" size={16} /> Import .ics file
        </label>
        <form
          className="mt-4 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveSettings({ icsUrl: icsUrl.trim() }, icsUrl.trim() ? 'Calendar link saved. Syncing it now.' : 'Calendar link removed.');
          }}
        >
          <Field label="Calendar subscription link (optional)" htmlFor={`${uid}-iu`} hint="An https:// or webcal:// link. It is re-read every time you press Sync all.">
            <input id={`${uid}-iu`} className={clsx(inputClass, 'w-full')} value={icsUrl} onChange={(e) => setIcsUrl(e.target.value)} placeholder="https://…/calendar.ics" maxLength={2048} />
          </Field>
          <Button type="submit" className="self-start">
            Save link
          </Button>
        </form>
      </Section>
    </>
  );
}

function SettingsTab({ d }: { d: Dashboard }) {
  const s = d.settings;
  const uid = useId();
  const [role, setRole] = useState(s.targetRole);
  const [hours, setHours] = useState(String(s.studyHoursPerDay));
  const [interval, setIntervalMin] = useState(String(s.syncIntervalMinutes));
  const [axes, setAxes] = useState(s.radarAxes.join(', '));
  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const axisList = axes.split(',').map((a) => a.trim()).filter(Boolean);
          void saveSettings({ targetRole: role.trim(), studyHoursPerDay: Number(hours), syncIntervalMinutes: Number(interval), radarAxes: axisList.length >= 3 ? axisList : [...DEFAULT_RADAR_AXES] }, 'Settings saved.');
        }}
      >
        <Field label="Target role" htmlFor={`${uid}-r`} hint="Smart sort ranks your projects for this role, for example backend internship or data analyst.">
          <input id={`${uid}-r`} className={clsx(inputClass, 'w-full')} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Backend internship" maxLength={80} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Study hours per day" htmlFor={`${uid}-h`} hint="Outside classes. Used to check whether tasks fit before their deadlines.">
            <input id={`${uid}-h`} type="number" min={0} max={16} step={0.5} className={clsx(inputClass, 'num w-full')} value={hours} onChange={(e) => setHours(e.target.value)} />
          </Field>
          <Field label="Background refresh (minutes)" htmlFor={`${uid}-i`} hint="How often GitHub and Codeforces refresh while Runway is open.">
            <input id={`${uid}-i`} type="number" min={5} max={1440} className={clsx(inputClass, 'num w-full')} value={interval} onChange={(e) => setIntervalMin(e.target.value)} />
          </Field>
        </div>
        <Field label="Activity areas" htmlFor={`${uid}-a`} hint="Comma-separated, 3 to 8. Known areas: Web, Backend, AI/ML, Data Structures, Systems, DevOps, Data, Mobile, Security.">
          <input id={`${uid}-a`} className={clsx(inputClass, 'w-full')} value={axes} onChange={(e) => setAxes(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" className="self-start">
          Save settings
        </Button>
      </form>

      <Section title="AI">
        <p className="mb-3 text-xs leading-relaxed text-zinc-400">
          {s.aiAvailable ? (
            <>
              An API key is set on the server (model <span className="num text-zinc-300">{s.model}</span>). AI features send resume text and short activity summaries to the Anthropic API.
            </>
          ) : (
            <>No ANTHROPIC_API_KEY is set, so every feature uses local rules. Add a key to .env and restart to turn AI on.</>
          )}
        </p>
        <label className="flex items-center gap-3 text-sm text-zinc-200">
          <input type="checkbox" className="h-4 w-4 accent-emerald-400" checked={s.localOnly} onChange={(e) => void saveSettings({ localOnly: e.target.checked }, e.target.checked ? 'Local only: no AI calls will be made.' : 'AI calls allowed again.')} />
          Local only (never call the AI)
        </label>
      </Section>

      <Section title="Demo data">
        <p className="mb-3 text-xs leading-relaxed text-zinc-400">Fills every card with clearly badged sample data, with dates relative to today. Your real data is kept separately and comes back when you turn it off.</p>
        <DemoToggle d={d} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6 border-t border-zinc-800 pt-5 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-sm font-medium text-zinc-100">{title}</h3>
      {children}
    </section>
  );
}

function ItemList({ items, onRemove }: { items: { id: string; label: string; meta: string; origin: Parameters<typeof SourceTag>[0]['origin'] }[]; onRemove: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <ul className="mt-3 flex flex-col divide-y divide-zinc-800 rounded-lg border border-zinc-800">
      {items.map((it) => (
        <li key={it.id} className="flex items-center gap-2 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate text-zinc-200">{it.label}</span>
          <span className="hidden text-xs text-zinc-400 sm:inline">{it.meta}</span>
          <SourceTag origin={it.origin} />
          <button type="button" className="tr rounded p-1 text-zinc-400 hover:text-red-300" aria-label={`Remove ${it.label}`} onClick={() => onRemove(it.id)}>
            <Icon name="x" size={13} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */

export function ConnectionsModal({ d }: { d: Dashboard | null }) {
  const { connections } = usePanels();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const active = connections ?? 'github';
  const idx = TABS.findIndex((t) => t.id === active);

  useEffect(() => {
    if (connections) tabRefs.current[idx]?.focus();
    // focus the active tab when the panel opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections === null]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const n = (idx + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + TABS.length) % TABS.length;
    openConnections(TABS[n]!.id);
    tabRefs.current[n]?.focus();
  };

  return (
    <Modal open={connections !== null} onClose={closeConnections} title="Connections and settings" wide>
      {!d ? null : (
        <div className="flex flex-col gap-5 sm:flex-row">
          <div role="tablist" aria-orientation="vertical" aria-label="Sources" className="scrollbar-thin -mx-1 flex shrink-0 gap-1 overflow-x-auto px-1 sm:mx-0 sm:w-40 sm:flex-col sm:overflow-visible sm:px-0" onKeyDown={onKey}>
            {TABS.map((t, i) => {
              const st = d.sources.find((s) => s.source === t.id);
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={active === t.id}
                  aria-controls={`panel-${t.id}`}
                  tabIndex={active === t.id ? 0 : -1}
                  onClick={() => openConnections(t.id)}
                  className={clsx('tr flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm', active === t.id ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200')}
                >
                  <Icon name={t.icon} size={15} />
                  <span className="flex-1">{t.label}</span>
                  {st && st.state !== 'not_connected' && <span className={clsx('h-1.5 w-1.5 rounded-full', st.state === 'error' ? 'bg-red-400' : isStale(st.lastSyncedAt) ? 'bg-amber-400' : 'bg-emerald-400')} aria-label={st.state === 'error' ? 'error' : 'connected'} />}
                </button>
              );
            })}
          </div>
          <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`} className="min-w-0 flex-1" key={`${active}-${d.mode}`}>
            {d.mode === 'demo' && active !== 'settings' && (
              <p className="mb-4 rounded-lg border border-violet-400/30 bg-violet-500/10 p-3 text-xs leading-relaxed text-violet-100">
                {active === 'leetcode' || active === 'timetable'
                  ? 'Demo data is on, so entries here change the demo copy. Turn Demo data off in Settings to edit your own.'
                  : 'Demo data is on. Account details saved here belong to your real data and sync when you turn Demo data off.'}
              </p>
            )}
            {active === 'github' && <GithubTab d={d} />}
            {active === 'codeforces' && <CodeforcesTab d={d} />}
            {active === 'leetcode' && <LeetcodeTab d={d} />}
            {active === 'resume' && <ResumeTab d={d} />}
            {active === 'timetable' && <TimetableTab d={d} />}
            {active === 'settings' && <SettingsTab d={d} />}
          </div>
        </div>
      )}
    </Modal>
  );
}
