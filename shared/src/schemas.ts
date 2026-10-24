import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

/** ISO timestamp string (e.g. 2026-10-24T10:00:00.000Z). */
export const IsoString = z.string().min(10).max(40);
/** Calendar date YYYY-MM-DD. */
export const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
/** 24h clock time HH:MM. */
export const ClockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)');

export const SourceId = z.enum(['github', 'codeforces', 'leetcode', 'resume', 'timetable']);
export type SourceId = z.infer<typeof SourceId>;

/** Who a record came from. Shown on every record in the UI. */
export const RecordOrigin = z.enum(['github', 'codeforces', 'resume', 'manual', 'ics', 'demo']);
export type RecordOrigin = z.infer<typeof RecordOrigin>;

export const SourceState = z.enum(['not_connected', 'connected', 'syncing', 'error']);
export type SourceState = z.infer<typeof SourceState>;

export const SourceStatus = z.object({
  source: SourceId,
  state: SourceState,
  lastSyncedAt: IsoString.nullable(),
  lastError: z.string().nullable(),
  /** Short human detail, e.g. "@octocat · 42 repos". */
  detail: z.string().nullable(),
});
export type SourceStatus = z.infer<typeof SourceStatus>;

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export const DEFAULT_RADAR_AXES = ['Web', 'Backend', 'AI/ML', 'Data Structures', 'Systems', 'DevOps'] as const;

export const Settings = z.object({
  githubUsername: z.string().max(39).default(''),
  /** Stored server-side only. Never returned unmasked. */
  githubToken: z.string().max(255).default(''),
  codeforcesHandle: z.string().max(24).default(''),
  icsUrl: z.string().max(2048).default(''),
  targetRole: z.string().max(80).default(''),
  /** When true, no AI calls are made at all. */
  localOnly: z.boolean().default(false),
  /** One-time AI privacy notice acknowledged. */
  aiNoticeAck: z.boolean().default(false),
  demoMode: z.boolean().default(false),
  syncIntervalMinutes: z.number().int().min(5).max(24 * 60).default(15),
  /** Hours per day you can realistically spend on tasks, outside classes. */
  studyHoursPerDay: z.number().min(0).max(16).default(4),
  radarAxes: z.array(z.string().min(1).max(24)).min(3).max(8).default([...DEFAULT_RADAR_AXES]),
});
export type Settings = z.infer<typeof Settings>;

/** Settings as returned to the browser: token masked, plus server capability flags. */
export const PublicSettings = Settings.omit({ githubToken: true }).extend({
  githubTokenMasked: z.string(),
  hasGithubToken: z.boolean(),
  aiAvailable: z.boolean(),
  model: z.string(),
});
export type PublicSettings = z.infer<typeof PublicSettings>;

export const SettingsPatch = Settings.partial();
export type SettingsPatch = z.infer<typeof SettingsPatch>;

/* ------------------------------------------------------------------ */
/* GitHub                                                              */
/* ------------------------------------------------------------------ */

export const GithubProfile = z.object({
  login: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  htmlUrl: z.string(),
  publicRepos: z.number(),
  followers: z.number(),
});
export type GithubProfile = z.infer<typeof GithubProfile>;

