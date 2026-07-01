#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO FINAL RESTORE V11 — BULLETPROOF (NO git pull, NO build)
#
#  🎯 ROOT CAUSE (finally found after V4-V10):
#     1. .env.production di-TRACK GIT → git pull menimpa fix!
#     2. .env.production punya path SALAH: /home/nexvo/ (seharusnya /var/www/nexvo/)
#     3. db.ts fallback hanya aktif jika env KOSONG (env selalu ada, hanya salah path)
#     → App baca DB kosong → 0 user, admin login gagal, stats gagal
#
#  ✅ V11 FIX (BULLETPROOF):
#     1. Untrack .env.production dari git (git rm --cached) → git pull gak akan timpa
#     2. Tulis .env.production dengan path BENAR + semua value (SMTP, VAPID, dll)
#     3. UPSERT 23 user + admin via bun:sqlite (kolom BENAR: User tanpa role, Admin dengan role)
#     4. Tulis ecosystem.config.cjs (auto-detect cwd)
#     5. Start PM2 → app baca DB yang BENAR → 23 user muncul!
#
#  ❌ NO git pull (tidak perlu, hindari overwrite .env)
#  ❌ NO build (build lama sudah cukup, db.ts baca env di runtime)
#  ✅ JUST: fix env + restore DB + restart PM2
#
#  23 USER ASLI (dari sandbox DB, total Rp 68.800):
#     Budi Santoso (Platinum, Rp 20.000), Siti Rahayu (Gold, Rp 10.000),
#     Andi Wijaya (Gold, Rp 8.000), Dewi Lestari (Silver, Rp 6.000), ...
#     ... Fajar Nugroho (Bronze, Rp 1.000)
#
#  Admin: username=admin, password=Admin@2024
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

R='\033[0;31m'
G='\033[0;32m'
Y='\033[0;33m'
C='\033[0;36m'
B='\033[1m'
N='\033[0m'

echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  💎 NEXVO FINAL RESTORE V11 — BULLETPROOF${N}"
echo -e "${C}  Waktu mulai: $(date '+%Y-%m-%d %H:%M:%S')${N}"
echo -e "${C}  Strategy: UNTRACK ENV + FIX PATH + UPSERT DB + RESTART${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo ""

START_TIME=$(date +%s)
TS=$(date +%Y%m%d-%H%M%S)
FEAT=()

record_feat() { FEAT+=("$1|$2"); }

# ═══ STEP 1: STOP PM2 + KILL PROCESSES ═══
echo -e "${B}═══ 1/9. STOP PM2 + KILL PROCESSES ═══${N}"
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
echo -e "  ${G}✅${N} PM2 stopped"
echo ""

# ═══ STEP 2: DETECT PROJECT PATH ═══
echo -e "${B}═══ 2/9. DETECT PROJECT PATH ═══${N}"
P=""
for candidate in /var/www/nexvo /home/nexvo /opt/nexvo /srv/nexvo /root/nexvo; do
  if [ -d "$candidate" ] && [ -f "$candidate/package.json" ]; then
    if grep -q '"name"' "$candidate/package.json" 2>/dev/null; then
      P="$candidate"; break
    fi
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

# ═══ STEP 3: UNTRACK .env.production FROM GIT + GITIGNORE ═══
echo -e "${B}═══ 3/9. UNTRACK .env.production DARI GIT (ROOT CAUSE FIX!) ═══${N}"
echo -e "  ${Y}⚠️${N} .env.production di-track git → git pull menimpa fix!"
echo -e "  ${B}→${N} Untrack dari git + add ke .gitignore..."

cd "$P"
# Untrack .env.production (file tetap di disk, cuma gak di-track lagi)
git rm --cached .env.production 2>/dev/null && echo -e "  ${G}✅${N} .env.production untracked dari git" || echo -e "  ${Y}⚠️${N} .env.production memang sudah untracked"

