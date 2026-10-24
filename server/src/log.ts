/**
 * Server log helpers. Tool calls are logged by name, status and duration only, never with
 * personal content (no resume text, task titles or messages).
 */
export function logToolCall(runId: string, tool: string, status: 'ok' | 'error' | 'pending' | 'approved' | 'rejected', ms?: number): void {
  console.log(`[agent] run=${runId.slice(0, 8)} tool=${tool} status=${status}${ms !== undefined ? ` ${ms}ms` : ''}`);
}

export function logInfo(scope: string, msg: string): void {
  console.log(`[${scope}] ${msg}`);
}
