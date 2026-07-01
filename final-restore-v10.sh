#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO FINAL RESTORE V10 — RESTORE FROM BACKUP (NO INSERT!)
#
#  🎯 STRATEGI BARU (STOP INSERTING, START RESTORING):
#     V4-V9 semua INSERT 23 canonical user → gagal terus (0 user)
#     V5 dulu pernah tampil 23 user (Rp 156.800) → BACKUP ADA DI VPS!
#     V10: scan SEMUA backup di VPS, pilih yang paling banyak user,
#          COPY ke DB aktif. JANGAN INSERT apapun.
#
#  ✅ V10 APPROACH:
#     1. Stop PM2
#     2. Scan ALL backups: .pre-v*, /tmp/nexvo-backups/*, db/*.db*
#     3. For each backup: count users via bun:sqlite
#     4. Print TABLE of all backups with user counts
#     5. Pick BEST backup (most users, prefer 23)
#     6. Copy best backup → active DB (cp, simple file copy)
#     7. WAL checkpoint
#     8. Fix .env AND .env.production (root cause from V9)
#     9. Start PM2
#    10. Verify 12 features
#
#  FALLBACK: Kalau gak ada backup dengan user > 0:
#     → Insert 23 canonical via bun:sqlite (last resort)
#
#  PRINSIP:
#  ❌ NO schema migration (prisma db push) — bisa hapus data
#  ❌ NO build — bisa gagal, tidak perlu untuk restore data
#  ❌ NO git pull — bisa overwrite .env
#  ✅ JUST COPY BACKUP FILE → DB AKTIF
#  ✅ FIX .env + .env.production (root cause)
#  ✅ START PM2
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

R='\033[0;31m'
G='\033[0;32m'
Y='\033[1;33m'
C='\033[0;36m'
B='\033[1m'
N='\033[0m'

echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  💎 NEXVO FINAL RESTORE V10 — RESTORE FROM BACKUP${N}"
echo -e "${C}  Waktu mulai: $(date '+%Y-%m-%d %H:%M:%S')${N}"
echo -e "${C}  Strategy: SCAN ALL BACKUPS → COPY BEST → FIX ENV → START${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo ""

START_TIME=$(date +%s)
TS=$(date +%Y%m%d-%H%M%S)

# ═══ STEP 1: STOP PM2 + KILL PROCESSES ═══
echo -e "${B}═══ 1/10. STOP PM2 + KILL PROCESSES ═══${N}"
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
echo -e "${B}═══ 2/10. DETECT PROJECT PATH ═══${N}"
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

# ═══ STEP 3: SCAN ALL BACKUPS (KEY STEP!) ═══
echo -e "${B}═══ 3/10. SCAN ALL BACKUPS (find one with most users) ═══${N}"
echo -e "  ${B}→${N} Mencari semua file backup DB..."

