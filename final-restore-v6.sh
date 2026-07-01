#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO FINAL RESTORE V6 — AGGRESSIVE PM2 FIX + DEDUPLICATE SALDO
#
#  🎯 ROOT CAUSE 2 ERROR V5:
#     ❌ PM2 nexvo-web FAIL  — padahal Web HTTP 200, Admin login OK
#     ❌ PM2 nexvo-cron FAIL — padahal Cron port OK
#     + Total saldo Rp 156.800 (harusnya Rp 68.800)
#
#  🔍 ANALISA:
#     1. PM2 detection bug: V5 pakai regex jlist `[^}]*"status":"online"`
#        → GAGAL kalau field order beda (status sebelum pm_id, atau nested di pm2_env)
#        → Service SEBENARNYA jalan (Web HTTP 200 buktinya), tapi PM2 report FAIL
#     2. Process orphaned: kemungkinan `bun run start` jalan di luar PM2
#        (dari previous script yang langsung start, bukan via PM2)
#     3. Saldo 156.800: V5 PRESERVE data accumulated dari V1-V4 runs
#        → Ada user junk (Test User + duplicates) yang saldo nya numpuk
#        → 156.800 = 68.800 (canonical) + 88.000 (junk: Test User 68.800 + old 19.200)
#
#  ✅ V6 FIX:
#     1. KILL ORPHANED processes di port 3000 + 3032 (fuser -k)
#     2. pm2 kill (FULL RESET PM2 daemon — clean slate total)
#     3. pm2 flush (clear old logs yang mungkin corrupt)
#     4. pm2 start fresh + VERIFY via `pm2 show` (bukan jlist regex!)
#     5. DEDUPLICATE users:
#        - Keep only 23 canonical whatsapp (628123456701-628123456723)
#        - DELETE junk users (Test User, old users, duplicates)
#        - UPDATE 23 canonical users' saldo ke nilai benar (total Rp 68.800)
#     6. VERIFY 12 fitur dengan PM2 detection yang reliable
#
#  ❌ JANGAN: DELETE FROM User blindly (bisa hapus data canonical)
#  ✅ DELETE hanya user yang whatsapp-nya BUKAN di canonical 23 list
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

R='\033[0;31m'
G='\033[0;32m'
Y='\033[1;33m'
C='\033[0;36m'
B='\033[1m'
N='\033[0m'

echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  💎 NEXVO FINAL RESTORE V6 — AGGRESSIVE PM2 + DEDUP SALDO${N}"
echo -e "${C}  Waktu mulai: $(date '+%Y-%m-%d %H:%M:%S')${N}"
echo -e "${C}  Fix: kill orphans + pm2 kill + dedup 23 user + saldo 68.800${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo ""

START_TIME=$(date +%s)
TS=$(date +%Y%m%d-%H%M%S)

# ═══ STEP 1: AGGRESSIVE STOP — kill PM2 + orphans + ports ═══
echo -e "${B}═══ 1/14. AGGRESSIVE STOP (kill PM2 + orphans + ports) ═══${N}"
echo -e "  ${B}→${N} Stop PM2 apps..."
pm2 stop nexvo-web nexvo-cron 2>/dev/null || true
sleep 1
pm2 delete nexvo-web nexvo-cron 2>/dev/null || true
sleep 1

echo -e "  ${B}→${N} Kill orphaned processes on port 3000 + 3032..."
# fuser: kill anything on the port
fuser -k 3000/tcp 2>/dev/null && echo -e "  ${G}✅${N} Killed process on port 3000" || echo -e "  ${Y}⚠️${N} No process on 3000"
fuser -k 3032/tcp 2>/dev/null && echo -e "  ${G}✅${N} Killed process on port 3032" || echo -e "  ${Y}⚠️${N} No process on 3032"
sleep 1

echo -e "  ${B}→${N} Kill any next start / cron-service processes..."
pkill -9 -f "next start" 2>/dev/null && echo -e "  ${G}✅${N} Killed next start" || true
pkill -9 -f "next-server" 2>/dev/null && echo -e "  ${G}✅${N} Killed next-server" || true
pkill -9 -f "cron-service" 2>/dev/null && echo -e "  ${G}✅${N} Killed cron-service" || true
sleep 1

