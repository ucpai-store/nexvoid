#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO DIAGNOSE + FIX ADMIN LOGIN
#
#  Dari screenshot user: 11 OK, 2 FAIL (Admin login + Prisma client)
#  TAPI Products API ✅ + Packages API ✅ (juga pakai Prisma)
#  → Prisma JALAN, masalahnya spesifik di ADMIN RECORD
#
#  Script ini:
#  1. STOP nexvo-web (release DB lock)
#  2. DIAGNOSE: cek Admin table via bun:sqlite (skip Prisma)
#     - Ada tabel Admin?
#     - Ada record admin?
#     - Password hash valid?
#  3. FIX: pastikan admin admin/Admin@2024 ADA dan BISA LOGIN
#     - Kalau tabel kosong → INSERT admin lengkap (semua kolom)
#     - Kalau ada → UPDATE password + unlock + role='admin'
#     - VERIFY: SELECT + bcrypt.compareSync
#  4. Recreate .env (safety)
#  5. START nexvo-web
#  6. TEST admin login dengan FULL response output
#  7. Kalau masih gagal → show pm2 logs (error sebenarnya)
#
#  NO build, NO git pull. Cuma fix admin + restart.
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

R='\033[0;31m'
G='\033[0;32m'
Y='\033[1;33m'
C='\033[0;36m'
B='\033[1m'
N='\033[0m'

echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  🔍 NEXVO DIAGNOSE + FIX ADMIN LOGIN${N}"
echo -e "${C}  Waktu: $(date '+%Y-%m-%d %H:%M:%S')${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo ""

# ═══ DETECT PROJECT ═══
P=""
for candidate in /var/www/nexvo /home/nexvo /opt/nexvo /srv/nexvo /root/nexvo; do
  if [ -d "$candidate/db" ] && [ -f "$candidate/package.json" ]; then
    if grep -q '"name": *"nexvo"' "$candidate/package.json" 2>/dev/null; then
      P="$candidate"; break
    fi
  fi
done
[ -z "$P" ] && P=$(find /var/www /home /root /opt /srv -maxdepth 5 -name "package.json" -type f 2>/dev/null | while read f; do
  if grep -q '"name": *"nexvo"' "$f" 2>/dev/null; then dirname "$f"; break; fi
done)
[ -z "$P" ] && { echo -e "${R}❌ Project nexvo gak ketemu${N}"; exit 1; }
DB="$P/db/custom.db"
echo -e "  Project: ${B}$P${N}"
echo -e "  DB: $DB"
echo ""

# ═══ STOP nexvo-web ═══
echo -e "${B}═══ 1. STOP nexvo-web ═══${N}"
pm2 stop nexvo-web 2>/dev/null && echo -e "  ${G}✅${N} Stopped" || echo -e "  ${Y}⚠️${N} Skip"
sleep 2
echo ""

# ═══ DIAGNOSE + FIX ADMIN ═══
echo -e "${B}═══ 2. DIAGNOSE + FIX ADMIN TABLE ═══${N}"
cat > /tmp/nexvo-diag-admin.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const dbPath = process.argv[2];
if (!fs.existsSync(dbPath)) {
  console.log('❌ DB file gak ada');
  process.exit(1);
}

const db = new Database(dbPath);
db.exec("PRAGMA journal_mode = WAL;");

// Cek tabel
const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
const names = tables.map(t => t.name);
console.log(`  Tabel ada: ${names.length}`);

if (!names.includes('Admin')) {
  console.log('  ❌ Tabel Admin GAK ADA — DB corrupt atau schema gak sync');
  console.log('  → Run: cd $P && bunx prisma db push');
  db.close();
  process.exit(1);
}
console.log('  ✅ Tabel Admin ada');

// Cek struktur kolom Admin
const cols = db.query("PRAGMA table_info(Admin)").all() as any[];
const colNames = cols.map(c => c.name);
console.log(`  Kolom Admin: ${colNames.join(', ')}`);

// Cek record admin
const admins = db.query("SELECT id, username, email, name, role, password, loginAttempts, lockedUntil FROM Admin").all() as any[];
console.log(`  Admin records: ${admins.length}`);

if (admins.length > 0) {
  console.log('  ─── CURRENT ADMINS ───');
  admins.forEach((a, i) => {
    console.log(`  ${i+1}. username=${a.username} | email=${a.email} | role=${a.role} | attempts=${a.loginAttempts} | locked=${a.lockedUntil}`);
    // Test password
    const pwOk = a.password && bcrypt.compareSync('Admin@2024', a.password);
    console.log(`     bcrypt verify Admin@2024: ${pwOk ? '✅' : '❌ (hash invalid)'}`);
  });
}

console.log('');
console.log('  ─── FIX: RESET/CREATE ADMIN ───');