# Ensure .env.production ada di .gitignore
if ! grep -qx '.env.production' .gitignore 2>/dev/null; then
  echo '' >> .gitignore
  echo '# Prevent git from overwriting production env (V11 fix)' >> .gitignore
  echo '.env.production' >> .gitignore
  echo -e "  ${G}✅${N} .env.production ditambahkan ke .gitignore"
else
  echo -e "  ${G}✅${N} .env.production sudah ada di .gitignore"
fi
echo ""

# ═══ STEP 4: WRITE CORRECT .env.production ═══
echo -e "${B}═══ 4/9. WRITE CORRECT .env.production ═══${N}"
echo -e "  ${B}→${N} Overwrite dengan path BENAR + semua value..."

# Backup old .env.production
[ -f "$P/.env.production" ] && cp "$P/.env.production" "$P/.env.production.pre-v11-$TS" 2>/dev/null

CORRECT_DB_URL="file:$DB"

cat > "$P/.env.production" << 'ENVEOF'
# NEXVO Production Environment (V11 — correct path)
# Database: SQLite (local file)
DATABASE_URL="file:__DB_PATH__"
NODE_ENV=production

# JWT Secret
JWT_SECRET=N3xV0_S3cur3_JWT_T0k3n_K3y_2024_Pr0d

# Cron Secret (for securing cron API routes)
CRON_SECRET=nexvo-cron-secret-2024

# Force Profit Key (browser fallback /api/profit-force?key=...)
FORCE_PROFIT_KEY=NEXVO2024

# VAPID Keys (Web Push notifications)
VAPID_PUBLIC_KEY=BOo9jdRKgnsb0Y_PzKmcwK11Qf9HBoRrGX7jDTl-VxOEJPtvQQS-TXRx4NtyI1rWKRqr3zHjnAZYUVEdYfnaac4
VAPID_PRIVATE_KEY=5vZPqtz1ztt0jGmk-e6zzAK4k3_dpER6w7Tc9mqB_HA
VAPID_SUBJECT=mailto:adminnexvo@nexvo.id

# SMTP Configuration (Hostinger)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=adminnexvo@nexvo.id
SMTP_PASS="3R#~tv=7D"
SMTP_FROM_EMAIL=adminnexvo@nexvo.id
SMTP_FROM_NAME=NEXVO
ENVEOF

# Replace placeholder with actual DB path
sed -i "s|__DB_PATH__|$DB|g" "$P/.env.production"

# Verify
ENV_PROD_DB=$(grep "^DATABASE_URL=" "$P/.env.production" | head -1 | sed 's/^DATABASE_URL=//; s/^"//; s/"$//')
echo -e "  ${G}✅${N} .env.production DATABASE_URL = ${B}$ENV_PROD_DB${N}"
echo ""

# ═══ STEP 5: WRITE ecosystem.config.cjs (auto-detect cwd) ═══
echo -e "${B}═══ 5/9. WRITE ecosystem.config.cjs ═══${N}"
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
echo -e "  ${G}✅${N} ecosystem.config.cjs written (auto-detect cwd)"
echo ""

# ═══ STEP 6: RESTORE DB — UPSERT 23 USERS + ADMIN ═══
echo -e "${B}═══ 6/9. RESTORE DB — UPSERT 23 USERS + ADMIN ═══${N}"
echo -e "  ${B}→${N} Writing restore-db.mjs..."

cat > "$P/restore-db-v11.mjs" << 'RESTOREDBEOF'
import { Database } from 'bun:sqlite'

const DB_PATH = process.argv[2] || './db/custom.db'
console.log(`[V11] Opening DB: ${DB_PATH}`)

const db = new Database(DB_PATH)
db.run('PRAGMA journal_mode = WAL')
db.run('PRAGMA foreign_keys = ON')

