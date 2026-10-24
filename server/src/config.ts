import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MODEL, DEFAULT_SYNC_INTERVAL_MINUTES } from '@runway/shared';

const here = dirname(fileURLToPath(import.meta.url));
/** server/ directory (works from src/ in dev and dist/ in production). */
export const SERVER_DIR = resolve(here, '..');
const ROOT_DIR = resolve(SERVER_DIR, '..');

// .env at the repo root, then server/.env. Missing files are fine.
for (const p of [resolve(ROOT_DIR, '.env'), resolve(SERVER_DIR, '.env')]) if (existsSync(p)) loadEnv({ path: p, quiet: true });

export const config = {
  port: Number(process.env.PORT ?? 8787),
  /** Always loopback: single local user, no auth. */
  host: '127.0.0.1',
  anthropicApiKey: (process.env.ANTHROPIC_API_KEY ?? '').trim(),
  model: (process.env.ANTHROPIC_MODEL ?? '').trim() || DEFAULT_MODEL,
  syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES ?? DEFAULT_SYNC_INTERVAL_MINUTES) || DEFAULT_SYNC_INTERVAL_MINUTES,
  dataDir: process.env.RUNWAY_DATA_DIR ? resolve(process.env.RUNWAY_DATA_DIR) : resolve(SERVER_DIR, 'data'),
  webDist: resolve(ROOT_DIR, 'web', 'dist'),
};
