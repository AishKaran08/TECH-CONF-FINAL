import { describe, expect, it } from 'vitest';
import { kindFromTitle, mergeIcs, parseIcs } from './ics';

const now = new Date(2026, 9, 24, 8, 0); // Sat 24 Oct 2026 local
const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:dsa-1
DTSTAMP:20260901T000000
DTSTART:20260907T090000
DTEND:20260907T100000
RRULE:FREQ=WEEKLY;BYDAY=MO,TH
SUMMARY:Data Structures
LOCATION:LH-101
END:VEVENT
BEGIN:VEVENT
UID:os-mid
DTSTAMP:20260901T000000
DTSTART:20261030T100000
DTEND:20261030T130000
SUMMARY:Operating Systems Mid-Sem Exam
LOCATION:Hall A
END:VEVENT
BEGIN:VEVENT
UID:past
DTSTAMP:20260901T000000
DTSTART:20260101T100000
SUMMARY:Old quiz
END:VEVENT
END:VCALENDAR`;

describe('ics import', () => {
  it('turns weekly events into classes and upcoming one-offs into deadlines', () => {
    const r = parseIcs(ICS, now);
    expect(r.classes.map((c) => [c.title, c.day, c.start, c.end])).toEqual([
      ['Data Structures', 0, '09:00', '10:00'],
      ['Data Structures', 3, '09:00', '10:00'],
    ]);
    expect(r.classes[0]!.location).toBe('LH-101');
    expect(r.deadlines).toHaveLength(1);
    expect(r.deadlines[0]).toMatchObject({ title: 'Operating Systems Mid-Sem Exam', kind: 'exam', due: '2026-10-30T10:00', origin: 'ics' });
  });

  it('rejects files that are not calendars', () => {
    expect(() => parseIcs('hello', now)).toThrow(/does not look like an .ics/);
  });

  it('classifies titles', () => {
    expect(kindFromTitle('CN Quiz 2')).toBe('exam');
    expect(kindFromTitle('DBMS assignment 3')).toBe('assignment');
    expect(kindFromTitle('Mini project review')).toBe('project');
    expect(kindFromTitle('Club meeting')).toBe('other');
  });

  it('replaces earlier imports and keeps manual entries', () => {
    const existing = [{ id: 'm1', origin: 'manual' }, { id: 'ics:a', origin: 'ics' }, { id: 'ics:b', origin: 'ics' }];
    const r = mergeIcs(existing, [{ id: 'ics:b', origin: 'ics' }, { id: 'ics:c', origin: 'ics' }]);
    expect(r.merged.map((x) => x.id)).toEqual(['m1', 'ics:b', 'ics:c']);
    expect(r).toMatchObject({ added: 1, removed: 1 });
  });
});
