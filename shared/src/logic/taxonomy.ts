/**
 * Keyword taxonomy used by the no-AI fallbacks: radar axes, role relevance,
 * skill detection and resume gap checks. Everything is lower-case.
 */

/** Canonical skill names with aliases (alias → canonical). */
const SKILL_ALIASES: Record<string, string[]> = {
  JavaScript: ['javascript', 'js', 'es6', 'ecmascript'],
  TypeScript: ['typescript', 'ts'],
  Python: ['python', 'python3'],
  Java: ['java'],
  'C++': ['c++', 'cpp'],
  C: ['c'],
  'C#': ['c#', 'csharp'],
  Go: ['go', 'golang'],
  Rust: ['rust'],
  Kotlin: ['kotlin'],
  Swift: ['swift'],
  PHP: ['php'],
  Ruby: ['ruby'],
  Dart: ['dart'],
  Scala: ['scala'],
  R: ['r'],
  SQL: ['sql', 'mysql', 'postgresql', 'postgres', 'sqlite', 'plsql'],
  HTML: ['html', 'html5'],
  CSS: ['css', 'css3', 'scss', 'sass'],
  React: ['react', 'reactjs', 'react.js'],
  'Next.js': ['next.js', 'nextjs'],
  Vue: ['vue', 'vuejs', 'vue.js'],
  Angular: ['angular'],
  Svelte: ['svelte'],
  'Tailwind CSS': ['tailwind', 'tailwindcss'],
  'Node.js': ['node', 'node.js', 'nodejs'],
  Express: ['express', 'express.js', 'expressjs'],
  Django: ['django'],
  Flask: ['flask'],
  FastAPI: ['fastapi'],
  Spring: ['spring', 'spring boot', 'springboot'],
  GraphQL: ['graphql'],
  'REST APIs': ['rest', 'rest api', 'restful', 'api'],
  PostgreSQL: ['postgresql', 'postgres'],
  MongoDB: ['mongodb', 'mongo'],
  Redis: ['redis'],
  Docker: ['docker', 'dockerfile'],
  Kubernetes: ['kubernetes', 'k8s'],
  AWS: ['aws', 'amazon web services', 'ec2', 's3', 'lambda'],
  GCP: ['gcp', 'google cloud'],
  Azure: ['azure'],
  Linux: ['linux', 'unix'],
  Git: ['git', 'github'],
  'CI/CD': ['ci/cd', 'ci', 'github actions', 'github-actions', 'jenkins', 'gitlab ci'],
  Terraform: ['terraform', 'hcl'],
  'Machine Learning': ['machine learning', 'machine-learning', 'ml', 'scikit-learn', 'sklearn'],
  'Deep Learning': ['deep learning', 'deep-learning', 'neural networks', 'cnn', 'rnn', 'transformers'],
  PyTorch: ['pytorch', 'torch'],
  TensorFlow: ['tensorflow', 'keras'],
  NLP: ['nlp', 'natural language processing'],
  LLMs: ['llm', 'llms', 'langchain', 'rag', 'large language models'],
  Pandas: ['pandas'],
  NumPy: ['numpy'],
  'Data Analysis': ['data analysis', 'data analytics', 'eda', 'exploratory data analysis'],
  'Data Visualization': ['data visualization', 'matplotlib', 'seaborn', 'plotly', 'tableau', 'power bi', 'powerbi'],
  Statistics: ['statistics', 'statistical', 'probability', 'hypothesis testing', 'a/b testing'],
  Spark: ['spark', 'pyspark', 'apache spark'],
  Airflow: ['airflow'],
  'ETL / Data Pipelines': ['etl', 'data pipeline', 'data pipelines', 'dbt'],
  Excel: ['excel', 'spreadsheets'],
  'Data Structures': ['data structures', 'dsa', 'data structure'],
  Algorithms: ['algorithms', 'algorithm', 'competitive programming', 'leetcode', 'codeforces'],
  'Operating Systems': ['operating systems', 'operating system', 'os', 'kernel'],
  'Computer Networks': ['computer networks', 'networking', 'tcp/ip', 'networks'],
  DBMS: ['dbms', 'database management'],
  'System Design': ['system design', 'distributed systems', 'microservices', 'scalability'],
  Testing: ['testing', 'unit testing', 'jest', 'pytest', 'vitest', 'junit'],
  Android: ['android'],
  Flutter: ['flutter'],
  'React Native': ['react native', 'react-native'],
};

const ALIAS_TO_SKILL = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
  ALIAS_TO_SKILL.set(canonical.toLowerCase(), canonical);
  for (const a of aliases) if (!ALIAS_TO_SKILL.has(a)) ALIAS_TO_SKILL.set(a, canonical);
}

/** Canonical skill name for a token, or null. Short/ambiguous aliases (c, r, go, os, api, ci, ml, ts, js) need exact matches. */
export function canonicalSkill(token: string): string | null {
  const t = token.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  return ALIAS_TO_SKILL.get(t) ?? null;
}

