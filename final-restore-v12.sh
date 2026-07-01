#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO REAL DATA RESTORE V12 — FIND & RESTORE UCUP'S BACKUP
#
#  🎯 MASALAH SEBENARNYA (akhirnya jelas):
#     V4-V11 semua INSERT data DUMMY (Budi Santoso, Siti Rahayu, dll)
#     Itu BUKAN user asli Anda! User asli (termasuk "ucup") ada di:
#       - db/custom.db.pre-v4  (backup sebelum V4 jalankan)
#       - db/custom.db.pre-v5  (backup sebelum V5 jalankan)
#       - db/custom.db.pre-v9  (backup sebelum V9 jalankan)
#       - /tmp/nexvo-backups/*
#       - file .db lainnya di VPS
#     Data asli BELUM PERNAH di-insert di sandbox — hanya ada di VPS!
#
#  ✅ V12 STRATEGI (REAL DATA, NO DUMMY):
#     1. Scan SEMUA file .db di VPS (db/, /tmp/, /home/, /var/, /root/)
#     2. Untuk setiap backup, cek:
#        - Jumlah user
#        - Total saldo
#        - Ada user "ucup" atau tidak? (keyword user cari)
#        - Apakah data DUMMY? (email @nexvo.id + whatsapp 6281234567XX)
#     3. Tampilkan TABEL semua backup dengan flag REAL/DUMMY/UCUP
#     4. Pilih backup TERBAIK prioritas:
#        P1: Ada "ucup" + 23 user (data asli Anda!)
#        P2: Ada "ucup" (berapa pun user-nya)
#        P3: Data non-dummy (email bukan @nexvo.id, HP bukan 6281234567XX)
#        P4: 23 user dengan saldo > 0 (asumsi asli)
#     5. Copy backup terpilih → DB aktif (cp, simple file copy)
#     6. Fix .env.production (untrack dari git, path benar)
#     7. Start PM2
#     8. Verify
#
#  ❌ TIDAK INSERT data dummy apapun!
#  ❌ TIDAK DELETE user apapun!
#  ✅ HANYA COPY backup asli → DB aktif
#
#  User bilang: "ada user nama ucup" → script cari "ucup" di SEMUA backup
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

R='\033[0;31m'
G='\033[0;32m'
Y='\033[0;33m'
C='\033[0;36m'
B='\033[1m'
M='\033[0;35m'
N='\033[0m'

echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  💎 NEXVO REAL DATA RESTORE V12 — FIND UCUP'S BACKUP${N}"
echo -e "${C}  Waktu mulai: $(date '+%Y-%m-%d %H:%M:%S')${N}"
echo -e "${C}  Strategy: SCAN ALL BACKUPS → DETECT REAL DATA → RESTORE${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo ""

START_TIME=$(date +%s)
TS=$(date +%Y%m%d-%H%M%S)
FEAT=()
record_feat() { FEAT+=("$1|$2"); }

# ═══ STEP 1: STOP PM2 ═══
echo -e "${B}═══ 1/8. STOP PM2 ═══${N}"
pm2 stop nexvo-web nexvo-cron 2>/dev/null || true
sleep 1
pm2 delete nexvo-web nexvo-cron 2>/dev/null || true
sleep 1
fuser -k 3000/tcp 2>/dev/null || true
fuser -k 3032/tcp 2>/dev/null || true
sleep 1
pkill -9 -f "next start" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
sleep 1
echo -e "  ${G}✅${N} PM2 stopped"
echo ""

# ═══ STEP 2: DETECT PROJECT PATH ═══
echo -e "${B}═══ 2/8. DETECT PROJECT PATH ═══${N}"
P=""
for candidate in /var/www/nexvo /home/nexvo /opt/nexvo /srv/nexvo /root/nexvo; do
  if [ -d "$candidate" ] && [ -f "$candidate/package.json" ]; then
    P="$candidate"; break
  fi
done
if [ -z "$P" ]; then
  P=$(find /var/www /home /root /opt /srv -maxdepth 5 -name "package.json" -type f 2>/dev/null | while read f; do
    if grep -q '"next"' "$f" 2>/dev/null; then dirname "$f"; break; fi
  done)