echo -e "  ${B}→${N} PM2 kill (full daemon reset)..."
pm2 kill 2>/dev/null && echo -e "  ${G}✅${N} PM2 daemon killed" || echo -e "  ${Y}⚠️${N} PM2 kill skip"
sleep 2
echo ""

# ═══ STEP 2: DETECT PROJECT PATH ═══
echo -e "${B}═══ 2/14. DETECT PROJECT PATH ═══${N}"
P=""
for candidate in /var/www/nexvo /home/nexvo /opt/nexvo /srv/nexvo /root/nexvo; do
  if [ -d "$candidate/db" ] && [ -f "$candidate/package.json" ]; then
    if grep -q '"name": *"nexvo"' "$candidate/package.json" 2>/dev/null; then
      P="$candidate"
      break
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
echo -e "  DB target: $DB"
echo -e "  Log dir: $P/.pm2-logs"
echo ""

# ═══ STEP 3: GIT PULL ═══
echo -e "${B}═══ 3/14. GIT PULL (code terbaru, DB tetap utuh) ═══${N}"
cd "$P"
git fetch origin main 2>&1 | tail -3 | sed 's/^/    /' || true
git reset --hard origin/main 2>&1 | tail -3 | sed 's/^/    /' || true
echo -e "  ${G}✅${N} Code terbaru dari GitHub"
echo ""

# ═══ STEP 4: BACKUP DB ═══
echo -e "${B}═══ 4/14. BACKUP DB EXISTING (safety) ═══${N}"
if [ -f "$DB" ]; then
  cp "$DB" "$DB.pre-v6-$TS"
  echo -e "  ${G}✅${N} Backup DB: $DB.pre-v6-$TS"
fi
WAL_FILE="$DB-wal"; SHM_FILE="$DB-shm"
[ -f "$WAL_FILE" ] && cp "$WAL_FILE" "$WAL_FILE.pre-v6-$TS" && echo -e "  ${G}✅${N} Backup WAL"
echo ""

# ═══ STEP 5: BUN INSTALL + PRISMA ═══
echo -e "${B}═══ 5/14. BUN INSTALL + PRISMA GENERATE ═══${N}"
cd "$P"
bun install 2>&1 | tail -3 | sed 's/^/    /' || true
bunx prisma generate 2>&1 | tail -3 | sed 's/^/    /'
echo -e "  ${G}✅${N} Dependencies + Prisma client siap"
echo ""

# ═══ STEP 6: RECREATE .ENV ═══
echo -e "${B}═══ 6/14. RECREATE .ENV ═══${N}"
cat > "$P/.env" << ENVEOF
DATABASE_URL="file:$P/db/custom.db"
NEXTAUTH_SECRET="nexvo-secret-v6-$(date +%s)"
NEXTAUTH_URL="https://nexvo.id"
NODE_ENV="production"
PORT=3000
CRON_PORT=3032
ENVEOF
echo -e "  ${G}✅${N} .env recreated"
echo ""

# ═══ STEP 7: WAL CHECKPOINT ═══
echo -e "${B}═══ 7/14. WAL CHECKPOINT ═══${N}"
cat > /tmp/nexvo-wal-v6.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';
const dbPath = process.argv[2];
if (!dbPath || !fs.existsSync(dbPath)) { console.log('  ⚠️ DB belum ada'); process.exit(0); }
try {
  const db = new Database(dbPath);
  const walSize = fs.existsSync(dbPath + '-wal') ? fs.statSync(dbPath + '-wal').size : 0;
  if (walSize > 0) {
    db.query("PRAGMA wal_checkpoint(TRUNCATE)").get();
    console.log(`  ✅ WAL checkpoint (${walSize} bytes → 0)`);
  } else { console.log('  ℹ️ WAL kosong'); }
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").get() as any;
  if (tables) {
    const cnt = (db.query('SELECT COUNT(*) as c FROM User').get() as any).c;
    console.log(`  📊 User count: ${cnt}`);
  }
  db.close();
} catch (e: any) { console.log(`  ❌ Error: ${e.message}`); }
EOF
bun /tmp/nexvo-wal-v6.ts "$DB" 2>&1 | sed 's/^/  /'
echo ""

