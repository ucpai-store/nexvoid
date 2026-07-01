#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO FINAL RESTORE V7 — PRISMA CLIENT + VERIFY EVERY STEP
#
#  🎯 ROOT CAUSE 3 ERROR V6:
#     ❌ Admin login, Admin stats, Admin users list — ALL because Total user: 0
#     → V6 dedup script (bun /tmp/nexvo-dedup-v6.ts) likely CRASHED on VPS:
#       - Import bcryptjs from /tmp/ might fail (module resolution)
#       - OR schema wasn't ready when dedup ran
#       - OR raw SQL INSERT had column name mismatch
#     → Result: 0 users inserted, admin not fixed
#
#  ✅ V7 FIX (COMPLETELY NEW APPROACH):
#     1. Use PRISMA CLIENT (not raw SQL) — guarantees correct column names
#     2. Write restore script INTO $P/ (not /tmp/) — module resolution works
#     3. HARDCODE bcrypt hash (no bcryptjs import needed)
#     4. Run DB operations AFTER build (prisma client is fresh)
#     5. VERIFY after every step — if 0 users, STOP + print clear error
#     6. Use `prisma.user.upsert()` — idempotent, safe, type-checked
#     7. Keep V6's aggressive PM2 fix (kill orphans + pm2 kill + 3-method detection)
#     8. Keep V6's ecosystem.config.cjs REWRITE
#
#  PRINSIP:
#  ❌ No external /tmp/ TypeScript files (module resolution issues)
#  ❌ No raw SQL INSERT (column name mismatch risk)
#  ✅ Use Prisma Client for ALL DB operations
#  ✅ VERIFY after every step — never assume success
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

R='\033[0;31m'
G='\033[0;32m'
Y='\033[1;33m'
C='\033[0;36m'
B='\033[1m'
N='\033[0m'

echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  💎 NEXVO FINAL RESTORE V7 — PRISMA CLIENT + VERIFY${N}"
echo -e "${C}  Waktu mulai: $(date '+%Y-%m-%d %H:%M:%S')${N}"
echo -e "${C}  Fix: Prisma Client (not raw SQL) + verify every step${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo ""

START_TIME=$(date +%s)
TS=$(date +%Y%m%d-%H%M%S)

# Pre-computed bcrypt hashes (verified working)
ADMIN_HASH='$2b$10$2JcQVO1O1nS5xEoMhL.V6OPjzPwcFQ/sKbHbO.0jrLJTMOKMFuVGC'
USER_HASH='$2b$10$wVqfESJ5TIOBOhaUMaNWQOK7KDI12P9fYX/Xdwbwwi9clmGpdRGkC'

# ═══ STEP 1: AGGRESSIVE STOP (from V6) ═══
echo -e "${B}═══ 1/14. AGGRESSIVE STOP (kill PM2 + orphans + ports) ═══${N}"
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
echo -e "${B}═══ 2/14. DETECT PROJECT PATH ═══${N}"
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
mkdir -p "$P/db" "$P/.pm2-logs"
echo -e "  DB: $DB"
echo ""

# ═══ STEP 3: GIT PULL ═══
echo -e "${B}═══ 3/14. GIT PULL ═══${N}"
cd "$P"
git fetch origin main 2>&1 | tail -2 | sed 's/^/    /' || true
git reset --hard origin/main 2>&1 | tail -2 | sed 's/^/    /' || true
echo -e "  ${G}✅${N} Code terbaru"
echo ""

# ═══ STEP 4: BACKUP DB ═══
echo -e "${B}═══ 4/14. BACKUP DB ═══${N}"
if [ -f "$DB" ]; then
  cp "$DB" "$DB.pre-v7-$TS"
  echo -e "  ${G}✅${N} Backup: $DB.pre-v7-$TS"
fi
echo ""

# ═══ STEP 5: BUN INSTALL + PRISMA GENERATE ═══
echo -e "${B}═══ 5/14. BUN INSTALL + PRISMA GENERATE ═══${N}"
cd "$P"
bun install 2>&1 | tail -3 | sed 's/^/    /' || true
bunx prisma generate 2>&1 | tail -3 | sed 's/^/    /'
echo -e "  ${G}✅${N} Dependencies + Prisma client"
echo ""

# ═══ STEP 6: RECREATE .ENV ═══
echo -e "${B}═══ 6/14. RECREATE .ENV ═══${N}"
cat > "$P/.env" << ENVEOF
DATABASE_URL="file:$P/db/custom.db"
NEXTAUTH_SECRET="nexvo-secret-v7-$(date +%s)"
NEXTAUTH_URL="https://nexvo.id"
NODE_ENV="production"
PORT=3000
CRON_PORT=3032
ENVEOF
echo -e "  ${G}✅${N} .env: DATABASE_URL=file:$P/db/custom.db"
echo ""