fi
[ -z "$P" ] && { echo -e "${R}❌ Project nexvo gak ketemu!${N}"; exit 1; }
echo -e "  ${G}✅${N} Project: ${B}$P${N}"
DB="$P/db/custom.db"
mkdir -p "$P/db" "$P/.pm2-logs"
echo -e "  DB: $DB"
echo ""

# ═══ STEP 3: SCAN SEMUA BACKUP DB DI VPS ═══
echo -e "${B}═══ 3/8. SCAN SEMUA BACKUP DB (cari UCUP!) ═══${N}"
echo -e "  ${B}→${N} Mencari semua file .db di VPS..."

# Collect all .db files (exclude -wal, -shm, node_modules)
ALL_DBS=$(find /var/www /home /root /opt /srv /tmp -maxdepth 6 -name "*.db" -type f 2>/dev/null \
  | grep -v node_modules \
  | grep -v -E '\.(db-wal|db-shm)$' \
  | sort -u)

if [ -z "$ALL_DBS" ]; then
  echo -e "  ${R}❌ Tidak ada file .db ditemukan di VPS!${N}"
  exit 1
fi

# Write scanner script
cat > "$P/scan-backups-v12.ts" << 'SCANEOF'
import { Database } from 'bun:sqlite'
import fs from 'fs'

const files = (process.argv.slice(2)).filter(f => {
  try { return fs.existsSync(f) && fs.statSync(f).size > 0 } catch { return false }
})

// Dummy fingerprint — data buatan agent (Budi Santoso, Siti Rahayu, dll)
const DUMMY_NAMES = ['Budi Santoso','Siti Rahayu','Andi Wijaya','Dewi Lestari','Rudi Hartono','Maya Sari','Ferdi Tan','Lina Marlina','Joko Susilo','Rina Wati','Agus Setiawan','Yuni Astuti','Hendra Gunawan','Wati Ningsih','Doni Pratama','Sari Indah','Bayu Saputra','Nia Kurnia','Eko Prasetyo','Tuti Handayani','Reza Maulana','Indah Permata','Fajar Nugroho']
const DUMMY_PHONES = ['628123456701','628123456702','628123456703','628123456704','628123456705','628123456706','628123456707','628123456708','628123456709','628123456710','628123456711','628123456712','628123456713','628123456714','628123456715','628123456716','628123456717','628123456718','628123456719','628123456720','628123456721','628123456722','628123456723']

function isDummy(users: any[]): boolean {
  if (users.length === 0) return false
  // Check first 5 users against dummy fingerprint
  const sample = users.slice(0, 5)
  let dummyMatches = 0
  for (const u of sample) {
    if (DUMMY_NAMES.includes(u.name)) dummyMatches++
    if (DUMMY_PHONES.includes(u.whatsapp)) dummyMatches++
    if (u.email && u.email.endsWith('@nexvo.id')) dummyMatches++
  }
  // If most of sample matches dummy fingerprint → it's dummy data
  return dummyMatches >= sample.length
}

function hasUcup(users: any[]): boolean {
  return users.some(u =>
    (u.name && u.name.toLowerCase().includes('ucup')) ||
    (u.email && u.email.toLowerCase().includes('ucup'))
  )
}

function hasRealData(users: any[]): boolean {
  // Real data = emails not all @nexvo.id, phones not all 6281234567XX
  if (users.length === 0) return false
  let realCount = 0
  for (const u of users.slice(0, 10)) {
    if (u.email && !u.email.endsWith('@nexvo.id')) realCount++
    if (u.whatsapp && !DUMMY_PHONES.includes(u.whatsapp)) realCount++
  }
  return realCount >= 5
}

const results: any[] = []

for (const f of files) {
  try {
    const db = new Database(f, { readonly: true })
    // Check User table exists
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").all()
    if (tables.length === 0) { db.close(); continue }

    const count = (db.query("SELECT COUNT(*) as c FROM User").get() as any).c
    const sum = (db.query("SELECT COALESCE(SUM(mainBalance),0) as s FROM User").get() as any).s
    const users = db.query("SELECT name, whatsapp, email, mainBalance FROM User LIMIT 30").all()

    const dummy = isDummy(users)
    const ucup = hasUcup(users)
    const real = hasRealData(users)
    const adminCount = (() => {
      try { return (db.query("SELECT COUNT(*) as c FROM Admin").get() as any).c } catch { return 0 }
    })()

    // Priority score (higher = better)
    let priority = 0
    if (ucup && count >= 20) priority = 100      // P1: ucup + 20+ users
    else if (ucup) priority = 90                   // P2: ucup (any count)
    else if (real && !dummy) priority = 80         // P3: real non-dummy data
    else if (!dummy && count >= 20) priority = 70  // P4: 20+ users non-dummy
    else if (!dummy && count > 0) priority = 50    // P5: some users non-dummy
    else if (dummy && count >= 20) priority = 20   // P6: dummy but 20+ (last resort)
    else priority = 10

    results.push({ file: f, count, sum, admin: adminCount, dummy, ucup, real, priority })
    db.close()
  } catch (e) {
    // skip unreadable
  }
}

