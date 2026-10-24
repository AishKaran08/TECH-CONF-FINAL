import { describe, expect, it, vi } from 'vitest';
import { CodeforcesClient, fetchCodeforces, mapSubmission, RateQueue } from './codeforces';

const ok = (result: unknown) => new Response(JSON.stringify({ status: 'OK', result }));

describe('RateQueue', () => {
  it('spaces requests at least gapMs apart, in order', async () => {
    let t = 0;
    const sleeps: number[] = [];
    const q = new RateQueue(2000, async (ms) => {
      sleeps.push(ms);
      t += ms;
    }, () => t);
    const order: number[] = [];
    await Promise.all([1, 2, 3].map((n) => q.run(async () => order.push(n))));
    expect(order).toEqual([1, 2, 3]);
    expect(sleeps).toEqual([2000, 2000]);
  });
  it('keeps going after a failed call', async () => {
    const q = new RateQueue(0);
    await expect(q.run(async () => { throw new Error('x'); })).rejects.toThrow('x');
    await expect(q.run(async () => 5)).resolves.toBe(5);
  });
});

describe('Codeforces adapter', () => {
  it('maps verdicts to words and builds problem links', () => {
    const s = mapSubmission({ id: 9, contestId: 1985, creationTimeSeconds: 1790000000, problem: { contestId: 1985, index: 'D', name: 'Manhattan Circle', tags: ['implementation'], rating: 1100 }, programmingLanguage: 'GNU C++17', verdict: 'WRONG_ANSWER', passedTestCount: 2 });
    expect(s).toMatchObject({ id: '9', accepted: false, verdictText: 'Wrong answer on test 3', url: 'https://codeforces.com/contest/1985/problem/D', difficulty: '1100' });
    expect(mapSubmission({ id: 1, creationTimeSeconds: 1, problem: { index: 'A', name: 'x', tags: [] }, verdict: 'OK' })).toMatchObject({ accepted: true, verdictText: 'Accepted', url: null });
  });

  it('calls user.info, user.rating and user.status through the queue', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('user.info')) return ok([{ handle: 'tourist', rating: 3700, maxRating: 3900, rank: 'legendary grandmaster', maxRank: 'legendary grandmaster' }]);
      if (u.includes('user.rating')) return ok([{ contestId: 1, contestName: 'Round 1', rank: 1, oldRating: 3600, newRating: 3700, ratingUpdateTimeSeconds: 1790000000 }]);
      return ok([{ id: 5, creationTimeSeconds: 1790000000, problem: { contestId: 1, index: 'A', name: 'P', tags: ['dp'] }, verdict: 'OK' }]);
    });
    const snap = await fetchCodeforces(new CodeforcesClient(f as unknown as typeof fetch, new RateQueue(0)), 'tourist');
    expect(f).toHaveBeenCalledTimes(3);
    expect(String(f.mock.calls[2]![0])).toContain('user.status?handle=tourist&from=1&count=100');
    expect(snap.user.rating).toBe(3700);
    expect(snap.ratings[0]!.newRating).toBe(3700);
    expect(snap.submissions[0]!.accepted).toBe(true);
  });

  it('explains a missing handle', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ status: 'FAILED', comment: 'handles: User with handle zz not found' }), { status: 400 }));
    await expect(fetchCodeforces(new CodeforcesClient(f as unknown as typeof fetch, new RateQueue(0)), 'zz')).rejects.toThrow('Codeforces handle not found');
  });
});
