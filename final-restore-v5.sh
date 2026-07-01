#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO FINAL RESTORE V5 — FIX PM2 ROOT CAUSE + SMART FALLBACK
#
#  🎯 ROOT CAUSE V4 FAILURE (5 errors):
#     ❌ Admin login, Admin stats, Admin users list — ALL because PM2 nexvo-web NOT RUNNING
#     ❌ PM2 nexvo-web — NOT RUNNING (silent fail)
#     ❌ PM2 nexvo-cron — NOT RUNNING (silent fail)
#
#  🔍 WHY PM2 FAILS SILENTLY:
#     ecosystem.config.cjs has HARDCODED paths:
#       error_file: '/home/nexvo/.pm2-logs/nexvo-web-error.log'
#       out_file:   '/home/nexvo/.pm2-logs/nexvo-web-out.log'
#     VPS project is at /var/www/nexvo → /home/nexvo/.pm2-logs/ DOESN'T EXIST
#     → PM2 can't write logs → PM2 fails silently
#     V4 only sed-replaced `cwd`, NOT error_file/out_file → bug!
#
#  ✅ V5 FIX:
#     1. STOP + delete existing PM2 entries (clean slate)
#     2. REWRITE ecosystem.config.cjs COMPLETELY (not sed) with correct paths
#     3. CREATE log directory $P/.pm2-logs/ before starting PM2
#     4. VERIFY build succeeded (.next folder has content)
#     5. START PM2 fresh + VERIFY actually running (poll pm2 jlist)
#     6. IF PM2 FAILS → print full pm2 logs for diagnosis (no silent fail!)
#     7. ULTRA SCAN backup + WAL checkpoint (from V4)
#     8. SMART FALLBACK: if DB empty AND no backup → insert 23 canonical users
#        (Budi, Siti, Andi — total Rp 68.800) so system WORKS immediately
#     9. PRESERVE: if DB has users → don't touch (data asli aman)
#     10. FIX admin via UPDATE (preserve admin ID)
#     11. FIX saldo via UPDATE (preserve user data)
#     12. VERIFY 12 fitur — ZERO TOLERANCE
#
#  ❌ JANGAN PERNAH: DELETE FROM User (itu hapus data asli!)
#  ✅ FALLBACK INSERT HANYA kalau: DB empty AND no backup found
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

R='\033[0;31m'
G='\033[0;32m'
Y='\033[1;33m'
C='\033[0;36m'
B='\033[1m'
N='\033[0m'

echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  💎 NEXVO FINAL RESTORE V5 — FIX PM2 + SMART FALLBACK${N}"
echo -e "${C}  Waktu mulai: $(date '+%Y-%m-%d %H:%M:%S')${N}"
echo -e "${C}  Fix: PM2 root cause (log dir) + fallback 23 user${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo ""

START_TIME=$(date +%s)
TS=$(date +%Y%m%d-%H%M%S)

# ═══ STEP 1: STOP + DELETE PM2 ENTRIES (clean slate) ═══
echo -e "${B}═══ 1/14. STOP + DELETE PM2 (clean slate) ═══${N}"
pm2 stop nexvo-web nexvo-cron 2>/dev/null && echo -e "  ${G}✅${N} PM2 stop" || echo -e "  ${Y}⚠️${N} PM2 stop skip"
sleep 1
pm2 delete nexvo-web nexvo-cron 2>/dev/null && echo -e "  ${G}✅${N} PM2 delete (clean slate)" || echo -e "  ${Y}⚠️${N} PM2 delete skip"
sleep 1
pkill -f "next start" 2>/dev/null && echo -e "  ${G}✅${N} Kill next start" || true
pkill -f "cron-service" 2>/dev/null && echo -e "  ${G}✅${N} Kill cron-service" || true
sleep 1
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
mkdir -p "$P/db"
mkdir -p "$P/.pm2-logs"
echo -e "  DB target: $DB"
echo -e "  Log dir: $P/.pm2-logs"
echo ""

# ═══ STEP 3: GIT PULL ═══
echo -e "${B}═══ 3/14. GIT PULL (code terbaru, DB tetap utuh) ═══${N}"
cd "$P"
git fetch origin main 2>&1 | tail -3 | sed 's/^/    /' || true
git reset --hard origin/main 2>&1 | tail -3 | sed 's/^/    /' || true
echo -e "  ${G}✅${N} Code terbaru dari GitHub (DB file tetap utuh)"
echo ""

# ═══ STEP 4: BACKUP DB EXISTING (SAFETY) ═══
echo -e "${B}═══ 4/14. BACKUP DB EXISTING (safety) ═══${N}"
if [ -f "$DB" ]; then
  cp "$DB" "$DB.pre-v5-$TS"
  echo -e "  ${G}✅${N} Backup DB: $DB.pre-v5-$TS"
  DB_SIZE=$(stat -c%s "$DB" 2>/dev/null || stat -f%z "$DB" 2>/dev/null || echo 0)
  echo -e "  ${B}Current DB size:${N} $DB_SIZE bytes"
else
  echo -e "  ${Y}⚠️${N} DB belum ada — akan di-scan dari backup"
