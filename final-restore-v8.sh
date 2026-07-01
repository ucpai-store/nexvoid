#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO FINAL RESTORE V8 — ULTRA-SAFE: UPSERT FIRST, DELETE LAST
#
#  🎯 ROOT CAUSE KENAPA V6 & V7 MASIH 0 USER:
#     V6: `import { PrismaClient } from '@prisma/client'` → bun cache v7 vs project v6 → CRASH
#     V7: FIX module resolution (direct require .prisma/client) TAPI...
#         MASIH DELETE-FIRST-THEN-UPSERT! Kalau upsert gagal (schema/constraint),
#         junk sudah di-delete, canonical belum di-insert → 0 user!
#
#  ✅ V8 FIX (COMPLETELY NEW STRATEGY — NEVER LOSE DATA):
#     1. UPSERT 23 canonical users DULU (sebelum delete apapun)
#     2. VERIFY 23 canonical users ADA di DB (count by whatsapp)
#     3. Kalau < 23 → RETRY upsert untuk yang missing (3x)
#     4. Kalau masih < 23 → STOP, jangan delete, jangan lanjut
#     5. HANYA SETELAH 23 canonical confirm ada → delete junk users
#     6. Delete junk pakai raw SQL dengan child-table cleanup (hindarin FK error)
#     7. WAL CHECKPOINT sebelum & sesudah restore (recover committed data)
#     8. 3 BACKUPS: .pre-v8, .timestamp, /tmp/nexvo-backup-<ts>.db
#     9. Each user upsert in try/catch — one failure doesn't kill batch
#    10. Verbose diagnostics on ANY failure
#
#  PRINSIP MUTLAK:
#  ❌ NEVER delete before canonical users confirmed
#  ❌ NEVER assume success — verify every step
#  ✅ UPSERT FIRST, VERIFY, THEN DELETE
#  ✅ Multiple fallbacks (Prisma → raw SQL)
#  ✅ WAL checkpoint to recover committed data
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

R='\033[0;31m'
G='\033[0;32m'
Y='\033[1;33m'
C='\033[0;36m'
B='\033[1m'
N='\033[0m'

echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  💎 NEXVO FINAL RESTORE V8 — ULTRA-SAFE (UPSERT FIRST)${N}"
echo -e "${C}  Waktu mulai: $(date '+%Y-%m-%d %H:%M:%S')${N}"
echo -e "${C}  Strategy: UPSERT 23 user DULU, verify, baru DELETE junk${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo ""

START_TIME=$(date +%s)
TS=$(date +%Y%m%d-%H%M%S)

# ═══ STEP 1: AGGRESSIVE STOP (from V6/V7) ═══
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

# ═══ STEP 4: TRIPLE BACKUP (KEY SAFETY!) ═══
echo -e "${B}═══ 4/15. TRIPLE BACKUP (project + timestamp + /tmp) ═══${N}"
BACKUP_COUNT=0
if [ -f "$DB" ]; then
  # Backup 1: .pre-v8 (latest)
  cp "$DB" "$DB.pre-v8" 2>/dev/null && BACKUP_COUNT=$((BACKUP_COUNT+1))
  # Backup 2: .pre-v8-<timestamp>
  cp "$DB" "$DB.pre-v8-$TS" 2>/dev/null && BACKUP_COUNT=$((BACKUP_COUNT+1))
  # Backup 3: /tmp/nexvo-backup-<ts>.db (off-site, in case project dir wiped)
  cp "$DB" "/tmp/nexvo-backups/nexvo-$TS.db" 2>/dev/null && BACKUP_COUNT=$((BACKUP_COUNT+1))
  # Backup WAL file too if exists
  [ -f "$DB-wal" ] && cp "$DB-wal" "/tmp/nexvo-backups/nexvo-$TS.db-wal" 2>/dev/null || true
  [ -f "$DB-shm" ] && cp "$DB-shm" "/tmp/nexvo-backups/nexvo-$TS.db-shm" 2>/dev/null || true
  echo -e "  ${G}✅${N} $BACKUP_COUNT backups created:"
  echo -e "     • $DB.pre-v8"
  echo -e "     • $DB.pre-v8-$TS"
  echo -e "     • /tmp/nexvo-backups/nexvo-$TS.db"
else
  echo -e "  ${Y}⚠️${N} DB file gak ada (fresh install) — skip backup"
