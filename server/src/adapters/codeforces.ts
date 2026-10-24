import { verdictToWords, type CodeforcesUser, type RatingChange, type Submission } from '@runway/shared';
import { SourceError } from './github';

type Fetch = typeof fetch;

/**
 * Serializes calls so at most one request starts every `gapMs` (Codeforces allows 1 per 2 seconds).
 * Shared across all syncs in the process.
 */
export class RateQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private last = Number.NEGATIVE_INFINITY;
  constructor(
    private readonly gapMs: number,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private readonly clock: () => number = () => Date.now(),
  ) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(async () => {
      const wait = this.last + this.gapMs - this.clock();
      if (wait > 0) await this.sleep(wait);
      this.last = this.clock();
      return fn();
    });
    this.tail = next.catch(() => undefined);
    return next;
  }
}

const API = 'https://codeforces.com/api';

interface CfResponse<T> {
  status: 'OK' | 'FAILED';
  comment?: string;
  result?: T;
}

export class CodeforcesClient {
  constructor(
    private readonly fetchImpl: Fetch,
    private readonly queue: RateQueue,
  ) {}

  async call<T>(method: string, params: Record<string, string | number>): Promise<T> {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])));
    return this.queue.run(async () => {
      let res: Response;
      try {
        res = await this.fetchImpl(`${API}/${method}?${qs}`, { headers: { 'user-agent': 'Runway-dashboard' }, signal: AbortSignal.timeout(20_000) });
      } catch {
        throw new SourceError('Could not reach Codeforces. Check your internet connection.', 'network');
      }
      if (res.status === 503 || res.status === 429) throw new SourceError('Codeforces is busy or limiting requests. Try again in a minute.', 'rate_limited');
      let body: CfResponse<T>;
      try {
        body = (await res.json()) as CfResponse<T>;
      } catch {
        throw new SourceError(`Codeforces returned an unexpected response (${res.status}).`, 'bad_response');
      }
      if (body.status !== 'OK' || body.result === undefined) {
        const c = body.comment ?? '';
        if (/not found/i.test(c)) throw new SourceError('Codeforces handle not found. Check it in Connections.', 'not_found');
        if (/limit/i.test(c)) throw new SourceError('Codeforces is limiting requests. Try again in a minute.', 'rate_limited');
        throw new SourceError(`Codeforces said: ${c || 'unknown error'}`, 'bad_response');
      }
      return body.result;
    });
  }
}

interface RawCfUser {
  handle: string;
  rating?: number;
  maxRating?: number;
  rank?: string;
  maxRank?: string;
}
interface RawRating {
  contestId: number;
  contestName: string;
  rank: number;
  oldRating: number;
  newRating: number;
  ratingUpdateTimeSeconds: number;
}
interface RawSubmission {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  problem: { contestId?: number; index: string; name: string; tags: string[]; rating?: number };
  programmingLanguage?: string;
  verdict?: string;
  passedTestCount?: number;
}

export function mapSubmission(s: RawSubmission): Submission {
  const contestId = s.problem.contestId ?? s.contestId;
  const url = contestId ? (contestId >= 100000 ? `https://codeforces.com/gym/${contestId}/problem/${s.problem.index}` : `https://codeforces.com/contest/${contestId}/problem/${s.problem.index}`) : null;
  return {
    id: String(s.id),
    origin: 'codeforces',
    problemName: s.problem.name,
    problemId: `${contestId ?? ''}${s.problem.index}`,
    url,
    tags: s.problem.tags,
    verdict: s.verdict ?? 'TESTING',
    accepted: s.verdict === 'OK',
    verdictText: verdictToWords(s.verdict, s.passedTestCount),
    language: s.programmingLanguage ?? null,
    difficulty: s.problem.rating ? String(s.problem.rating) : null,
    time: new Date(s.creationTimeSeconds * 1000).toISOString(),
  };
}

export interface CodeforcesSnapshot {
  user: CodeforcesUser;
  ratings: RatingChange[];
  submissions: Submission[];
}

export async function fetchCodeforces(client: CodeforcesClient, handle: string, onStep: (p: number, msg: string) => void = () => {}): Promise<CodeforcesSnapshot> {
  onStep(0.1, 'Reading profile (queued, 1 request per 2 s)');
  const [u] = await client.call<RawCfUser[]>('user.info', { handles: handle });
  if (!u) throw new SourceError('Codeforces handle not found. Check it in Connections.', 'not_found');
  onStep(0.4, 'Reading rating history');
  const ratings = await client.call<RawRating[]>('user.rating', { handle });
  onStep(0.7, 'Reading recent submissions');
  const subs = await client.call<RawSubmission[]>('user.status', { handle, from: 1, count: 100 });
  return {
    user: { handle: u.handle, rating: u.rating ?? null, maxRating: u.maxRating ?? null, rank: u.rank ?? null, maxRank: u.maxRank ?? null },
    ratings: ratings.map((r) => ({ contestId: r.contestId, contestName: r.contestName, rank: r.rank, oldRating: r.oldRating, newRating: r.newRating, time: new Date(r.ratingUpdateTimeSeconds * 1000).toISOString() })),
    submissions: subs.map(mapSubmission),
  };
}