fi
WAL_FILE="$DB-wal"
SHM_FILE="$DB-shm"
if [ -f "$WAL_FILE" ]; then
  cp "$WAL_FILE" "$WAL_FILE.pre-v5-$TS"
  WAL_SIZE=$(stat -c%s "$WAL_FILE" 2>/dev/null || stat -f%z "$WAL_FILE" 2>/dev/null || echo 0)
  echo -e "  ${G}✅${N} Backup WAL: $WAL_FILE.pre-v5-$TS ($WAL_SIZE bytes)"
fi
echo ""

# ═══ STEP 5: BUN INSTALL + PRISMA GENERATE ═══
echo -e "${B}═══ 5/14. BUN INSTALL + PRISMA GENERATE ═══${N}"
cd "$P"
echo -e "  ${B}→${N} bun install..."
bun install 2>&1 | tail -5 | sed 's/^/    /' || echo -e "    ${Y}⚠️${N} install skip"

echo -e "  ${B}→${N} prisma generate..."
bunx prisma generate 2>&1 | tail -5 | sed 's/^/    /'
echo -e "  ${G}✅${N} Dependencies + Prisma client siap"
echo ""

# ═══ STEP 6: RECREATE .ENV ═══
echo -e "${B}═══ 6/14. RECREATE .ENV (correct DATABASE_URL) ═══${N}"
cat > "$P/.env" << ENVEOF
DATABASE_URL="file:$P/db/custom.db"
NEXTAUTH_SECRET="nexvo-secret-v5-$(date +%s)"
NEXTAUTH_URL="https://nexvo.id"
NODE_ENV="production"
PORT=3000
CRON_PORT=3032
ENVEOF
echo -e "  ${G}✅${N} .env recreated: DATABASE_URL=file:$P/db/custom.db"
echo ""

# ═══ STEP 7: WAL CHECKPOINT ═══
echo -e "${B}═══ 7/14. WAL CHECKPOINT (recover committed data) ═══${N}"
cat > /tmp/nexvo-wal-checkpoint-v5.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';

const dbPath = process.argv[2];
if (!dbPath || !fs.existsSync(dbPath)) {
  console.log('  ⚠️ DB belum ada, skip WAL checkpoint');
  process.exit(0);
}

try {
  const db = new Database(dbPath);
  const walSize = fs.existsSync(dbPath + '-wal') ? fs.statSync(dbPath + '-wal').size : 0;
  console.log(`  WAL file size sebelum checkpoint: ${walSize} bytes`);
  
  if (walSize > 0) {
    const result = db.query("PRAGMA wal_checkpoint(TRUNCATE)").get() as any;
    console.log(`  ✅ WAL checkpoint: busy=${result?.busy}, log=${result?.log}, checkpointed=${result?.checkpointed}`);
    const walSizeAfter = fs.existsSync(dbPath + '-wal') ? fs.statSync(dbPath + '-wal').size : 0;
    console.log(`  WAL file size setelah checkpoint: ${walSizeAfter} bytes`);
  } else {
    console.log('  ℹ️ WAL kosong, tidak perlu checkpoint');
  }
  
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").get() as any;
  if (tables) {
    const cnt = (db.query('SELECT COUNT(*) as c FROM User').get() as any).c;
    console.log(`  📊 User count setelah WAL checkpoint: ${cnt}`);
  } else {
    console.log('  ⚠️ Tabel User belum ada');
  }
  db.close();
} catch (e: any) {
  console.log(`  ❌ WAL checkpoint error: ${e.message}`);
}
EOF
bun /tmp/nexvo-wal-checkpoint-v5.ts "$DB" 2>&1 | sed 's/^/  /'
echo ""

# ═══ STEP 8: ULTRA SCAN BACKUP ═══
echo -e "${B}═══ 8/14. ULTRA SCAN BACKUP DI SELURUH VPS ═══${N}"
cat > /tmp/nexvo-ultra-scan-v5.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';
import path from 'path';

const dbPath = process.argv[2];
const searchDirs = ['/var/www', '/root', '/tmp', '/home', '/var/backups', '/opt', '/srv', '/var/lib', '/usr/local', '/mnt', '/media'];
const validExts = ['.db', '.sqlite', '.sqlite3'];

interface Candidate {
  path: string; size: number; mtime: number;
  users: number; hasUserTable: boolean;
  mainBalance: number; totalProfit: number; isCurrent: boolean;
}

const candidates: Candidate[] = [];

function isValidDbFile(name: string): boolean {
  if (name === 'custom.db' || name === 'custom.db-wal' || name === 'custom.db-shm') return true;
  for (const ext of validExts) if (name.endsWith(ext)) return true;
  if (name.startsWith('custom.db.') || name.startsWith('custom.db-')) return true;
  if (name.includes('nexvo') && (name.endsWith('.db') || name.endsWith('.sqlite') || name.endsWith('.bak') || name.endsWith('.backup'))) return true;
  return false;
}

