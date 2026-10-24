import ical, { type VEvent } from 'node-ical';
import { addDays, pad2, toLocalDateTime, weekdayIndex, type ClassSession, type Deadline, type DeadlineKind } from '@runway/shared';
import { SourceError } from './github';

/**
 * .ics import. Recurring events become weekly classes; one-off upcoming events become dated
 * deadlines (exams are recognised by their title). Only text from the file is used, as data.
 */

const MAX_ICS_BYTES = 2 * 1024 * 1024;

function text(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'val' in v) return String((v as { val: unknown }).val);
  return '';
}

function clock(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function kindFromTitle(title: string): DeadlineKind {
  const t = title.toLowerCase();
  if (/\b(exam|mid[\s-]?sem|end[\s-]?sem|midterm|final|quiz|test|viva|cat\s?\d|semester exam)\b/.test(t)) return 'exam';
  if (/\b(assignment|homework|submission|lab record|worksheet)\b/.test(t)) return 'assignment';
  if (/\b(project|demo|presentation|review)\b/.test(t)) return 'project';
  return 'other';
}

export interface IcsResult {
  classes: ClassSession[];
  deadlines: Deadline[];
}

export function parseIcs(body: string, now: Date, horizonDays = 180): IcsResult {
  if (Buffer.byteLength(body) > MAX_ICS_BYTES) throw new SourceError('That calendar file is larger than 2 MB.', 'bad_response');
  if (!/BEGIN:VCALENDAR/i.test(body)) throw new SourceError('That file does not look like an .ics calendar.', 'bad_response');
  let data: Record<string, unknown>;
  try {
    data = ical.sync.parseICS(body) as Record<string, unknown>;
  } catch {
    throw new SourceError('Could not read that calendar file.', 'bad_response');
  }

  const classes: ClassSession[] = [];
  const deadlines: Deadline[] = [];
  const seenClass = new Set<string>();
  const horizon = addDays(now, horizonDays);

  for (const raw of Object.values(data)) {
    if (!raw || typeof raw !== 'object' || (raw as { type?: string }).type !== 'VEVENT') continue;
    const ev = raw as VEvent;
    const title = text(ev.summary).trim().slice(0, 120) || 'Untitled';
    const location = text(ev.location).trim().slice(0, 120) || null;
    const start = ev.start ? new Date(ev.start) : null;
    if (!start || Number.isNaN(start.getTime())) continue;
    const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 3600_000);
    const uid = (ev.uid || title).slice(0, 60);

    if (ev.rrule) {
      // Weekly pattern: look at the next two weeks of occurrences to learn which weekdays it meets.
      let occ: Date[] = [];
      try {
        occ = ev.rrule.between(now, addDays(now, 14), true);
      } catch {
        occ = [];
      }
      const durationMs = Math.max(15 * 60_000, end.getTime() - start.getTime());
      for (const o of occ) {
        if (ev.datetype === 'date') continue; // all-day recurring items are not classes
        const day = weekdayIndex(o);
        const s = clock(o);
        const e = clock(new Date(o.getTime() + durationMs));
        const key = `${uid}|${day}|${s}`;
        if (seenClass.has(key) || e <= s) continue;
        seenClass.add(key);
        classes.push({ id: `ics:${uid}:${day}:${s.replace(':', '')}`, title, day, start: s, end: e, location, origin: 'ics' });
      }
      continue;
    }

    // One-off events: upcoming ones within the horizon become deadlines.
    if (start.getTime() < now.getTime() - 86400_000 || start.getTime() > horizon.getTime()) continue;
    const due = ev.datetype === 'date' ? `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}` : toLocalDateTime(start);
    deadlines.push({ id: `ics:${uid}`, title, kind: kindFromTitle(title), due, location, origin: 'ics' });
  }

  classes.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  deadlines.sort((a, b) => a.due.localeCompare(b.due));
  return { classes, deadlines };
}

/** Fetch an .ics subscription URL (http/https only, size and time limited). */
export async function fetchIcs(fetchImpl: typeof fetch, url: string): Promise<string> {
  let u: URL;
  try {
    u = new URL(url.replace(/^webcal:/i, 'https:'));
  } catch {
    throw new SourceError('The calendar link is not a valid URL.', 'bad_response');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new SourceError('Calendar links must start with https:// or webcal://', 'bad_response');
  let res: Response;
  try {
    res = await fetchImpl(u, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'Runway-dashboard' } });
  } catch {
    throw new SourceError('Could not download the calendar. Check the link and your connection.', 'network');
  }
  if (!res.ok) throw new SourceError(`The calendar link returned an error (${res.status}).`, 'bad_response');
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_ICS_BYTES) throw new SourceError('That calendar is larger than 2 MB.', 'bad_response');
  return res.text();
}

/** Replace previously imported (origin 'ics') items, keep everything entered by hand. Returns counts. */
export function mergeIcs<T extends { id: string; origin: string }>(existing: T[], incoming: T[]): { merged: T[]; added: number; removed: number } {
  const oldIds = new Set(existing.filter((x) => x.origin === 'ics').map((x) => x.id));
  const newIds = new Set(incoming.map((x) => x.id));
  const added = incoming.filter((x) => !oldIds.has(x.id)).length;
  const removed = [...oldIds].filter((id) => !newIds.has(id)).length;
  return { merged: [...existing.filter((x) => x.origin !== 'ics'), ...incoming], added, removed };
}