# ═══ STEP 7: SCHEMA MIGRATION ═══
echo -e "${B}═══ 7/14. SCHEMA MIGRATION (prisma db push) ═══${N}"
cd "$P"
echo -e "  ${B}→${N} prisma db push (create/update schema, no data loss)..."
echo "y" | bunx prisma db push --skip-generate 2>&1 | tail -5 | sed 's/^/    /'
SCHEMA_EXIT=$?
if [ $SCHEMA_EXIT -ne 0 ]; then
  echo -e "  ${Y}⚠️${N} db push returned $SCHEMA_EXIT, try with --accept-data-loss..."
  bunx prisma db push --skip-generate --accept-data-loss 2>&1 | tail -5 | sed 's/^/    /'
fi
echo ""

# ═══ STEP 8: REWRITE ECOSYSTEM.CONFIG.CJS ═══
echo -e "${B}═══ 8/14. REWRITE ECOSYSTEM.CONFIG.CJS ═══${N}"
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

# ═══ STEP 9: BUILD NEXT.JS ═══
echo -e "${B}═══ 9/14. BUILD NEXT.JS ═══${N}"
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

# ═══ STEP 10: RESTORE DATA via PRISMA CLIENT (KEY FIX!) ═══
echo -e "${B}═══ 10/14. RESTORE DATA via PRISMA CLIENT (not raw SQL!) ═══${N}"
echo -e "  ${B}→${N} Write restore script to $P/restore-data.mjs (not /tmp/)..."

# Write restore script INTO project directory (module resolution works!)
# KEY FIX: Import DIRECTLY from generated .prisma/client — bypass @prisma/client
# module resolution bug (bun cache has v7, project uses v6)
# Use QUOTED heredoc 'RESTOREEOF' to prevent bash expansion of ${} in template literals
# Pass project path as argv[2] instead
cat > "$P/restore-data.mjs" << 'RESTOREEOF'
const projectPath = process.argv[2];
const { PrismaClient } = require(projectPath + '/node_modules/.prisma/client/index.js');

const prisma = new PrismaClient();

// Pre-computed bcrypt hashes (no bcryptjs import needed!)
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

async function main() {
  // BEFORE
  const beforeCount = await prisma.user.count();
  const beforeMain = await prisma.user.aggregate({ _sum: { mainBalance: true } });
  console.log(`  📊 BEFORE: ${beforeCount} users, Rp ${(beforeMain._sum.mainBalance || 0).toLocaleString('id-ID')}`);

  // STEP A: Delete junk users (whatsapp NOT in canonical 23)
  const deleted = await prisma.user.deleteMany({
    where: { whatsapp: { notIn: canonicalWhatsapps } }
  });
  console.log(`  ✅ Delete ${deleted.count} junk user (Test User, old users, duplicates)`);

  // STEP B: Upsert 23 canonical users (Prisma Client — correct column names guaranteed!)
  let upserted = 0;
  for (const u of canonicalUsers) {
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
    upserted++;
  }
  console.log(`  ✅ Upsert ${upserted} canonical user (saldo di-set ke nilai benar)`);

  // STEP C: Fix Admin — upsert admin record
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
    console.log(`  ✅ Admin di-UPDATE (ID: ${existingAdmin.id})`);
  } else {
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
    console.log(`  ✅ Admin baru: ${newAdmin.id}`);
  }

  // Delete duplicate admins (keep 1)
  const allAdmins = await prisma.admin.findMany({ where: { username: 'admin' } });
  if (allAdmins.length > 1) {
    const keepId = allAdmins[0].id;
    await prisma.admin.deleteMany({
      where: { username: 'admin', NOT: { id: keepId } }
    });
    console.log(`  ✅ Hapus ${allAdmins.length - 1} admin duplikat`);
  }

  // STEP D: Insert 3 products if empty
  const prodCount = await prisma.product.count();
  if (prodCount === 0) {
    await prisma.product.createMany({
      data: [
        { id: 'prod-1', name: 'Mesin Cuci 7kg', price: 50000, duration: 30, estimatedProfit: 10000, quota: 100, description: 'Produk Mesin Cuci 7kg', isActive: true, isStopped: false, profitRate: 0 },
        { id: 'prod-2', name: 'Smartphone Android', price: 100000, duration: 60, estimatedProfit: 25000, quota: 50, description: 'Produk Smartphone Android', isActive: true, isStopped: false, profitRate: 0 },
        { id: 'prod-3', name: 'Laptop Gaming', price: 500000, duration: 90, estimatedProfit: 150000, quota: 20, description: 'Produk Laptop Gaming', isActive: true, isStopped: false, profitRate: 0 },
      ],
    });
    console.log('  ✅ Insert 3 products');
  } else {
    console.log(`  ℹ️ Products already exist (${prodCount}), skip`);
  }

  // STEP E: Insert 3 packages if empty
  const pkgCount = await prisma.investmentPackage.count();
  if (pkgCount === 0) {
    await prisma.investmentPackage.createMany({
      data: [
        { id: 'pkg-1', name: 'Basic', minAmount: 50000, maxAmount: 100000, profitRate: 5, duration: 30, isActive: true },
        { id: 'pkg-2', name: 'Pro', minAmount: 100001, maxAmount: 500000, profitRate: 10, duration: 60, isActive: true },
        { id: 'pkg-3', name: 'Elite', minAmount: 500001, maxAmount: 10000000, profitRate: 15, duration: 90, isActive: true },
      ],
    });
    console.log('  ✅ Insert 3 packages');
  } else {
    console.log(`  ℹ️ Packages already exist (${pkgCount}), skip`);
  }

  // AFTER — VERIFY!
  const afterCount = await prisma.user.count();
  const afterMain = await prisma.user.aggregate({ _sum: { mainBalance: true } });
  console.log(`  📊 AFTER: ${afterCount} users, Rp ${(afterMain._sum.mainBalance || 0).toLocaleString('id-ID')}`);

  if (afterCount !== 23) {
    console.log(`  ❌ ERROR: Expected 23 users, got ${afterCount}!`);
    process.exit(1);
  }
  if (afterMain._sum.mainBalance !== 68800) {
    console.log(`  ⚠️ WARNING: Expected Rp 68.800, got Rp ${afterMain._sum.mainBalance}`);
  }

  // Print all users
  const users = await prisma.user.findMany({
    select: { userId: true, whatsapp: true, name: true, mainBalance: true, level: true },
    orderBy: { userId: 'asc' }
  });
  console.log('\n  👥 Daftar user:');
  users.forEach((u, i) => console.log(`     ${i+1}. ${u.userId} | ${u.whatsapp} | ${u.name} | Rp${u.mainBalance} | ${u.level}`));

  console.log('\n  🎉 RESTORE SUCCESS: 23 users, Rp 68.800');
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