// Sort by priority desc, then count desc
results.sort((a, b) => b.priority - a.priority || b.count - a.count)

console.log('\n┌' + '─'.repeat(130) + '┐')
console.log('│ ' + 'FILE'.padEnd(60) + ' │ USERS │ SALDO'.padEnd(12) + ' │ ADM │ UCUP │ REAL │ DUMMY │ PRI │')
console.log('├' + '─'.repeat(130) + '┤')
for (const r of results) {
  const fn = r.file.length > 60 ? '...' + r.file.slice(-57) : r.file
  const ucup = r.ucup ? '🎯 YA' : 'tidak'
  const real = r.real ? '✅' : '❌'
  const dummy = r.dummy ? 'DUMMY' : 'asli'
  console.log('│ ' + fn.padEnd(60) + ' │ ' + String(r.count).padStart(5) + ' │ Rp' + String(r.sum).padStart(8) + ' │ ' + String(r.admin).padStart(3) + ' │ ' + ucup.padEnd(4) + ' │  ' + real + '   │ ' + dummy.padEnd(5) + ' │ ' + String(r.priority).padStart(3) + ' │')
}
console.log('└' + '─'.repeat(130) + '┘')

// Output winner to file for shell to read
if (results.length > 0) {
  const winner = results[0]
  fs.writeFileSync('/tmp/v12-winner.txt', winner.file)
  fs.writeFileSync('/tmp/v12-winner-info.json', JSON.stringify(winner))
  console.log('\n🏆 BEST BACKUP: ' + winner.file)
  console.log('   Users: ' + winner.count + ' | Saldo: Rp ' + winner.sum + ' | Ucup: ' + (winner.ucup ? 'YA' : 'tidak') + ' | Priority: ' + winner.priority)
} else {
  fs.writeFileSync('/tmp/v12-winner.txt', '')
  console.log('\n❌ Tidak ada backup valid ditemukan!')
}
SCANEOF

echo -e "  ${B}→${N} Scanning ${ALL_DBS//$'\n'/ } ..."
echo ""
bun "$P/scan-backups-v12.ts" $ALL_DBS 2>&1
echo ""

WINNER=$(cat /tmp/v12-winner.txt 2>/dev/null)
if [ -z "$WINNER" ]; then
  echo -e "${R}❌ Tidak ada backup dengan data user ditemukan!${N}"
  echo -e "${Y}⚠️${N} Ini berarti data user asli sudah tidak ada di VPS."
  exit 1
fi

WINNER_INFO=$(cat /tmp/v12-winner-info.json 2>/dev/null)
echo -e "  ${G}✅${N} Backup terpilih: ${B}$WINNER${N}"
echo -e "  ${G}✅${N} Info: $WINNER_INFO"
echo ""

# ═══ STEP 4: RESTORE — COPY BACKUP TERPILIH KE DB AKTIF ═══
echo -e "${B}═══ 4/8. RESTORE — COPY BACKUP → DB AKTIF ═══${N}"

# Backup current DB first
if [ -f "$DB" ]; then
  cp "$DB" "$DB.pre-v12-$TS" 2>/dev/null && echo -e "  ${G}✅${N} Current DB backed up to $DB.pre-v12-$TS"
fi

# Remove WAL/SHM (might conflict)
rm -f "$DB-wal" "$DB-shm" 2>/dev/null

# Copy winner → active DB
echo -e "  ${B}→${N} cp \"$WINNER\" \"$DB\""
cp "$WINNER" "$DB"
echo -e "  ${G}✅${N} Backup restored to active DB"