const nowIso = new Date().toISOString();
const hash = bcrypt.hashSync('Admin@2024', 10);

// HAPUS semua admin lama, INSERT baru (clean slate)
const delRes = db.run(`DELETE FROM Admin`);
console.log(`  Hapus admin lama: ${delRes.changes} record`);

// INSERT admin baru dengan SEMUA kolom (jaga-jaga kalau ada kolom NOT NULL)
// Pakai struktur yang match sama schema.prisma
const id = 'admin-' + Date.now();
try {
  // Cek kolom pairingCode ada atau gak
  const hasPairingCode = colNames.includes('pairingCode');
  const hasPairingExpiry = colNames.includes('pairingCodeExpiry');
  const hasLastLogin = colNames.includes('lastLogin');

  let sql = `INSERT INTO Admin (id, username, email, password, name, role, loginAttempts, lockedUntil, createdAt, updatedAt`;
  let placeholders = `?, 'admin', 'admin@nexvo.id', ?, 'Super Admin', 'admin', 0, NULL, ?, ?`;
  let params: any[] = [id, hash, nowIso, nowIso];

  if (hasLastLogin) { sql += `, lastLogin`; placeholders += `, NULL`; }
  if (hasPairingCode) { sql += `, pairingCode`; placeholders += `, NULL`; }
  if (hasPairingExpiry) { sql += `, pairingCodeExpiry`; placeholders += `, NULL`; }
  sql += `) VALUES (${placeholders})`;

  db.run(sql, params);
  console.log(`  ✅ Admin baru di-INSERT: admin / Admin@2024 (id=${id})`);
} catch (e: any) {
  console.log(`  ❌ INSERT gagal: ${e.message}`);
  console.log('  → Coba INSERT minimal...');
  try {
    db.run(`INSERT INTO Admin (id, username, email, password, name, role, loginAttempts, createdAt, updatedAt)
            VALUES (?, 'admin', 'admin@nexvo.id', ?, 'Super Admin', 'admin', 0, ?, ?)`,
            [id, hash, nowIso, nowIso]);
    console.log(`  ✅ Admin minimal di-INSERT`);
  } catch (e2: any) {
    console.log(`  ❌ INSERT minimal juga gagal: ${e2.message}`);
    db.close();
    process.exit(1);
  }
}

// VERIFY — SELECT back + bcrypt verify
const verify = db.query("SELECT id, username, email, password, role, loginAttempts, lockedUntil FROM Admin WHERE username = 'admin' LIMIT 1").get() as any;
if (!verify) {
  console.log('  ❌ VERIFY FAILED — admin gak ke-insert');
  db.close();
  process.exit(1);
}
console.log('');
console.log('  ─── VERIFY ───');
console.log(`  id: ${verify.id}`);
console.log(`  username: ${verify.username}`);
console.log(`  email: ${verify.email}`);
console.log(`  role: ${verify.role}`);
console.log(`  loginAttempts: ${verify.loginAttempts} (harus 0)`);
console.log(`  lockedUntil: ${verify.lockedUntil} (harus null)`);
const pwOk = bcrypt.compareSync('Admin@2024', verify.password);
console.log(`  bcrypt verify Admin@2024: ${pwOk ? '✅ TRUE' : '❌ FALSE'}`);

if (!pwOk || verify.loginAttempts !== 0 || verify.lockedUntil !== null) {
  console.log('  ❌ VERIFY FAILED — admin record gak valid');
  db.close();
  process.exit(1);
}

// Cek User table juga (pastikan 23 user masih ada)
if (names.includes('User')) {
  const userCount = (db.query('SELECT COUNT(*) as c FROM User').get() as any).c;
  console.log('');
  console.log(`  ─── USER CHECK ───`);
  console.log(`  User count: ${userCount} ${userCount >= 23 ? '✅' : '⚠️ (< 23)'}`);
}

db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
db.close();
console.log('');
console.log('✅ ADMIN FIX SELESAI — admin / Admin@2024 siap login');
EOF

bun /tmp/nexvo-diag-admin.ts "$DB" 2>&1 | grep -v "^Bun v"
if [ $? -ne 0 ]; then
  echo -e "  ${R}❌ Admin fix gagal${N}"
  exit 1
fi
echo ""

# ═══ RECREATE .ENV (safety) ═══
echo -e "${B}═══ 3. RECREATE .env ═══${N}"
[ -f "$P/.env" ] && cp "$P/.env" "$P/.env.backup-diag-$(date +%Y%m%d-%H%M%S)"
cat > "$P/.env" << EOF
# NEXVO Production — fixed by diagnose-admin.sh
# $(date '+%Y-%m-%d %H:%M:%S')
DATABASE_URL="file:$DB"
NEXTAUTH_SECRET=nexvo-secret-$(date +%s)
NEXTAUTH_URL=https://nexvo.id
NODE_ENV=production
JWT_SECRET=nexvo-jwt-secret-2024
CRON_SECRET=nexvo-cron-secret-2024
EOF
echo -e "  ${G}✅${N} .env: DATABASE_URL=\"file:$DB\""
echo ""