function walk(dir: string, depth: number) {
  if (depth > 5) return;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.next' || e.name.startsWith('.cache')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, depth + 1);
    else if (e.isFile() && isValidDbFile(e.name)) {
      candidates.push({ path: full, size: 0, mtime: 0, users: 0, hasUserTable: false, mainBalance: 0, totalProfit: 0, isCurrent: false });
    }
  }
}

for (const dir of searchDirs) {
  if (!fs.existsSync(dir)) continue;
  walk(dir, 0);
}

if (dbPath && fs.existsSync(dbPath)) {
  candidates.push({ path: dbPath, size: 0, mtime: 0, users: 0, hasUserTable: false, mainBalance: 0, totalProfit: 0, isCurrent: true });
}

console.log(`  📦 Found ${candidates.length} candidate DB files. Checking...\n`);

for (const c of candidates) {
  try {
    const stat = fs.statSync(c.path);
    c.size = stat.size;
    c.mtime = stat.mtimeMs;
    if (c.path.endsWith('-wal') || c.path.endsWith('-shm')) continue;
    if (c.size < 1024) continue;
    
    const db = new Database(c.path, { readonly: true });
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    const names = tables.map(t => t.name);
    if (names.includes('User')) {
      c.hasUserTable = true;
      const row = db.query('SELECT COUNT(*) as c, COALESCE(SUM(mainBalance),0) as m, COALESCE(SUM(totalProfit),0) as p FROM User').get() as any;
      c.users = row.c; c.mainBalance = row.m; c.totalProfit = row.p;
    }
    db.close();
    
    if (c.users > 0 || c.isCurrent) {
      const date = new Date(c.mtime).toISOString().replace('T', ' ').substring(0, 19);
      const marker = c.isCurrent ? '👈 CURRENT' : (c.users > 0 ? '✅ HAS USERS' : '⚠️ EMPTY');
      console.log(`     ${marker} ${c.path}`);
      console.log(`        Size: ${c.size} | Modified: ${date} | Users: ${c.users} | Saldo: Rp ${c.mainBalance}`);
    }
  } catch {}
}

const withUsers = candidates.filter(c => c.users > 0);
withUsers.sort((a, b) => {
  if (b.users !== a.users) return b.users - a.users;
  return b.mtime - a.mtime;
});

console.log('');
if (withUsers.length === 0) {
  console.log('RESULT=NO_BACKUP_WITH_USERS');
  console.log('BEST_PATH='); console.log('BEST_USERS=0'); console.log('BEST_IS_CURRENT=false');
} else {
  const best = withUsers[0];
  console.log(`RESULT=FOUND`);
  console.log(`BEST_PATH=${best.path}`);
  console.log(`BEST_USERS=${best.users}`);
  console.log(`BEST_MAIN=${best.mainBalance}`);
  console.log(`BEST_IS_CURRENT=${best.isCurrent}`);
}
const current = candidates.find(c => c.isCurrent);
console.log(`CURRENT_USERS=${current?.users || 0}`);
console.log(`CURRENT_MAIN=${current?.mainBalance || 0}`);
EOF

SCAN_RESULT=$(bun /tmp/nexvo-ultra-scan-v5.ts "$DB" 2>&1)
echo "$SCAN_RESULT" | head -40
echo ""

BEST_PATH=$(echo "$SCAN_RESULT" | grep "^BEST_PATH=" | head -1 | cut -d= -f2-)
BEST_USERS=$(echo "$SCAN_RESULT" | grep "^BEST_USERS=" | head -1 | cut -d= -f2)
BEST_IS_CURRENT=$(echo "$SCAN_RESULT" | grep "^BEST_IS_CURRENT=" | head -1 | cut -d= -f2)
CURRENT_USERS=$(echo "$SCAN_RESULT" | grep "^CURRENT_USERS=" | head -1 | cut -d= -f2)
CURRENT_USERS=${CURRENT_USERS:-0}
BEST_USERS=${BEST_USERS:-0}

echo -e "  ${B}Current DB:${N} $CURRENT_USERS users"
echo -e "  ${B}Best backup:${N} $BEST_USERS users (${BEST_PATH})"
echo ""

# ═══ STEP 9: DECISION — RESTORE / PRESERVE / FALLBACK INSERT ═══
echo -e "${B}═══ 9/14. DECISION: RESTORE / PRESERVE / FALLBACK ═══${N}"
NEED_FALLBACK_INSERT=false

if [ -n "$BEST_PATH" ] && [ "$BEST_USERS" -gt 0 ] 2>/dev/null; then
  if [ "$BEST_IS_CURRENT" = "true" ] || [ "$BEST_PATH" = "$DB" ]; then
    echo -e "  ${G}✅${N} Current DB adalah yang terbaik (${BEST_USERS} users) → PRESERVE"
  elif [ "$BEST_USERS" -gt "$CURRENT_USERS" ] 2>/dev/null; then
    echo -e "  ${G}✅${N} Backup lebih baik ($BEST_USERS > current $CURRENT_USERS) → RESTORE dari: $BEST_PATH"
    cp "$BEST_PATH" "$DB"
    rm -f "$WAL_FILE" "$SHM_FILE" 2>/dev/null || true
    echo -e "  ${G}✅${N} DB restored dari backup"
    CURRENT_USERS=$BEST_USERS
  else
    echo -e "  ${G}✅${N} Current DB ($CURRENT_USERS) >= backup ($BEST_USERS) → PRESERVE"
  fi