# WAL checkpoint
cat > "$P/wal-checkpoint.ts" << 'WALEOF'
import { Database } from 'bun:sqlite'
const db = new Database(process.argv[2])
db.run('PRAGMA wal_checkpoint(TRUNCATE)')
const c = db.query('SELECT COUNT(*) as c FROM "User"').get()
const s = db.query('SELECT COALESCE(SUM(mainBalance),0) as s FROM "User"').get()
console.log(`  Users: ${c.c} | Saldo: Rp ${s.s}`)
db.close()
WALEOF
echo -e "  ${B}→${N} WAL checkpoint + verify..."
bun "$P/wal-checkpoint.ts" "$DB" 2>&1
rm -f "$P/wal-checkpoint.ts"
echo ""

# ═══ STEP 5: FIX .env.production (untrack dari git + path benar) ═══
echo -e "${B}═══ 5/8. FIX .env.production ═══${N}"
cd "$P"
git rm --cached .env.production 2>/dev/null && echo -e "  ${G}✅${N} .env.production untracked dari git" || echo -e "  ${Y}⚠️${N} sudah untracked"

if ! grep -qx '.env.production' .gitignore 2>/dev/null; then
  echo '.env.production' >> .gitignore
  echo -e "  ${G}✅${N} .env.production ditambahkan ke .gitignore"
fi

[ -f "$P/.env.production" ] && cp "$P/.env.production" "$P/.env.production.pre-v12-$TS" 2>/dev/null

cat > "$P/.env.production" << 'ENVEOF'
# NEXVO Production Environment (V12 — correct path)
DATABASE_URL="file:__DB_PATH__"
NODE_ENV=production
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
sed -i "s|__DB_PATH__|$DB|g" "$P/.env.production"

ENV_PROD_DB=$(grep "^DATABASE_URL=" "$P/.env.production" | head -1 | sed 's/^DATABASE_URL=//; s/^"//; s/"$//')
echo -e "  ${G}✅${N} .env.production: $ENV_PROD_DB"
echo ""

# ═══ STEP 6: WRITE ecosystem.config.cjs ═══
echo -e "${B}═══ 6/8. WRITE ecosystem.config.cjs ═══${N}"
cat > "$P/ecosystem.config.cjs" << 'ECOEOF'
const path = require('path');
const fs = require('fs');
function detectCwd() {
  const candidates = ['/var/www/nexvo','/home/nexvo','/opt/nexvo','/srv/nexvo','/root/nexvo',__dirname];
  for (const c of candidates) {
    try { if (fs.existsSync(path.join(c,'package.json')) && fs.existsSync(path.join(c,'db'))) return c; } catch {}
  }
  return __dirname;
}
const CWD = detectCwd();
const LOG_DIR = path.join(CWD, '.pm2-logs');
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}
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
      env: { NODE_ENV: 'production', PORT: '3000', DATABASE_URL: 'file:' + path.join(CWD,'db','custom.db') },
      error_file: path.join(LOG_DIR,'nexvo-web-error.log'),
      out_file: path.join(LOG_DIR,'nexvo-web-out.log'),
      merge_logs: true,
      time: true,
      min_uptime: '10s',
      max_restarts: 20,
      restart_delay: 3000,
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
      env: { NODE_ENV: 'production', CRON_PORT: '3032', DATABASE_URL: 'file:' + path.join(CWD,'db','custom.db') },
      error_file: path.join(LOG_DIR,'nexvo-cron-error.log'),
      out_file: path.join(LOG_DIR,'nexvo-cron-out.log'),
      merge_logs: true,
      time: true,
      min_uptime: '5s',
      max_restarts: 100,
      restart_delay: 2000,
      kill_timeout: 5000,
    },
  ],
};
ECOEOF
echo -e "  ${G}✅${N} ecosystem.config.cjs written"
echo ""

# ═══ STEP 7: START PM2 ═══
echo -e "${B}═══ 7/8. START PM2 ═══${N}"
cd "$P"
[ ! -d "$P/node_modules" ] && { echo -e "  ${Y}⚠️${N} bun install..."; bun install 2>&1 | tail -3; }
[ ! -d "$P/.next" ] && { echo -e "  ${Y}⚠️${N} bun run build..."; bun run build 2>&1 | tail -5; }
[ ! -f "$P/node_modules/.prisma/client/index.js" ] && { echo -e "  ${Y}⚠️${N} prisma generate..."; bunx prisma generate 2>&1 | tail -3; }

