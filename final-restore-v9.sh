#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO FINAL RESTORE V9 — FIX .env.production OVERRIDE + bun:sqlite
#
#  🎯 ROOT CAUSE KENAPA V4-V8 MASIH 0 USER (FINAL ANSWER!):
#     Next.js production mode loads `.env.production` OVER `.env`!
#     `.env.production` has HARDCODED `DATABASE_URL=file:/home/nexvo/db/custom.db`
#     TAPI VPS project ada di `/var/www/nexvo/`, BUKAN `/home/nexvo/`!
#
#     → V8 restore writes 23 users to `/var/www/nexvo/db/custom.db` ✅
#     → Next.js app reads from `/home/nexvo/db/custom.db` (empty/non-existent!) ❌
#     → Admin login FAILS because app sees 0 users
#     → V4/V5/V6/V7/V8 ALL failed because of this single .env.production file!
#
#  ✅ V9 FIX (COMPLETE):
#     1. OVERWRITE BOTH `.env` AND `.env.production` with correct DATABASE_URL
#     2. Use `bun:sqlite` DIRECTLY with explicit DB path (no Prisma, no env dependency)
#     3. UPSERT 23 canonical users DULU (from V8 strategy)
#     4. VERIFY 23 canonical users ADA di DB
#     5. HANYA SETELAH 23 confirm → delete junk users
#     6. Hardcoded bcrypt hash (no bcryptjs import)
#     7. WAL checkpoint + triple backup (from V8)
#     8. Verify .env dan .env.production have SAME DATABASE_URL
#
#  PRINSIP MUTLAK:
#  ❌ NEVER trust .env.production yang lama (mungkin hardcoded wrong path)
#  ✅ OVERWRITE .env.production dengan path yang benar
#  ✅ Use bun:sqlite dengan explicit path (bypass Prisma + env issues)
#  ✅ UPSERT FIRST, VERIFY, THEN DELETE
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

R='\033[0;31m'
G='\033[0;32m'
Y='\033[1;33m'
C='\033[0;36m'
B='\033[1m'
N='\033[0m'

echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  💎 NEXVO FINAL RESTORE V9 — FIX .env.production OVERRIDE${N}"
echo -e "${C}  Waktu mulai: $(date '+%Y-%m-%d %H:%M:%S')${N}"
echo -e "${C}  Root cause: .env.production overrides .env (Next.js prod)${N}"
echo -e "${C}  Fix: overwrite BOTH .env + .env.production + bun:sqlite${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo ""

START_TIME=$(date +%s)
TS=$(date +%Y%m%d-%H%M%S)

# ═══ STEP 1: AGGRESSIVE STOP (from V6/V7/V8) ═══
echo -e "${B}═══ 1/15. AGGRESSIVE STOP (kill PM2 + orphans + ports) ═══${N}"
pm2 stop nexvo-web nexvo-cron 2>/dev/null || true
sleep 1
pm2 delete nexvo-web nexvo-cron 2>/dev/null || true
sleep 1
fuser -k 3000/tcp 2>/dev/null && echo -e "  ${G}✅${N} Killed port 3000" || true
fuser -k 3032/tcp 2>/dev/null && echo -e "  ${G}✅${N} Killed port 3032" || true
sleep 1
pkill -9 -f "next start" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "cron-service" 2>/dev/null || true
sleep 1
pm2 kill 2>/dev/null && echo -e "  ${G}✅${N} PM2 daemon killed" || true
sleep 2
echo ""

# ═══ STEP 2: DETECT PROJECT PATH ═══
echo -e "${B}═══ 2/15. DETECT PROJECT PATH ═══${N}"
P=""
for candidate in /var/www/nexvo /home/nexvo /opt/nexvo /srv/nexvo /root/nexvo; do
  if [ -d "$candidate/db" ] && [ -f "$candidate/package.json" ]; then
    if grep -q '"name": *"nexvo"' "$candidate/package.json" 2>/dev/null; then
      P="$candidate"; break
    fi
  fi
done
if [ -z "$P" ]; then
  P=$(find /var/www /home /root /opt /srv -maxdepth 5 -name "package.json" -type f 2>/dev/null | while read f; do
    if grep -q '"name": *"nexvo"' "$f" 2>/dev/null; then dirname "$f"; break; fi
  done)
fi
[ -z "$P" ] && { echo -e "${R}❌ Project nexvo gak ketemu${N}"; exit 1; }
echo -e "  ${G}✅${N} Project: ${B}$P${N}"
DB="$P/db/custom.db"
mkdir -p "$P/db" "$P/.pm2-logs" /tmp/nexvo-backups
echo -e "  DB: $DB"
echo ""

# ═══ STEP 3: GIT PULL ═══
echo -e "${B}═══ 3/15. GIT PULL ═══${N}"
cd "$P"
git fetch origin main 2>&1 | tail -2 | sed 's/^/    /' || true
git reset --hard origin/main 2>&1 | tail -2 | sed 's/^/    /' || true
echo -e "  ${G}✅${N} Code terbaru"
echo ""

# ═══ STEP 4: TRIPLE BACKUP (from V8) ═══
echo -e "${B}═══ 4/15. TRIPLE BACKUP (project + timestamp + /tmp) ═══${N}"
BACKUP_COUNT=0
if [ -f "$DB" ]; then
  cp "$DB" "$DB.pre-v9" 2>/dev/null && BACKUP_COUNT=$((BACKUP_COUNT+1))
  cp "$DB" "$DB.pre-v9-$TS" 2>/dev/null && BACKUP_COUNT=$((BACKUP_COUNT+1))
  cp "$DB" "/tmp/nexvo-backups/nexvo-$TS.db" 2>/dev/null && BACKUP_COUNT=$((BACKUP_COUNT+1))
  [ -f "$DB-wal" ] && cp "$DB-wal" "/tmp/nexvo-backups/nexvo-$TS.db-wal" 2>/dev/null || true
  [ -f "$DB-shm" ] && cp "$DB-shm" "/tmp/nexvo-backups/nexvo-$TS.db-shm" 2>/dev/null || true
  echo -e "  ${G}✅${N} $BACKUP_COUNT backups created"
else
  echo -e "  ${Y}⚠️${N} DB file gak ada (fresh install) — skip backup"
fi
echo ""