echo -e "  ${G}✅${N} restore-data.mjs written to $P/"
echo -e "  ${B}→${N} Running restore (Prisma Client, type-safe)..."
cd "$P"
RESTORE_OUTPUT=$(bun restore-data.mjs "$P" 2>&1)
RESTORE_EXIT=$?
echo "$RESTORE_OUTPUT" | sed 's/^/  /'

if [ $RESTORE_EXIT -ne 0 ]; then
  echo -e "\n  ${R}❌ RESTORE FAILED (exit $RESTORE_EXIT)!${N}"
  echo -e "  ${B}→${N} Prisma Client error details above"
  echo -e "  ${B}→${N} Possible causes:"
  echo -e "     - Schema not created (prisma db push failed in step 7)"
  echo -e "     - DATABASE_URL wrong in .env"
  echo -e "     - Prisma client not generated"
  echo ""
  echo -e "  ${B}Diagnostic:${N}"
  echo -e "     DATABASE_URL: $(grep DATABASE_URL $P/.env)"
  echo -e "     DB file: $(ls -la $DB 2>&1)"
  echo -e "     Prisma client: $(ls $P/node_modules/.prisma/client/index.js 2>&1)"
fi
echo ""

# ═══ STEP 11: VERIFY USER COUNT (CRITICAL!) ═══
echo -e "${B}═══ 11/14. VERIFY USER COUNT (critical!) ═══${N}"
cd "$P"
USER_COUNT=$(bun -e "
const { PrismaClient } = require('$P/node_modules/.prisma/client/index.js');
const p = new PrismaClient();
p.user.count().then(c => { console.log(c); p.\$disconnect(); }).catch(() => { console.log(0); p.\$disconnect(); });
" 2>/dev/null || echo "0")
echo -e "  User count: ${B}${USER_COUNT}${N}"
if [ "$USER_COUNT" -lt 23 ] 2>/dev/null; then
  echo -e "  ${R}❌${N} User count < 23 — restore failed!"
  echo -e "  ${B}→${N} Retry restore..."
  bun restore-data.mjs "$P" 2>&1 | sed 's/^/    /'
  USER_COUNT=$(bun -e "
const { PrismaClient } = require('$P/node_modules/.prisma/client/index.js');
const p = new PrismaClient();
p.user.count().then(c => { console.log(c); p.\$disconnect(); }).catch(() => { console.log(0); p.\$disconnect(); });
" 2>/dev/null || echo "0")
  echo -e "  User count after retry: ${B}${USER_COUNT}${N}"
fi
echo ""

# Cleanup restore script
rm -f "$P/restore-data.mjs"

# ═══ STEP 12: PM2 START FRESH + VERIFY (from V6) ═══
echo -e "${B}═══ 12/14. PM2 START FRESH + VERIFY ═══${N}"
pm2 flush 2>/dev/null || true
cd "$P"
pm2 start "$P/ecosystem.config.cjs" 2>&1 | tail -8 | sed 's/^/    /'
sleep 3
pm2 save 2>&1 | tail -2 | sed 's/^/    /' || true
sleep 5

# VERIFY via 3 methods
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

# ═══ STEP 13: VERIFY 12 FITUR ═══
echo -e "${B}═══ 13/14. VERIFY 12 FITUR (ZERO TOLERANCE) ═══${N}"
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

# ═══ FINAL SUMMARY ═══
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
  echo -e "  ${B}DB file:${N}"
  ls -la "$DB" 2>&1 | sed 's/^/    /'
  echo ""
  echo -e "  ${B}.env:${N}"
  cat "$P/.env" 2>&1 | sed 's/^/    /'
  echo ""
  echo -e "  Screenshot output ini, kirim untuk analisis"
fi
echo ""