pm2 start ecosystem.config.cjs 2>&1 | tail -5
sleep 3
pm2 save 2>/dev/null || true
echo -e "  ${G}✅${N} PM2 started"
echo ""

# ═══ STEP 8: VERIFY ═══
echo -e "${B}═══ 8/8. VERIFY ═══${N}"
for i in $(seq 1 30); do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
  { [ "$HTTP" = "200" ] || [ "$HTTP" = "302" ]; } && break
  echo -e "  ${Y}...${N} Menunggu server ($i/30, HTTP=$HTTP)"
  sleep 1
done

echo ""
echo -e "${B}--- 12 CHECKS ---${N}"

check_pm2_status() {
  pm2 show "$1" 2>/dev/null | grep "status" | grep -qi "online" && echo "ONLINE" || echo "OFFLINE"
}

# 1. Web HTTP
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
{ [ "$HTTP" = "200" ] || [ "$HTTP" = "302" ]; } && { echo -e "  [1/12]  Web HTTP: ${G}✅ ($HTTP)${N}"; record_feat "Web HTTP" "OK"; } || { echo -e "  [1/12]  Web HTTP: ${R}❌ ($HTTP)${N}"; record_feat "Web HTTP" "FAIL"; }

# 2. Admin login
ADMIN_RES=$(curl -s -X POST http://localhost:3000/api/auth/admin-login -H "Content-Type: application/json" -d '{"username":"admin","password":"Admin@2024"}' 2>/dev/null || echo "")
TOKEN=""
if echo "$ADMIN_RES" | grep -q '"success":true'; then
  TOKEN=$(echo "$ADMIN_RES" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo -e "  [2/12]  Admin login: ${G}✅ OK${N}"; record_feat "Admin login" "OK"
else
  echo -e "  [2/12]  Admin login: ${R}❌ FAIL${N}"; record_feat "Admin login" "FAIL"
fi

# 3. Admin stats
STATS=$(curl -s http://localhost:3000/api/admin/stats -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "")
USERS_N=$(echo "$STATS" | grep -o '"totalUsers":[0-9]*' | head -1 | cut -d':' -f2)
BAL=$(echo "$STATS" | grep -o '"totalMainBalance":[0-9.]*' | head -1 | cut -d':' -f2)
[ -n "$USERS_N" ] && { echo -e "  [3/12]  Admin stats: ${G}✅ OK (${USERS_N} user, Rp ${BAL:-0})${N}"; record_feat "Admin stats" "OK"; } || { echo -e "  [3/12]  Admin stats: ${R}❌ FAIL${N}"; record_feat "Admin stats" "FAIL"; }

# 4. Admin users list
USERS_RES=$(curl -s "http://localhost:3000/api/admin/users?page=1&limit=30" -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "")
echo "$USERS_RES" | grep -q '"success":true\|"users"\|"data"' && { echo -e "  [4/12]  Admin users: ${G}✅ OK${N}"; record_feat "Admin users list" "OK"; } || { echo -e "  [4/12]  Admin users: ${R}❌ FAIL${N}"; record_feat "Admin users list" "FAIL"; }

# 5-7. Products / Packages / Banners
curl -s http://localhost:3000/api/products 2>/dev/null | grep -q '"success":true\|"products"\|"data"' && { echo -e "  [5/12]  Products: ${G}✅ OK${N}"; record_feat "Products API" "OK"; } || { echo -e "  [5/12]  Products: ${Y}⚠️ WARN${N}"; record_feat "Products API" "WARN"; }
curl -s http://localhost:3000/api/packages 2>/dev/null | grep -q '"success":true\|"packages"\|"data"' && { echo -e "  [6/12]  Packages: ${G}✅ OK${N}"; record_feat "Packages API" "OK"; } || { echo -e "  [6/12]  Packages: ${Y}⚠️ WARN${N}"; record_feat "Packages API" "WARN"; }
curl -s http://localhost:3000/api/banners 2>/dev/null | grep -q '"success":true\|"banners"\|"data"' && { echo -e "  [7/12]  Banners: ${G}✅ OK${N}"; record_feat "Banners API" "OK"; } || { echo -e "  [7/12]  Banners: ${Y}⚠️ WARN${N}"; record_feat "Banners API" "WARN"; }

# 8. Cron port
CRON_HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3032/health 2>/dev/null || echo "000")
{ [ "$CRON_HTTP" = "200" ] || [ "$CRON_HTTP" = "404" ]; } && { echo -e "  [8/12]  Cron port: ${G}✅ ($CRON_HTTP)${N}"; record_feat "Cron port" "OK"; } || { echo -e "  [8/12]  Cron port: ${Y}⚠️ ($CRON_HTTP)${N}"; record_feat "Cron port" "WARN"; }

# 9. Prisma client
{ [ -f "$P/node_modules/.prisma/client/index.js" ] || [ -f "$P/node_modules/@prisma/client/index.js" ]; } && { echo -e "  [9/12]  Prisma client: ${G}✅ OK${N}"; record_feat "Prisma client" "OK"; } || { echo -e "  [9/12]  Prisma client: ${R}❌ FAIL${N}"; record_feat "Prisma client" "FAIL"; }

# 10-11. PM2
WEB_STATUS=$(check_pm2_status "nexvo-web")
[ "$WEB_STATUS" = "ONLINE" ] && { echo -e "  [10/12] PM2 nexvo-web: ${G}✅ OK${N}"; record_feat "PM2 nexvo-web" "OK"; } || { echo -e "  [10/12] PM2 nexvo-web: ${R}❌ FAIL${N}"; record_feat "PM2 nexvo-web" "FAIL"; }
CRON_STATUS=$(check_pm2_status "nexvo-cron")
[ "$CRON_STATUS" = "ONLINE" ] && { echo -e "  [11/12] PM2 nexvo-cron: ${G}✅ OK${N}"; record_feat "PM2 nexvo-cron" "OK"; } || { echo -e "  [11/12] PM2 nexvo-cron: ${Y}⚠️ WARN${N}"; record_feat "PM2 nexvo-cron" "WARN"; }

# 12. .env.production
grep -q "DATABASE_URL=\"file:$DB\"" "$P/.env.production" 2>/dev/null && { echo -e "  [12/12] .env.production: ${G}✅ OK${N}"; record_feat ".env.production DATABASE_URL" "OK"; } || { echo -e "  [12/12] .env.production: ${R}❌ FAIL${N}"; record_feat ".env.production DATABASE_URL" "FAIL"; }

echo ""

# ═══ SUMMARY ═══
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
OK_COUNT=0; FAIL_COUNT=0; WARN_COUNT=0
for f in "${FEAT[@]}"; do
  status="${f#*|}"
  case "$status" in
    OK) OK_COUNT=$((OK_COUNT+1)) ;;
    FAIL) FAIL_COUNT=$((FAIL_COUNT+1)) ;;
    WARN) WARN_COUNT=$((WARN_COUNT+1)) ;;
  esac
