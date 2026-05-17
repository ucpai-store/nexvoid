import { db } from './db';

let _dbAvailable: boolean | null = null;
let _lastCheck = 0;
const CHECK_INTERVAL = 30_000; // re-check every 30 seconds

/**
 * Check if the database is reachable.
 * Caches the result for 30 seconds to avoid hammering the DB on every request.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  const now = Date.now();
  if (_dbAvailable !== null && now - _lastCheck < CHECK_INTERVAL) {
    return _dbAvailable;
  }

  try {
    await db.$queryRaw`SELECT 1`;
    _dbAvailable = true;
  } catch {
    _dbAvailable = false;
  }

  _lastCheck = now;
  return _dbAvailable;
}

/**
 * Standard error response when database is not available.
 * Use this for write endpoints (POST/PUT/DELETE) that require a database.
 */
export const DB_UNAVAILABLE_ERROR = {
  success: false,
  error: 'Database belum tersedia. Silakan hubungi admin.',
};