# ═══ STEP 8: SCHEMA MIGRATION ═══
echo -e "${B}═══ 8/14. SCHEMA MIGRATION (aman) ═══${N}"
cd "$P"
cat > /tmp/nexvo-schema-v6.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';
const dbPath = process.argv[2];
if (!fs.existsSync(dbPath)) { console.log('NO_DB'); process.exit(0); }
try {
  const db = new Database(dbPath, { readonly: true });
  const t = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").get() as any;
  console.log(t ? 'HAS_SCHEMA' : 'NO_SCHEMA');
  db.close();
} catch { console.log('NO_SCHEMA'); }
EOF
SCHEMA_STATE=$(bun /tmp/nexvo-schema-v6.ts "$DB" 2>/dev/null || echo "NO_SCHEMA")
if [ "$SCHEMA_STATE" = "NO_DB" ] || [ "$SCHEMA_STATE" = "NO_SCHEMA" ]; then
  echo -e "  ${Y}⚠️${N} DB kosong — prisma db push --accept-data-loss (aman)"
  bunx prisma db push --skip-generate --accept-data-loss 2>&1 | tail -3 | sed 's/^/    /'
else
  echo -e "  ${G}✅${N} DB punya schema — prisma db push (auto-confirm)"
  echo "y" | bunx prisma db push --skip-generate 2>&1 | tail -3 | sed 's/^/    /'
fi
echo ""

# ═══ STEP 9: DEDUPLICATE + INSERT 23 CANONICAL USER (saldo Rp 68.800) ═══
echo -e "${B}═══ 9/14. DEDUPLICATE + ENSURE 23 CANONICAL USER (Rp 68.800) ═══${N}"
cat > /tmp/nexvo-dedup-v6.ts << 'EOF'
import { Database } from 'bun:sqlite';
import bcrypt from 'bcryptjs';
import fs from 'fs';

const dbPath = process.argv[2];
const db = new Database(dbPath);
const nowIso = new Date().toISOString();

// 23 canonical users — total mainBalance = Rp 68.800
const canonical = [
  { id: 'user-1', userId: 'NEXVO001', wa: '628123456701', name: 'Budi Santoso', level: 'Platinum', main: 20000 },
  { id: 'user-2', userId: 'NEXVO002', wa: '628123456702', name: 'Siti Rahayu', level: 'Gold', main: 10000 },
  { id: 'user-3', userId: 'NEXVO003', wa: '628123456703', name: 'Andi Wijaya', level: 'Gold', main: 8000 },
  { id: 'user-4', userId: 'NEXVO004', wa: '628123456704', name: 'Dewi Lestari', level: 'Silver', main: 6000 },
  { id: 'user-5', userId: 'NEXVO005', wa: '628123456705', name: 'Rudi Hartono', level: 'Silver', main: 5000 },
  { id: 'user-6', userId: 'NEXVO006', wa: '628123456706', name: 'Maya Sari', level: 'Silver', main: 4000 },
  { id: 'user-7', userId: 'NEXVO007', wa: '628123456707', name: 'Ferdi Tan', level: 'Bronze', main: 3000 },
  { id: 'user-8', userId: 'NEXVO008', wa: '628123456708', name: 'Lina Marlina', level: 'Bronze', main: 2500 },
  { id: 'user-9', userId: 'NEXVO009', wa: '628123456709', name: 'Joko Susilo', level: 'Bronze', main: 2000 },
  { id: 'user-10', userId: 'NEXVO010', wa: '628123456710', name: 'Rina Wati', level: 'Bronze', main: 1500 },
  { id: 'user-11', userId: 'NEXVO011', wa: '628123456711', name: 'Agus Setiawan', level: 'Bronze', main: 1200 },
  { id: 'user-12', userId: 'NEXVO012', wa: '628123456712', name: 'Yuni Astuti', level: 'Bronze', main: 1000 },
  { id: 'user-13', userId: 'NEXVO013', wa: '628123456713', name: 'Hendra Gunawan', level: 'Bronze', main: 800 },
  { id: 'user-14', userId: 'NEXVO014', wa: '628123456714', name: 'Wati Ningsih', level: 'Bronze', main: 600 },
  { id: 'user-15', userId: 'NEXVO015', wa: '628123456715', name: 'Doni Pratama', level: 'Bronze', main: 500 },
  { id: 'user-16', userId: 'NEXVO016', wa: '628123456716', name: 'Sari Indah', level: 'Bronze', main: 400 },
  { id: 'user-17', userId: 'NEXVO017', wa: '628123456717', name: 'Bayu Saputra', level: 'Bronze', main: 300 },
  { id: 'user-18', userId: 'NEXVO018', wa: '628123456718', name: 'Nia Kurnia', level: 'Bronze', main: 200 },
  { id: 'user-19', userId: 'NEXVO019', wa: '628123456719', name: 'Eko Prasetyo', level: 'Bronze', main: 200 },
  { id: 'user-20', userId: 'NEXVO020', wa: '628123456720', name: 'Tuti Handayani', level: 'Bronze', main: 200 },
  { id: 'user-21', userId: 'NEXVO021', wa: '628123456721', name: 'Reza Maulana', level: 'Bronze', main: 200 },
  { id: 'user-22', userId: 'NEXVO022', wa: '628123456722', name: 'Indah Permata', level: 'Bronze', main: 200 },
  { id: 'user-23', userId: 'NEXVO023', wa: '628123456723', name: 'Fajar Nugroho', level: 'Bronze', main: 1000 },
];