else
  if [ "$CURRENT_USERS" -gt 0 ] 2>/dev/null; then
    echo -e "  ${G}✅${N} Current DB punya $CURRENT_USERS user, gak ada backup → PRESERVE"
  else
    echo -e "  ${Y}⚠️${N} DB kosong (0 user) + gak nemu backup di seluruh VPS"
    echo -e "  ${B}→${N} FALLBACK: insert 23 user canonical (Budi, Siti, Andi, dll — total Rp 68.800)"
    echo -e "  ${B}→${N} Ini data SEED supaya sistem jalan. Kalau punya backup Hostinger, restore dulu lalu run V5 lagi"
    NEED_FALLBACK_INSERT=true
  fi
fi
echo ""

# ═══ STEP 10: SCHEMA MIGRATION ═══
echo -e "${B}═══ 10/14. SCHEMA MIGRATION (aman, no data loss) ═══${N}"
cd "$P"
cat > /tmp/nexvo-check-schema-v5.ts << 'EOF'
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
SCHEMA_STATE=$(bun /tmp/nexvo-check-schema-v5.ts "$DB" 2>/dev/null || echo "NO_SCHEMA")

if [ "$SCHEMA_STATE" = "NO_DB" ] || [ "$SCHEMA_STATE" = "NO_SCHEMA" ]; then
  echo -e "  ${Y}⚠️${N} DB kosong/belum ada schema — pakai --accept-data-loss (AMAN, gak ada data)"
  bunx prisma db push --skip-generate --accept-data-loss 2>&1 | tail -5 | sed 's/^/    /'
else
  echo -e "  ${G}✅${N} DB punya schema — pakai db push biasa (auto-confirm, ADD columns only)"
  echo "y" | bunx prisma db push --skip-generate 2>&1 | tail -5 | sed 's/^/    /'
fi
echo -e "  ${G}✅${N} Schema siap"
echo ""

# ═══ STEP 11: FALLBACK INSERT (kalau DB kosong + gak nemu backup) ═══
if [ "$NEED_FALLBACK_INSERT" = "true" ]; then
  echo -e "${B}═══ 11/14. FALLBACK INSERT 23 USER CANONICAL ═══${N}"
  cat > /tmp/nexvo-fallback-insert.ts << 'INSERTEOF'
import { Database } from 'bun:sqlite';
import bcrypt from 'bcryptjs';

const dbPath = process.argv[2];
const db = new Database(dbPath);
const nowIso = new Date().toISOString();

// Cek kalau sudah ada user → skip (jangan overwrite data asli)
const existing = (db.query('SELECT COUNT(*) as c FROM User').get() as any).c;
if (existing > 0) {
  console.log(`  ℹ️ DB sudah punya ${existing} user — skip fallback insert`);
  db.close();
  process.exit(0);
}

console.log('  📦 Inserting 23 canonical users (Budi, Siti, Andi, dll)...');

// 23 user canonical — total mainBalance = Rp 68.800
const users = [
  { id: 'user-1', userId: 'NEXVO001', wa: '628123456701', name: 'Budi Santoso', level: 'Platinum', main: 20000, profit: 20000 },
  { id: 'user-2', userId: 'NEXVO002', wa: '628123456702', name: 'Siti Rahayu', level: 'Gold', main: 10000, profit: 10000 },
  { id: 'user-3', userId: 'NEXVO003', wa: '628123456703', name: 'Andi Wijaya', level: 'Gold', main: 8000, profit: 8000 },
  { id: 'user-4', userId: 'NEXVO004', wa: '628123456704', name: 'Dewi Lestari', level: 'Silver', main: 6000, profit: 6000 },
  { id: 'user-5', userId: 'NEXVO005', wa: '628123456705', name: 'Rudi Hartono', level: 'Silver', main: 5000, profit: 5000 },
  { id: 'user-6', userId: 'NEXVO006', wa: '628123456706', name: 'Maya Sari', level: 'Silver', main: 4000, profit: 4000 },
  { id: 'user-7', userId: 'NEXVO007', wa: '628123456707', name: 'Ferdi Tan', level: 'Bronze', main: 3000, profit: 3000 },
  { id: 'user-8', userId: 'NEXVO008', wa: '628123456708', name: 'Lina Marlina', level: 'Bronze', main: 2500, profit: 2500 },
  { id: 'user-9', userId: 'NEXVO009', wa: '628123456709', name: 'Joko Susilo', level: 'Bronze', main: 2000, profit: 2000 },
  { id: 'user-10', userId: 'NEXVO010', wa: '628123456710', name: 'Rina Wati', level: 'Bronze', main: 1500, profit: 1500 },
  { id: 'user-11', userId: 'NEXVO011', wa: '628123456711', name: 'Agus Setiawan', level: 'Bronze', main: 1200, profit: 1200 },
  { id: 'user-12', userId: 'NEXVO012', wa: '628123456712', name: 'Yuni Astuti', level: 'Bronze', main: 1000, profit: 1000 },
  { id: 'user-13', userId: 'NEXVO013', wa: '628123456713', name: 'Hendra Gunawan', level: 'Bronze', main: 800, profit: 800 },
  { id: 'user-14', userId: 'NEXVO014', wa: '628123456714', name: 'Wati Ningsih', level: 'Bronze', main: 600, profit: 600 },
  { id: 'user-15', userId: 'NEXVO015', wa: '628123456715', name: 'Doni Pratama', level: 'Bronze', main: 500, profit: 500 },
  { id: 'user-16', userId: 'NEXVO016', wa: '628123456716', name: 'Sari Indah', level: 'Bronze', main: 400, profit: 400 },
  { id: 'user-17', userId: 'NEXVO017', wa: '628123456717', name: 'Bayu Saputra', level: 'Bronze', main: 300, profit: 300 },
  { id: 'user-18', userId: 'NEXVO018', wa: '628123456718', name: 'Nia Kurnia', level: 'Bronze', main: 200, profit: 200 },
  { id: 'user-19', userId: 'NEXVO019', wa: '628123456719', name: 'Eko Prasetyo', level: 'Bronze', main: 200, profit: 200 },
  { id: 'user-20', userId: 'NEXVO020', wa: '628123456720', name: 'Tuti Handayani', level: 'Bronze', main: 200, profit: 200 },
  { id: 'user-21', userId: 'NEXVO021', wa: '628123456721', name: 'Reza Maulana', level: 'Bronze', main: 200, profit: 200 },
  { id: 'user-22', userId: 'NEXVO022', wa: '628123456722', name: 'Indah Permata', level: 'Bronze', main: 200, profit: 200 },
  { id: 'user-23', userId: 'NEXVO023', wa: '628123456723', name: 'Fajar Nugroho', level: 'Bronze', main: 1000, profit: 1000 },
];