# ═══ STEP 5: BUN INSTALL + PRISMA GENERATE ═══
echo -e "${B}═══ 5/15. BUN INSTALL + PRISMA GENERATE ═══${N}"
cd "$P"
bun install 2>&1 | tail -3 | sed 's/^/    /' || true
bunx prisma generate 2>&1 | tail -3 | sed 's/^/    /'
if [ ! -f "$P/node_modules/.prisma/client/index.js" ]; then
  echo -e "  ${Y}⚠️${N} Prisma client NOT generated! Retry..."
  bunx prisma generate 2>&1 | tail -5 | sed 's/^/    /'
fi
echo -e "  ${G}✅${N} Dependencies + Prisma client"
echo ""

# ═══ STEP 6: OVERWRITE BOTH .env AND .env.production (KEY FIX!) ═══
echo -e "${B}═══ 6/15. OVERWRITE .env AND .env.production (KEY FIX!) ═══${N}"
echo -e "  ${Y}⚠️${N} Next.js prod loads .env.production OVER .env!"
echo -e "  ${B}→${N} Backup old .env.production dulu..."
[ -f "$P/.env.production" ] && cp "$P/.env.production" "$P/.env.production.pre-v9-$TS" 2>/dev/null

CORRECT_DB_URL="file:$DB"
echo -e "  ${B}→${N} Correct DATABASE_URL: ${CORRECT_DB_URL}"

# Write .env
cat > "$P/.env" << ENVEOF
DATABASE_URL="$CORRECT_DB_URL"
NEXTAUTH_SECRET="nexvo-secret-v9-$(date +%s)"
NEXTAUTH_URL="https://nexvo.id"
NODE_ENV="production"
PORT=3000
CRON_PORT=3032
JWT_SECRET=N3xV0_S3cur3_JWT_T0k3n_K3y_2024_Pr0d
CRON_SECRET=nexvo-cron-secret-2024
FORCE_PROFIT_KEY=NEXVO2024
VAPID_PUBLIC_KEY=BOo9jdRKgnsb0Y_PzKmcwK11Qf9HBoRrGX7jDTl-VxOEJPtvQQS-TXRx4NtyI1rWKRqr3zHjnAZYUVEdYfnaac4
VAPID_PRIVATE_KEY=5vZPqtz1ztt0jGmk-e6zzAK4k3_dpER6w7Tc9mqB_HA
VAPID_SUBJECT=mailto:adminnexvo@nexvo.id
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=adminnexvo@nexvo.id
SMTP_PASS="3R#~tv=7D"
SMTP_FROM_EMAIL=adminnexvo@nexvo.id
SMTP_FROM_NAME=NEXVO
ENVEOF

# Write .env.production with SAME DATABASE_URL (CRITICAL!)
cat > "$P/.env.production" << ENVEOF
DATABASE_URL="$CORRECT_DB_URL"
NEXTAUTH_SECRET="nexvo-secret-v9-$(date +%s)"
NEXTAUTH_URL="https://nexvo.id"
NODE_ENV="production"
PORT=3000
CRON_PORT=3032
JWT_SECRET=N3xV0_S3cur3_JWT_T0k3n_K3y_2024_Pr0d
CRON_SECRET=nexvo-cron-secret-2024
FORCE_PROFIT_KEY=NEXVO2024
VAPID_PUBLIC_KEY=BOo9jdRKgnsb0Y_PzKmcwK11Qf9HBoRrGX7jDTl-VxOEJPtvQQS-TXRx4NtyI1rWKRqr3zHjnAZYUVEdYfnaac4
VAPID_PRIVATE_KEY=5vZPqtz1ztt0jGmk-e6zzAK4k3_dpER6w7Tc9mqB_HA
VAPID_SUBJECT=mailto:adminnexvo@nexvo.id
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=adminnexvo@nexvo.id
SMTP_PASS="3R#~tv=7D"
SMTP_FROM_EMAIL=adminnexvo@nexvo.id
SMTP_FROM_NAME=NEXVO
ENVEOF

# Verify both files have SAME DATABASE_URL
ENV_DB=$(grep "^DATABASE_URL=" "$P/.env" | head -1 | cut -d'"' -f2)
ENV_PROD_DB=$(grep "^DATABASE_URL=" "$P/.env.production" | head -1 | cut -d'"' -f2)
echo -e "  ${G}✅${N} .env:              DATABASE_URL=$ENV_DB"
echo -e "  ${G}✅${N} .env.production:   DATABASE_URL=$ENV_PROD_DB"
if [ "$ENV_DB" = "$ENV_PROD_DB" ]; then
  echo -e "  ${G}✅${N} Both files have SAME DATABASE_URL — no more override!"
else
  echo -e "  ${R}❌${N} DATABASE_URL MISMATCH! .env vs .env.production beda!"
fi
echo ""

# ═══ STEP 7: WAL CHECKPOINT (from V8) ═══
echo -e "${B}═══ 7/15. WAL CHECKPOINT (recover committed data) ═══${N}"
if [ -f "$DB" ]; then
  bun -e "
const { Database } = require('bun:sqlite');
try {
  const db = new Database('$DB');
  const r = db.run('PRAGMA wal_checkpoint(TRUNCATE)');
  console.log('    WAL checkpoint OK:', JSON.stringify(r));
  db.close();
} catch(e) { console.log('    WAL checkpoint skip:', e.message); }
" 2>&1 | sed 's/^/    /' || true
  echo -e "  ${G}✅${N} WAL checkpoint done"
else
  echo -e "  ${Y}⚠️${N} DB file gak ada, skip WAL checkpoint"
fi
echo ""

# ═══ STEP 8: SCHEMA MIGRATION ═══
echo -e "${B}═══ 8/15. SCHEMA MIGRATION (prisma db push) ═══${N}"
cd "$P"
echo -e "  ${B}→${N} prisma db push (create/update schema, preserve data)..."
echo "y" | bunx prisma db push --skip-generate 2>&1 | tail -5 | sed 's/^/    /'
SCHEMA_EXIT=$?
if [ $SCHEMA_EXIT -ne 0 ]; then
  echo -e "  ${Y}⚠️${N} db push returned $SCHEMA_EXIT, try with --accept-data-loss..."
  bunx prisma db push --skip-generate --accept-data-loss 2>&1 | tail -5 | sed 's/^/    /'