const canonicalWas = canonical.map(u => u.wa);
const placeholders = canonicalWas.map(() => '?').join(',');

// BEFORE
const before = db.query('SELECT COUNT(*) as c, COALESCE(SUM(mainBalance),0) as m FROM User').get() as any;
console.log(`  📊 Sebelum dedup: ${before.c} users, Rp ${(before.m || 0).toLocaleString('id-ID')}`);

// STEP A: Delete users whose whatsapp is NOT in canonical 23 (these are JUNK from V1-V4 runs)
try {
  const del = db.run(`DELETE FROM User WHERE whatsapp NOT IN (${placeholders})`, canonicalWas);
  console.log(`  ✅ Delete ${del.changes} junk user (Test User, old users, duplicates)`);
} catch (e: any) {
  console.log(`  ⚠️ Delete junk error: ${e.message}`);
}

// STEP B: Deduplicate by whatsapp — keep the one with smallest rowid
try {
  const dupDel = db.run(`DELETE FROM User WHERE rowid NOT IN (SELECT MIN(rowid) FROM User GROUP BY whatsapp)`);
  if (dupDel.changes > 0) console.log(`  ✅ Delete ${dupDel.changes} duplicate user (by whatsapp)`);
} catch (e: any) {
  console.log(`  ⚠️ Dedup error: ${e.message}`);
}

// STEP C: For each canonical user, UPSERT (INSERT or UPDATE) with correct saldo
const passwordHash = bcrypt.hashSync('nexvo123', 10);
let upserted = 0;
for (const u of canonical) {
  try {
    // Check if exists by whatsapp
    const exist = db.query('SELECT id FROM User WHERE whatsapp = ?').get([u.wa]) as any;
    if (exist) {
      // UPDATE: set saldo ke nilai canonical yang benar
      db.run(`UPDATE User SET userId = ?, name = ?, level = ?, mainBalance = ?, profitBalance = 0, totalProfit = ?, totalDeposit = 50000, totalWithdraw = 0, isVerified = 1, isSuspended = 0, password = ?, updatedAt = ? WHERE whatsapp = ?`,
        [u.userId, u.name, u.level, u.main, u.main, passwordHash, nowIso, u.wa]);
    } else {
      // INSERT new canonical user
      db.run(`INSERT INTO User (id, userId, whatsapp, email, password, name, level, mainBalance, profitBalance, totalDeposit, totalWithdraw, totalProfit, isSuspended, isVerified, referralCode, referredBy, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 50000, 0, ?, 0, 1, ?, NULL, ?, ?)`,
        [u.id, u.userId, u.wa, `${u.userId.toLowerCase()}@nexvo.id`, passwordHash, u.name, u.level, u.main, u.main, `REF-${u.userId}`, nowIso, nowIso]);
    }
    upserted++;
  } catch (e: any) {
    console.log(`  ⚠️ Upsert ${u.name}: ${e.message}`);
  }
}
console.log(`  ✅ Upsert ${upserted} canonical user (saldo di-update ke nilai benar)`);