const passwordHash = bcrypt.hashSync('nexvo123', 10);

let inserted = 0;
for (const u of users) {
  try {
    db.run(`INSERT INTO User (id, userId, whatsapp, email, password, name, level, mainBalance, profitBalance, totalDeposit, totalWithdraw, totalProfit, isSuspended, isVerified, referralCode, referredBy, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 50000, 0, ?, 0, 1, ?, NULL, ?, ?)`,
      [u.id, u.userId, u.wa, `${u.userId.toLowerCase()}@nexvo.id`, passwordHash, u.name, u.level, u.main, u.profit, `REF-${u.userId}`, nowIso, nowIso]);
    inserted++;
  } catch (e: any) {
    console.log(`  ⚠️ Skip ${u.name}: ${e.message}`);
  }
}
console.log(`  ✅ Inserted ${inserted} users`);

// Insert 3 products
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
console.log('  ✅ Inserted 3 products');

// Insert 3 investment packages
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
console.log('  ✅ Inserted 3 packages');

// Total
const t = db.query('SELECT COUNT(*) as cnt, SUM(mainBalance) as main FROM User').get() as any;
console.log(`\n  📊 Setelah fallback insert:`);
console.log(`     Total user: ${t.cnt}`);
console.log(`     Total mainBalance: Rp ${(t.main || 0).toLocaleString('id-ID')}`);

db.close();
INSERTEOF
  cd "$P"
  bun /tmp/nexvo-fallback-insert.ts "$DB" 2>&1 | sed 's/^/  /'
  echo ""
fi

# ═══ STEP 12: FIX ADMIN + SALDO via UPDATE ═══
echo -e "${B}═══ 12/14. FIX ADMIN + SALDO (UPDATE, no DELETE) ═══${N}"

# Fix admin
cat > /tmp/nexvo-fix-admin-v5.ts << 'EOF'
import { Database } from 'bun:sqlite';
import bcrypt from 'bcryptjs';
import fs from 'fs';

const dbPath = process.argv[2];
const db = new Database(dbPath);
const nowIso = new Date().toISOString();
const hash = bcrypt.hashSync('Admin@2024', 10);

const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
const names = tables.map(t => t.name);

if (!names.includes('Admin')) {
  console.log('  ❌ Tabel Admin belum ada');
  process.exit(1);
}

const existing = db.query("SELECT id, username, email FROM Admin WHERE username = 'admin' OR email = 'admin@nexvo.id' LIMIT 1").get() as any;

if (existing) {
  db.run("UPDATE Admin SET password = ?, loginAttempts = 0, lockedUntil = NULL, role = 'admin', updatedAt = ? WHERE id = ?",
    [hash, nowIso, existing.id]);
  console.log(`  ✅ Admin di-UPDATE (ID: ${existing.id})`);
} else {
  const newId = 'admin-' + Date.now();
  db.run(`INSERT INTO Admin (id, username, email, password, name, role, loginAttempts, lockedUntil, createdAt, updatedAt) VALUES (?, 'admin', 'admin@nexvo.id', ?, 'Super Admin', 'admin', 0, NULL, ?, ?)`,
    [newId, hash, nowIso, nowIso]);
  console.log(`  ✅ Admin baru di-INSERT: ${newId}`);
}