export const GithubRepo = z.object({
  id: z.string(),
  name: z.string(),
  fullName: z.string(),
  url: z.string(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  stars: z.number(),
  topics: z.array(z.string()),
  pushedAt: IsoString.nullable(),
  fork: z.boolean(),
});
export type GithubRepo = z.infer<typeof GithubRepo>;

export const GithubEvent = z.object({
  id: z.string(),
  type: z.string(),
  repo: z.string(),
  createdAt: IsoString,
  /** Commits for PushEvent, otherwise 1. */
  count: z.number(),
});
export type GithubEvent = z.infer<typeof GithubEvent>;

export const ContributionDay = z.object({ date: DateOnly, count: z.number() });
export type ContributionDay = z.infer<typeof ContributionDay>;

export const ContributionCalendar = z.object({
  /** 'graphql' = official contribution calendar (needs a token); 'events' = built from public events. */
  basis: z.enum(['graphql', 'events', 'demo']),
  from: DateOnly,
  to: DateOnly,
  days: z.array(ContributionDay),
});
export type ContributionCalendar = z.infer<typeof ContributionCalendar>;

/* ------------------------------------------------------------------ */
/* Codeforces                                                          */
/* ------------------------------------------------------------------ */

export const CodeforcesUser = z.object({
  handle: z.string(),
  rating: z.number().nullable(),
  maxRating: z.number().nullable(),
  rank: z.string().nullable(),
  maxRank: z.string().nullable(),
});
export type CodeforcesUser = z.infer<typeof CodeforcesUser>;

export const RatingChange = z.object({
  contestId: z.number(),
  contestName: z.string(),
  rank: z.number(),
  oldRating: z.number(),
  newRating: z.number(),
  time: IsoString,
});
export type RatingChange = z.infer<typeof RatingChange>;

export const Submission = z.object({
  id: z.string(),
  origin: RecordOrigin,
  problemName: z.string(),
  problemId: z.string(),
  url: z.string().nullable(),
  tags: z.array(z.string()),
  /** Raw verdict code, e.g. OK, WRONG_ANSWER. */
  verdict: z.string(),
  accepted: z.boolean(),
  /** Verdict in plain words, e.g. "Wrong answer on test 3". */
  verdictText: z.string(),
  language: z.string().nullable(),
  difficulty: z.string().nullable(),
  time: IsoString,
});
export type Submission = z.infer<typeof Submission>;

/* ------------------------------------------------------------------ */
/* LeetCode (manual entry only)                                        */
/* ------------------------------------------------------------------ */

export const LeetcodeLogEntry = z.object({
  id: z.string(),
  title: z.string().min(1).max(160),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  date: DateOnly,
  tags: z.array(z.string().max(40)).max(10).default([]),
});
export type LeetcodeLogEntry = z.infer<typeof LeetcodeLogEntry>;

export const LeetcodeStats = z.object({
  easy: z.number().int().min(0).max(10000),
  medium: z.number().int().min(0).max(10000),
  hard: z.number().int().min(0).max(10000),
  totalEasy: z.number().int().min(1).max(10000),
  totalMedium: z.number().int().min(1).max(10000),
  totalHard: z.number().int().min(1).max(10000),
  log: z.array(LeetcodeLogEntry).max(2000).default([]),
  updatedAt: IsoString.nullable().default(null),
});
export type LeetcodeStats = z.infer<typeof LeetcodeStats>;

export const LeetcodeInput = LeetcodeStats.omit({ updatedAt: true });
export type LeetcodeInput = z.infer<typeof LeetcodeInput>;

/* ------------------------------------------------------------------ */
/* Resume and profile                                                  */
/* ------------------------------------------------------------------ */

export const EvidenceSource = z.enum(['resume', 'github', 'codeforces', 'leetcode', 'manual']);
export type EvidenceSource = z.infer<typeof EvidenceSource>;

export const Skill = z.object({
  name: z.string(),
  evidence: z.array(EvidenceSource),
  /** How many separate pieces of evidence we found (repos, mentions, submissions). */
  evidenceCount: z.number().default(1),
  lastSeen: IsoString.nullable().default(null),
});
export type Skill = z.infer<typeof Skill>;

export const Education = z.object({
  institution: z.string(),
  degree: z.string().nullable().default(null),
  period: z.string().nullable().default(null),
  detail: z.string().nullable().default(null),
});
export type Education = z.infer<typeof Education>;

export const ResumeProject = z.object({
  name: z.string(),
  description: z.string().nullable().default(null),
  url: z.string().nullable().default(null),
  tech: z.array(z.string()).default([]),
  bullets: z.array(z.string()).default([]),
});
export type ResumeProject = z.infer<typeof ResumeProject>;

export const Experience = z.object({
  title: z.string(),
  org: z.string().nullable().default(null),
  period: z.string().nullable().default(null),
  bullets: z.array(z.string()).default([]),
});
export type Experience = z.infer<typeof Experience>;

/** Structured profile extracted from a resume (by the model or the heuristic parser). */
export const ResumeProfile = z.object({
  name: z.string().nullable().default(null),
  email: z.string().nullable().default(null),
  education: z.array(Education).default([]),
  skills: z.array(z.string()).default([]),
  projects: z.array(ResumeProject).default([]),
  experience: z.array(Experience).default([]),
  links: z.array(z.string()).default([]),
});
export type ResumeProfile = z.infer<typeof ResumeProfile>;

export const ResumeRecord = z.object({
  fileName: z.string(),
  hash: z.string(),
  uploadedAt: IsoString,
  parsedAt: IsoString,
  parsedBy: z.enum(['ai', 'heuristic', 'demo']),
  charCount: z.number(),
  profile: ResumeProfile,
});
export type ResumeRecord = z.infer<typeof ResumeRecord>;

/* ------------------------------------------------------------------ */
/* Timetable, deadlines, tasks                                         */
/* ------------------------------------------------------------------ */

export const ClassSession = z.object({
  id: z.string(),
  title: z.string().min(1).max(120),
  /** 0 = Monday ... 6 = Sunday */
  day: z.number().int().min(0).max(6),
  start: ClockTime,
  end: ClockTime,
  location: z.string().max(120).nullable().default(null),
  origin: RecordOrigin,
});
export type ClassSession = z.infer<typeof ClassSession>;

export const ClassInput = ClassSession.omit({ id: true, origin: true });
export type ClassInput = z.infer<typeof ClassInput>;

export const DeadlineKind = z.enum(['exam', 'project', 'assignment', 'other']);
export type DeadlineKind = z.infer<typeof DeadlineKind>;

export const Deadline = z.object({
  id: z.string(),
  title: z.string().min(1).max(160),
  kind: DeadlineKind,
  /** Local date-time "YYYY-MM-DDTHH:MM" or date "YYYY-MM-DD" (interpreted as 09:00 local). */
  due: z.string().min(10).max(25),
  location: z.string().max(120).nullable().default(null),
  origin: RecordOrigin,
});
export type Deadline = z.infer<typeof Deadline>;

export const DeadlineInput = Deadline.omit({ id: true, origin: true });
export type DeadlineInput = z.infer<typeof DeadlineInput>;

export const Task = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  /** Same format as Deadline.due, or null for no deadline. */
  due: z.string().min(10).max(25).nullable().default(null),
  estimateHours: z.number().min(0.25).max(200).default(1),
  postponedCount: z.number().int().min(0).default(0),
  done: z.boolean().default(false),
  /** Optional link to a deadline this task prepares for. */
  deadlineId: z.string().nullable().default(null),
  createdAt: IsoString,
  origin: RecordOrigin,
});
export type Task = z.infer<typeof Task>;

