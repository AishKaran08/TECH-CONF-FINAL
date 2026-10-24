import type {
  ClassSession,
  CodeforcesUser,
  ContributionCalendar,
  Deadline,
  GithubEvent,
  GithubProfile,
  GithubRepo,
  LeetcodeStats,
  RatingChange,
  ResumeRecord,
  Submission,
  Task,
} from './schemas';
import { addDays, toDateOnly, toLocalDateTime } from './logic/time';
import { verdictToWords } from './logic/verdict';

/**
 * Sample data for the "Demo data" toggle. Every date is relative to `now`, so the demo never
 * looks stale. Everything produced here is tagged origin 'demo' / basis 'demo' and badged in the UI.
 */
export interface DemoData {
  githubProfile: GithubProfile;
  repos: GithubRepo[];
  events: GithubEvent[];
  calendar: ContributionCalendar;
  cfUser: CodeforcesUser;
  ratings: RatingChange[];
  submissions: Submission[];
  leetcode: LeetcodeStats;
  resume: ResumeRecord;
  classes: ClassSession[];
  deadlines: Deadline[];
  tasks: Task[];
}

/** Small deterministic PRNG so the demo looks the same on every load. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d: Date) => d.toISOString();
const daysAgo = (now: Date, n: number, hour = 14) => {
  const d = addDays(now, -n);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const inDays = (now: Date, n: number, hour = 9, minute = 0) => {
  const d = addDays(now, n);
  d.setHours(hour, minute, 0, 0);
  return toLocalDateTime(d);
};

export function generateDemoData(now: Date): DemoData {
  const rand = mulberry32(20261024);
  const login = 'demo-student';

  const repoDefs: [string, string | null, string[], number, number, string][] = [
    ['campus-eats-api', 'Go', ['backend', 'rest-api', 'postgresql', 'docker'], 2, 14, 'REST API for ordering from campus canteens, with Postgres and Docker.'],
    ['runway-notes', 'TypeScript', ['react', 'frontend', 'tailwindcss'], 1, 9, 'Note-taking web app with offline sync.'],
    ['cp-library', 'C++', ['algorithms', 'data-structures', 'competitive-programming'], 3, 31, 'Segment trees, DSU, graph templates used in contests.'],
    ['mini-shell', 'C', ['operating-system', 'systems'], 21, 6, 'A tiny Unix shell with pipes, redirection and job control.'],
    ['sentiment-lab', 'Jupyter Notebook', ['machine-learning', 'nlp', 'pytorch'], 38, 4, 'Fine-tuning a small transformer for review sentiment.'],
    ['ci-templates', 'Shell', ['github-actions', 'docker', 'devops'], 12, 2, 'Reusable CI workflows for student projects.'],
    ['attendance-bot', 'Python', ['backend', 'api', 'redis'], 55, 3, 'Chat bot that reminds classmates about attendance thresholds.'],
    ['portfolio-site', 'HTML', ['web', 'css'], 80, 1, 'Personal portfolio site.'],
  ];
  const repos: GithubRepo[] = repoDefs.map(([name, language, topics, pushedDaysAgo, stars, description], i) => ({
    id: String(900000 + i),
    name,
    fullName: `${login}/${name}`,
    url: `https://github.com/${login}/${name}`,
    description,
    language,
    stars,
    topics,
    pushedAt: iso(daysAgo(now, pushedDaysAgo)),
    fork: false,
  }));

  // Contribution calendar: 26 weeks, busier on weekdays, a quieter stretch ~5 weeks ago.
  const days = 26 * 7;
  const calDays: { date: string; count: number }[] = [];
  const events: GithubEvent[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgo(now, i);
    const weekday = (d.getDay() + 6) % 7;
    const quiet = i > 30 && i < 40;
    const base = weekday < 5 ? 0.78 : 0.45;
    const active = i < 9 || (!quiet && rand() < base);
    const count = active ? 1 + Math.floor(rand() * (weekday < 5 ? 7 : 4)) : 0;
    calDays.push({ date: toDateOnly(d), count });
    if (count > 0 && i < 90) {
      const repo = repos[Math.floor(rand() * 6)]!;
      events.push({ id: `demo-ev-${i}`, type: 'PushEvent', repo: repo.fullName, createdAt: iso(d), count });
    }
  }
  const calendar: ContributionCalendar = { basis: 'demo', from: calDays[0]!.date, to: calDays[calDays.length - 1]!.date, days: calDays };

  const cfUser: CodeforcesUser = { handle: 'demo_coder', rating: 1487, maxRating: 1512, rank: 'specialist', maxRank: 'specialist' };
  const ratingSteps = [1200, 1265, 1241, 1318, 1356, 1402, 1388, 1451, 1512, 1487];
  const ratings: RatingChange[] = ratingSteps.slice(1).map((r, i) => ({
    contestId: 2000 + i * 7,
    contestName: `Codeforces Round ${960 + i * 3} (Div. ${i % 3 === 0 ? 3 : 2})`,
    rank: 1800 - i * 120,
    oldRating: ratingSteps[i]!,
    newRating: r,
    time: iso(daysAgo(now, (9 - i) * 14 + 3, 20)),
  }));

  const probs: [string, string, string[], string][] = [
    ['1980C', 'Sofia and the Lost Operations', ['greedy', 'constructive algorithms'], 'OK'],
    ['1985D', 'Manhattan Circle', ['implementation'], 'OK'],
    ['1986E', 'Beautiful Array', ['greedy', 'math', 'sortings'], 'WRONG_ANSWER'],
    ['1986E', 'Beautiful Array', ['greedy', 'math', 'sortings'], 'OK'],
    ['1987D', 'World is Mine', ['dp', 'games'], 'TIME_LIMIT_EXCEEDED'],
    ['1990C', 'Mad MAD Sum', ['brute force', 'greedy'], 'OK'],
    ['1991D', 'Prime XOR Coloring', ['bitmasks', 'constructive algorithms', 'graphs'], 'OK'],
    ['1992E', 'Novice\'s Mistake', ['brute force', 'math', 'strings'], 'RUNTIME_ERROR'],
    ['1993C', 'Light Switches', ['math', 'implementation'], 'OK'],
    ['1994D', 'Funny Game', ['dsu', 'graphs', 'greedy'], 'OK'],
    ['1995B', 'Bouquet', ['binary search', 'sortings'], 'WRONG_ANSWER'],
    ['1995B', 'Bouquet', ['binary search', 'sortings'], 'OK'],
  ];
  const submissions: Submission[] = probs.map(([pid, name, tags, verdict], i) => {
    const contest = pid.slice(0, 4);
    const index = pid.slice(4);
    return {
      id: `demo-cf-${i}`,
      origin: 'demo' as const,
      problemName: name,
      problemId: pid,
      url: `https://codeforces.com/contest/${contest}/problem/${index}`,
      tags,
      verdict,
      accepted: verdict === 'OK',
      verdictText: verdictToWords(verdict, verdict === 'OK' ? null : 3 + (i % 9)),
      language: i % 4 === 0 ? 'Python 3' : 'GNU C++17',
      difficulty: String(1000 + (i % 6) * 200),
      time: iso(new Date(now.getTime() - (probs.length - i) * 31 * 3600_000)),
    };
  });
  submissions.reverse();

  const leetcode: LeetcodeStats = {
    easy: 142,
    medium: 96,
    hard: 18,
    totalEasy: 880,
    totalMedium: 1860,
    totalHard: 830,
    log: [
      { id: 'demo-lc-1', title: 'LRU Cache', difficulty: 'Medium', date: toDateOnly(daysAgo(now, 1)), tags: ['design', 'hash table'] },
      { id: 'demo-lc-2', title: 'Course Schedule II', difficulty: 'Medium', date: toDateOnly(daysAgo(now, 3)), tags: ['graphs', 'topological sort'] },
      { id: 'demo-lc-3', title: 'Median of Two Sorted Arrays', difficulty: 'Hard', date: toDateOnly(daysAgo(now, 6)), tags: ['binary search'] },
    ],
    updatedAt: iso(daysAgo(now, 1, 21)),
  };

  const resume: ResumeRecord = {
    fileName: 'demo-resume.pdf',
    hash: 'demo',
    uploadedAt: iso(daysAgo(now, 4)),
    parsedAt: iso(daysAgo(now, 4)),
    parsedBy: 'demo',
    charCount: 3120,
    profile: {
      name: 'Demo Student',
      email: 'demo.student@example.com',
      education: [{ institution: 'Example Institute of Technology', degree: 'B.Tech, Computer Science and Engineering', period: `${now.getFullYear() - 2} – ${now.getFullYear() + 2}`, detail: 'CGPA 8.6/10' }],
      skills: ['C++', 'Python', 'Go', 'TypeScript', 'React', 'SQL', 'Docker', 'Git', 'Linux', 'Data Structures', 'Algorithms', 'PyTorch', 'Kubernetes'],
      projects: [
        {
          name: 'Campus Eats API',
          description: 'Ordering backend for campus canteens',
          url: `https://github.com/${login}/campus-eats-api`,
          tech: ['Go', 'PostgreSQL', 'Docker'],
          bullets: ['Built a Go REST API serving 1,200 daily orders with PostgreSQL and Redis caching', 'Cut p95 latency from 480ms to 120ms by adding indexes and connection pooling'],
        },
        {
          name: 'Sentiment Lab',
          description: 'Review sentiment with a fine-tuned transformer',
          url: null,
          tech: ['Python', 'PyTorch'],
          bullets: ['Fine-tuned DistilBERT on 50k reviews, reaching 91% accuracy'],
        },
        { name: 'Hackathon Scheduler', description: 'Room and slot scheduler for a 300-person hackathon', url: null, tech: ['React', 'Node.js'], bullets: ['Scheduled 64 teams across 12 rooms with a constraint solver'] },
      ],
      experience: [
        {
          title: 'Software Engineering Intern',
          org: 'Example Labs',
          period: `May ${now.getFullYear()} – Jul ${now.getFullYear()}`,
          bullets: ['Wrote Docker-based CI for 6 services, reducing build time by 35%', 'Helped migrate an internal tool from Flask to FastAPI', 'Wrote documentation for the onboarding guide'],
        },
      ],
      links: [`https://github.com/${login}`, 'https://linkedin.com/in/demo-student'],
    },
  };

  const cls = (id: string, title: string, day: number, start: string, end: string, location: string): ClassSession => ({ id, title, day, start, end, location, origin: 'demo' });
  const classes: ClassSession[] = [
    cls('demo-c1', 'Data Structures', 0, '09:00', '10:00', 'LH-101'),
    cls('demo-c2', 'Operating Systems', 0, '11:00', '12:00', 'LH-204'),
    cls('demo-c3', 'DBMS', 1, '09:00', '10:00', 'LH-102'),
    cls('demo-c4', 'Computer Networks', 1, '14:00', '15:00', 'LH-204'),
    cls('demo-c5', 'Discrete Maths', 2, '10:00', '11:00', 'LH-101'),
    cls('demo-c6', 'OS Lab', 2, '14:00', '17:00', 'Lab 3'),
    cls('demo-c7', 'Data Structures', 3, '09:00', '10:00', 'LH-101'),
    cls('demo-c8', 'DBMS Lab', 3, '14:00', '16:00', 'Lab 2'),
    cls('demo-c9', 'Computer Networks', 4, '11:00', '12:00', 'LH-204'),
    cls('demo-c10', 'Operating Systems', 4, '15:00', '16:00', 'LH-204'),
  ];

  const deadlines: Deadline[] = [
    { id: 'demo-d1', title: 'Operating Systems mid-sem', kind: 'exam', due: inDays(now, 6, 10), location: 'Exam Hall A', origin: 'demo' },
    { id: 'demo-d2', title: 'DBMS mid-sem', kind: 'exam', due: inDays(now, 9, 10), location: 'Exam Hall B', origin: 'demo' },
    { id: 'demo-d3', title: 'Computer Networks quiz', kind: 'exam', due: inDays(now, 2, 14), location: 'LH-204', origin: 'demo' },
    { id: 'demo-d4', title: 'Mini project: Campus Eats demo', kind: 'project', due: inDays(now, 4, 17), location: null, origin: 'demo' },
    { id: 'demo-d5', title: 'Discrete Maths end-sem', kind: 'exam', due: inDays(now, 20, 10), location: 'Exam Hall A', origin: 'demo' },
  ];

  const task = (id: string, title: string, due: string | null, estimateHours: number, postponedCount = 0, deadlineId: string | null = null): Task => ({
    id,
    title,
    due,
    estimateHours,
    postponedCount,
    done: false,
    deadlineId,
    createdAt: iso(daysAgo(now, 5)),
    origin: 'demo',
  });
  const tasks: Task[] = [
    task('demo-t1', 'Write README and demo script for Campus Eats', inDays(now, 4, 12), 2, 0, 'demo-d4'),
    task('demo-t2', 'Revise OS: scheduling and deadlocks', inDays(now, 5, 20), 6, 0, 'demo-d1'),
    task('demo-t3', 'CN quiz: practice subnetting problems', inDays(now, 2, 9), 2, 0, 'demo-d3'),
    task('demo-t4', 'Polish resume bullets for internship applications', null, 1.5, 3),
    task('demo-t5', 'Finish Campus Eats auth endpoints', inDays(now, 3, 20), 5, 0, 'demo-d4'),
  ];

  return {
    githubProfile: { login, name: 'Demo Student', avatarUrl: null, htmlUrl: `https://github.com/${login}`, publicRepos: repos.length, followers: 23 },
    repos,
    events,
    calendar,
    cfUser,
    ratings,
    submissions,
    leetcode,
    resume,
    classes,
    deadlines,
    tasks,
  };
}