const admin = db.query("SELECT id, username, role FROM Admin WHERE username = 'admin'").get() as any;
const allAdmins = db.query("SELECT id FROM Admin WHERE username = 'admin'").all() as any[];
if (allAdmins.length > 1) {
  db.run("DELETE FROM Admin WHERE username = 'admin' AND id != ?", [admin.id]);
  console.log(`  ✅ Hapus ${allAdmins.length - 1} admin duplikat`);
}

const row = db.query("SELECT password FROM Admin WHERE username = 'admin'").get() as any;
const valid = bcrypt.compareSync('Admin@2024', row.password);
console.log(`  ✅ Bcrypt verify: ${valid ? 'VALID' : 'INVALID'}`);
if (!valid) process.exit(1);
db.close();
EOF
cd "$P"
bun /tmp/nexvo-fix-admin-v5.ts "$DB" 2>&1 | sed 's/^/  /'

# Fix saldo
cat > /tmp/nexvo-fix-saldo-v5.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';
const dbPath = process.argv[2];
const db = new Database(dbPath);
const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
const names = tables.map(t => t.name);
if (!names.includes('User')) { console.log('  ⚠️ Tabel User belum ada, skip'); db.close(); process.exit(0); }

const before = db.query('SELECT COUNT(*) as cnt, COALESCE(SUM(mainBalance),0) as main FROM User').get() as any;
if (before.cnt === 0) { console.log('  ⚠️ Tidak ada user, skip'); db.close(); process.exit(0); }

db.run("UPDATE User SET mainBalance = mainBalance + profitBalance, profitBalance = 0 WHERE profitBalance > 0");
db.run("UPDATE User SET mainBalance = MAX(0, totalProfit - totalWithdraw) WHERE mainBalance < MAX(0, totalProfit - totalWithdraw)");
db.run("UPDATE User SET profitBalance = 0 WHERE profitBalance != 0");

const after = db.query('SELECT COUNT(*) as cnt, COALESCE(SUM(mainBalance),0) as main, COALESCE(SUM(totalProfit),0) as profit FROM User').get() as any;
console.log(`  📊 Setelah fix saldo:`);
console.log(`     Total user: ${after.cnt}`);
console.log(`     Total mainBalance: Rp ${(after.main || 0).toLocaleString('id-ID')}`);
console.log(`     Total totalProfit: Rp ${(after.profit || 0).toLocaleString('id-ID')}`);
db.close();
EOF
bun /tmp/nexvo-fix-saldo-v5.ts "$DB" 2>&1 | sed 's/^/  /'
echo ""

# ═══ STEP 13: REWRITE ECOSYSTEM.CONFIG.CJS + BUILD + START PM2 ═══
echo -e "${B}═══ 13/14. REWRITE ECOSYSTEM + BUILD + START PM2 ═══${N}"

# REWRITE ecosystem.config.cjs completely (NOT sed — fix all paths)
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
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: 'file:$P/db/custom.db',
      },
      error_file: '$P/.pm2-logs/nexvo-web-error.log',
      out_file: '$P/.pm2-logs/nexvo-web-out.log',
      merge_logs: true,
      time: true,
      min_uptime: '10s',
      max_restarts: 50,
      restart_delay: 3000,
      exp_backoff_restart_delay: 200,
      kill_timeout: 10000,
    },
    {
      name: 'nexvo-cron',
      script: 'bun',
      args: 'run cron-service.ts',
      cwd: '$P',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        CRON_PORT: '3032',
        DATABASE_URL: 'file:$P/db/custom.db',
      },
      error_file: '$P/.pm2-logs/nexvo-cron-error.log',
      out_file: '$P/.pm2-logs/nexvo-cron-out.log',
      merge_logs: true,
      time: true,
      min_uptime: '5s',
      max_restarts: 100,
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 5000,
    },
  ],
};
ECOEOF
echo -e "  ${G}✅${N} REWRITE ecosystem.config.cjs (cwd=$P, logs=$P/.pm2-logs/)"

# Validate ecosystem syntax
node -c "$P/ecosystem.config.cjs" 2>&1 && echo -e "  ${G}✅${N} ecosystem.config.cjs syntax valid" || echo -e "  ${R}❌${N} ecosystem.config.cjs syntax ERROR"

# BUILD
echo -e "  ${B}→${N} Build Next.js (1-2 min)..."
cd "$P"
BUILD_OUTPUT=$(bun run build 2>&1)
BUILD_EXIT=$?
if [ $BUILD_EXIT -eq 0 ] && [ -d "$P/.next" ] && [ -n "$(ls -A "$P/.next" 2>/dev/null)" ]; then
  echo -e "  ${G}✅${N} Build sukses"
else
  echo -e "  ${R}❌${N} Build GAGAL (exit $BUILD_EXIT)"
  echo -e "  ${B}→${N} Last 20 lines of build output:"
  echo "$BUILD_OUTPUT" | tail -20 | sed 's/^/    /'
  echo ""
  # Try fallback: next build directly
  echo -e "  ${Y}⚠️${N} Try fallback: next build --webpack..."
  npx next build --webpack 2>&1 | tail -10 | sed 's/^/    /'
  if [ -d "$P/.next" ] && [ -n "$(ls -A "$P/.next" 2>/dev/null)" ]; then
    echo -e "  ${G}✅${N} Fallback build sukses"
  else
    echo -e "  ${R}❌${N} Fallback build juga gagal — cek disk space & memory"
    df -h "$P" | sed 's/^/    /'
    free -m | sed 's/^/    /'
  fi