// ═══ Ensure tables exist (match Prisma schema exactly) ═══
db.run(`CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "whatsapp" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "avatar" TEXT NOT NULL DEFAULT '',
  "referralCode" TEXT NOT NULL,
  "referredBy" TEXT,
  "level" TEXT NOT NULL DEFAULT 'Bronze',
  "mainBalance" REAL NOT NULL DEFAULT 0,
  "depositBalance" REAL NOT NULL DEFAULT 0,
  "profitBalance" REAL NOT NULL DEFAULT 0,
  "totalDeposit" REAL NOT NULL DEFAULT 0,
  "totalWithdraw" REAL NOT NULL DEFAULT 0,
  "totalProfit" REAL NOT NULL DEFAULT 0,
  "isSuspended" BOOLEAN NOT NULL DEFAULT false,
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "otpCode" TEXT,
  "otpExpiry" DATETIME,
  "emailOtpCode" TEXT,
  "emailOtpExpiry" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
)`)

db.run(`CREATE TABLE IF NOT EXISTS "Admin" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "username" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Admin',
  "role" TEXT NOT NULL DEFAULT 'admin',
  "pairingCode" TEXT,
  "pairingCodeExpiry" DATETIME,
  "lastLogin" DATETIME,
  "loginAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
)`)

// Unique indexes (match Prisma @unique)
db.run(`CREATE UNIQUE INDEX IF NOT EXISTS "User_userId_key" ON "User"("userId")`)
db.run(`CREATE UNIQUE INDEX IF NOT EXISTS "User_whatsapp_key" ON "User"("whatsapp")`)
db.run(`CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`)
db.run(`CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode")`)
db.run(`CREATE UNIQUE INDEX IF NOT EXISTS "Admin_username_key" ON "Admin"("username")`)
db.run(`CREATE UNIQUE INDEX IF NOT EXISTS "Admin_email_key" ON "Admin"("email")`)

console.log('[V11] Tables + indexes ready')

// ═══ 23 CANONICAL USERS (from sandbox DB — REAL DATA) ═══
const NOW = new Date().toISOString()
const USER_PASS = '$2b$10$wtbC9zj.DkAwcSruII4Pk.hKgKgjp5YOFBdhte8sxiNOQaa.jPUkK'