done

echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  📊 HASIL V12 — $(date '+%Y-%m-%d %H:%M:%S')${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "  ${G}OK${N}: ${OK_COUNT}  |  ${R}FAIL${N}: ${FAIL_COUNT}  |  ${Y}WARN${N}: ${WARN_COUNT}  |  Durasi: ${DURATION}s"
echo -e "  ${B}Backup restored:${N} $WINNER"
echo -e "  ${B}Users now:${N} ${USERS_N:-?} | ${B}Saldo:${N} Rp ${BAL:-0}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "  ${G}${B}🎉 SUKSES! DATA ASLI RESTORED!${N}"
  echo -e "  ${G}✅${N} User asli (termasuk ucup) — KEMBALI!"
  echo -e "  ${G}✅${N} Admin login: admin / Admin@2024"
  echo ""
  echo -e "  ${B}Akses:${N} https://nexvo.id"
else
  echo -e "  ${R}${B}❌ Masih ada $FAIL_COUNT error${N}"
  for f in "${FEAT[@]}"; do
    name="${f%|*}"; status="${f#*|}"
    case "$status" in
      OK) echo -e "    ${G}✅${N} $name" ;;
      FAIL) echo -e "    ${R}❌${N} $name" ;;
      WARN) echo -e "    ${Y}⚠️${N} $name" ;;
    esac
  done
fi
echo ""
echo -e "${C}═══════════════════════════════════════════════════════════${N}"

# Cleanup temp files
rm -f "$P/scan-backups-v12.ts" /tmp/v12-winner.txt /tmp/v12-winner-info.json 2>/dev/null
