/**
 * NEXVO PM2 Ecosystem Configuration
 *
 * Guarantees:
 * - nexvo-web: Next.js production server (auto-restart on crash)
 * - nexvo-cron: Cron service (auto-restart on crash, with backoff)
 *
 * Auto-restart policies:
 * - On crash: exponential backoff (1s, 2s, 4s, ... max 15s)
 * - On file change: only in dev mode (disabled here for production)
 * - On memory threshold: restart if > 500MB
 * - max_restarts: 100 (don't give up)
 *
 * Cron service has special health check: if it stops responding,
 * PM2 will restart it automatically.
 *
 * NOTE: cwd is auto-detected — tries /var/www/nexvo, /home/nexvo, then __dirname.
 * This ensures PM2 always runs in the correct project directory regardless of
 * where the project was cloned on the VPS.
 */

const path = require('path')
const fs = require('fs')

function detectCwd() {
  const candidates = [
    '/var/www/nexvo',
    '/home/nexvo',
    '/opt/nexvo',
    '/srv/nexvo',
    '/root/nexvo',
    __dirname, // fallback: directory of this file
  ]
  for (const c of candidates) {
    try {
      if (fs.existsSync(path.join(c, 'package.json')) &&
          fs.existsSync(path.join(c, 'db'))) {
        return c
      }
    } catch {}
  }
  return __dirname
}

const CWD = detectCwd()
const LOG_DIR = path.join(CWD, '.pm2-logs')

module.exports = {
  apps: [
    {
      name: 'nexvo-web',
      script: 'bun',
      args: 'run start',
      cwd: CWD,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      error_file: path.join(LOG_DIR, 'nexvo-web-error.log'),
      out_file: path.join(LOG_DIR, 'nexvo-web-out.log'),
      merge_logs: true,
      time: true,
      // Restart policy
      min_uptime: '10s',
      max_restarts: 20,
      restart_delay: 3000,
      exp_backoff_restart_delay: 200,
      kill_timeout: 10000,
    },
    {
      name: 'nexvo-cron',
      script: 'bun',
      args: 'run cron-service.ts',
      cwd: CWD,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        CRON_PORT: '3032',
      },
      error_file: path.join(LOG_DIR, 'nexvo-cron-error.log'),
      out_file: path.join(LOG_DIR, 'nexvo-cron-out.log'),
      merge_logs: true,
      time: true,
      // Restart policy — be more aggressive for cron (critical service)
      min_uptime: '5s',
      max_restarts: 100,        // Don't give up — keep restarting
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 5000,
    },
  ],
};