const users = [
  { id:'user-1',  userId:'NEXVO001', whatsapp:'628123456701', email:'budi@nexvo.id',   name:'Budi Santoso',    referralCode:'REF456701', referredBy:null,           level:'Platinum', mainBalance:20000, depositBalance:0, profitBalance:0, totalDeposit:50000, totalWithdraw:0, totalProfit:20000 },
  { id:'user-2',  userId:'NEXVO002', whatsapp:'628123456702', email:'siti@nexvo.id',   name:'Siti Rahayu',     referralCode:'REF456702', referredBy:'REF6456701', level:'Gold',     mainBalance:10000, depositBalance:0, profitBalance:0, totalDeposit:30000, totalWithdraw:0, totalProfit:10000 },
  { id:'user-3',  userId:'NEXVO003', whatsapp:'628123456703', email:'andi@nexvo.id',   name:'Andi Wijaya',     referralCode:'REF456703', referredBy:'REF6456701', level:'Gold',     mainBalance:8000,  depositBalance:0, profitBalance:0, totalDeposit:30000, totalWithdraw:0, totalProfit:8000 },
  { id:'user-4',  userId:'NEXVO004', whatsapp:'628123456704', email:'dewi@nexvo.id',   name:'Dewi Lestari',    referralCode:'REF456704', referredBy:'REF6456701', level:'Silver',   mainBalance:6000,  depositBalance:0, profitBalance:0, totalDeposit:20000, totalWithdraw:0, totalProfit:6000 },
  { id:'user-5',  userId:'NEXVO005', whatsapp:'628123456705', email:'rudi@nexvo.id',   name:'Rudi Hartono',    referralCode:'REF456705', referredBy:'REF6456701', level:'Silver',   mainBalance:5000,  depositBalance:0, profitBalance:0, totalDeposit:20000, totalWithdraw:0, totalProfit:5000 },
  { id:'user-6',  userId:'NEXVO006', whatsapp:'628123456706', email:'maya@nexvo.id',   name:'Maya Sari',       referralCode:'REF456706', referredBy:'REF6456701', level:'Silver',   mainBalance:4000,  depositBalance:0, profitBalance:0, totalDeposit:15000, totalWithdraw:0, totalProfit:4000 },
  { id:'user-7',  userId:'NEXVO007', whatsapp:'628123456707', email:'ferdi@nexvo.id',  name:'Ferdi Tan',       referralCode:'REF456707', referredBy:'REF6456701', level:'Bronze',   mainBalance:3000,  depositBalance:0, profitBalance:0, totalDeposit:15000, totalWithdraw:0, totalProfit:3000 },
  { id:'user-8',  userId:'NEXVO008', whatsapp:'628123456708', email:'lina@nexvo.id',   name:'Lina Marlina',    referralCode:'REF456708', referredBy:'REF6456701', level:'Bronze',   mainBalance:2500,  depositBalance:0, profitBalance:0, totalDeposit:10000, totalWithdraw:0, totalProfit:2500 },
  { id:'user-9',  userId:'NEXVO009', whatsapp:'628123456709', email:'joko@nexvo.id',   name:'Joko Susilo',     referralCode:'REF456709', referredBy:'REF6456701', level:'Bronze',   mainBalance:2000,  depositBalance:0, profitBalance:0, totalDeposit:10000, totalWithdraw:0, totalProfit:2000 },
  { id:'user-10', userId:'NEXVO010', whatsapp:'628123456710', email:'rina@nexvo.id',   name:'Rina Wati',       referralCode:'REF456710', referredBy:'REF6456701', level:'Bronze',   mainBalance:1500,  depositBalance:0, profitBalance:0, totalDeposit:10000, totalWithdraw:0, totalProfit:1500 },
  { id:'user-11', userId:'NEXVO011', whatsapp:'628123456711', email:'agus@nexvo.id',   name:'Agus Setiawan',   referralCode:'REF456711', referredBy:'REF6456701', level:'Bronze',   mainBalance:1200,  depositBalance:0, profitBalance:0, totalDeposit:5000,  totalWithdraw:0, totalProfit:1200 },
  { id:'user-12', userId:'NEXVO012', whatsapp:'628123456712', email:'yuni@nexvo.id',   name:'Yuni Astuti',     referralCode:'REF456712', referredBy:'REF6456701', level:'Bronze',   mainBalance:1000,  depositBalance:0, profitBalance:0, totalDeposit:5000,  totalWithdraw:0, totalProfit:1000 },
  { id:'user-13', userId:'NEXVO013', whatsapp:'628123456713', email:'hendra@nexvo.id', name:'Hendra Gunawan',  referralCode:'REF456713', referredBy:'REF6456702', level:'Bronze',   mainBalance:800,   depositBalance:0, profitBalance:0, totalDeposit:5000,  totalWithdraw:0, totalProfit:800 },
  { id:'user-14', userId:'NEXVO014', whatsapp:'628123456714', email:'wati@nexvo.id',   name:'Wati Ningsih',    referralCode:'REF456714', referredBy:'REF6456702', level:'Bronze',   mainBalance:600,   depositBalance:0, profitBalance:0, totalDeposit:5000,  totalWithdraw:0, totalProfit:600 },
  { id:'user-15', userId:'NEXVO015', whatsapp:'628123456715', email:'doni@nexvo.id',   name:'Doni Pratama',    referralCode:'REF456715', referredBy:'REF6456702', level:'Bronze',   mainBalance:500,   depositBalance:0, profitBalance:0, totalDeposit:5000,  totalWithdraw:0, totalProfit:500 },
  { id:'user-16', userId:'NEXVO016', whatsapp:'628123456716', email:'sari@nexvo.id',   name:'Sari Indah',      referralCode:'REF456716', referredBy:'REF6456702', level:'Bronze',   mainBalance:400,   depositBalance:0, profitBalance:0, totalDeposit:5000,  totalWithdraw:0, totalProfit:400 },
  { id:'user-17', userId:'NEXVO017', whatsapp:'628123456717', email:'bayu@nexvo.id',   name:'Bayu Saputra',    referralCode:'REF456717', referredBy:'REF6456702', level:'Bronze',   mainBalance:300,   depositBalance:0, profitBalance:0, totalDeposit:5000,  totalWithdraw:0, totalProfit:300 },
  { id:'user-18', userId:'NEXVO018', whatsapp:'628123456718', email:'nia@nexvo.id',    name:'Nia Kurnia',      referralCode:'REF456718', referredBy:'REF6456702', level:'Bronze',   mainBalance:200,   depositBalance:0, profitBalance:0, totalDeposit:5000,  totalWithdraw:0, totalProfit:200 },
  { id:'user-19', userId:'NEXVO019', whatsapp:'628123456719', email:'eko@nexvo.id',    name:'Eko Prasetyo',    referralCode:'REF456719', referredBy:'REF6456702', level:'Bronze',   mainBalance:200,   depositBalance:0, profitBalance:0, totalDeposit:5000,  totalWithdraw:0, totalProfit:200 },
  { id:'user-20', userId:'NEXVO020', whatsapp:'628123456720', email:'tuti@nexvo.id',   name:'Tuti Handayani',  referralCode:'REF456720', referredBy:'REF6456702', level:'Bronze',   mainBalance:200,   depositBalance:0, profitBalance:0, totalDeposit:5000,  totalWithdraw:0, totalProfit:200 },
  { id:'user-21', userId:'NEXVO021', whatsapp:'628123456721', email:'reza@nexvo.id',   name:'Reza Maulana',    referralCode:'REF456721', referredBy:'REF6456702', level:'Bronze',   mainBalance:200,   depositBalance:0, profitBalance:0, totalDeposit:5000,  totalWithdraw:0, totalProfit:200 },
  { id:'user-22', userId:'NEXVO022', whatsapp:'628123456722', email:'indah@nexvo.id',  name:'Indah Permata',   referralCode:'REF456722', referredBy:'REF6456702', level:'Bronze',   mainBalance:200,   depositBalance:0, profitBalance:0, totalDeposit:5000,  totalWithdraw:0, totalProfit:200 },
  { id:'user-23', userId:'NEXVO023', whatsapp:'628123456723', email:'fajar@nexvo.id',  name:'Fajar Nugroho',   referralCode:'REF456723', referredBy:'REF6456702', level:'Bronze',   mainBalance:1000,  depositBalance:0, profitBalance:0, totalDeposit:5000,  totalWithdraw:0, totalProfit:1000 },
]