export const TaskInput = z.object({
  title: z.string().min(1).max(200),
  due: z.string().min(10).max(25).nullable().optional(),
  estimateHours: z.number().min(0.25).max(200).optional(),
  deadlineId: z.string().nullable().optional(),
});
export type TaskInput = z.infer<typeof TaskInput>;

export const TaskPatch = z.object({
  title: z.string().min(1).max(200).optional(),
  due: z.string().min(10).max(25).nullable().optional(),
  estimateHours: z.number().min(0.25).max(200).optional(),
  done: z.boolean().optional(),
  postpone: z.boolean().optional(),
});
export type TaskPatch = z.infer<typeof TaskPatch>;

/* ------------------------------------------------------------------ */
/* Orders, smart sort                                                  */
/* ------------------------------------------------------------------ */

export const SortScope = z.enum(['tasks', 'projects', 'skills']);
export type SortScope = z.infer<typeof SortScope>;

export const Orders = z.object({
  tasks: z.array(z.string()).default([]),
  projects: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  /** One-line reason per id (projects and skills), from the last applied sort. */
  reasons: z.record(z.string(), z.string()).default({}),
  sortedAt: IsoString.nullable().default(null),
});
export type Orders = z.infer<typeof Orders>;

export const SortMove = z.object({
  id: z.string(),
  label: z.string(),
  from: z.number(),
  to: z.number(),
  reason: z.string(),
});
export type SortMove = z.infer<typeof SortMove>;

export const TaskFlag = z.object({
  taskId: z.string(),
  kind: z.enum(['at_risk', 'postponed_often']),
  message: z.string(),
  options: z.array(z.enum(['split', 'drop', 'reschedule'])),
});
export type TaskFlag = z.infer<typeof TaskFlag>;

export const ScopePreview = z.object({
  scope: SortScope,
  before: z.array(z.string()),
  after: z.array(z.string()),
  moves: z.array(SortMove),
  reasons: z.record(z.string(), z.string()),
  method: z.enum(['deterministic', 'ai', 'heuristic']),
});
export type ScopePreview = z.infer<typeof ScopePreview>;