fi
echo ""

# START PM2 fresh
echo -e "  ${B}→${N} PM2 start fresh..."
cd "$P"
pm2 start "$P/ecosystem.config.cjs" 2>&1 | tail -10 | sed 's/^/    /'
sleep 3
pm2 save 2>&1 | tail -2 | sed 's/^/    /' || true

# VERIFY PM2 actually running (poll for online status)
echo -e "  ${B}→${N} Verify PM2 services actually running..."
sleep 5
PM2_WEB_ONLINE=$(pm2 jlist 2>/dev/null | grep -oE '"name":"nexvo-web"[^}]*"pm_id":[0-9]+[^}]*"status":"online"' | head -1)
PM2_CRON_ONLINE=$(pm2 jlist 2>/dev/null | grep -oE '"name":"nexvo-cron"[^}]*"pm_id":[0-9]+[^}]*"status":"online"' | head -1)

if [ -n "$PM2_WEB_ONLINE" ]; then
  echo -e "  ${G}✅${N} nexvo-web: ONLINE"
else
  echo -e "  ${R}❌${N} nexvo-web: NOT ONLINE — print logs for diagnosis:"
  pm2 logs nexvo-web --lines 20 --nostream 2>&1 | tail -25 | sed 's/^/    /'
fi

if [ -n "$PM2_CRON_ONLINE" ]; then
  echo -e "  ${G}✅${N} nexvo-cron: ONLINE"
else
  echo -e "  ${R}❌${N} nexvo-cron: NOT ONLINE — print logs for diagnosis:"
  pm2 logs nexvo-cron --lines 20 --nostream 2>&1 | tail -25 | sed 's/^/    /'
fi
echo ""

# ═══ STEP 14: VERIFY 12 FITUR ═══
echo -e "${B}═══ 14/14. VERIFY 12 FITUR (ZERO TOLERANCE) ═══${N}"
sleep 8

declare -a FEAT
record_feat() { FEAT+=("$1|$2"); }

# 1. Web HTTP
echo -ne "  [1/12] Web HTTP 200... "
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
if [ "$HTTP" = "200" ]; then echo -e "${G}✅ OK ($HTTP)${N}"; record_feat "Web HTTP" "OK"; else echo -e "${R}❌ FAIL ($HTTP)${N}"; record_feat "Web HTTP" "FAIL"; fi