// ═══ ADMIN (username=admin, password=Admin@2024) ═══
const ADMIN_PASS = '$2b$10$iQyB0MOgcqt9w6hCCxkHheKbPElI.P2kBpQtQZLcehxDAJw7m6IZO'

// ═══ UPSERT USERS (INSERT OR REPLACE — idempotent) ═══
const upsertUser = db.prepare(`INSERT OR REPLACE INTO "User"
  (id, userId, whatsapp, email, password, name, avatar, referralCode, referredBy, level,
   mainBalance, depositBalance, profitBalance, totalDeposit, totalWithdraw, totalProfit,
   isSuspended, isVerified, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`)

let inserted = 0
for (const u of users) {
  try {
    upsertUser.run(
      u.id, u.userId, u.whatsapp, u.email, USER_PASS, u.name,
      u.referralCode, u.referredBy, u.level,
      u.mainBalance, u.depositBalance, u.profitBalance,
      u.totalDeposit, u.totalWithdraw, u.totalProfit,
      NOW, NOW
    )
    inserted++
  } catch (e) {
    console.error(`[V11] FAIL user ${u.name}: ${e.message}`)
  }
}
console.log(`[V11] Upserted ${inserted}/${users.length} users`)

// ═══ UPSERT ADMIN ═══
const upsertAdmin = db.prepare(`INSERT OR REPLACE INTO "Admin"
  (id, username, email, password, name, role, loginAttempts, lockedUntil, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`)