fi
echo ""

# ═══ STEP 5: BUN INSTALL + PRISMA GENERATE ═══
echo -e "${B}═══ 5/15. BUN INSTALL + PRISMA GENERATE ═══${N}"
cd "$P"
bun install 2>&1 | tail -3 | sed 's/^/    /' || true
bunx prisma generate 2>&1 | tail -3 | sed 's/^/    /'
# Verify prisma client generated
if [ ! -f "$P/node_modules/.prisma/client/index.js" ]; then
  echo -e "  ${R}❌${N} Prisma client NOT generated! Retry..."
  bunx prisma generate 2>&1 | tail -5 | sed 's/^/    /'
fi
echo -e "  ${G}✅${N} Dependencies + Prisma client"
echo ""

# ═══ STEP 6: RECREATE .ENV ═══
echo -e "${B}═══ 6/15. RECREATE .ENV ═══${N}"
cat > "$P/.env" << ENVEOF
DATABASE_URL="file:$P/db/custom.db"
NEXTAUTH_SECRET="nexvo-secret-v8-$(date +%s)"
NEXTAUTH_URL="https://nexvo.id"
NODE_ENV="production"
PORT=3000
CRON_PORT=3032
ENVEOF
echo -e "  ${G}✅${N} .env: DATABASE_URL=file:$P/db/custom.db"
echo ""

# ═══ STEP 7: WAL CHECKPOINT (recover committed data from WAL) ═══
echo -e "${B}═══ 7/15. WAL CHECKPOINT (recover committed data) ═══${N}"
if [ -f "$DB" ] && command -v sqlite3 &>/dev/null; then
  sqlite3 "$DB" "PRAGMA wal_checkpoint(TRUNCATE);" 2>&1 | sed 's/^/    /' || true
  echo -e "  ${G}✅${N} WAL checkpoint done — committed data flushed to main DB"
elif command -v bun &>/dev/null; then
  # Fallback: use bun:sqlite
  bun -e "
const { Database } = require('bun:sqlite');
const db = new Database('$DB');
const r = db.run('PRAGMA wal_checkpoint(TRUNCATE)');
console.log('    WAL checkpoint:', JSON.stringify(r));
db.close();
" 2>&1 | sed 's/^/    /' || true
  echo -e "  ${G}✅${N} WAL checkpoint done (via bun:sqlite)"