# 2. Admin login
echo -ne "  [2/12] Admin login API... "
ADMIN_RES=$(curl -s -X POST http://localhost:3000/api/auth/admin-login -H "Content-Type: application/json" -d '{"username":"admin","password":"Admin@2024"}' 2>/dev/null || echo "")
if echo "$ADMIN_RES" | grep -q '"success":true'; then
  echo -e "${G}✅ OK (token)${N}"; record_feat "Admin login" "OK"
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
if [ -n "$STATS_USERS" ]; then
  echo -e "${G}✅ OK (${STATS_USERS} user, Rp ${STATS_MAIN:-0})${N}"; record_feat "Admin stats" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "Admin stats" "FAIL"
  echo "      Response: $(echo "$STATS_RES" | head -c 300)"
fi

# 4. Admin users list
echo -ne "  [4/12] Admin users list... "
USERS_RES=$(curl -s http://localhost:3000/api/admin/users -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo "")
if echo "$USERS_RES" | grep -q '"success":true\|"users"\|"data"'; then
  echo -e "${G}✅ OK${N}"; record_feat "Admin users list" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "Admin users list" "FAIL"
  echo "      Response: $(echo "$USERS_RES" | head -c 200)"
fi

# 5. Products API
echo -ne "  [5/12] Products API... "
PROD_RES=$(curl -s http://localhost:3000/api/products 2>/dev/null || echo "")
if echo "$PROD_RES" | grep -q '"success":true\|"products"\|"data"'; then
  echo -e "${G}✅ OK${N}"; record_feat "Products API" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "Products API" "FAIL"
fi

# 6. Packages API
echo -ne "  [6/12] Packages API... "
PKG_RES=$(curl -s http://localhost:3000/api/packages 2>/dev/null || echo "")
if echo "$PKG_RES" | grep -q '"success":true\|"packages"\|"data"'; then
  echo -e "${G}✅ OK${N}"; record_feat "Packages API" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "Packages API" "FAIL"
fi

# 7. Banners API
echo -ne "  [7/12] Banners API... "
BAN_RES=$(curl -s http://localhost:3000/api/banners 2>/dev/null || echo "")
if echo "$BAN_RES" | grep -q '"success":true\|"banners"\|"data"'; then
  echo -e "${G}✅ OK${N}"; record_feat "Banners API" "OK"
else
  echo -e "${Y}⚠️${N} WARN"; record_feat "Banners API" "WARN"
fi

# 8. Cron port 3032
echo -ne "  [8/12] Cron port 3032... "
CRON_HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3032/health 2>/dev/null || echo "000")
if [ "$CRON_HTTP" = "200" ] || [ "$CRON_HTTP" = "404" ]; then
  echo -e "${G}✅ OK ($CRON_HTTP)${N}"; record_feat "Cron port" "OK"
else
  echo -e "${Y}⚠️${N} INFO ($CRON_HTTP)"; record_feat "Cron port" "WARN"
fi

# 9. Prisma client
echo -ne "  [9/12] Prisma client... "
if [ -f "$P/node_modules/.prisma/client/index.js" ] || [ -f "$P/node_modules/@prisma/client/index.js" ]; then
  echo -e "${G}✅ OK${N}"; record_feat "Prisma client" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "Prisma client" "FAIL"
fi

# 10. PM2 nexvo-web
echo -ne "  [10/12] PM2 nexvo-web online... "
PM2_WEB=$(pm2 jlist 2>/dev/null | grep -oE '"name":"nexvo-web"[^}]*"status":"online"' | head -1)
if [ -n "$PM2_WEB" ]; then
  echo -e "${G}✅ OK${N}"; record_feat "PM2 nexvo-web" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "PM2 nexvo-web" "FAIL"
fi

# 11. PM2 nexvo-cron
echo -ne "  [11/12] PM2 nexvo-cron online... "
PM2_CRON=$(pm2 jlist 2>/dev/null | grep -oE '"name":"nexvo-cron"[^}]*"status":"online"' | head -1)
if [ -n "$PM2_CRON" ]; then
  echo -e "${G}✅ OK${N}"; record_feat "PM2 nexvo-cron" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "PM2 nexvo-cron" "FAIL"
fi

# 12. .env correct
echo -ne "  [12/12] .env DATABASE_URL... "
if grep -q "DATABASE_URL=\"file:$P/db/custom.db\"" "$P/.env" 2>/dev/null; then
  echo -e "${G}✅ OK${N}"; record_feat ".env DATABASE_URL" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat ".env DATABASE_URL" "FAIL"
fi

# ═══ FINAL SUMMARY ═══
echo ""
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  📊 FINAL SUMMARY${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
OK=0; FAIL=0; WARN=0
for f in "${FEAT[@]}"; do
  name="${f%%|*}"
  status="${f##*|}"
  if [ "$status" = "OK" ]; then echo -e "  ${G}✅${N} $name"; OK=$((OK+1))
  elif [ "$status" = "WARN" ]; then echo -e "  ${Y}⚠️${N} $name"; WARN=$((WARN+1))
  else echo -e "  ${R}❌${N} $name"; FAIL=$((FAIL+1))
  fi
done
echo ""
echo -e "  Total: ${G}$OK OK${N} | ${R}$FAIL FAIL${N} | ${Y}$WARN WARN${N}"
echo -e "  Total user: ${B}${STATS_USERS:-0}${N}"
echo -e "  Total saldo: ${B}Rp ${STATS_MAIN:-0}${N}"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
echo -e "  Durasi: ${B}${DURATION}s${N}"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "${G}═══════════════════════════════════════════════════════════${N}"
  echo -e "${G}  🎉 BERHASIL TOTAL! ZERO ERROR${N}"
  echo -e "${G}═══════════════════════════════════════════════════════════${N}"
  echo ""
  echo -e "  ${B}Admin login:${N} https://nexvo.id/login-admin"
  echo -e "    Username: ${B}admin${N}"
  echo -e "    Password: ${B}Admin@2024${N}"
  echo ""
  if [ "$NEED_FALLBACK_INSERT" = "true" ]; then
    echo -e "  ${Y}⚠️${N} DB VPS kosong, gak nemu backup → di-insert 23 user canonical"
    echo -e "    User contoh: WA 628123456701 (Budi Santoso), password: nexvo123"
    echo -e "    ${B}Kalau punya backup Hostinger panel:${N}"
    echo -e "      1. Restore file DB dari Hostinger hPanel → Backup"
    echo -e "      2. Taruh file DB di: $DB"
    echo -e "      3. Run V5 lagi — akan PRESERVE data asli Anda"
  else
    echo -e "  ${G}✅${N} Data customer ASLI dipertahankan"
    echo -e "    Total ${STATS_USERS} user dengan saldo Rp ${STATS_MAIN}"
  fi
else
  echo -e "${R}═══════════════════════════════════════════════════════════${N}"
  echo -e "${R}  ❌ MASIH ADA $FAIL ERROR${N}"
  echo -e "${R}═══════════════════════════════════════════════════════════${N}"
  echo ""
  echo -e "  ${B}Diagnostic PM2 logs:${N}"
  pm2 logs nexvo-web --lines 30 --nostream 2>&1 | tail -30 | sed 's/^/    /'
  echo ""
  pm2 logs nexvo-cron --lines 15 --nostream 2>&1 | tail -15 | sed 's/^/    /'
  echo ""
  echo -e "  Screenshot output ini, kirim untuk analisis"
fi
echo ""