# Collect all potential DB backup files (exclude -wal, -shm — they're not valid DBs)
BACKUP_FILES=""
# Current DB
[ -f "$DB" ] && BACKUP_FILES="$BACKUP_FILES $DB"
# .pre-v* backups in db folder (exclude -wal, -shm)
for f in "$P"/db/custom.db.pre-v* "$P"/db/custom.db.*-backup* "$P"/db/*.db.pre-*; do
  [ -f "$f" ] || continue
  case "$f" in *-wal|*-shm) continue;; esac
  BACKUP_FILES="$BACKUP_FILES $f"
done
# /tmp/nexvo-backups (exclude -wal, -shm)
for f in /tmp/nexvo-backups/*.db; do
  [ -f "$f" ] || continue
  case "$f" in *-wal|*-shm) continue;; esac
  BACKUP_FILES="$BACKUP_FILES $f"
done
# Any .db files in db folder (exclude -wal, -shm)
for f in "$P"/db/*.db; do
  [ -f "$f" ] || continue
  case "$f" in *-wal|*-shm) continue;; esac
  BACKUP_FILES="$BACKUP_FILES $f"
done

# Deduplicate
BACKUP_FILES=$(echo "$BACKUP_FILES" | tr ' ' '\n' | sort -u | grep -v '^$')

# Write scanner script (avoids shell escaping issues with bun -e)
cat > "$P/scan-backups.mjs" << 'SCANEEOF'
const { Database } = require('bun:sqlite');
const files = process.argv.slice(2);
const results = [];
for (const f of files) {
  try {
    const db = new Database(f, { readonly: true });
    const t = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").get();
    if (!t) { results.push({ file: f, count: 0, saldo: 0, status: 'no-table' }); db.close(); continue; }
    const c = db.query('SELECT COUNT(*) as c FROM User').get();
    const s = db.query('SELECT COALESCE(SUM(mainBalance),0) as s FROM User').get();
    let adminCount = 0;
    try { adminCount = db.query('SELECT COUNT(*) as c FROM Admin').get().c; } catch(e) {}
    results.push({ file: f, count: c.c, saldo: s.s, adminCount, status: 'ok' });
    db.close();
  } catch(e) {
    results.push({ file: f, count: 0, saldo: 0, status: 'error:' + e.message });
  }
}
// Output as JSON for bash to parse
console.log(JSON.stringify(results));
SCANEEOF

echo -e "  ${B}→${N} Scan user count di setiap backup:"
echo ""

# Run scanner
SCAN_JSON=$(bun "$P/scan-backups.mjs" $BACKUP_FILES 2>/dev/null || echo "[]")

# Parse and display
printf "  %-65s %6s %12s %6s\n" "BACKUP FILE" "USERS" "SALDO" "ADMIN"
printf "  %-65s %6s %12s %6s\n" "-----------------------------------------------------------------" "------" "----------" "------"

BEST_BACKUP=""
BEST_COUNT=-1
BEST_SALDO=0

# Parse JSON with python3 (more reliable than bash for JSON)
if command -v python3 &>/dev/null; then
  echo "$SCAN_JSON" | python3 -c "
import json, sys
results = json.load(sys.stdin)
for r in results:
    f = r['file']
    # Shorten for display
    import re
    short = f
    print(f'  {short:<65} {r[\"count\"]:>6} Rp {r[\"saldo\"]:>9} {r.get(\"adminCount\",0):>6}')
" 2>/dev/null

  # Find best backup via python (prefer 23 users + Rp 68.800, then 23 users, then most users)
  BEST_INFO=$(echo "$SCAN_JSON" | python3 -c "
import json, sys
results = json.load(sys.stdin)
# Filter out invalid (no User table or error)
valid = [r for r in results if r['status'] == 'ok' and r['count'] > 0]
if not valid:
    print('||0')
else:
    # Priority 1: exactly 23 users + saldo 68800
    p1 = [r for r in valid if r['count'] == 23 and r['saldo'] == 68800]
    if p1:
        best = p1[0]
    else:
        # Priority 2: exactly 23 users
        p2 = [r for r in valid if r['count'] == 23]
        if p2:
            best = p2[0]
        else:
            # Priority 3: most users
            best = max(valid, key=lambda x: x['count'])
    print(best['file'] + '|' + str(best['count']) + '|' + str(best['saldo']))
" 2>/dev/null)
  BEST_BACKUP=$(echo "$BEST_INFO" | cut -d'|' -f1)
  BEST_COUNT=$(echo "$BEST_INFO" | cut -d'|' -f2)
  BEST_SALDO=$(echo "$BEST_INFO" | cut -d'|' -f3)
else
  # Fallback: parse manually (less reliable)
  echo "$SCAN_JSON" | sed 's/\[//;s/\]//;s/{/\n/g' | grep '"count"' | while read line; do
    F=$(echo "$line" | grep -oE '"file":"[^"]*"' | cut -d'"' -f4)
    C=$(echo "$line" | grep -oE '"count":[0-9]+' | grep -oE '[0-9]+')
    S=$(echo "$line" | grep -oE '"saldo":[0-9]+' | grep -oE '[0-9]+')
    echo "  $F | $C | $S"
  done
fi

rm -f "$P/scan-backups.mjs"
echo ""
echo -e "  ${G}✅${N} BEST BACKUP: ${B}$BEST_BACKUP${N}"
echo -e "  ${G}✅${N} Users: ${B}${BEST_COUNT}${N}, Saldo: ${B}Rp ${BEST_SALDO}${N}"
echo ""

# ═══ STEP 4: RESTORE FROM BEST BACKUP ═══
echo -e "${B}═══ 4/10. RESTORE FROM BEST BACKUP ═══${N}"

if [ "$BEST_COUNT" -gt 0 ] 2>/dev/null; then
  echo -e "  ${G}✅${N} Best backup has $BEST_COUNT users — RESTORING!"
  # Backup current DB first (just in case)
  [ -f "$DB" ] && cp "$DB" "$DB.pre-v10-$TS" 2>/dev/null
  # Copy best backup to active DB
  cp "$BEST_BACKUP" "$DB"
  echo -e "  ${G}✅${N} Copied: $BEST_BACKUP → $DB"
  # Remove WAL/SHM (they might conflict with restored DB)
  rm -f "$DB-wal" "$DB-shm" 2>/dev/null
  echo -e "  ${G}✅${N} Cleared WAL/SHM files"
  # WAL checkpoint
  bun -e "
const { Database } = require('bun:sqlite');
try {
  const db = new Database('$DB');
  db.run('PRAGMA wal_checkpoint(TRUNCATE)');
  const c = db.query('SELECT COUNT(*) as c, COALESCE(SUM(mainBalance),0) as s FROM User').get();
  console.log('  ✅ After restore: ' + c.c + ' users, Rp ' + c.s);
  db.close();
} catch(e) { console.log('  ❌ Error:', e.message); }
" 2>&1 | sed 's/^/  /'
  RESTORED_VIA_BACKUP=1
else
  echo -e "  ${Y}⚠️${N} No backup has users! Falling back to INSERT 23 canonical..."
  RESTORED_VIA_BACKUP=0
fi
echo ""

# ═══ STEP 5: FALLBACK INSERT 23 CANONICAL (only if no backup had users) ═══
if [ "$RESTORED_VIA_BACKUP" = "0" ]; then
  echo -e "${B}═══ 5/10. FALLBACK: INSERT 23 CANONICAL USERS ═══${N}"
  echo -e "  ${Y}⚠️${N} No backup with users found — inserting 23 canonical as last resort"
  echo -e "  ${B}→${N} Using bun:sqlite (explicit path, no Prisma)..."

  cat > "$P/restore-v10-fallback.mjs" << 'FALLBACKEOF'
const dbPath = process.argv[2];
const { Database } = require('bun:sqlite');
const db = new Database(dbPath);
db.run('PRAGMA journal_mode = WAL;');
db.run('PRAGMA foreign_keys = OFF;');

const ADMIN_HASH = '$2b$10$2JcQVO1O1nS5xEoMhL.V6OPjzPwcFQ/sKbHbO.0jrLJTMOKMFuVGC';
const USER_HASH = '$2b$10$wVqfESJ5TIOBOhaUMaNWQOK7KDI12P9fYX/Xdwbwwi9clmGpdRGkC';

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

const nowIso = new Date().toISOString();

// Check if User table exists, if not create it (minimal schema)
try {
  db.query('SELECT id FROM User LIMIT 1').get();
} catch (e) {
  console.log('  ⚠️ User table not found, running prisma db push first...');
  // We can't run prisma here, so try minimal CREATE TABLE
  db.run(`CREATE TABLE IF NOT EXISTS User (
    id TEXT PRIMARY KEY,
    userId TEXT UNIQUE,
    whatsapp TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    referralCode TEXT UNIQUE,
    referredBy TEXT,
    level TEXT DEFAULT 'Bronze',
    mainBalance REAL DEFAULT 0,
    depositBalance REAL DEFAULT 0,
    profitBalance REAL DEFAULT 0,
    totalDeposit REAL DEFAULT 0,
    totalWithdraw REAL DEFAULT 0,
    totalProfit REAL DEFAULT 0,
    isSuspended INTEGER DEFAULT 0,
    isVerified INTEGER DEFAULT 0,
    otpCode TEXT,
    otpExpiry TEXT,
    emailOtpCode TEXT,
    emailOtpExpiry TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS Admin (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT DEFAULT 'Admin',
    role TEXT DEFAULT 'admin',
    pairingCode TEXT,
    pairingCodeExpiry TEXT,
    lastLogin TEXT,
    loginAttempts INTEGER DEFAULT 0,
    lockedUntil TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log('  ✅ Created User + Admin tables (minimal schema)');
}

let okCount = 0, failCount = 0;
for (const u of canonicalUsers) {
  try {
    db.run(`INSERT OR REPLACE INTO User (id, userId, whatsapp, email, password, name, level, mainBalance, depositBalance, profitBalance, totalDeposit, totalWithdraw, totalProfit, isSuspended, isVerified, referralCode, referredBy, avatar, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 50000, 0, ?, 0, 1, ?, NULL, '', ?, ?)`,
      [u.id, u.userId, u.whatsapp, u.userId.toLowerCase()+'@nexvo.id', USER_HASH, u.name, u.level, u.main, u.main, 'REF-'+u.userId, nowIso, nowIso]);
    okCount++;
  } catch (e) {
    console.log('  ❌', u.userId, u.name, '—', e.message);
    failCount++;
  }
}
console.log('  ✅ Inserted', okCount, 'users,', failCount, 'fail');

// Fix admin
try {
  const admin = db.query('SELECT id FROM Admin WHERE username = ? OR email = ?').get('admin', 'admin@nexvo.id');
  if (admin) {
    db.run('UPDATE Admin SET password=?, loginAttempts=0, lockedUntil=NULL, role=?, updatedAt=? WHERE id=?', [ADMIN_HASH, 'admin', nowIso, admin.id]);
    console.log('  ✅ Admin updated');
  } else {
    db.run(`INSERT INTO Admin (id, username, email, password, name, role, loginAttempts, createdAt, updatedAt)
      VALUES (?, 'admin', 'admin@nexvo.id', ?, 'Super Admin', 'admin', 0, ?, ?)`,
      ['admin-'+Date.now(), ADMIN_HASH, nowIso, nowIso]);
    console.log('  ✅ Admin created');
  }
} catch (e) {
  console.log('  ⚠️ Admin:', e.message);
}

db.run('PRAGMA wal_checkpoint(TRUNCATE)');
const after = db.query('SELECT COUNT(*) as c, COALESCE(SUM(mainBalance),0) as s FROM User').get();
console.log('  📊 AFTER:', after.c, 'users, Rp', after.s);
db.close();
FALLBACKEOF

  cd "$P"
  bun restore-v10-fallback.mjs "$DB" 2>&1 | sed 's/^/  /'
  rm -f "$P/restore-v10-fallback.mjs"
fi
echo ""

# ═══ STEP 6: FIX .env AND .env.production (ROOT CAUSE FIX from V9) ═══
echo -e "${B}═══ 6/10. FIX .env AND .env.production (ROOT CAUSE!) ═══${N}"
echo -e "  ${Y}⚠️${N} Next.js prod loads .env.production OVER .env!"
echo -e "  ${B}→${N} Overwrite BOTH with correct DATABASE_URL..."

CORRECT_DB_URL="file:$DB"
[ -f "$P/.env.production" ] && cp "$P/.env.production" "$P/.env.production.pre-v10-$TS" 2>/dev/null
[ -f "$P/.env" ] && cp "$P/.env" "$P/.env.pre-v10-$TS" 2>/dev/null

cat > "$P/.env" << ENVEOF
DATABASE_URL="$CORRECT_DB_URL"
NEXTAUTH_SECRET="nexvo-secret-v10-$(date +%s)"
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

cat > "$P/.env.production" << ENVEOF
DATABASE_URL="$CORRECT_DB_URL"
NEXTAUTH_SECRET="nexvo-secret-v10-$(date +%s)"
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

ENV_DB=$(grep "^DATABASE_URL=" "$P/.env" | head -1 | cut -d'"' -f2)
ENV_PROD_DB=$(grep "^DATABASE_URL=" "$P/.env.production" | head -1 | cut -d'"' -f2)
echo -e "  ${G}✅${N} .env:              $ENV_DB"
echo -e "  ${G}✅${N} .env.production:   $ENV_PROD_DB"
[ "$ENV_DB" = "$ENV_PROD_DB" ] && echo -e "  ${G}✅${N} Both SAME — no override!" || echo -e "  ${R}❌${N} MISMATCH!"
echo ""

# ═══ STEP 7: ENSURE ECOSYSTEM.CONFIG.CJS CORRECT ═══
echo -e "${B}═══ 7/10. ENSURE ECOSYSTEM.CONFIG.CJS ═══${N}"
# Only rewrite if doesn't exist or has wrong cwd
if [ ! -f "$P/ecosystem.config.cjs" ] || ! grep -q "cwd: '$P'" "$P/ecosystem.config.cjs" 2>/dev/null; then
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
      kill_timeout: 10000,
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
      kill_timeout: 5000,
    },
  ],
};
ECOEOF
  echo -e "  ${G}✅${N} ecosystem.config.cjs written"
else
  echo -e "  ${G}✅${N} ecosystem.config.cjs already correct (cwd: $P)"
fi
echo ""

# ═══ STEP 8: VERIFY DB STATE (before starting PM2) ═══
echo -e "${B}═══ 8/10. VERIFY DB STATE (before PM2 start) ═══${N}"
DB_VERIFY=$(bun -e "
const { Database } = require('bun:sqlite');
try {
  const db = new Database('$DB');
  const t = db.query(\"SELECT name FROM sqlite_master WHERE type='table' AND name='User'\").get();
  if (!t) { console.log('NO_USER_TABLE'); db.close(); process.exit(0); }
  const c = db.query('SELECT COUNT(*) as c, COALESCE(SUM(mainBalance),0) as s FROM User').get();
  let ac = 0;
  try { ac = db.query('SELECT COUNT(*) as c FROM Admin').get().c; } catch(e) {}
  console.log(c.c + '|' + c.s + '|' + ac);
  // Print first 5 users
  const users = db.query('SELECT userId, whatsapp, name, mainBalance FROM User ORDER BY mainBalance DESC LIMIT 5').all();
  users.forEach(u => console.log('  ' + u.userId + ' | ' + u.whatsapp + ' | ' + u.name + ' | Rp' + u.mainBalance));
  db.close();
} catch(e) { console.log('ERROR:' + e.message); }
" 2>&1)
echo "$DB_VERIFY" | sed 's/^/  /'
USER_COUNT=$(echo "$DB_VERIFY" | head -1 | cut -d'|' -f1)
USER_SUM=$(echo "$DB_VERIFY" | head -1 | cut -d'|' -f2)
ADMIN_COUNT=$(echo "$DB_VERIFY" | head -1 | cut -d'|' -f3)
echo -e "  User count: ${B}${USER_COUNT}${N}"
echo -e "  Total saldo: ${B}Rp ${USER_SUM}${N}"
echo -e "  Admin count: ${B}${ADMIN_COUNT}${N}"
echo ""

# ═══ STEP 9: START PM2 + VERIFY ═══
echo -e "${B}═══ 9/10. START PM2 + VERIFY ═══${N}"
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
  pm2 logs nexvo-web --lines 20 --nostream 2>&1 | tail -20 | sed 's/^/    /'
fi
echo ""

# ═══ STEP 10: VERIFY 12 FITUR ═══
echo -e "${B}═══ 10/10. VERIFY 12 FITUR ═══${N}"
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

# 12. .env.production DATABASE_URL
echo -ne "  [12/12] .env.production DATABASE_URL... "
grep -q "DATABASE_URL=\"file:$DB\"" "$P/.env.production" 2>/dev/null && { echo -e "${G}✅ OK${N}"; record_feat ".env.production DATABASE_URL" "OK"; } || { echo -e "${R}❌ FAIL${N}"; record_feat ".env.production DATABASE_URL" "FAIL"; }

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
echo -e "  Total saldo (DB): ${B}Rp ${USER_SUM}${N}"
echo -e "  Total saldo (API): ${B}Rp ${STATS_MAIN:-0}${N}"
echo -e "  Restore source: ${B}$([ "$RESTORED_VIA_BACKUP" = "1" ] && echo "$BEST_BACKUP" || echo "CANONICAL INSERT (fallback)")${N}"
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
  echo -e "  ${B}Total:${N} ${USER_COUNT} user, Rp ${USER_SUM}"
else
  echo -e "${R}═══════════════════════════════════════════════════════════${N}"
  echo -e "${R}  ❌ MASIH ADA $FAIL ERROR${N}"
  echo -e "${R}═══════════════════════════════════════════════════════════${N}"
  echo ""
  echo -e "  ${B}DB direct check:${N}"
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
  echo -e "  ${B}.env DATABASE_URL:${N}"
  grep DATABASE_URL "$P/.env" 2>&1 | sed 's/^/    /'
  echo -e "  ${B}.env.production DATABASE_URL:${N}"
  grep DATABASE_URL "$P/.env.production" 2>&1 | sed 's/^/    /'
  echo ""
  echo -e "  ${B}nexvo-web logs (last 20):${N}"
  pm2 logs nexvo-web --lines 20 --nostream 2>&1 | tail -20 | sed 's/^/    /'
  echo ""
  echo -e "  ${B}All backups available:${N}"
  ls -la "$P"/db/custom.db.pre-* 2>&1 | sed 's/^/    /'
  ls -la /tmp/nexvo-backups/ 2>&1 | sed 's/^/    /'
  echo ""
  echo -e "  Screenshot output ini, kirim untuk analisis"
fi
echo ""
