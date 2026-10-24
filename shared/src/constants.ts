/** The product name lives here and only here. Rename the app by changing this constant. */
export const APP_NAME = 'Runway';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const DEFAULT_SYNC_INTERVAL_MINUTES = 15;
/** Data older than this is marked "Stale". */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
/** Window used for "recent" activity (heatmap fallback, radar). */
export const RECENT_WINDOW_DAYS = 90;