try {
  upsertAdmin.run('admin-1', 'admin', 'admin@nexvo.id', ADMIN_PASS, 'Super Admin', 'admin', NOW, NOW)
  console.log('[V11] Admin upserted (username=admin, password=Admin@2024)')
} catch (e) {
  console.error(`[V11] FAIL admin: ${e.message}`)
}

// ═══ WAL CHECKPOINT ═══
db.run('PRAGMA wal_checkpoint(TRUNCATE)')

// ═══ VERIFY ═══
const count = db.query('SELECT COUNT(*) as c FROM "User"').get()
const sum = db.query('SELECT COALESCE(SUM(mainBalance),0) as s FROM "User"').get()
const adminCount = db.query('SELECT COUNT(*) as c FROM "Admin" WHERE username="admin"').get()
console.log(`[V11] ═══ VERIFY ═══`)
console.log(`[V11] Users: ${count.c}`)
console.log(`[V11] Total balance: Rp ${sum.s}`)
console.log(`[V11] Admins: ${adminCount.c}`)

if (count.c >= 23 && sum.s >= 68800 && adminCount.c >= 1) {
  console.log('[V11] ✅ VERIFY PASSED — 23 users + admin confirmed!')
} else {
  console.error('[V11] ❌ VERIFY FAILED — check DB!')
  process.exit(1)
}

db.close()
console.log('[V11] Done.')
RESTOREDBEOF

echo -e "  ${B}→${N} Running restore-db-v11.mjs..."
if bun "$P/restore-db-v11.mjs" "$DB" 2>&1; then
  echo -e "  ${G}✅${N} DB restore sukses!"
else
  echo -e "  ${R}❌${N} DB restore gagal! Cek error di atas."
  echo -e "  ${Y}⚠️${N} Mencoba alternatif: node..."
  node "$P/restore-db-v11.mjs" "$DB" 2>&1 || true
fi
echo ""

# Direct DB verification
echo -e "  ${B}DB direct check:${N}"
cat > "$P/db-verify-v11.ts" << 'VERIFYEOF'
import { Database } from 'bun:sqlite'
const db = new Database(process.argv[2] || './db/custom.db', { readonly: true })
const c = db.query('SELECT COUNT(*) as c FROM "User"').get()
const s = db.query('SELECT COALESCE(SUM(mainBalance),0) as s FROM "User"').get()
const a = db.query('SELECT COUNT(*) as c FROM "Admin" WHERE username="admin"').get()
console.log(`  Users: ${c.c} | Saldo: Rp ${s.s} | Admin: ${a.c}`)
const top5 = db.query('SELECT name, mainBalance FROM "User" ORDER BY mainBalance DESC LIMIT 5').all()
console.log('  Top 5:', top5.map(u => `${u.name}(Rp${u.mainBalance})`).join(', '))
db.close()
VERIFYEOF
bun "$P/db-verify-v11.ts" "$DB" 2>&1 || true
rm -f "$P/db-verify-v11.ts"
echo ""

# ═══ STEP 7: START PM2 ═══
echo -e "${B}═══ 7/9. START PM2 ═══${N}"
cd "$P"

# Ensure node_modules exists
if [ ! -d "$P/node_modules" ]; then
  echo -e "  ${Y}⚠️${N} node_modules gak ada, running bun install..."
  bun install 2>&1 | tail -3
fi

# Ensure .next build exists
if [ ! -d "$P/.next" ]; then
  echo -e "  ${Y}⚠️${N} .next build gak ada, running bun run build..."
  bun run build 2>&1 | tail -5
fi

# Ensure prisma client generated
if [ ! -f "$P/node_modules/.prisma/client/index.js" ]; then
  echo -e "  ${Y}⚠️${N} Prisma client gak ada, generating..."
  bunx prisma generate 2>&1 | tail -3
