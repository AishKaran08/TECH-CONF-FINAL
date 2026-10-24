const VERDICT_WORDS: Record<string, string> = {
  OK: 'Accepted',
  FAILED: 'Failed',
  PARTIAL: 'Partially correct',
  COMPILATION_ERROR: 'Compilation error',
  RUNTIME_ERROR: 'Runtime error',
  WRONG_ANSWER: 'Wrong answer',
  PRESENTATION_ERROR: 'Presentation error',
  TIME_LIMIT_EXCEEDED: 'Time limit exceeded',
  MEMORY_LIMIT_EXCEEDED: 'Memory limit exceeded',
  IDLENESS_LIMIT_EXCEEDED: 'Idleness limit exceeded',
  SECURITY_VIOLATED: 'Security violation',
  CRASHED: 'Judge crashed',
  INPUT_PREPARATION_CRASHED: 'Input preparation crashed',
  CHALLENGED: 'Hacked',
  SKIPPED: 'Skipped',
  TESTING: 'Still testing',
  REJECTED: 'Rejected',
};

/** Codeforces verdict code → plain words, including the failing test when known. */
export function verdictToWords(verdict: string | undefined | null, passedTestCount?: number | null): string {
  if (!verdict) return 'In queue';
  const base = VERDICT_WORDS[verdict] ?? verdict.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  if (verdict !== 'OK' && verdict !== 'COMPILATION_ERROR' && verdict !== 'TESTING' && typeof passedTestCount === 'number') {
    return `${base} on test ${passedTestCount + 1}`;
  }
  return base;
}