export const SortPreview = z.object({
  id: z.string(),
  createdAt: IsoString,
  targetRole: z.string(),
  scopes: z.array(ScopePreview),
  flags: z.array(TaskFlag),
  /** Ordered resume bullets (evidence first), shown in the preview. */
  bullets: z.array(z.object({ text: z.string(), reason: z.string() })),
});
export type SortPreview = z.infer<typeof SortPreview>;

/* ------------------------------------------------------------------ */
/* Derived widgets                                                     */
/* ------------------------------------------------------------------ */

export const RadarAxis = z.object({
  axis: z.string(),
  /** 0..1, normalized to the user's own maximum. */
  share: z.number(),
  evidence: z.object({
    repos: z.number(),
    commits: z.number(),
    submissions: z.number(),
    logs: z.number(),
  }),
});
export type RadarAxis = z.infer<typeof RadarAxis>;

export const Streak = z.object({
  current: z.number(),
  longest: z.number(),
  from: DateOnly,
  to: DateOnly,
  basis: z.enum(['graphql', 'events', 'demo']),
});
export type Streak = z.infer<typeof Streak>;

export const PortfolioProject = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  url: z.string().nullable(),
  language: z.string().nullable(),
  tech: z.array(z.string()),
  stars: z.number().nullable(),
  pushedAt: IsoString.nullable(),
  origins: z.array(RecordOrigin),
});
export type PortfolioProject = z.infer<typeof PortfolioProject>;

export const Briefing = z.object({
  date: DateOnly,
  text: z.string(),
  generatedBy: z.enum(['ai', 'heuristic', 'user', 'demo']),
  dismissed: z.boolean(),
  generatedAt: IsoString,
});
export type Briefing = z.infer<typeof Briefing>;

/* ------------------------------------------------------------------ */
/* Dashboard snapshot (GET /api/dashboard)                             */
/* ------------------------------------------------------------------ */

export const Dashboard = z.object({
  mode: z.enum(['real', 'demo']),
  generatedAt: IsoString,
  settings: PublicSettings,
  sources: z.array(SourceStatus),
  github: z.object({
    profile: GithubProfile.nullable(),
    repos: z.array(GithubRepo),
    calendar: ContributionCalendar.nullable(),
    totals: z.object({ contributions: z.number(), activeDays: z.number() }).nullable(),
    streak: Streak.nullable(),
    rateLimit: z.object({ remaining: z.number(), resetAt: IsoString }).nullable(),
  }),
  codeforces: z.object({
    user: CodeforcesUser.nullable(),
    ratings: z.array(RatingChange),
  }),
  submissions: z.array(Submission),
  leetcode: LeetcodeStats.nullable(),
  resume: ResumeRecord.nullable(),
  skills: z.array(Skill),
  projects: z.array(PortfolioProject),
  radar: z.array(RadarAxis),
  classes: z.array(ClassSession),
  deadlines: z.array(Deadline),
  tasks: z.array(Task),
  orders: Orders,
  canUndoSort: z.boolean(),
  briefing: Briefing.nullable(),
});
export type Dashboard = z.infer<typeof Dashboard>;

/* ------------------------------------------------------------------ */
/* Real-time events (SSE)                                              */
/* ------------------------------------------------------------------ */

export type SyncSummaryItem = { source: SourceId; ok: boolean; text: string };

export type AgentStep =
  | { kind: 'thinking'; text: string }
  | { kind: 'tool'; callId: string; tool: string; input: unknown; status: 'running' | 'done' | 'error'; summary?: string }
  | {
      kind: 'confirm';
      callId: string;
      tool: string;
      input: unknown;
      description: string;
      status: 'pending' | 'approved' | 'rejected' | 'expired';
    }
  | { kind: 'text'; text: string };

export type ServerEvent =
  | { type: 'hello'; at: string }
  | { type: 'sync.start'; syncId: string; sources: SourceId[]; trigger: 'manual' | 'scheduler' | 'agent' }
  | { type: 'sync.progress'; syncId: string; source: SourceId; state: SourceState; progress: number; message: string }
  | { type: 'sync.done'; syncId: string; summary: SyncSummaryItem[]; text: string }
  | { type: 'data.changed'; scopes: string[] }
  | { type: 'agent.step'; runId: string; index: number; step: AgentStep }
  | { type: 'agent.delta'; runId: string; text: string }
  | { type: 'agent.done'; runId: string; ok: boolean; error?: string };