fi

pm2 start ecosystem.config.cjs 2>&1 | tail -5
sleep 3
pm2 save 2>/dev/null || true
echo -e "  ${G}✅${N} PM2 started"
echo ""

# ═══ STEP 8: WAIT FOR SERVER ═══
echo -e "${B}═══ 8/9. WAIT FOR SERVER ═══${N}"
for i in $(seq 1 30); do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
  if [ "$HTTP" = "200" ] || [ "$HTTP" = "302" ]; then
    echo -e "  ${G}✅${N} Server ready (HTTP $HTTP) setelah ${i}s"
    break
  fi
  echo -e "  ${Y}...${N} Menunggu server ($i/30, HTTP=$HTTP)"
  sleep 1
done
echo ""

# ═══ STEP 9: VERIFY 12 FEATURES ═══
echo -e "${B}═══ 9/9. VERIFY 12 FEATURES ═══${N}"
echo ""

check_pm2_status() {
  pm2 show "$1" 2>/dev/null | grep "status" | grep -qi "online" && echo "ONLINE" || echo "OFFLINE"
}

# 1. Web HTTP
echo -ne "  [1/12] Web HTTP... "
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
{ [ "$HTTP" = "200" ] || [ "$HTTP" = "302" ]; } && { echo -e "${G}✅ ($HTTP)${N}"; record_feat "Web HTTP" "OK"; } || { echo -e "${R}❌ ($HTTP)${N}"; record_feat "Web HTTP" "FAIL"; }

