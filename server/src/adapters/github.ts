import { addDays, toDateOnly, type ContributionCalendar, type GithubEvent, type GithubProfile, type GithubRepo } from '@runway/shared';
import type { Store } from '../store';

/**
 * GitHub through the official REST API (and GraphQL for the contribution calendar when the user
 * adds a token). Never scrapes github.com. Uses ETag / If-None-Match so unchanged responses
 * come back as 304 and do not count against the rate limit.
 */

export class SourceError extends Error {
  constructor(
    message: string,
    readonly kind: 'not_found' | 'rate_limited' | 'auth' | 'network' | 'bad_response',
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;
const API = 'https://api.github.com';

export interface RateInfo {
  remaining: number;
  resetAt: string;
}

export class GithubClient {
  rate: RateInfo | null = null;
  constructor(
    private readonly fetchImpl: Fetch,
    private readonly cache: Store,
    private readonly token: string,
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'Runway-dashboard',
      ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      ...extra,
    };
  }

  private noteRate(res: Response): void {
    const remaining = res.headers.get('x-ratelimit-remaining');
    const reset = res.headers.get('x-ratelimit-reset');
    if (remaining !== null && reset !== null) this.rate = { remaining: Number(remaining), resetAt: new Date(Number(reset) * 1000).toISOString() };
  }

  private rateError(res: Response): SourceError {
    const reset = res.headers.get('x-ratelimit-reset');
    const at = reset ? new Date(Number(reset) * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'soon';
    return new SourceError(
      `GitHub's rate limit is used up until ${at}. ${this.token ? 'It resets on its own.' : 'Adding a personal access token in Connections raises the limit.'} The last good data stays on screen.`,
      'rate_limited',
    );
  }

  /** GET with ETag caching. Returns the parsed JSON body. */
  async get<T>(path: string): Promise<T> {
    const url = `${API}${path}`;
    const cacheKey = `etag:${this.token ? 'auth:' : ''}${url}`;
    const cached = this.cache.getDoc<{ etag: string; body: unknown }>(cacheKey);
    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers: this.headers(cached ? { 'if-none-match': cached.etag } : {}), signal: AbortSignal.timeout(20_000) });
    } catch {
      throw new SourceError('Could not reach GitHub. Check your internet connection.', 'network');
    }
    this.noteRate(res);
    if (res.status === 304 && cached) return cached.body as T;
    if (res.status === 404) throw new SourceError('GitHub user not found. Check the username in Connections.', 'not_found');
    if (res.status === 401) throw new SourceError('GitHub rejected the token. Remove it or paste a new one in Connections.', 'auth');
    if ((res.status === 403 || res.status === 429) && (res.headers.get('x-ratelimit-remaining') === '0' || res.status === 429)) throw this.rateError(res);
    if (!res.ok) throw new SourceError(`GitHub returned an error (${res.status}). Try again in a minute.`, 'bad_response');
    const body = (await res.json()) as T;
    const etag = res.headers.get('etag');
    if (etag) this.cache.setDoc(cacheKey, { etag, body });
    return body;
  }

  async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${API}/graphql`, {
        method: 'POST',
        headers: this.headers({ 'content-type': 'application/json' }),
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new SourceError('Could not reach GitHub. Check your internet connection.', 'network');
    }
    this.noteRate(res);
    if (res.status === 401) throw new SourceError('GitHub rejected the token. Remove it or paste a new one in Connections.', 'auth');
    if (res.status === 403 || res.status === 429) throw this.rateError(res);
    if (!res.ok) throw new SourceError(`GitHub returned an error (${res.status}).`, 'bad_response');
    const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (body.errors?.length || !body.data) throw new SourceError('GitHub could not return the contribution calendar.', 'bad_response');
    return body.data;
  }
}

/* ---------------- raw API shapes (only the fields we use) ---------------- */

interface RawUser {
  login: string;
  name: string | null;
  avatar_url: string | null;
  html_url: string;
  public_repos: number;
  followers: number;
}
interface RawRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  topics?: string[];
  pushed_at: string | null;
  fork: boolean;
  archived?: boolean;
}
interface RawEvent {
  id: string;
  type: string;
  repo: { name: string };
  created_at: string;
  payload?: { size?: number; distinct_size?: number; commits?: unknown[] };
}

export function mapRepo(r: RawRepo): GithubRepo {
  return {
    id: String(r.id),
    name: r.name,
    fullName: r.full_name,
    url: r.html_url,
    description: r.description,
    language: r.language,
    stars: r.stargazers_count,
    topics: r.topics ?? [],
    pushedAt: r.pushed_at,
    fork: r.fork,
  };
}

/** Commits in a PushEvent when GitHub reports them; otherwise each event counts once. */
export function mapEvent(e: RawEvent): GithubEvent {
  const commits = e.type === 'PushEvent' ? (e.payload?.distinct_size ?? e.payload?.size ?? e.payload?.commits?.length ?? 1) : 1;
  return { id: e.id, type: e.type, repo: e.repo.name, createdAt: e.created_at, count: Math.max(1, commits) };
}

/** Heatmap from public events: honest about its range (GitHub keeps ~90 days, at most 300 events). */
export function calendarFromEvents(events: GithubEvent[], now: Date, days = 90): ContributionCalendar {
  const from = addDays(now, -(days - 1));
  const counts = new Map<string, number>();
  for (const e of events) {
    const key = toDateOnly(new Date(e.createdAt));
    counts.set(key, (counts.get(key) ?? 0) + e.count);
  }
  const out: { date: string; count: number }[] = [];
  for (let d = from; toDateOnly(d) <= toDateOnly(now); d = addDays(d, 1)) out.push({ date: toDateOnly(d), count: counts.get(toDateOnly(d)) ?? 0 });
  return { basis: 'events', from: out[0]!.date, to: out[out.length - 1]!.date, days: out };
}

const CALENDAR_QUERY = `query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    }
  }
}`;

export interface GithubSnapshot {
  profile: GithubProfile;
  repos: GithubRepo[];
  events: GithubEvent[];
  calendar: ContributionCalendar;
  rate: RateInfo | null;
}

/** Fetch everything for a username. `onStep` reports progress 0..1 with a short message. */
export async function fetchGithub(
  client: GithubClient,
  username: string,
  opts: { now: Date; useGraphql: boolean; onStep?: (progress: number, message: string) => void },
): Promise<GithubSnapshot> {
  const step = opts.onStep ?? (() => {});
  const u = encodeURIComponent(username);
  step(0.1, 'Reading profile');
  const raw = await client.get<RawUser>(`/users/${u}`);
  const profile: GithubProfile = { login: raw.login, name: raw.name, avatarUrl: raw.avatar_url, htmlUrl: raw.html_url, publicRepos: raw.public_repos, followers: raw.followers };

  step(0.3, 'Reading repositories');
  const repos: GithubRepo[] = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await client.get<RawRepo[]>(`/users/${u}/repos?per_page=100&sort=pushed&type=owner&page=${page}`);
    repos.push(...batch.filter((r) => !r.archived).map(mapRepo));
    if (batch.length < 100) break;
  }

  step(0.55, 'Reading recent events');
  const events: GithubEvent[] = [];
  const since = opts.now.getTime() - 90 * 86400_000;
  for (let page = 1; page <= 3; page++) {
    const batch = await client.get<RawEvent[]>(`/users/${u}/events/public?per_page=100&page=${page}`);
    events.push(...batch.map(mapEvent).filter((e) => Date.parse(e.createdAt) >= since));
    if (batch.length < 100) break;
  }

  let calendar: ContributionCalendar;
  if (opts.useGraphql) {
    step(0.8, 'Reading contribution calendar');
    const from = addDays(opts.now, -26 * 7 + 1);
    from.setHours(0, 0, 0, 0);
    const data = await client.graphql<{ user: { contributionsCollection: { contributionCalendar: { weeks: { contributionDays: { date: string; contributionCount: number }[] }[] } } } | null }>(CALENDAR_QUERY, {
      login: username,
      from: from.toISOString(),
      to: opts.now.toISOString(),
    });
    if (!data.user) throw new SourceError('GitHub user not found. Check the username in Connections.', 'not_found');
    const days = data.user.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays).map((d) => ({ date: d.date, count: d.contributionCount }));
    calendar = { basis: 'graphql', from: days[0]?.date ?? toDateOnly(from), to: days[days.length - 1]?.date ?? toDateOnly(opts.now), days };
  } else {
    calendar = calendarFromEvents(events, opts.now);
  }
  step(0.95, 'Saving');
  return { profile, repos, events, calendar, rate: client.rate };
}