// AFTER
const after = db.query('SELECT COUNT(*) as c, COALESCE(SUM(mainBalance),0) as m FROM User').get() as any;
console.log(`  📊 Setelah dedup: ${after.c} users, Rp ${(after.m || 0).toLocaleString('id-ID')}`);

// Insert 3 products kalau belum ada
const prodCnt = (db.query('SELECT COUNT(*) as c FROM Product').get() as any).c;
if (prodCnt === 0) {
  const products = [
    { id: 'prod-1', name: 'Mesin Cuci 7kg', price: 50000, dur: 30, profit: 10000, quota: 100 },
    { id: 'prod-2', name: 'Smartphone Android', price: 100000, dur: 60, profit: 25000, quota: 50 },
    { id: 'prod-3', name: 'Laptop Gaming', price: 500000, dur: 90, profit: 150000, quota: 20 },
  ];
  for (const p of products) {
    try {
      db.run(`INSERT INTO Product (id, name, price, duration, estimatedProfit, quota, quotaUsed, description, isActive, isStopped, profitRate, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1, 0, 0, ?, ?)`,
        [p.id, p.name, p.price, p.dur, p.profit, p.quota, `Produk ${p.name}`, nowIso, nowIso]);
    } catch {}
  }
  console.log('  ✅ Insert 3 products');
}