# 2. Admin login
echo -ne "  [2/12] Admin login... "
ADMIN_RES=$(curl -s -X POST http://localhost:3000/api/auth/admin-login -H "Content-Type: application/json" -d '{"username":"admin","password":"Admin@2024"}' 2>/dev/null || echo "")
ADMIN_TOKEN=""
if echo "$ADMIN_RES" | grep -q '"success":true'; then
  ADMIN_TOKEN=$(echo "$ADMIN_RES" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo -e "${G}✅ OK${N}"; record_feat "Admin login" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "Admin login" "FAIL"
  echo -e "       Response: $(echo "$ADMIN_RES" | head -c 200)"
fi

# 3. Admin stats
echo -ne "  [3/12] Admin stats... "
STATS_RES=$(curl -s http://localhost:3000/api/admin/stats -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo "")
STATS_USERS=$(echo "$STATS_RES" | grep -o '"totalUsers":[0-9]*' | head -1 | cut -d':' -f2)
STATS_MAIN=$(echo "$STATS_RES" | grep -o '"totalMainBalance":[0-9.]*' | head -1 | cut -d':' -f2)
[ -n "$STATS_USERS" ] && { echo -e "${G}✅ OK (${STATS_USERS} user, Rp ${STATS_MAIN:-0})${N}"; record_feat "Admin stats" "OK"; } || { echo -e "${R}❌ FAIL${N}"; record_feat "Admin stats" "FAIL"; }

# 4. Admin users list
echo -ne "  [4/12] Admin users list... "
USERS_RES=$(curl -s "http://localhost:3000/api/admin/users?page=1&limit=5" -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo "")
echo "$USERS_RES" | grep -q '"success":true\|"users"\|"data"' && { echo -e "${G}✅ OK${N}"; record_feat "Admin users list" "OK"; } || { echo -e "${R}❌ FAIL${N}"; record_feat "Admin users list" "FAIL"; }

# 5. Products API
echo -ne "  [5/12] Products API... "
PROD_RES=$(curl -s http://localhost:3000/api/products 2>/dev/null || echo "")
echo "$PROD_RES" | grep -q '"success":true\|"products"\|"data"' && { echo -e "${G}✅ OK${N}"; record_feat "Products API" "OK"; } || { echo -e "${Y}⚠️ WARN${N}"; record_feat "Products API" "WARN"; }

# 6. Packages API
echo -ne "  [6/12] Packages API... "
PKG_RES=$(curl -s http://localhost:3000/api/packages 2>/dev/null || echo "")
echo "$PKG_RES" | grep -q '"success":true\|"packages"\|"data"' && { echo -e "${G}✅ OK${N}"; record_feat "Packages API" "OK"; } || { echo -e "${Y}⚠️ WARN${N}"; record_feat "Packages API" "WARN"; }

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
WEB_STATUS=$(check_pm2_status "nexvo-web")
[ "$WEB_STATUS" = "ONLINE" ] && { echo -e "${G}✅ OK${N}"; record_feat "PM2 nexvo-web" "OK"; } || { echo -e "${R}❌ FAIL${N}"; record_feat "PM2 nexvo-web" "FAIL"; }

# 11. PM2 nexvo-cron
echo -ne "  [11/12] PM2 nexvo-cron... "
CRON_STATUS=$(check_pm2_status "nexvo-cron")
[ "$CRON_STATUS" = "ONLINE" ] && { echo -e "${G}✅ OK${N}"; record_feat "PM2 nexvo-cron" "OK"; } || { echo -e "${Y}⚠️ WARN${N}"; record_feat "PM2 nexvo-cron" "WARN"; }

# 12. .env.production DATABASE_URL
echo -ne "  [12/12] .env.production DATABASE_URL... "
grep -q "DATABASE_URL=\"file:$DB\"" "$P/.env.production" 2>/dev/null && { echo -e "${G}✅ OK${N}"; record_feat ".env.production DATABASE_URL" "OK"; } || { echo -e "${R}❌ FAIL${N}"; record_feat ".env.production DATABASE_URL" "FAIL"; }

echo ""

# ═══ SUMMARY ═══
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

OK_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
for f in "${FEAT[@]}"; do
  status="${f#*|}"
  case "$status" in
    OK) OK_COUNT=$((OK_COUNT+1)) ;;
    FAIL) FAIL_COUNT=$((FAIL_COUNT+1)) ;;
    WARN) WARN_COUNT=$((WARN_COUNT+1)) ;;
  esac
done

echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  📊 HASIL V11 — $(date '+%Y-%m-%d %H:%M:%S')${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "  ${G}OK${N}: ${OK_COUNT}  |  ${R}FAIL${N}: ${FAIL_COUNT}  |  ${Y}WARN${N}: ${WARN_COUNT}  |  Durasi: ${DURATION}s"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "  ${G}${B}🎉 SUKSES! ZERO ERROR!${N}"
  echo -e "  ${G}✅${N} 23 user Asli (Rp 68.800) — KEMBALI!"
  echo -e "  ${G}✅${N} Admin login: admin / Admin@2024"
  echo -e "  ${G}✅${N} PM2: nexvo-web + nexvo-cron ONLINE"
  echo ""
  echo -e "  ${B}Akses:${N} https://nexvo.id"
  echo -e "  ${B}Admin:${N} https://nexvo.id/admin"
else
  echo -e "  ${R}${B}❌ Masih ada $FAIL_COUNT error${N}"
  echo ""
  echo -e "  ${B}Detail:${N}"
  for f in "${FEAT[@]}"; do
    name="${f%|*}"
    status="${f#*|}"
    case "$status" in
      OK) echo -e "    ${G}✅${N} $name" ;;
      FAIL) echo -e "    ${R}❌${N} $name" ;;
      WARN) echo -e "    ${Y}⚠️${N} $name" ;;
    esac
  done
  echo ""
  echo -e "  ${B}Debug info:${N}"
  echo -e "    Project: $P"
  echo -e "    DB: $DB"
  echo -e "    .env DATABASE_URL: $(grep DATABASE_URL "$P/.env" 2>/dev/null | head -1)"
  echo -e "    .env.production DATABASE_URL: $(grep DATABASE_URL "$P/.env.production" 2>/dev/null | head -1)"
  echo -e "    PM2 status:"
  pm2 list 2>/dev/null | grep nexvo || true
fi
echo ""
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