/** All canonical skills. */
export const KNOWN_SKILLS = Object.keys(SKILL_ALIASES);

const AMBIGUOUS = new Set(['c', 'r', 'go', 'os', 'api', 'ci', 'ml', 'ts', 'js', 'rest', 'node', 'spring', 'torch', 'git', 'swift', 'dart', 'rust', 'ruby', 'scala', 'java', 'excel', 'testing', 'networks', 'kernel', 'statistical', 'algorithm', 'eda', 'rag', 'lambda', 's3', 'ec2', 'hcl', 'cnn', 'rnn', 'probability', 'scalability', 'networking', 'spreadsheets', 'mongo']);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find canonical skills mentioned anywhere in free text.
 * Ambiguous short aliases are only accepted in "list-like" contexts (`strict=false`) to avoid
 * false positives like "go" in "go to market".
 */
export function detectSkills(text: string, strict = true): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const found = new Set<string>();
  for (const [alias, canonical] of ALIAS_TO_SKILL) {
    if (strict && AMBIGUOUS.has(alias)) continue;
    const re = new RegExp(`(^|[^a-z0-9+#.])${escapeRe(alias)}(?=$|[^a-z0-9+#])`, 'i');
    if (re.test(lower)) found.add(canonical);
  }
  return [...found];
}

/* ------------------------------------------------------------------ */
/* Radar axes                                                          */
/* ------------------------------------------------------------------ */

export interface AxisMatcher {
  languages: string[];
  topics: string[];
  /** Codeforces/LeetCode tags that count towards this axis. '*' = every algorithmic tag. */
  tags: string[];
}

export const AXIS_MATCHERS: Record<string, AxisMatcher> = {
  web: {
    languages: ['javascript', 'typescript', 'html', 'css', 'scss', 'vue', 'svelte', 'astro', 'php'],
    topics: ['web', 'frontend', 'react', 'nextjs', 'vue', 'svelte', 'angular', 'tailwindcss', 'css', 'html', 'website', 'webapp', 'pwa'],
    tags: [],
  },
  backend: {
    languages: ['go', 'java', 'kotlin', 'php', 'ruby', 'elixir', 'c#', 'scala'],
    topics: ['backend', 'api', 'rest-api', 'graphql', 'express', 'nodejs', 'django', 'flask', 'fastapi', 'spring-boot', 'database', 'postgresql', 'mongodb', 'redis', 'microservices', 'server', 'hono'],
    tags: [],
  },
  'ai/ml': {
    languages: ['jupyter notebook', 'r'],
    topics: ['machine-learning', 'deep-learning', 'ml', 'ai', 'artificial-intelligence', 'pytorch', 'tensorflow', 'llm', 'nlp', 'computer-vision', 'data-science', 'scikit-learn', 'langchain', 'transformers', 'neural-network'],
    tags: ['probabilities'],
  },
  'data structures': {
    languages: [],
    topics: ['algorithms', 'data-structures', 'dsa', 'competitive-programming', 'leetcode', 'codeforces', 'cp'],
    tags: ['*'],
  },
  systems: {
    languages: ['c', 'c++', 'rust', 'assembly', 'zig', 'cuda'],
    topics: ['operating-system', 'os', 'kernel', 'compiler', 'embedded', 'systems', 'systems-programming', 'networking', 'emulator', 'interpreter', 'database-engine'],
    tags: [],
  },
  devops: {
    languages: ['dockerfile', 'shell', 'hcl', 'nix', 'powershell', 'makefile'],
    topics: ['docker', 'kubernetes', 'devops', 'ci', 'cicd', 'github-actions', 'terraform', 'ansible', 'aws', 'gcp', 'azure', 'cloud', 'infrastructure', 'helm'],
    tags: [],
  },
  data: {
    languages: ['jupyter notebook', 'r', 'sql'],
    topics: ['data', 'data-analysis', 'data-science', 'pandas', 'sql', 'etl', 'visualization', 'analytics', 'spark', 'dashboard'],
    tags: [],
  },
  mobile: {
    languages: ['kotlin', 'swift', 'dart', 'objective-c'],
    topics: ['android', 'ios', 'flutter', 'react-native', 'mobile'],
    tags: [],
  },
  security: {
    languages: [],
    topics: ['security', 'ctf', 'cryptography', 'pentesting', 'cybersecurity'],
    tags: ['cryptography'],
  },
};

/** Matcher for a configurable axis label (case-insensitive). Unknown axes match topics equal to their slug. */
export function axisMatcher(axis: string): AxisMatcher {
  const key = axis.trim().toLowerCase();
  const known = AXIS_MATCHERS[key];
  if (known) return known;
  const slug = key.replace(/[^a-z0-9]+/g, '-');
  return { languages: [key], topics: [slug, key], tags: [key] };
}

/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */

export interface RoleProfile {
  label: string;
  /** Keywords that make a project relevant (matched against language, topics, description, tech). */
  keywords: string[];
  /** Canonical skills employers typically look for. Used for "what's missing" checks. */
  expectedSkills: string[];
}