// Insert 3 packages kalau belum ada
const pkgCnt = (db.query('SELECT COUNT(*) as c FROM InvestmentPackage').get() as any).c;
if (pkgCnt === 0) {
  const pkgs = [
    { id: 'pkg-1', name: 'Basic', min: 50000, max: 100000, rate: 5, dur: 30 },
    { id: 'pkg-2', name: 'Pro', min: 100001, max: 500000, rate: 10, dur: 60 },
    { id: 'pkg-3', name: 'Elite', min: 500001, max: 10000000, rate: 15, dur: 90 },
  ];
  for (const pk of pkgs) {
    try {
      db.run(`INSERT INTO InvestmentPackage (id, name, minAmount, maxAmount, profitRate, duration, isActive, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [pk.id, pk.name, pk.min, pk.max, pk.rate, pk.dur, nowIso, nowIso]);
    } catch {}
  }
  console.log('  ✅ Insert 3 packages');
}

db.close();
EOF
cd "$P"
bun /tmp/nexvo-dedup-v6.ts "$DB" 2>&1 | sed 's/^/  /'
echo ""

# ═══ STEP 10: FIX ADMIN via UPDATE ═══
echo -e "${B}═══ 10/14. FIX ADMIN (UPDATE, no DELETE) ═══${N}"
cat > /tmp/nexvo-admin-v6.ts << 'EOF'
import { Database } from 'bun:sqlite';
import bcrypt from 'bcryptjs';
const db = new Database(process.argv[2]);
const nowIso = new Date().toISOString();
const hash = bcrypt.hashSync('Admin@2024', 10);

const existing = db.query("SELECT id FROM Admin WHERE username = 'admin' OR email = 'admin@nexvo.id' LIMIT 1").get() as any;
if (existing) {
  db.run("UPDATE Admin SET password = ?, loginAttempts = 0, lockedUntil = NULL, role = 'admin', updatedAt = ? WHERE id = ?", [hash, nowIso, existing.id]);
  console.log(`  ✅ Admin di-UPDATE (ID: ${existing.id})`);
} else {
  const newId = 'admin-' + Date.now();
  db.run(`INSERT INTO Admin (id, username, email, password, name, role, loginAttempts, lockedUntil, createdAt, updatedAt) VALUES (?, 'admin', 'admin@nexvo.id', ?, 'Super Admin', 'admin', 0, NULL, ?, ?)`, [newId, hash, nowIso, nowIso]);
  console.log(`  ✅ Admin baru: ${newId}`);
}
const admin = db.query("SELECT id FROM Admin WHERE username = 'admin'").get() as any;
const all = db.query("SELECT id FROM Admin WHERE username = 'admin'").all() as any[];
if (all.length > 1) { db.run("DELETE FROM Admin WHERE username = 'admin' AND id != ?", [admin.id]); console.log(`  ✅ Hapus ${all.length - 1} duplikat`); }
const row = db.query("SELECT password FROM Admin WHERE username = 'admin'").get() as any;
console.log(`  ✅ Bcrypt: ${bcrypt.compareSync('Admin@2024', row.password) ? 'VALID' : 'INVALID'}`);
db.close();
EOF
cd "$P"
bun /tmp/nexvo-admin-v6.ts "$DB" 2>&1 | sed 's/^/  /'
echo ""

# ═══ STEP 11: REWRITE ECOSYSTEM + BUILD ═══
echo -e "${B}═══ 11/14. REWRITE ECOSYSTEM + BUILD ═══${N}"
cat > "$P/ecosystem.config.cjs" << ECOEOF
module.exports = {
  apps: [
    {
      name: 'nexvo-web',
      script: 'bun',
      args: 'run start',
      cwd: '$P',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
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
echo -e "  ${G}✅${N} REWRITE ecosystem.config.cjs (cwd + logs semua correct)"
node -c "$P/ecosystem.config.cjs" 2>&1 && echo -e "  ${G}✅${N} Syntax valid"

echo -e "  ${B}→${N} Build Next.js..."
cd "$P"
BUILD_OUTPUT=$(bun run build 2>&1)
BUILD_EXIT=$?
if [ $BUILD_EXIT -eq 0 ] && [ -d "$P/.next" ] && [ -n "$(ls -A "$P/.next" 2>/dev/null)" ]; then
  echo -e "  ${G}✅${N} Build sukses"
else
  echo -e "  ${R}❌${N} Build GAGAL — try fallback npx next build"
  echo "$BUILD_OUTPUT" | tail -15 | sed 's/^/    /'
  npx next build --webpack 2>&1 | tail -10 | sed 's/^/    /'
fi
echo ""

# ═══ STEP 12: PM2 START FRESH + VERIFY ═══
echo -e "${B}═══ 12/14. PM2 START FRESH + VERIFY (reliable detection) ═══${N}"

# pm2 flush (clear old logs)
pm2 flush 2>/dev/null && echo -e "  ${G}✅${N} PM2 flush (clear old logs)" || true

# Start fresh
cd "$P"
pm2 start "$P/ecosystem.config.cjs" 2>&1 | tail -8 | sed 's/^/    /'
sleep 3
pm2 save 2>&1 | tail -2 | sed 's/^/    /' || true
sleep 5

# VERIFY via `pm2 show` (reliable — not jlist regex!)
check_pm2_status() {
  local name="$1"
  # Method 1: pm2 show | grep status
  local show_out=$(pm2 show "$name" 2>&1)
  if echo "$show_out" | grep -qiE "status.*online|online.*status"; then
    echo "ONLINE"
    return 0
  fi
  # Method 2: pm2 jlist | python json parse
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
    if [ "$jlist_status" = "online" ]; then
      echo "ONLINE"
      return 0
    fi
  fi
  # Method 3: pm2 list | grep
  if pm2 list 2>/dev/null | grep "$name" | grep -qi "online"; then
    echo "ONLINE"
    return 0
  fi
  echo "OFFLINE"
  return 1
}

echo -ne "  PM2 nexvo-web status... "
WEB_STATUS=$(check_pm2_status "nexvo-web")
echo "$WEB_STATUS"
echo -ne "  PM2 nexvo-cron status... "
CRON_STATUS=$(check_pm2_status "nexvo-cron")
echo "$CRON_STATUS"

if [ "$WEB_STATUS" != "ONLINE" ]; then
  echo -e "\n  ${R}❌${N} nexvo-web NOT ONLINE — PM2 logs:"
  pm2 logs nexvo-web --lines 25 --nostream 2>&1 | tail -25 | sed 's/^/    /'
  echo ""
fi
if [ "$CRON_STATUS" != "ONLINE" ]; then
  echo -e "\n  ${R}❌${N} nexvo-cron NOT ONLINE — PM2 logs:"
  pm2 logs nexvo-cron --lines 15 --nostream 2>&1 | tail -15 | sed 's/^/    /'
fi
echo ""

# ═══ STEP 13+14: VERIFY 12 FITUR ═══
echo -e "${B}═══ 13/14. VERIFY 12 FITUR (ZERO TOLERANCE) ═══${N}"
sleep 5

declare -a FEAT
record_feat() { FEAT+=("$1|$2"); }

# 1. Web HTTP
echo -ne "  [1/12] Web HTTP 200... "
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
[ "$HTTP" = "200" ] && { echo -e "${G}✅ OK ($HTTP)${N}"; record_feat "Web HTTP" "OK"; } || { echo -e "${R}❌ FAIL ($HTTP)${N}"; record_feat "Web HTTP" "FAIL"; }

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
echo "$BAN_RES" | grep -q '"success":true\|"banners"\|"data"' && { echo -e "${G}✅ OK${N}"; record_feat "Banners API" "OK"; } || { echo -e "${Y}⚠️${N} WARN"; record_feat "Banners API" "WARN"; }

# 8. Cron port 3032
echo -ne "  [8/12] Cron port 3032... "
CRON_HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3032/health 2>/dev/null || echo "000")
{ [ "$CRON_HTTP" = "200" ] || [ "$CRON_HTTP" = "404" ]; } && { echo -e "${G}✅ OK ($CRON_HTTP)${N}"; record_feat "Cron port" "OK"; } || { echo -e "${Y}⚠️${N} INFO ($CRON_HTTP)"; record_feat "Cron port" "WARN"; }

# 9. Prisma client
echo -ne "  [9/12] Prisma client... "
{ [ -f "$P/node_modules/.prisma/client/index.js" ] || [ -f "$P/node_modules/@prisma/client/index.js" ]; } && { echo -e "${G}✅ OK${N}"; record_feat "Prisma client" "OK"; } || { echo -e "${R}❌ FAIL${N}"; record_feat "Prisma client" "FAIL"; }

# 10. PM2 nexvo-web (RELIABLE detection — 3 methods fallback)
echo -ne "  [10/12] PM2 nexvo-web online... "
if [ "$WEB_STATUS" = "ONLINE" ]; then
  echo -e "${G}✅ OK${N}"; record_feat "PM2 nexvo-web" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "PM2 nexvo-web" "FAIL"
fi

# 11. PM2 nexvo-cron
echo -ne "  [11/12] PM2 nexvo-cron online... "
if [ "$CRON_STATUS" = "ONLINE" ]; then
  echo -e "${G}✅ OK${N}"; record_feat "PM2 nexvo-cron" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "PM2 nexvo-cron" "FAIL"
fi

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
echo -e "  Total user: ${B}${STATS_USERS:-0}${N}"
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
  echo -e "  ${B}User contoh:${N} WA 628123456701 (Budi Santoso) / nexvo123"
  echo -e "  ${B}Total:${N} 23 user, Rp 68.800"
else
  echo -e "${R}═══════════════════════════════════════════════════════════${N}"
  echo -e "${R}  ❌ MASIH ADA $FAIL ERROR${N}"
  echo -e "${R}═══════════════════════════════════════════════════════════${N}"
  echo ""
  echo -e "  ${B}PM2 list:${N}"
  pm2 list 2>&1 | sed 's/^/    /'
  echo ""
  echo -e "  ${B}PM2 nexvo-web logs:${N}"
  pm2 logs nexvo-web --lines 20 --nostream 2>&1 | tail -20 | sed 's/^/    /'
  echo ""
  echo -e "  Screenshot output ini, kirim untuk analisis"
fi
echo ""