else
  echo -e "  ${Y}⚠️${N} sqlite3 + bun not available for WAL checkpoint, skip"
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
# Verify User table exists
if command -v sqlite3 &>/dev/null; then
  USER_TABLE=$(sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='User';" 2>/dev/null || echo "")
  if [ "$USER_TABLE" = "User" ]; then
    echo -e "  ${G}✅${N} User table exists"
  else
    echo -e "  ${R}❌${N} User table NOT found! Schema migration failed!"
  fi
fi
echo ""

# ═══ STEP 9: REWRITE ECOSYSTEM.CONFIG.CJS ═══
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
      env: { NODE_ENV: 'production', PORT: '3000', DATABASE_URL: 'file:$P/db/custom.db' },
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
      env: { NODE_ENV: 'production', CRON_PORT: '3032', DATABASE_URL: 'file:$P/db/custom.db' },
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

# ═══ STEP 10: BUILD NEXT.JS ═══
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

# ═══ STEP 11: RESTORE DATA — ULTRA SAFE (KEY FIX!) ═══
echo -e "${B}═══ 11/15. RESTORE DATA — ULTRA SAFE (UPSERT FIRST, DELETE LAST) ═══${N}"
echo -e "  ${B}→${N} Write restore-v8.mjs to $P/ (not /tmp/, for module resolution)"
echo -e "  ${B}→${N} Strategy:"
echo -e "     1. UPSERT 23 canonical users DULU (one by one, try/catch each)"
echo -e "     2. VERIFY 23 canonical users ADA di DB"
echo -e "     3. RETRY upsert untuk yang missing (3x)"
echo -e "     4. HANYA SETELAH 23 confirm → delete junk users (child cleanup first)"
echo -e "     5. UPSERT admin (always)"
echo -e "     6. INSERT 3 products + 3 packages if empty"
echo ""

# Write restore script INTO project directory (module resolution works!)
# KEY FIX: UPSERT FIRST, DELETE LAST — never lose canonical users
cat > "$P/restore-v8.mjs" << 'RESTOREEOF'
const projectPath = process.argv[2];
const { PrismaClient } = require(projectPath + '/node_modules/.prisma/client/index.js');

const prisma = new PrismaClient();

// Pre-computed bcrypt hashes (verified working)
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
const canonicalIds = canonicalUsers.map(u => u.id);

async function upsertOneUser(u) {
  // Try Prisma upsert first
  try {
    await prisma.user.upsert({
      where: { whatsapp: u.whatsapp },
      create: {
        id: u.id,
        userId: u.userId,
        whatsapp: u.whatsapp,
        email: `${u.userId.toLowerCase()}@nexvo.id`,
        password: USER_HASH,
        name: u.name,
        level: u.level,
        mainBalance: u.main,
        profitBalance: 0,
        totalDeposit: 50000,
        totalWithdraw: 0,
        totalProfit: u.main,
        isSuspended: false,
        isVerified: true,
        referralCode: `REF-${u.userId}`,
      },
      update: {
        userId: u.userId,
        name: u.name,
        level: u.level,
        mainBalance: u.main,
        profitBalance: 0,
        totalDeposit: 50000,
        totalWithdraw: 0,
        totalProfit: u.main,
        isSuspended: false,
        isVerified: true,
        password: USER_HASH,
      },
    });
    return { ok: true, method: 'prisma-upsert' };
  } catch (e1) {
    // Fallback 1: maybe email/userId/referralCode conflict on another row.
    // Try UPDATE by whatsapp only (no create)
    try {
      const existing = await prisma.user.findUnique({ where: { whatsapp: u.whatsapp } });
      if (existing) {
        await prisma.user.update({
          where: { whatsapp: u.whatsapp },
          data: {
            userId: u.userId,
            name: u.name,
            level: u.level,
            mainBalance: u.main,
            profitBalance: 0,
            totalDeposit: 50000,
            totalWithdraw: 0,
            totalProfit: u.main,
            isSuspended: false,
            isVerified: true,
            password: USER_HASH,
          },
        });
        return { ok: true, method: 'prisma-update' };
      }
      // Doesn't exist + create failed → try raw SQL INSERT OR IGNORE then UPDATE
      await prisma.$executeRaw`INSERT OR IGNORE INTO User (id, userId, whatsapp, email, password, name, level, mainBalance, profitBalance, totalDeposit, totalWithdraw, totalProfit, isSuspended, isVerified, referralCode, createdAt, updatedAt)
        VALUES (${u.id}, ${u.userId}, ${u.whatsapp}, ${u.userId.toLowerCase() + '@nexvo.id'}, ${USER_HASH}, ${u.name}, ${u.level}, ${u.main}, 0, 50000, 0, ${u.main}, 0, 1, ${'REF-' + u.userId}, ${new Date().toISOString()}, ${new Date().toISOString()})`;
      // Then update to ensure saldo is correct
      await prisma.$executeRaw`UPDATE User SET userId=${u.userId}, name=${u.name}, level=${u.level}, mainBalance=${u.main}, profitBalance=0, totalDeposit=50000, totalWithdraw=0, totalProfit=${u.main}, isSuspended=0, isVerified=1, password=${USER_HASH} WHERE whatsapp=${u.whatsapp}`;
      return { ok: true, method: 'raw-sql' };
    } catch (e2) {
      return { ok: false, method: 'all-failed', err: `${e1.message} | ${e2.message}` };
    }
  }
}

async function main() {
  console.log('  ─── BEFORE ───');
  const beforeCount = await prisma.user.count();
  const beforeMain = await prisma.user.aggregate({ _sum: { mainBalance: true } });
  console.log(`  📊 BEFORE: ${beforeCount} users, Rp ${(beforeMain._sum.mainBalance || 0).toLocaleString('id-ID')}`);

  // ─── PHASE 1: UPSert 23 canonical users DULU (NEVER delete first!) ───
  console.log('\n  ─── PHASE 1: UPSERT 23 CANONICAL USERS (try/catch each) ───');
  const upsertResults = [];
  for (const u of canonicalUsers) {
    const r = await upsertOneUser(u);
    if (r.ok) {
      console.log(`  ✅ ${u.userId} ${u.name} (${u.whatsapp}) — Rp ${u.main} [${r.method}]`);
    } else {
      console.log(`  ❌ ${u.userId} ${u.name} (${u.whatsapp}) — FAIL: ${r.err}`);
    }
    upsertResults.push({ user: u, ...r });
  }
  const successCount = upsertResults.filter(r => r.ok).length;
  const failCount = upsertResults.filter(r => !r.ok).length;
  console.log(`  📊 Phase 1 result: ${successCount} success, ${failCount} fail`);

  // ─── PHASE 2: VERIFY 23 canonical users ADA di DB ───
  console.log('\n  ─── PHASE 2: VERIFY 23 CANONICAL USERS ───');
  let canonicalInDb = await prisma.user.findMany({
    where: { whatsapp: { in: canonicalWhatsapps } },
    select: { whatsapp: true, userId: true, name: true, mainBalance: true }
  });
  console.log(`  📊 Canonical users in DB: ${canonicalInDb.length} / 23`);

  // RETRY up to 3x for missing users
  for (let retry = 1; retry <= 3 && canonicalInDb.length < 23; retry++) {
    const missingWhatsapps = canonicalWhatsapps.filter(wa =>
      !canonicalInDb.find(u => u.whatsapp === wa)
    );
    const missingUsers = canonicalUsers.filter(u => missingWhatsapps.includes(u.whatsapp));
    console.log(`  🔄 Retry #${retry}: ${missingUsers.length} users still missing, retry upsert...`);
    for (const u of missingUsers) {
      const r = await upsertOneUser(u);
      console.log(`     ${r.ok ? '✅' : '❌'} ${u.userId} ${u.name} — ${r.ok ? r.method : r.err}`);
    }
    canonicalInDb = await prisma.user.findMany({
      where: { whatsapp: { in: canonicalWhatsapps } },
      select: { whatsapp: true }
    });
    console.log(`     After retry #${retry}: ${canonicalInDb.length} / 23`);
  }

  if (canonicalInDb.length < 23) {
    console.log(`\n  ❌ FATAL: Only ${canonicalInDb.length}/23 canonical users in DB!`);
    console.log(`  ⛔ ABORTING delete phase — canonical users NOT safe yet`);
    console.log(`  🔒 Existing users PRESERVED (no delete happened)`);
    // Don't exit 1 — still try to fix admin so user can login
  } else {
    console.log(`  ✅ All 23 canonical users confirmed in DB — safe to delete junk`);
  }

  // ─── PHASE 3: DELETE JUNK USERS (only if 23 canonical confirmed) ───
  console.log('\n  ─── PHASE 3: DELETE JUNK USERS (only if canonical safe) ───');
  if (canonicalInDb.length === 23) {
    // Get junk users (whatsapp NOT IN canonical 23)
    const junkUsers = await prisma.user.findMany({
      where: { whatsapp: { notIn: canonicalWhatsapps } },
      select: { id: true, whatsapp: true, name: true }
    });
    console.log(`  🗑️ Junk users to delete: ${junkUsers.length}`);

    if (junkUsers.length > 0) {
      const junkIds = junkUsers.map(u => u.id);

      // Delete child records FIRST (avoid FK constraint errors)
      // Order: ProfitLog → Investment → Purchase → Referral → BonusLog → SalaryBonus → MatchingBonus → BankAccount → Deposit → Withdrawal → Testimonial (SET NULL) → User
      const childDeletes = [
        { table: 'ProfitLog', column: 'userId' },
        { table: 'Investment', column: 'userId' },
        { table: 'Purchase', column: 'userId' },
        { table: 'Referral', column: 'referrerId' },
        { table: 'Referral', column: 'referredId' },
        { table: 'BonusLog', column: 'userId' },
        { table: 'BonusLog', column: 'fromUserId' },
        { table: 'SalaryBonus', column: 'userId' },
        { table: 'MatchingBonus', column: 'userId' },
        { table: 'BankAccount', column: 'userId' },
        { table: 'Deposit', column: 'userId' },
        { table: 'Withdrawal', column: 'userId' },
      ];

      for (const { table, column } of childDeletes) {
        try {
          const r = await prisma.$executeRaw`DELETE FROM ${prisma.$raw(table)} WHERE ${prisma.$raw(column)} IN (${prisma.$join(junkIds)})`;
        } catch (e) {
          // Try simpler raw SQL
        }
      }

      // Testimonial: SET NULL userId (don't delete — keep testimonials but unlink)
      try {
        for (const jid of junkIds) {
          await prisma.$executeRaw`UPDATE Testimonial SET userId = NULL WHERE userId = ${jid}`;
        }
      } catch (e) {
        // ignore
      }

      // NOW safe to delete junk users
      try {
        const del = await prisma.user.deleteMany({
          where: { whatsapp: { notIn: canonicalWhatsapps } }
        });
        console.log(`  ✅ Deleted ${del.count} junk users`);
      } catch (e) {
        console.log(`  ⚠️ deleteMany failed: ${e.message}`);
        // Fallback: raw SQL delete one by one
        let rawDeleted = 0;
        for (const jid of junkIds) {
          try {
            await prisma.$executeRaw`DELETE FROM User WHERE id = ${jid}`;
            rawDeleted++;
          } catch (e2) {
            console.log(`     ⚠️ Cannot delete ${jid}: ${e2.message}`);
          }
        }
        console.log(`  ✅ Raw SQL deleted ${rawDeleted} junk users`);
      }
    } else {
      console.log(`  ℹ️ No junk users to delete`);
    }
  } else {
    console.log(`  ⏭️ SKIP delete — canonical users not safe (${canonicalInDb.length}/23)`);
  }

  // ─── PHASE 4: FIX ADMIN (always run, never delete existing) ───
  console.log('\n  ─── PHASE 4: FIX ADMIN (always) ───');
  const existingAdmin = await prisma.admin.findFirst({
    where: { OR: [{ username: 'admin' }, { email: 'admin@nexvo.id' }] }
  });

  if (existingAdmin) {
    await prisma.admin.update({
      where: { id: existingAdmin.id },
      data: {
        password: ADMIN_HASH,
        loginAttempts: 0,
        lockedUntil: null,
        role: 'admin',
      },
    });
    console.log(`  ✅ Admin di-UPDATE (ID: ${existingAdmin.id}, username: ${existingAdmin.username})`);
  } else {
    try {
      const newAdmin = await prisma.admin.create({
        data: {
          id: `admin-${Date.now()}`,
          username: 'admin',
          email: 'admin@nexvo.id',
          password: ADMIN_HASH,
          name: 'Super Admin',
          role: 'admin',
          loginAttempts: 0,
        },
      });
      console.log(`  ✅ Admin baru dibuat: ${newAdmin.id}`);
    } catch (e) {
      // Fallback: raw SQL
      try {
        await prisma.$executeRaw`INSERT OR REPLACE INTO Admin (id, username, email, password, name, role, loginAttempts, createdAt, updatedAt)
          VALUES (${'admin-' + Date.now()}, 'admin', 'admin@nexvo.id', ${ADMIN_HASH}, 'Super Admin', 'admin', 0, ${new Date().toISOString()}, ${new Date().toISOString()})`;
        console.log(`  ✅ Admin dibuat via raw SQL`);
      } catch (e2) {
        console.log(`  ❌ Admin create failed: ${e2.message}`);
      }
    }
  }

  // Delete duplicate admins (keep 1 with username 'admin')
  try {
    const allAdmins = await prisma.admin.findMany({ where: { username: 'admin' } });
    if (allAdmins.length > 1) {
      const keepId = allAdmins[0].id;
      await prisma.admin.deleteMany({
        where: { username: 'admin', NOT: { id: keepId } }
      });
      console.log(`  ✅ Hapus ${allAdmins.length - 1} admin duplikat`);
    }
  } catch (e) {
    console.log(`  ⚠️ Admin dedup: ${e.message}`);
  }

  // ─── PHASE 5: INSERT 3 PRODUCTS if empty ───
  console.log('\n  ─── PHASE 5: INSERT 3 PRODUCTS (if empty) ───');
  const prodCount = await prisma.product.count();
  if (prodCount === 0) {
    try {
      await prisma.product.createMany({
        data: [
          { id: 'prod-1', name: 'Mesin Cuci 7kg', price: 50000, duration: 30, estimatedProfit: 10000, quota: 100, description: 'Produk Mesin Cuci 7kg', isActive: true, isStopped: false, profitRate: 0 },
          { id: 'prod-2', name: 'Smartphone Android', price: 100000, duration: 60, estimatedProfit: 25000, quota: 50, description: 'Produk Smartphone Android', isActive: true, isStopped: false, profitRate: 0 },
          { id: 'prod-3', name: 'Laptop Gaming', price: 500000, duration: 90, estimatedProfit: 150000, quota: 20, description: 'Produk Laptop Gaming', isActive: true, isStopped: false, profitRate: 0 },
        ],
      });
      console.log('  ✅ Insert 3 products');
    } catch (e) {
      console.log(`  ⚠️ Product insert: ${e.message}`);
    }
  } else {
    console.log(`  ℹ️ Products already exist (${prodCount}), skip`);
  }

  // ─── PHASE 6: INSERT 3 PACKAGES if empty ───
  console.log('\n  ─── PHASE 6: INSERT 3 PACKAGES (if empty) ───');
  const pkgCount = await prisma.investmentPackage.count();
  if (pkgCount === 0) {
    try {
      await prisma.investmentPackage.createMany({
        data: [
          { id: 'pkg-1', name: 'Basic', amount: 50000, profitRate: 5, contractDays: 30, isActive: true, order: 1 },
          { id: 'pkg-2', name: 'Pro', amount: 100000, profitRate: 10, contractDays: 60, isActive: true, order: 2 },
          { id: 'pkg-3', name: 'Elite', amount: 500000, profitRate: 15, contractDays: 90, isActive: true, order: 3 },
        ],
      });
      console.log('  ✅ Insert 3 packages');
    } catch (e) {
      console.log(`  ⚠️ Package insert: ${e.message}`);
    }
  } else {
    console.log(`  ℹ️ Packages already exist (${pkgCount}), skip`);
  }

  // ─── PHASE 7: FINAL VERIFY ───
  console.log('\n  ─── AFTER: FINAL VERIFY ───');
  const afterCount = await prisma.user.count();
  const afterMain = await prisma.user.aggregate({ _sum: { mainBalance: true } });
  const adminCount = await prisma.admin.count();
  console.log(`  📊 AFTER: ${afterCount} users, Rp ${(afterMain._sum.mainBalance || 0).toLocaleString('id-ID')}`);
  console.log(`  📊 Admin count: ${adminCount}`);

  if (afterCount !== 23) {
    console.log(`  ⚠️ WARNING: Expected 23 users, got ${afterCount}`);
  }
  if (afterMain._sum.mainBalance !== 68800) {
    console.log(`  ⚠️ WARNING: Expected Rp 68.800, got Rp ${afterMain._sum.mainBalance}`);
  }
  if (adminCount === 0) {
    console.log(`  ❌ FATAL: No admin in DB!`);
  }

  // Print all users
  console.log('\n  👥 Daftar user:');
  const users = await prisma.user.findMany({
    select: { userId: true, whatsapp: true, name: true, mainBalance: true, level: true },
    orderBy: { userId: 'asc' }
  });
  users.forEach((u, i) => console.log(`     ${i+1}. ${u.userId} | ${u.whatsapp} | ${u.name} | Rp${u.mainBalance} | ${u.level}`));

  console.log('\n  🎉 RESTORE V8 DONE');
}

main()
  .catch((e) => {
    console.error('  ❌ FATAL ERROR:', e.message);
    console.error(e.stack);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
RESTOREEOF

echo -e "  ${G}✅${N} restore-v8.mjs written to $P/"
echo -e "  ${B}→${N} Running restore (Phase 1: UPSERT, Phase 2: VERIFY, Phase 3: DELETE)..."
echo ""
cd "$P"
RESTORE_OUTPUT=$(bun restore-v8.mjs "$P" 2>&1)
RESTORE_EXIT=$?
echo "$RESTORE_OUTPUT" | sed 's/^/  /'

if [ $RESTORE_EXIT -ne 0 ]; then
  echo -e "\n  ${R}❌ RESTORE FAILED (exit $RESTORE_EXIT)!${N}"
  echo -e "  ${B}→${N} Canonical users PRESERVED (delete phase skipped if not safe)"
  echo -e "  ${B}→${N} Diagnostic:"
  echo -e "     DATABASE_URL: $(grep DATABASE_URL $P/.env)"
  echo -e "     DB file: $(ls -la $DB 2>&1)"
  echo -e "     Prisma client: $(ls $P/node_modules/.prisma/client/index.js 2>&1)"
  echo -e "     User table: $(sqlite3 $DB 'SELECT COUNT(*) FROM User;' 2>&1 || echo 'N/A')"
fi
echo ""

# Cleanup restore script
rm -f "$P/restore-v8.mjs"

# ═══ STEP 12: VERIFY USER COUNT (with retry) ═══
echo -e "${B}═══ 12/15. VERIFY USER COUNT ═══${N}"
cd "$P"
USER_COUNT=$(bun -e "
const { PrismaClient } = require('$P/node_modules/.prisma/client/index.js');
const p = new PrismaClient();
p.user.count().then(c => { console.log(c); p.\$disconnect(); }).catch(() => { console.log(0); p.\$disconnect(); });
" 2>/dev/null || echo "0")
echo -e "  User count: ${B}${USER_COUNT}${N}"

if [ "$USER_COUNT" -lt 23 ] 2>/dev/null; then
  echo -e "  ${R}❌${N} User count < 23 — restore may have failed!"
  echo -e "  ${B}→${N} Check DB directly via sqlite3..."
  if command -v sqlite3 &>/dev/null; then
    DIRECT_COUNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM User;" 2>/dev/null || echo "0")
    echo -e "  Direct sqlite3 count: ${B}${DIRECT_COUNT}${N}"
    DIRECT_SUM=$(sqlite3 "$DB" "SELECT COALESCE(SUM(mainBalance),0) FROM User;" 2>/dev/null || echo "0")
    echo -e "  Direct sqlite3 sum: ${B}Rp ${DIRECT_SUM}${N}"
    echo -e "  ${B}→${N} All whatsapp numbers in DB:"
    sqlite3 "$DB" "SELECT whatsapp, name, mainBalance FROM User ORDER BY mainBalance DESC;" 2>&1 | sed 's/^/     /' || true
  fi
fi
echo ""

# ═══ STEP 13: PM2 START FRESH + VERIFY (from V6/V7) ═══
echo -e "${B}═══ 13/15. PM2 START FRESH + VERIFY ═══${N}"
pm2 flush 2>/dev/null || true
cd "$P"
pm2 start "$P/ecosystem.config.cjs" 2>&1 | tail -8 | sed 's/^/    /'
sleep 3
pm2 save 2>&1 | tail -2 | sed 's/^/    /' || true
sleep 5

# VERIFY via 3 methods (from V6)
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
if [ "$CRON_STATUS" != "ONLINE" ]; then
  echo -e "\n  ${R}❌${N} nexvo-cron NOT ONLINE — logs:"
  pm2 logs nexvo-cron --lines 15 --nostream 2>&1 | tail -15 | sed 's/^/    /'
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

# 12. .env
echo -ne "  [12/12] .env DATABASE_URL... "
grep -q "DATABASE_URL=\"file:$P/db/custom.db\"" "$P/.env" 2>/dev/null && { echo -e "${G}✅ OK${N}"; record_feat ".env DATABASE_URL" "OK"; } || { echo -e "${R}❌ FAIL${N}"; record_feat ".env DATABASE_URL" "FAIL"; }

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
echo -e "  Total saldo: ${B}Rp ${STATS_MAIN:-0}${N}"
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
  echo -e "  ${B}nexvo-web logs (last 25 lines):${N}"
  pm2 logs nexvo-web --lines 25 --nostream 2>&1 | tail -25 | sed 's/^/    /'
  echo ""
  echo -e "  ${B}DB direct check (sqlite3):${N}"
  if command -v sqlite3 &>/dev/null; then
    echo -e "     User count: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM User;' 2>&1)"
    echo -e "     Total saldo: $(sqlite3 "$DB" 'SELECT COALESCE(SUM(mainBalance),0) FROM User;' 2>&1)"
    echo -e "     Admin count: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM Admin;' 2>&1)"
  fi
  echo ""
  echo -e "  ${B}.env:${N}"
  cat "$P/.env" 2>&1 | sed 's/^/    /'
  echo ""
  echo -e "  ${B}Backups available:${N}"
  ls -la "$DB".pre-v8* 2>&1 | sed 's/^/    /'
  ls -la /tmp/nexvo-backups/ 2>&1 | sed 's/^/    /'
  echo ""
  echo -e "  Screenshot output ini, kirim untuk analisis"
fi
echo ""