export const ROLES: Record<string, RoleProfile> = {
  backend: {
    label: 'Backend',
    keywords: ['backend', 'api', 'rest', 'graphql', 'server', 'database', 'sql', 'postgres', 'postgresql', 'mongodb', 'redis', 'node', 'express', 'django', 'flask', 'fastapi', 'spring', 'go', 'java', 'kotlin', 'microservice', 'auth', 'queue', 'cache', 'docker', 'hono', 'grpc', 'websocket'],
    expectedSkills: ['SQL', 'REST APIs', 'Node.js', 'Docker', 'Git', 'Testing', 'System Design', 'Linux', 'Redis', 'DBMS'],
  },
  frontend: {
    label: 'Frontend',
    keywords: ['frontend', 'react', 'vue', 'svelte', 'angular', 'nextjs', 'next.js', 'css', 'html', 'tailwind', 'ui', 'ux', 'typescript', 'javascript', 'web', 'accessibility', 'animation'],
    expectedSkills: ['JavaScript', 'TypeScript', 'React', 'HTML', 'CSS', 'Testing', 'Git', 'REST APIs'],
  },
  fullstack: {
    label: 'Full-stack',
    keywords: ['fullstack', 'full-stack', 'react', 'node', 'express', 'api', 'database', 'sql', 'nextjs', 'typescript', 'javascript', 'web', 'mongodb', 'postgres'],
    expectedSkills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'SQL', 'REST APIs', 'Git', 'Docker', 'Testing'],
  },
  data: {
    label: 'Data',
    keywords: ['data', 'analysis', 'analytics', 'pandas', 'numpy', 'sql', 'etl', 'pipeline', 'visualization', 'dashboard', 'statistics', 'jupyter', 'spark', 'tableau', 'powerbi', 'excel', 'python', 'r'],
    expectedSkills: ['Python', 'SQL', 'Pandas', 'NumPy', 'Statistics', 'Data Visualization', 'Excel', 'ETL / Data Pipelines', 'Machine Learning', 'Git'],
  },
  ml: {
    label: 'Machine learning',
    keywords: ['ml', 'machine learning', 'machine-learning', 'deep learning', 'pytorch', 'tensorflow', 'model', 'nlp', 'llm', 'vision', 'classification', 'regression', 'jupyter', 'python', 'transformer', 'dataset'],
    expectedSkills: ['Python', 'Machine Learning', 'Deep Learning', 'PyTorch', 'NumPy', 'Pandas', 'Statistics', 'SQL', 'Git'],
  },
  devops: {
    label: 'DevOps / Cloud',
    keywords: ['docker', 'kubernetes', 'ci', 'cd', 'pipeline', 'terraform', 'aws', 'gcp', 'azure', 'cloud', 'infrastructure', 'linux', 'shell', 'monitoring', 'deploy', 'helm', 'ansible'],
    expectedSkills: ['Linux', 'Docker', 'Kubernetes', 'CI/CD', 'AWS', 'Terraform', 'Git', 'Python', 'Computer Networks'],
  },
  systems: {
    label: 'Systems',
    keywords: ['c', 'c++', 'rust', 'kernel', 'os', 'operating system', 'compiler', 'embedded', 'memory', 'concurrency', 'threads', 'networking', 'performance', 'low-level', 'assembly'],
    expectedSkills: ['C', 'C++', 'Rust', 'Operating Systems', 'Computer Networks', 'Linux', 'Data Structures', 'Algorithms'],
  },
  mobile: {
    label: 'Mobile',
    keywords: ['android', 'ios', 'flutter', 'react native', 'react-native', 'kotlin', 'swift', 'dart', 'mobile', 'app'],
    expectedSkills: ['Kotlin', 'Android', 'Flutter', 'Swift', 'REST APIs', 'Git', 'Testing'],
  },
  sde: {
    label: 'Software engineer (general)',
    keywords: ['algorithms', 'data structures', 'api', 'backend', 'web', 'java', 'c++', 'python', 'system', 'design', 'database', 'testing'],
    expectedSkills: ['Data Structures', 'Algorithms', 'Git', 'SQL', 'Operating Systems', 'DBMS', 'Computer Networks', 'Testing', 'System Design'],
  },
};

/** Map free text like "Backend internship" or "data analyst" to a role key. */
export function resolveRole(text: string): string {
  const t = text.toLowerCase();
  if (/full[\s-]?stack/.test(t)) return 'fullstack';
  if (/back[\s-]?end|server|api/.test(t)) return 'backend';
  if (/front[\s-]?end|ui\b|web dev/.test(t)) return 'frontend';
  if (/\bml\b|machine learning|\bai\b|deep learning|llm/.test(t)) return 'ml';
  if (/data|analyst|analytics|science/.test(t)) return 'data';
  if (/devops|cloud|sre|infra|platform/.test(t)) return 'devops';
  if (/system|embedded|kernel|low[\s-]?level/.test(t)) return 'systems';
  if (/mobile|android|ios|flutter/.test(t)) return 'mobile';
  return 'sde';
}