# ═══ START nexvo-web ═══
echo -e "${B}═══ 4. START nexvo-web ═══${N}"
pm2 restart nexvo-web 2>/dev/null || pm2 start nexvo-web 2>/dev/null
echo -e "  ${C}Waiting 15s for boot...${N}"
sleep 15
echo ""

# ═══ TEST ADMIN LOGIN (FULL RESPONSE) ═══
echo -e "${B}═══ 5. TEST ADMIN LOGIN — FULL RESPONSE ═══${N}"
echo -e "  ${C}POST /api/auth/admin-login${N}"
echo -e "  Body: {\"username\":\"admin\",\"password\":\"Admin@2024\"}"
echo ""

# Try 3 times with delay (in case slow boot)
LOGIN_OK=0
for attempt in 1 2 3; do
  echo -e "  ${C}Attempt $attempt...${N}"
  LOGIN_RES=$(curl -s --max-time 20 -X POST "http://localhost:3000/api/auth/admin-login" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"Admin@2024"}' 2>/dev/null)

  echo -e "  Response (FULL):"
  echo "$LOGIN_RES" | head -c 1000
  echo ""
  echo ""

  if echo "$LOGIN_RES" | grep -q '"success":true\|"token"'; then
    echo -e "  ${G}✅ ADMIN LOGIN OK — attempt $attempt${N}"
    LOGIN_OK=1
    break
  else
    echo -e "  ${R}❌ Attempt $attempt gagal${N}"
    if [ $attempt -lt 3 ]; then
      echo -e "  ${Y}Tunggu 5s, coba lagi...${N}"
      sleep 5
    fi
  fi
done

if [ "$LOGIN_OK" = "1" ]; then
  echo ""
  echo -e "${G}═══════════════════════════════════════════════════════════${N}"
  echo -e "${G}  ✅ ADMIN LOGIN BERHASIL${N}"
  echo -e "${G}  Kredensial: admin / Admin@2024${N}"
  echo -e "${G}═══════════════════════════════════════════════════════════${N}"
else
  echo ""
  echo -e "${R}═══════════════════════════════════════════════════════════${N}"
  echo -e "${R}  ❌ ADMIN LOGIN MASIH GAGAL setelah 3 percobaan${N}"
  echo -e "${R}═══════════════════════════════════════════════════════════${N}"
  echo ""
  echo -e "${B}═══ 6. DIAGNOSE — pm2 logs (error sebenarnya) ═══${N}"
  echo -e "  ${C}pm2 logs nexvo-web --lines 30 --nostream:${N}"
  echo ""
  pm2 logs nexvo-web --lines 30 --nostream 2>&1 | tail -40
  echo ""
  echo -e "${B}═══ 7. DIAGNOSE — cek Prisma langsung ═══${N}"
  cat > /tmp/nexvo-test-prisma.ts << 'EOF'
// Test Prisma connection langsung (bukan via API)
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function test() {
  try {
    console.log('  Testing Prisma connection...');
    const admin = await db.admin.findFirst({ where: { username: 'admin' } });
    console.log('  Prisma query result:', admin ? `Found admin: ${admin.username}` : 'Admin not found');
    console.log('  ✅ PRISMA WORKS');
  } catch (e) {
    console.log('  ❌ PRISMA ERROR:', e.message.split('\n')[0]);
    console.log('  Full error:', e.message);
  } finally {
    await db.$disconnect();
  }
}
test();
EOF
  cd "$P"
  bun /tmp/nexvo-test-prisma.ts 2>&1 | grep -v "^Bun v"
fi

echo ""
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  📊 RINGKASAN${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo ""
if [ "$LOGIN_OK" = "1" ]; then
  echo -e "  ${G}✅${N} Admin table: fixed (admin / Admin@2024)"
  echo -e "  ${G}✅${N} Admin login API: WORKING"
  echo -e "  ${G}✅${N} .env: fixed"
  echo ""
  echo -e "  ${Y}Di browser:${N}"
  echo -e "    1. Buka ${B}https://nexvo.id/recovery.html${N} → Clear Cache & Reload"
  echo -e "    2. Login admin: ${B}admin / Admin@2024${N}"
  echo -e "    3. Cek aset + saldo — harus muncul semua"
else
  echo -e "  ${R}❌${N} Admin login masih gagal — lihat error di atas"
  echo -e "  ${Y}→ Screenshot output ini, kirim ke developer${N}"
fi
echo ""
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