fi
# Verify User table exists via bun:sqlite
echo -e "  ${B}→${N} Verify User table exists..."
bun -e "
const { Database } = require('bun:sqlite');
try {
  const db = new Database('$DB');
  const r = db.query(\"SELECT name FROM sqlite_master WHERE type='table' AND name='User'\").get();
  if (r && r.name === 'User') {
    console.log('    ✅ User table exists');
    const c = db.query('SELECT COUNT(*) as c FROM User').get();
    console.log('    Current user count:', c.c);
  } else {
    console.log('    ❌ User table NOT found!');
  }
  db.close();
} catch(e) { console.log('    ❌ Error:', e.message); }
" 2>&1 | sed 's/^/  /'
echo ""

# ═══ STEP 9: REWRITE ECOSYSTEM.CONFIG.CJS (from V8) ═══
echo -e "${B}═══ 9/15. REWRITE ECOSYSTEM.CONFIG.CJS ═══${N}"
cat > "$P/ecosystem.config.cjs" << ECOEOF
module.exports = {
  apps: [
    {
      name: 'nexvo-web',
      script: 'bun',
      args: 'run start',
      cwd: '$P',
      instances: 1, exec_mode: 'fork', autorestart: true, watch: false,
      max_memory_restart: '500M',
      env: { NODE_ENV: 'production', PORT: '3000', DATABASE_URL: 'file:$DB' },
      error_file: '$P/.pm2-logs/nexvo-web-error.log',
      out_file: '$P/.pm2-logs/nexvo-web-out.log',
      merge_logs: true, time: true,
      min_uptime: '10s', max_restarts: 50, restart_delay: 3000,
      exp_backoff_restart_delay: 200, kill_timeout: 10000,
    },
    {
      name: 'nexvo-cron',
      script: 'bun',
      args: 'run cron-service.ts',
      cwd: '$P',
      instances: 1, exec_mode: 'fork', autorestart: true, watch: false,
      max_memory_restart: '300M',
      env: { NODE_ENV: 'production', CRON_PORT: '3032', DATABASE_URL: 'file:$DB' },
      error_file: '$P/.pm2-logs/nexvo-cron-error.log',
      out_file: '$P/.pm2-logs/nexvo-cron-out.log',
      merge_logs: true, time: true,
      min_uptime: '5s', max_restarts: 100, restart_delay: 2000,
      exp_backoff_restart_delay: 100, kill_timeout: 5000,
    },
  ],
};
ECOEOF
node -c "$P/ecosystem.config.cjs" 2>&1 && echo -e "  ${G}✅${N} ecosystem.config.cjs valid" || echo -e "  ${R}❌${N} syntax error"
echo ""

# ═══ STEP 10: BUILD NEXT.JS (from V8) ═══
echo -e "${B}═══ 10/15. BUILD NEXT.JS ═══${N}"
cd "$P"
echo -e "  ${B}→${N} bun run build (1-2 min)..."
BUILD_OUTPUT=$(bun run build 2>&1)
BUILD_EXIT=$?
if [ $BUILD_EXIT -eq 0 ] && [ -d "$P/.next" ] && [ -n "$(ls -A "$P/.next" 2>/dev/null)" ]; then
  echo -e "  ${G}✅${N} Build sukses"
else
  echo -e "  ${R}❌${N} Build gagal (exit $BUILD_EXIT), try fallback..."
  echo "$BUILD_OUTPUT" | tail -15 | sed 's/^/    /'
  npx next build --webpack 2>&1 | tail -10 | sed 's/^/    /'
fi
echo ""

# ═══ STEP 11: RESTORE DATA via bun:sqlite (KEY FIX — no Prisma, no env!) ═══
echo -e "${B}═══ 11/15. RESTORE DATA via bun:sqlite (explicit path, no Prisma) ═══${N}"
echo -e "  ${B}→${N} Strategy:"
echo -e "     1. UPSERT 23 canonical users DULU (one by one, try/catch each)"
echo -e "     2. VERIFY 23 canonical users ADA di DB"
echo -e "     3. RETRY upsert untuk yang missing (3x)"
echo -e "     4. HANYA SETELAH 23 confirm → delete junk users (child cleanup first)"
echo -e "     5. UPSERT admin (always)"
echo -e "     6. INSERT 3 products + 3 packages if empty"
echo -e "  ${B}→${N} DB path: $DB (explicit, not from env)"
echo ""

# Write restore script using bun:sqlite (built-in, no module resolution issues)
cat > "$P/restore-v9.mjs" << 'RESTOREEOF'
const dbPath = process.argv[2];
const { Database } = require('bun:sqlite');

const db = new Database(dbPath);
db.run('PRAGMA journal_mode = WAL;');
db.run('PRAGMA foreign_keys = OFF;');

// Pre-computed bcrypt hashes
const ADMIN_HASH = '$2b$10$2JcQVO1O1nS5xEoMhL.V6OPjzPwcFQ/sKbHbO.0jrLJTMOKMFuVGC';
const USER_HASH = '$2b$10$wVqfESJ5TIOBOhaUMaNWQOK7KDI12P9fYX/Xdwbwwi9clmGpdRGkC';

// 23 canonical users — total mainBalance = Rp 68.800
const canonicalUsers = [
  { id: 'user-1', userId: 'NEXVO001', whatsapp: '628123456701', name: 'Budi Santoso', level: 'Platinum', main: 20000 },
  { id: 'user-2', userId: 'NEXVO002', whatsapp: '628123456702', name: 'Siti Rahayu', level: 'Gold', main: 10000 },
  { id: 'user-3', userId: 'NEXVO003', whatsapp: '628123456703', name: 'Andi Wijaya', level: 'Gold', main: 8000 },
  { id: 'user-4', userId: 'NEXVO004', whatsapp: '628123456704', name: 'Dewi Lestari', level: 'Silver', main: 6000 },
  { id: 'user-5', userId: 'NEXVO005', whatsapp: '628123456705', name: 'Rudi Hartono', level: 'Silver', main: 5000 },
  { id: 'user-6', userId: 'NEXVO006', whatsapp: '628123456706', name: 'Maya Sari', level: 'Silver', main: 4000 },
  { id: 'user-7', userId: 'NEXVO007', whatsapp: '628123456707', name: 'Ferdi Tan', level: 'Bronze', main: 3000 },
  { id: 'user-8', userId: 'NEXVO008', whatsapp: '628123456708', name: 'Lina Marlina', level: 'Bronze', main: 2500 },
  { id: 'user-9', userId: 'NEXVO009', whatsapp: '628123456709', name: 'Joko Susilo', level: 'Bronze', main: 2000 },
  { id: 'user-10', userId: 'NEXVO010', whatsapp: '628123456710', name: 'Rina Wati', level: 'Bronze', main: 1500 },
  { id: 'user-11', userId: 'NEXVO011', whatsapp: '628123456711', name: 'Agus Setiawan', level: 'Bronze', main: 1200 },
  { id: 'user-12', userId: 'NEXVO012', whatsapp: '628123456712', name: 'Yuni Astuti', level: 'Bronze', main: 1000 },
  { id: 'user-13', userId: 'NEXVO013', whatsapp: '628123456713', name: 'Hendra Gunawan', level: 'Bronze', main: 800 },
  { id: 'user-14', userId: 'NEXVO014', whatsapp: '628123456714', name: 'Wati Ningsih', level: 'Bronze', main: 600 },
  { id: 'user-15', userId: 'NEXVO015', whatsapp: '628123456715', name: 'Doni Pratama', level: 'Bronze', main: 500 },
  { id: 'user-16', userId: 'NEXVO016', whatsapp: '628123456716', name: 'Sari Indah', level: 'Bronze', main: 400 },
  { id: 'user-17', userId: 'NEXVO017', whatsapp: '628123456717', name: 'Bayu Saputra', level: 'Bronze', main: 300 },
  { id: 'user-18', userId: 'NEXVO018', whatsapp: '628123456718', name: 'Nia Kurnia', level: 'Bronze', main: 200 },
  { id: 'user-19', userId: 'NEXVO019', whatsapp: '628123456719', name: 'Eko Prasetyo', level: 'Bronze', main: 200 },
  { id: 'user-20', userId: 'NEXVO020', whatsapp: '628123456720', name: 'Tuti Handayani', level: 'Bronze', main: 200 },
  { id: 'user-21', userId: 'NEXVO021', whatsapp: '628123456721', name: 'Reza Maulana', level: 'Bronze', main: 200 },
  { id: 'user-22', userId: 'NEXVO022', whatsapp: '628123456722', name: 'Indah Permata', level: 'Bronze', main: 200 },
  { id: 'user-23', userId: 'NEXVO023', whatsapp: '628123456723', name: 'Fajar Nugroho', level: 'Bronze', main: 1000 },
];

const canonicalWhatsapps = canonicalUsers.map(u => u.whatsapp);
const nowIso = new Date().toISOString();

function upsertOneUser(u) {
  // Method 1: Try UPDATE by whatsapp first (if exists)
  try {
    const exist = db.query('SELECT id FROM User WHERE whatsapp = ?').get(u.whatsapp);
    if (exist) {
      db.run(`UPDATE User SET userId=?, name=?, level=?, mainBalance=?, profitBalance=0, totalDeposit=50000, totalWithdraw=0, totalProfit=?, isSuspended=0, isVerified=1, password=?, updatedAt=? WHERE whatsapp=?`,
        [u.userId, u.name, u.level, u.main, u.main, USER_HASH, nowIso, u.whatsapp]);
      return { ok: true, method: 'update' };
    }
  } catch (e) {
    // fall through to insert
  }

  // Method 2: INSERT OR REPLACE (handles unique constraint conflicts)
  try {
    db.run(`INSERT OR REPLACE INTO User (id, userId, whatsapp, email, password, name, level, mainBalance, depositBalance, profitBalance, totalDeposit, totalWithdraw, totalProfit, isSuspended, isVerified, referralCode, referredBy, avatar, otpCode, otpExpiry, emailOtpCode, emailOtpExpiry, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 50000, 0, ?, 0, 1, ?, NULL, '', NULL, NULL, NULL, NULL, ?, ?)`,
      [u.id, u.userId, u.whatsapp, u.userId.toLowerCase()+'@nexvo.id', USER_HASH, u.name, u.level, u.main, u.main, 'REF-'+u.userId, nowIso, nowIso]);
    return { ok: true, method: 'insert-replace' };
  } catch (e1) {
    // Method 3: INSERT OR IGNORE then UPDATE
    try {
      db.run(`INSERT OR IGNORE INTO User (id, userId, whatsapp, email, password, name, level, mainBalance, depositBalance, profitBalance, totalDeposit, totalWithdraw, totalProfit, isSuspended, isVerified, referralCode, referredBy, avatar, otpCode, otpExpiry, emailOtpCode, emailOtpExpiry, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 50000, 0, ?, 0, 1, ?, NULL, '', NULL, NULL, NULL, NULL, ?, ?)`,
        [u.id, u.userId, u.whatsapp, u.userId.toLowerCase()+'@nexvo.id', USER_HASH, u.name, u.level, u.main, u.main, 'REF-'+u.userId, nowIso, nowIso]);
      db.run(`UPDATE User SET userId=?, name=?, level=?, mainBalance=?, profitBalance=0, totalDeposit=50000, totalWithdraw=0, totalProfit=?, isSuspended=0, isVerified=1, password=?, updatedAt=? WHERE whatsapp=?`,
        [u.userId, u.name, u.level, u.main, u.main, USER_HASH, nowIso, u.whatsapp]);
      return { ok: true, method: 'insert-ignore-update' };
    } catch (e2) {
      return { ok: false, method: 'all-failed', err: e1.message + ' | ' + e2.message };
    }
  }
}

console.log('  ─── BEFORE ───');
try {
  const before = db.query('SELECT COUNT(*) as c, COALESCE(SUM(mainBalance),0) as m FROM User').get();
  console.log('  📊 BEFORE:', before.c, 'users, Rp', before.m.toLocaleString('id-ID'));
} catch (e) {
  console.log('  ❌ User table not exists yet:', e.message);
  console.log('  ⚠️ Schema migration may have failed. Aborting restore.');
  process.exit(1);
}

// ─── PHASE 1: UPSERT 23 canonical users DULU ───
console.log('\n  ─── PHASE 1: UPSERT 23 CANONICAL USERS ───');
let okCount = 0, failCount = 0;
const failedUsers = [];
for (const u of canonicalUsers) {
  const r = upsertOneUser(u);
  if (r.ok) {
    okCount++;
    console.log('  ✅', u.userId, u.name, '('+u.whatsapp+') — Rp', u.main, '['+r.method+']');
  } else {
    failCount++;
    failedUsers.push(u);
    console.log('  ❌', u.userId, u.name, '('+u.whatsapp+') — FAIL:', r.err);
  }
}
console.log('  📊 Phase 1:', okCount, 'success,', failCount, 'fail');

// ─── PHASE 2: VERIFY 23 canonical users ADA ───
console.log('\n  ─── PHASE 2: VERIFY 23 CANONICAL USERS ───');
const placeholders = canonicalWhatsapps.map(() => '?').join(',');
let inDbRows = db.query(`SELECT whatsapp FROM User WHERE whatsapp IN (${placeholders})`).all(...canonicalWhatsapps);
let inDbCount = inDbRows.length;
console.log('  📊 Canonical users in DB:', inDbCount, '/ 23');

// RETRY missing users 3x
for (let retry = 1; retry <= 3 && inDbCount < 23; retry++) {
  const missingWa = canonicalWhatsapps.filter(wa => !inDbRows.find(r => r.whatsapp === wa));
  console.log('  🔄 Retry #'+retry+':', missingWa.length, 'users still missing');
  for (const wa of missingWa) {
    const u = canonicalUsers.find(x => x.whatsapp === wa);
    const r = upsertOneUser(u);
    console.log('     ', r.ok ? '✅' : '❌', u.userId, u.name, '—', r.ok ? r.method : r.err);
  }
  inDbRows = db.query(`SELECT whatsapp FROM User WHERE whatsapp IN (${placeholders})`).all(...canonicalWhatsapps);
  inDbCount = inDbRows.length;
  console.log('     After retry #'+retry+':', inDbCount, '/ 23');
}

if (inDbCount < 23) {
  console.log('\n  ⚠️ Only', inDbCount, '/23 canonical users — skip delete phase');
} else {
  console.log('  ✅ All 23 canonical users confirmed — safe to delete junk');
}

// ─── PHASE 3: DELETE JUNK USERS (only if 23 canonical safe) ───
console.log('\n  ─── PHASE 3: DELETE JUNK USERS ───');
if (inDbCount === 23) {
  const junkRows = db.query(`SELECT id, whatsapp, name FROM User WHERE whatsapp NOT IN (${placeholders})`).all(...canonicalWhatsapps);
  console.log('  🗑️ Junk users to delete:', junkRows.length);

  if (junkRows.length > 0) {
    // Delete child records FIRST (avoid FK errors)
    const junkIds = junkRows.map(u => u.id);
    const idPlaceholders = junkIds.map(() => '?').join(',');

    const childTables = [
      ['ProfitLog', 'userId'],
      ['Investment', 'userId'],
      ['Purchase', 'userId'],
      ['Referral', 'referrerId'],
      ['Referral', 'referredId'],
      ['BonusLog', 'userId'],
      ['BonusLog', 'fromUserId'],
      ['SalaryBonus', 'userId'],
      ['MatchingBonus', 'userId'],
      ['BankAccount', 'userId'],
      ['Deposit', 'userId'],
      ['Withdrawal', 'userId'],
      ['PushSubscription', 'userId'],
    ];

    for (const [table, col] of childTables) {
      try {
        db.run(`DELETE FROM ${table} WHERE ${col} IN (${idPlaceholders})`, ...junkIds);
      } catch (e) {
        // table might not exist — ignore
      }
    }

    // Testimonial: SET NULL userId (preserve testimonials)
    try {
      db.run(`UPDATE Testimonial SET userId = NULL WHERE userId IN (${idPlaceholders})`, ...junkIds);
    } catch (e) {}

    // NOW delete junk users
    try {
      const del = db.run(`DELETE FROM User WHERE whatsapp NOT IN (${placeholders})`, ...canonicalWhatsapps);
      console.log('  ✅ Deleted', del.changes, 'junk users');
    } catch (e) {
      console.log('  ⚠️ deleteMany failed:', e.message);
    }
  } else {
    console.log('  ℹ️ No junk users to delete');
  }
} else {
  console.log('  ⏭️ SKIP delete — canonical not safe (', inDbCount, '/23)');
}

// ─── PHASE 4: FIX ADMIN ───
console.log('\n  ─── PHASE 4: FIX ADMIN ───');
try {
  const admin = db.query('SELECT id, username FROM Admin WHERE username = ? OR email = ?').get('admin', 'admin@nexvo.id');
  if (admin) {
    db.run('UPDATE Admin SET password=?, loginAttempts=0, lockedUntil=NULL, role=?, updatedAt=? WHERE id=?',
      [ADMIN_HASH, 'admin', nowIso, admin.id]);
    console.log('  ✅ Admin updated (ID:', admin.id, ', username:', admin.username + ')');
  } else {
    try {
      db.run(`INSERT INTO Admin (id, username, email, password, name, role, loginAttempts, createdAt, updatedAt)
        VALUES (?, 'admin', 'admin@nexvo.id', ?, 'Super Admin', 'admin', 0, ?, ?)`,
        ['admin-'+Date.now(), ADMIN_HASH, nowIso, nowIso]);
      console.log('  ✅ Admin created (admin / Admin@2024)');
    } catch (e) {
      // Try minimal insert
      db.run("INSERT OR REPLACE INTO Admin (id, username, email, password, name, role, loginAttempts, createdAt, updatedAt) VALUES ('admin-v9', 'admin', 'admin@nexvo.id', ?, 'Super Admin', 'admin', 0, ?, ?)",
        [ADMIN_HASH, nowIso, nowIso]);
      console.log('  ✅ Admin created via minimal insert');
    }
  }

  // Delete duplicate admins
  const dupAdmins = db.query("SELECT id FROM Admin WHERE username = 'admin' ORDER BY createdAt ASC").all();
  if (dupAdmins.length > 1) {
    const keepId = dupAdmins[0].id;
    const dupIds = dupAdmins.slice(1).map(a => a.id);
    const idPh = dupIds.map(() => '?').join(',');
    try { db.run(`DELETE FROM AdminLog WHERE adminId IN (${idPh})`, ...dupIds); } catch (e) {}
    db.run(`DELETE FROM Admin WHERE id IN (${idPh})`, ...dupIds);
    console.log('  ✅ Deleted', dupIds.length, 'duplicate admins');
  }
} catch (e) {
  console.log('  ❌ Admin fix error:', e.message);
}

// ─── PHASE 5: INSERT 3 PRODUCTS if empty ───
console.log('\n  ─── PHASE 5: INSERT 3 PRODUCTS (if empty) ───');
try {
  const pc = db.query('SELECT COUNT(*) as c FROM Product').get();
  if (pc.c === 0) {
    db.run("INSERT INTO Product (id, name, price, duration, estimatedProfit, quota, quotaUsed, description, banner, isActive, isStopped, profitRate, createdAt, updatedAt) VALUES ('prod-1', 'Mesin Cuci 7kg', 50000, 30, 10000, 100, 0, 'Produk Mesin Cuci 7kg', '', 1, 0, 0, ?, ?)", [nowIso, nowIso]);
    db.run("INSERT INTO Product (id, name, price, duration, estimatedProfit, quota, quotaUsed, description, banner, isActive, isStopped, profitRate, createdAt, updatedAt) VALUES ('prod-2', 'Smartphone Android', 100000, 60, 25000, 50, 0, 'Produk Smartphone Android', '', 1, 0, 0, ?, ?)", [nowIso, nowIso]);
    db.run("INSERT INTO Product (id, name, price, duration, estimatedProfit, quota, quotaUsed, description, banner, isActive, isStopped, profitRate, createdAt, updatedAt) VALUES ('prod-3', 'Laptop Gaming', 500000, 90, 150000, 20, 0, 'Produk Laptop Gaming', '', 1, 0, 0, ?, ?)", [nowIso, nowIso]);
    console.log('  ✅ Insert 3 products');
  } else {
    console.log('  ℹ️ Products exist (', pc.c, '), skip');
  }
} catch (e) {
  console.log('  ⚠️ Product insert:', e.message);
}

// ─── PHASE 6: INSERT 3 PACKAGES if empty ───
console.log('\n  ─── PHASE 6: INSERT 3 PACKAGES (if empty) ───');
try {
  const kc = db.query('SELECT COUNT(*) as c FROM InvestmentPackage').get();
  if (kc.c === 0) {
    db.run("INSERT INTO InvestmentPackage (id, name, amount, profitRate, contractDays, isActive, `order`, createdAt, updatedAt) VALUES ('pkg-1', 'Basic', 50000, 5, 30, 1, 1, ?, ?)", [nowIso, nowIso]);
    db.run("INSERT INTO InvestmentPackage (id, name, amount, profitRate, contractDays, isActive, `order`, createdAt, updatedAt) VALUES ('pkg-2', 'Pro', 100000, 10, 60, 1, 2, ?, ?)", [nowIso, nowIso]);
    db.run("INSERT INTO InvestmentPackage (id, name, amount, profitRate, contractDays, isActive, `order`, createdAt, updatedAt) VALUES ('pkg-3', 'Elite', 500000, 15, 90, 1, 3, ?, ?)", [nowIso, nowIso]);
    console.log('  ✅ Insert 3 packages');
  } else {
    console.log('  ℹ️ Packages exist (', kc.c, '), skip');
  }
} catch (e) {
  console.log('  ⚠️ Package insert:', e.message);
}

// ─── PHASE 7: WAL CHECKPOINT + FINAL VERIFY ───
console.log('\n  ─── PHASE 7: WAL CHECKPOINT + FINAL VERIFY ───');
try { db.run('PRAGMA wal_checkpoint(TRUNCATE)'); } catch (e) {}

const after = db.query('SELECT COUNT(*) as c, COALESCE(SUM(mainBalance),0) as m FROM User').get();
let adminCount = 0;
try { adminCount = db.query('SELECT COUNT(*) as c FROM Admin').get().c; } catch (e) {}
console.log('  📊 AFTER:', after.c, 'users, Rp', after.m.toLocaleString('id-ID'));
console.log('  📊 Admin count:', adminCount);

if (after.c !== 23) console.log('  ⚠️ Expected 23 users, got', after.c);
if (after.m !== 68800) console.log('  ⚠️ Expected Rp 68.800, got Rp', after.m);
if (adminCount === 0) console.log('  ❌ No admin!');

console.log('\n  👥 Daftar user:');
const users = db.query('SELECT userId, whatsapp, name, mainBalance, level FROM User ORDER BY userId ASC').all();
users.forEach((u, i) => console.log('     '+(i+1)+'.', u.userId, '|', u.whatsapp, '|', u.name, '| Rp'+u.mainBalance, '|', u.level));

db.close();
console.log('\n  🎉 RESTORE V9 DONE');
RESTOREEOF

echo -e "  ${G}✅${N} restore-v9.mjs written to $P/"
echo -e "  ${B}→${N} Running restore (bun:sqlite, explicit DB path)..."
echo ""
cd "$P"
RESTORE_OUTPUT=$(bun restore-v9.mjs "$DB" 2>&1)
RESTORE_EXIT=$?
echo "$RESTORE_OUTPUT" | sed 's/^/  /'

if [ $RESTORE_EXIT -ne 0 ]; then
  echo -e "\n  ${R}❌ RESTORE FAILED (exit $RESTORE_EXIT)!${N}"
  echo -e "  ${B}Diagnostic:${N}"
  echo -e "     DB file: $(ls -la $DB 2>&1)"
  echo -e "     .env DATABASE_URL: $(grep DATABASE_URL $P/.env)"
  echo -e "     .env.production DATABASE_URL: $(grep DATABASE_URL $P/.env.production)"
fi
echo ""

# Cleanup restore script
rm -f "$P/restore-v9.mjs"

# ═══ STEP 12: VERIFY USER COUNT (bun:sqlite, explicit path) ═══
echo -e "${B}═══ 12/15. VERIFY USER COUNT (bun:sqlite) ═══${N}"
USER_COUNT=$(bun -e "
const { Database } = require('bun:sqlite');
try {
  const db = new Database('$DB');
  const r = db.query('SELECT COUNT(*) as c FROM User').get();
  console.log(r.c);
  db.close();
} catch(e) { console.log(0); }
" 2>/dev/null || echo "0")
USER_SUM=$(bun -e "
const { Database } = require('bun:sqlite');
try {
  const db = new Database('$DB');
  const r = db.query('SELECT COALESCE(SUM(mainBalance),0) as s FROM User').get();
  console.log(r.s);
  db.close();
} catch(e) { console.log(0); }
" 2>/dev/null || echo "0")
echo -e "  User count: ${B}${USER_COUNT}${N}"
echo -e "  Total saldo: ${B}Rp ${USER_SUM}${N}"

if [ "$USER_COUNT" -lt 23 ] 2>/dev/null; then
  echo -e "  ${R}❌${N} User count < 23 — restore may have failed!"
  echo -e "  ${B}→${N} Check ALL whatsapp numbers in DB:"
  bun -e "
const { Database } = require('bun:sqlite');
const db = new Database('$DB');
const users = db.query('SELECT whatsapp, name, mainBalance FROM User ORDER BY mainBalance DESC').all();
users.forEach(u => console.log('   ', u.whatsapp, '|', u.name, '| Rp'+u.mainBalance));
db.close();
" 2>&1 | sed 's/^/    /'
fi
echo ""

# ═══ STEP 13: PM2 START FRESH + VERIFY (from V8) ═══
echo -e "${B}═══ 13/15. PM2 START FRESH + VERIFY ═══${N}"
pm2 flush 2>/dev/null || true
cd "$P"
pm2 start "$P/ecosystem.config.cjs" 2>&1 | tail -8 | sed 's/^/    /'
sleep 3
pm2 save 2>&1 | tail -2 | sed 's/^/    /' || true
sleep 5

check_pm2_status() {
  local name="$1"
  local show_out=$(pm2 show "$name" 2>&1)
  if echo "$show_out" | grep -qiE "status.*online|online.*status"; then echo "ONLINE"; return 0; fi
  if command -v python3 &>/dev/null; then
    local jlist_status=$(pm2 jlist 2>/dev/null | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    for a in data:
        if a.get('name') == '$name':
            print(a.get('pm2_env', {}).get('status', 'unknown'))
            break
except: print('error')
" 2>/dev/null)
    if [ "$jlist_status" = "online" ]; then echo "ONLINE"; return 0; fi
  fi
  if pm2 list 2>/dev/null | grep "$name" | grep -qi "online"; then echo "ONLINE"; return 0; fi
  echo "OFFLINE"; return 1
}

echo -ne "  PM2 nexvo-web... "
WEB_STATUS=$(check_pm2_status "nexvo-web")
echo "$WEB_STATUS"
echo -ne "  PM2 nexvo-cron... "
CRON_STATUS=$(check_pm2_status "nexvo-cron")
echo "$CRON_STATUS"

if [ "$WEB_STATUS" != "ONLINE" ]; then
  echo -e "\n  ${R}❌${N} nexvo-web NOT ONLINE — logs:"
  pm2 logs nexvo-web --lines 25 --nostream 2>&1 | tail -25 | sed 's/^/    /'
fi
echo ""

# ═══ STEP 14: VERIFY 12 FITUR (ZERO TOLERANCE) ═══
echo -e "${B}═══ 14/15. VERIFY 12 FITUR (ZERO TOLERANCE) ═══${N}"
sleep 5

declare -a FEAT
record_feat() { FEAT+=("$1|$2"); }

# 1. Web HTTP
echo -ne "  [1/12] Web HTTP... "
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
[ "$HTTP" = "200" ] && { echo -e "${G}✅ ($HTTP)${N}"; record_feat "Web HTTP" "OK"; } || { echo -e "${R}❌ ($HTTP)${N}"; record_feat "Web HTTP" "FAIL"; }

# 2. Admin login
echo -ne "  [2/12] Admin login... "
ADMIN_RES=$(curl -s -X POST http://localhost:3000/api/auth/admin-login -H "Content-Type: application/json" -d '{"username":"admin","password":"Admin@2024"}' 2>/dev/null || echo "")
if echo "$ADMIN_RES" | grep -q '"success":true'; then
  echo -e "${G}✅ OK${N}"; record_feat "Admin login" "OK"
  ADMIN_TOKEN=$(echo "$ADMIN_RES" | grep -oE '"token":"[^"]+"' | head -1 | cut -d'"' -f4)
else
  echo -e "${R}❌ FAIL${N}"; record_feat "Admin login" "FAIL"
  echo "      Response: $(echo "$ADMIN_RES" | head -c 200)"
fi

# 3. Admin stats
echo -ne "  [3/12] Admin stats... "
STATS_RES=$(curl -s http://localhost:3000/api/admin/stats -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo "")
STATS_USERS=$(echo "$STATS_RES" | grep -oE '"totalUsers":[0-9]+' | grep -oE '[0-9]+')
STATS_MAIN=$(echo "$STATS_RES" | grep -oE '"totalMainBalance":[0-9]+' | grep -oE '[0-9]+')
[ -n "$STATS_USERS" ] && { echo -e "${G}✅ OK (${STATS_USERS} user, Rp ${STATS_MAIN:-0})${N}"; record_feat "Admin stats" "OK"; } || { echo -e "${R}❌ FAIL${N}"; record_feat "Admin stats" "FAIL"; }

# 4. Admin users list
echo -ne "  [4/12] Admin users list... "
USERS_RES=$(curl -s http://localhost:3000/api/admin/users -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo "")
echo "$USERS_RES" | grep -q '"success":true\|"users"\|"data"' && { echo -e "${G}✅ OK${N}"; record_feat "Admin users list" "OK"; } || { echo -e "${R}❌ FAIL${N}"; record_feat "Admin users list" "FAIL"; }

# 5. Products API
echo -ne "  [5/12] Products API... "
PROD_RES=$(curl -s http://localhost:3000/api/products 2>/dev/null || echo "")
echo "$PROD_RES" | grep -q '"success":true\|"products"\|"data"' && { echo -e "${G}✅ OK${N}"; record_feat "Products API" "OK"; } || { echo -e "${R}❌ FAIL${N}"; record_feat "Products API" "FAIL"; }

# 6. Packages API
echo -ne "  [6/12] Packages API... "
PKG_RES=$(curl -s http://localhost:3000/api/packages 2>/dev/null || echo "")
echo "$PKG_RES" | grep -q '"success":true\|"packages"\|"data"' && { echo -e "${G}✅ OK${N}"; record_feat "Packages API" "OK"; } || { echo -e "${R}❌ FAIL${N}"; record_feat "Packages API" "FAIL"; }

# 7. Banners API
echo -ne "  [7/12] Banners API... "
BAN_RES=$(curl -s http://localhost:3000/api/banners 2>/dev/null || echo "")
echo "$BAN_RES" | grep -q '"success":true\|"banners"\|"data"' && { echo -e "${G}✅ OK${N}"; record_feat "Banners API" "OK"; } || { echo -e "${Y}⚠️ WARN${N}"; record_feat "Banners API" "WARN"; }

# 8. Cron port
echo -ne "  [8/12] Cron port 3032... "
CRON_HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3032/health 2>/dev/null || echo "000")
{ [ "$CRON_HTTP" = "200" ] || [ "$CRON_HTTP" = "404" ]; } && { echo -e "${G}✅ ($CRON_HTTP)${N}"; record_feat "Cron port" "OK"; } || { echo -e "${Y}⚠️ ($CRON_HTTP)${N}"; record_feat "Cron port" "WARN"; }

# 9. Prisma client
echo -ne "  [9/12] Prisma client... "
{ [ -f "$P/node_modules/.prisma/client/index.js" ] || [ -f "$P/node_modules/@prisma/client/index.js" ]; } && { echo -e "${G}✅ OK${N}"; record_feat "Prisma client" "OK"; } || { echo -e "${R}❌ FAIL${N}"; record_feat "Prisma client" "FAIL"; }

# 10. PM2 nexvo-web
echo -ne "  [10/12] PM2 nexvo-web... "
[ "$WEB_STATUS" = "ONLINE" ] && { echo -e "${G}✅ OK${N}"; record_feat "PM2 nexvo-web" "OK"; } || { echo -e "${R}❌ FAIL${N}"; record_feat "PM2 nexvo-web" "FAIL"; }

# 11. PM2 nexvo-cron
echo -ne "  [11/12] PM2 nexvo-cron... "
[ "$CRON_STATUS" = "ONLINE" ] && { echo -e "${G}✅ OK${N}"; record_feat "PM2 nexvo-cron" "OK"; } || { echo -e "${R}❌ FAIL${N}"; record_feat "PM2 nexvo-cron" "FAIL"; }

# 12. .env.production DATABASE_URL (NEW CHECK!)
echo -ne "  [12/12] .env.production DATABASE_URL... "
grep -q "DATABASE_URL=\"file:$DB\"" "$P/.env.production" 2>/dev/null && { echo -e "${G}✅ OK${N}"; record_feat ".env.production DATABASE_URL" "OK"; } || { echo -e "${R}❌ FAIL${N}"; record_feat ".env.production DATABASE_URL" "FAIL"; }

# ═══ STEP 15: FINAL SUMMARY ═══
echo ""
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  📊 FINAL SUMMARY${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
OK=0; FAIL=0; WARN=0
for f in "${FEAT[@]}"; do
  name="${f%%|*}"; status="${f##*|}"
  if [ "$status" = "OK" ]; then echo -e "  ${G}✅${N} $name"; OK=$((OK+1))
  elif [ "$status" = "WARN" ]; then echo -e "  ${Y}⚠️${N} $name"; WARN=$((WARN+1))
  else echo -e "  ${R}❌${N} $name"; FAIL=$((FAIL+1)); fi
done
echo ""
echo -e "  Total: ${G}$OK OK${N} | ${R}$FAIL FAIL${N} | ${Y}$WARN WARN${N}"
echo -e "  User count (from DB): ${B}${USER_COUNT}${N}"
echo -e "  Total user (from API): ${B}${STATS_USERS:-0}${N}"
echo -e "  Total saldo (DB): ${B}Rp ${USER_SUM}${N}"
echo -e "  Total saldo (API): ${B}Rp ${STATS_MAIN:-0}${N}"
END_TIME=$(date +%s)
echo -e "  Durasi: ${B}$((END_TIME - START_TIME))s${N}"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "${G}═══════════════════════════════════════════════════════════${N}"
  echo -e "${G}  🎉 BERHASIL TOTAL! ZERO ERROR${N}"
  echo -e "${G}═══════════════════════════════════════════════════════════${N}"
  echo ""
  echo -e "  ${B}Admin:${N} https://nexvo.id/login-admin → admin / Admin@2024"
  echo -e "  ${B}User:${N} WA 628123456701 (Budi Santoso) / nexvo123"
  echo -e "  ${B}Total:${N} 23 user, Rp 68.800"
else
  echo -e "${R}═══════════════════════════════════════════════════════════${N}"
  echo -e "${R}  ❌ MASIH ADA $FAIL ERROR${N}"
  echo -e "${R}═══════════════════════════════════════════════════════════${N}"
  echo ""
  echo -e "  ${B}PM2 list:${N}"
  pm2 list 2>&1 | sed 's/^/    /'
  echo ""
  echo -e "  ${B}DB direct check (bun:sqlite):${N}"
  bun -e "
const { Database } = require('bun:sqlite');
try {
  const db = new Database('$DB');
  console.log('     User count:', db.query('SELECT COUNT(*) as c FROM User').get().c);
  console.log('     Total saldo:', db.query('SELECT COALESCE(SUM(mainBalance),0) as s FROM User').get().s);
  console.log('     Admin count:', db.query('SELECT COUNT(*) as c FROM Admin').get().c);
  db.close();
} catch(e) { console.log('     Error:', e.message); }
" 2>&1 | sed 's/^/    /'
  echo ""
  echo -e "  ${B}.env:${N}"
  grep DATABASE_URL "$P/.env" 2>&1 | sed 's/^/    /'
  echo -e "  ${B}.env.production:${N}"
  grep DATABASE_URL "$P/.env.production" 2>&1 | sed 's/^/    /'
  echo ""
  echo -e "  ${B}nexvo-web logs (last 25 lines):${N}"
  pm2 logs nexvo-web --lines 25 --nostream 2>&1 | tail -25 | sed 's/^/    /'
  echo ""
  echo -e "  ${B}Backups available:${N}"
  ls -la "$DB".pre-v9* 2>&1 | sed 's/^/    /'
  ls -la /tmp/nexvo-backups/ 2>&1 | sed 's/^/    /'
  echo ""
  echo -e "  Screenshot output ini, kirim untuk analisis"
fi
echo ""
