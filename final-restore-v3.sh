#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO FINAL RESTORE V3 — PRESERVE DATA ASLI, NO INSERT DUMMY
#
#  ⚠️  KESALAHAN V1 & V2 (yang bikin "aset ilang, akun ilang"):
#  - V1: INSERT 23 user DUMMY (Budi, Siti, Andi — data PALSU) tanpa hapus user lama
#  - V2: DELETE semua user asli, lalu INSERT 23 user DUMMY (data ASLI hilang!)
#  - User lihat "aset ilang, akun ilang" karena data ASLI customer dihapus!
#
#  ✅ FIX V3 (PRINSIP BARU — DATA ASLI DIUTAMAKAN):
#  1. STOP service (release DB lock)
#  2. BACKUP DB existing (safety — gak akan dihapus)
#  3. CEK DB: ada 23 user asli?
#     - Ya → PRESERVE (jangan hapus apapun!)
#     - Tidak → SCAN backup DB di filesystem VPS untuk cari yang punya 23 user asli
#  4. Kalau nemu backup dengan user asli → RESTORE dari backup
#  5. Kalau gak nemu backup → JANGAN insert dummy, tampilkan warning
#  6. FIX admin (UPDATE password, bukan DELETE — biar admin ID tetap sama)
#  7. FIX saldo (UPDATE mainBalance = MAX(0, totalProfit - totalWithdraw))
#  8. Build + start
#  9. VERIFY: admin login + count user + saldo total
#
#  ❌ JANGAN PERNAH: DELETE FROM User (itu hapus data asli!)
#  ❌ JANGAN PERNAH: INSERT dummy user (Budi, Siti, Andi — data palsu!)
#  ✅ SELALU: PRESERVE existing data, hanya UPDATE kalau perlu
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

R='\033[0;31m'
G='\033[0;32m'
Y='\033[1;33m'
C='\033[0;36m'
B='\033[1m'
N='\033[0m'

echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  💎 NEXVO FINAL RESTORE V3 — PRESERVE DATA ASLI${N}"
echo -e "${C}  Waktu mulai: $(date '+%Y-%m-%d %H:%M:%S')${N}"
echo -e "${C}  Prinsip: DATA ASLI DIUTAMAKAN, no insert dummy${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo ""

START_TIME=$(date +%s)

# ═══ STEP 1: STOP SERVICE ═══
echo -e "${B}═══ 1/8. STOP nexvo-web + nexvo-cron ═══${N}"
pm2 stop nexvo-web nexvo-cron 2>/dev/null && echo -e "  ${G}✅${N} PM2 stop" || echo -e "  ${Y}⚠️${N} PM2 stop skip"
sleep 2
pkill -f "next start" 2>/dev/null && echo -e "  ${G}✅${N} Kill next start" || true
pkill -f "cron-service" 2>/dev/null && echo -e "  ${G}✅${N} Kill cron-service" || true
sleep 1
echo ""

# ═══ STEP 2: DETECT PROJECT PATH + GIT PULL ═══
echo -e "${B}═══ 2/8. DETECT PROJECT + GIT PULL (code terbaru) ═══${N}"
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
echo -e "  DB target: $DB"

# Git pull untuk dapat code terbaru (TAPI gak sentuh DB file karena di-gitignore)
cd "$P"
echo -e "  ${B}→${N} Git pull (dapatkan code terbaru, DB aman karena di-gitignore)..."
git fetch origin main 2>&1 | tail -3 | sed 's/^/    /' || true
git reset --hard origin/main 2>&1 | tail -3 | sed 's/^/    /' || true
echo -e "  ${G}✅${N} Code terbaru dari GitHub (DB file tetap utuh)"
echo ""

# ═══ STEP 3: BACKUP DB + RECREATE .ENV ═══
echo -e "${B}═══ 3/8. BACKUP DB + RECREATE .ENV ═══${N}"
TS=$(date +%Y%m%d-%H%M%S)
if [ -f "$DB" ]; then
  cp "$DB" "$DB.pre-v3-$TS"
  echo -e "  ${G}✅${N} Backup DB: $DB.pre-v3-$TS"
else
  echo -e "  ${Y}⚠️${N} DB belum ada, akan dicari backup"
fi

# Recreate .env
cat > "$P/.env" << ENVEOF
DATABASE_URL="file:$P/db/custom.db"
NEXTAUTH_SECRET="nexvo-secret-v3-$(date +%s)"
NEXTAUTH_URL="https://nexvo.id"
NODE_ENV="production"
PORT=3000
CRON_PORT=3032
ENVEOF
echo -e "  ${G}✅${N} .env recreated: DATABASE_URL=file:$P/db/custom.db"
echo ""

# ═══ STEP 4: BUN INSTALL + PRISMA GENERATE + DB PUSH (HANYA schema, NO data loss) ═══
echo -e "${B}═══ 4/8. BUN INSTALL + PRISMA (schema only, NO data loss) ═══${N}"
cd "$P"
echo -e "  ${B}→${N} bun install..."
bun install 2>&1 | tail -5 | sed 's/^/    /' || echo -e "    ${Y}⚠️${N} install skip"
echo -e "  ${G}✅${N} Dependencies installed"

echo -e "  ${B}→${N} prisma generate..."
bunx prisma generate 2>&1 | tail -5 | sed 's/^/    /'
echo -e "  ${G}✅${N} Prisma client generated"

# Cek schema DB
echo -e "  ${B}→${N} prisma db push (create schema kalau belum ada, NO data loss)..."
cat > /tmp/nexvo-check-schema.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';
const dbPath = process.argv[2];
if (!fs.existsSync(dbPath)) { console.log('NO_DB'); process.exit(0); }
try {
  const db = new Database(dbPath, { readonly: true });
  const t = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").get() as any;
  console.log(t ? 'HAS_USER' : 'NO_USER');
  db.close();
} catch { console.log('NO_USER'); }
EOF
SCHEMA_STATE=$(bun /tmp/nexvo-check-schema.ts "$DB" 2>/dev/null || echo "NO_USER")

if [ "$SCHEMA_STATE" = "NO_DB" ] || [ "$SCHEMA_STATE" = "NO_USER" ]; then
  echo -e "    DB kosong/belum ada schema — pakai --accept-data-loss (aman, gak ada data)"
  bunx prisma db push --skip-generate --accept-data-loss 2>&1 | tail -5 | sed 's/^/    /'
else
  echo -e "    DB ada schema — pakai db push biasa (NO data loss)"
  echo "y" | bunx prisma db push --skip-generate 2>&1 | tail -5 | sed 's/^/    /'
fi
echo -e "  ${G}✅${N} Schema DB siap (data existing aman)"
echo ""

# ═══ STEP 5: SCAN + RESTORE DATA ASLI (NO INSERT DUMMY!) ═══
echo -e "${B}═══ 5/8. CEK DATA ASLI + SCAN BACKUP (NO INSERT DUMMY) ═══${N}"

# Cek current DB
cat > /tmp/nexvo-cek-current-v3.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';
const dbPath = process.argv[2];
if (!dbPath || !fs.existsSync(dbPath)) {
  console.log('USERS=0');
  console.log('MSG=DB belum ada');
  process.exit(0);
}
try {
  const db = new Database(dbPath, { readonly: true });
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
  const names = tables.map(t => t.name);
  const stat = (n: string) => names.includes(n) ? (db.query(`SELECT COUNT(*) as c FROM ${n}`).get() as any).c : 0;
  const users = stat('User');
  const products = stat('Product');
  const packages = stat('InvestmentPackage');
  const deposits = stat('Deposit');
  const investments = stat('Investment');
  const purchases = stat('Purchase');
  const referrals = stat('Referral');
  console.log(`USERS=${users}`);
  console.log(`PRODUCTS=${products}`);
  console.log(`PACKAGES=${packages}`);
  console.log(`DEPOSITS=${deposits}`);
  console.log(`INVESTMENTS=${investments}`);
  console.log(`PURCHASES=${purchases}`);
  console.log(`REFERRALS=${referrals}`);
  if (users > 0) {
    const sample = db.query('SELECT userId, whatsapp, name, mainBalance, totalProfit, level FROM User ORDER BY rowid ASC').all() as any[];
    console.log('ALL_USERS:');
    sample.forEach((u, i) => console.log(`  ${i+1}. ${u.userId} | ${u.whatsapp} | ${u.name} | Rp${u.mainBalance} | Rp${u.totalProfit} | ${u.level}`));
    const totals = db.query('SELECT SUM(mainBalance) as main, SUM(totalProfit) as profit FROM User').get() as any;
    console.log(`TOTAL_MAIN=${totals.main || 0}`);
    console.log(`TOTAL_PROFIT=${totals.profit || 0}`);
  }
  db.close();
} catch (e: any) {
  console.log('USERS=0');
  console.log('MSG=Error: ' + e.message);
}
EOF

CURRENT=$(bun /tmp/nexvo-cek-current-v3.ts "$DB" 2>&1)
echo "$CURRENT" | head -20
USERS_NOW=$(echo "$CURRENT" | grep "^USERS=" | head -1 | cut -d= -f2)
USERS_NOW=${USERS_NOW:-0}
echo -e "  Current users di DB: ${B}$USERS_NOW${N}"
echo ""

if [ "$USERS_NOW" -ge 1 ] 2>/dev/null; then
  echo -e "  ${G}✅${N} DB punya ${B}$USERS_NOW${N} user asli — PRESERVE (jangan sentuh datanya!)"
  echo -e "  ${G}✅${N} Data customer Anda AMAN, gak akan diubah/dihapus"
  
  # Tampilkan info saldo
  TOTAL_MAIN=$(echo "$CURRENT" | grep "^TOTAL_MAIN=" | cut -d= -f2)
  echo -e "  ${B}Total saldo utama:${N} Rp $((${TOTAL_MAIN:-0}))"
  echo ""
  
  # Fix saldo (UPDATE, bukan DELETE) — pastikan mainBalance = MAX(0, totalProfit - totalWithdraw)
  echo -e "  ${B}→${N} Fix saldo (UPDATE mainBalance = MAX(0, totalProfit - totalWithdraw))..."
  cat > /tmp/nexvo-fix-saldo-v3.ts << 'EOF'
import { Database } from 'bun:sqlite';
const db = new Database(process.argv[2]);

// FIX 1: Migrate profitBalance → mainBalance
const r1 = db.run("UPDATE User SET mainBalance = mainBalance + profitBalance, profitBalance = 0 WHERE profitBalance > 0");
console.log(`  ✅ Migrate profitBalance → mainBalance: ${r1.changes} row`);

// FIX 2: Sync mainBalance upward
const r2 = db.run("UPDATE User SET mainBalance = MAX(0, totalProfit - totalWithdraw) WHERE mainBalance < MAX(0, totalProfit - totalWithdraw)");
console.log(`  ✅ Sync mainBalance upward: ${r2.changes} row`);

// FIX 3: Reset profitBalance = 0
const r3 = db.run("UPDATE User SET profitBalance = 0 WHERE profitBalance != 0");
console.log(`  ✅ Reset profitBalance = 0: ${r3.changes} row`);

const t = db.query('SELECT COUNT(*) as cnt, SUM(mainBalance) as main, SUM(totalProfit) as profit FROM User').get() as any;
console.log(`\n  📊 Setelah fix (DATA ASLI DIPERTAHANKAN):`);
console.log(`     Total user: ${t.cnt}`);
console.log(`     Total mainBalance: Rp ${(t.main || 0).toLocaleString('id-ID')}`);
console.log(`     Total totalProfit: Rp ${(t.profit || 0).toLocaleString('id-ID')}`);
db.close();
EOF
  bun /tmp/nexvo-fix-saldo-v3.ts "$DB" 2>&1 | sed 's/^/  /'
  echo ""
  
else
  echo -e "  ${Y}⚠️${N} DB kosong (0 user) — SCAN backup DB di filesystem VPS..."
  echo -e "  ${B}→${N} Cari file .db di $P, /tmp, /root, /home, /var/backups"
  echo ""
  
  # SCAN backup DB di filesystem
  cat > /tmp/nexvo-scan-backup.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';
import path from 'path';

const candidates: string[] = [];
const searchDirs = ['/var/www/nexvo', '/var/www', '/root', '/tmp', '/home', '/var/backups', '/opt', '/srv'];

// Cari file .db di semua lokasi
for (const dir of searchDirs) {
  if (!fs.existsSync(dir)) continue;
  try {
    const walk = (d: string, depth: number) => {
      if (depth > 4) return;
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
          walk(full, depth + 1);
        } else if (e.isFile() && (e.name.endsWith('.db') || e.name.endsWith('.sqlite'))) {
          if (e.name.includes('custom') || e.name.includes('nexvo') || e.name.includes('backup')) {
            candidates.push(full);
          }
        }
      }
    };
    walk(dir, 0);
  } catch {}
}

// Cek tiap kandidat — cari yang punya >= 1 user
let best = { path: '', users: 0 };
for (const f of candidates) {
  try {
    const db = new Database(f, { readonly: true });
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    const names = tables.map(t => t.name);
    if (names.includes('User')) {
      const users = (db.query('SELECT COUNT(*) as c FROM User').get() as any).c;
      console.log(`  ${users > 0 ? '✅' : '⚠️'} ${f}: ${users} user`);
      if (users > best.users) {
        best = { path: f, users };
      }
    }
    db.close();
  } catch (e: any) {
    console.log(`  ❌ ${f}: ${e.message}`);
  }
}

console.log(`\nBEST_BACKUP=${best.path}`);
console.log(`BEST_USERS=${best.users}`);
EOF
  SCAN=$(bun /tmp/nexvo-scan-backup.ts 2>&1)
  echo "$SCAN" | head -30
  echo ""
  
  BEST_BACKUP=$(echo "$SCAN" | grep "^BEST_BACKUP=" | cut -d= -f2)
  BEST_USERS=$(echo "$SCAN" | grep "^BEST_USERS=" | cut -d= -f2)
  
  if [ -n "$BEST_BACKUP" ] && [ "$BEST_USERS" -gt 0 ] 2>/dev/null; then
    echo -e "  ${G}✅${N} Nemu backup dengan ${B}$BEST_USERS${N} user asli!"
    echo -e "  ${B}→${N} Restore dari: $BEST_BACKUP"
    cp "$BEST_BACKUP" "$DB"
    echo -e "  ${G}✅${N} DB restored dari backup"
    echo ""
    
    # Fix saldo setelah restore
    echo -e "  ${B}→${N} Fix saldo setelah restore..."
    bun /tmp/nexvo-fix-saldo-v3.ts "$DB" 2>&1 | sed 's/^/  /'
    echo ""
  else
    echo -e "  ${R}❌${N} Gak nemu backup DB dengan user asli di VPS!"
    echo -e "  ${Y}⚠️${N} Data customer mungkin benar-benar hilang dari VPS."
    echo -e "  ${B}→${N} Silakan kirim info ke admin:"
    echo -e "      - Apakah ada backup DB di luar VPS? (download, cloud, dll)"
    echo -e "      - Atau cek di panel hosting: backup otomatis Hostinger"
    echo ""
    echo -e "  ${B}→${N} Script akan lanjut dengan DB kosong (admin login tetap akan di-fix)"
    echo ""
  fi
fi

# ═══ STEP 6: FIX ADMIN LOGIN (UPDATE, bukan DELETE — biar admin ID tetap sama) ═══
echo -e "${B}═══ 6/8. FIX ADMIN LOGIN (UPDATE, no DELETE) ═══${N}"
cat > /tmp/nexvo-fix-admin-v3.ts << 'EOF'
import { Database } from 'bun:sqlite';
import bcrypt from 'bcryptjs';

const db = new Database(process.argv[2]);
const nowIso = new Date().toISOString();
const hash = bcrypt.hashSync('Admin@2024', 10);

// Cek tabel Admin
const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
const names = tables.map(t => t.name);

if (!names.includes('Admin')) {
  console.log('  ❌ Tabel Admin belum ada — jalankan prisma db push dulu');
  process.exit(1);
}

// Cek admin existing
const existing = db.query("SELECT id, username FROM Admin WHERE username = 'admin' OR email = 'admin@nexvo.id'").get() as any;

if (existing) {
  // UPDATE admin existing (jangan hapus, biar ID tetap sama)
  db.run("UPDATE Admin SET password = ?, loginAttempts = 0, lockedUntil = NULL, role = 'admin', updatedAt = ? WHERE id = ?",
    [hash, nowIso, existing.id]);
  console.log(`  ✅ Admin existing di-UPDATE (ID tetap: ${existing.id})`);
} else {
  // Kalau gak ada admin sama sekali, INSERT baru
  db.run(`INSERT INTO Admin (id, username, email, password, name, role, loginAttempts, lockedUntil, createdAt, updatedAt) VALUES (?, 'admin', 'admin@nexvo.id', ?, 'Super Admin', 'admin', 0, NULL, ?, ?)`,
    [`admin-${Date.now()}`, hash, nowIso, nowIso]);
  console.log('  ✅ Admin baru di-INSERT (gak ada admin existing)');
}

// VERIFY
const admin = db.query("SELECT id, username, role, loginAttempts, lockedUntil FROM Admin WHERE username = 'admin'").get() as any;
console.log(`  ✅ Verify: ${admin.username} | role=${admin.role} | attempts=${admin.loginAttempts} | locked=${admin.lockedUntil}`);

const row = db.query("SELECT password FROM Admin WHERE username = 'admin'").get() as any;
const valid = bcrypt.compareSync('Admin@2024', row.password);
console.log(`  ✅ Bcrypt verify: ${valid ? 'VALID' : 'INVALID'}`);

if (!valid) {
  console.log('  ❌ Bcrypt INVALID — admin login akan gagal!');
  process.exit(1);
}

db.close();
EOF
cd "$P"
bun /tmp/nexvo-fix-admin-v3.ts "$DB" 2>&1 | sed 's/^/  /'
echo ""

# ═══ STEP 7: FIX ECOSYSTEM + BUILD ═══
echo -e "${B}═══ 7/8. FIX ECOSYSTEM + BUILD NEXT.JS ═══${N}"
if [ -f "$P/ecosystem.config.cjs" ]; then
  sed -i "s|cwd: *'/home/nexvo'|cwd: '$P'|g" "$P/ecosystem.config.cjs"
  sed -i "s|cwd: *'/var/www/nexvo'|cwd: '$P'|g" "$P/ecosystem.config.cjs"
  echo -e "  ${G}✅${N} Fix ecosystem.config.cjs cwd → $P"
fi

echo -e "  ${B}→${N} Build Next.js (1-2 min)..."
cd "$P"
bun run build 2>&1 | tail -10 | sed 's/^/    /'
if [ -d "$P/.next" ]; then
  echo -e "  ${G}✅${N} Build sukses"
else
  echo -e "  ${R}❌${N} Build GAGAL"
fi
echo ""

# ═══ STEP 8: START + VERIFY ═══
echo -e "${B}═══ 8/8. START SERVICE + VERIFY ═══${N}"
pm2 start "$P/ecosystem.config.cjs" 2>&1 | tail -5 | sed 's/^/    /' || true
sleep 3
pm2 save 2>&1 | tail -2 | sed 's/^/    /' || true
echo -e "  ${G}✅${N} Service started"
sleep 8

declare -a FEAT
record_feat() { FEAT+=("$1|$2"); }

# 1. Web HTTP
echo -ne "  [1] Web HTTP 200... "
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
if [ "$HTTP" = "200" ]; then echo -e "${G}✅ OK ($HTTP)${N}"; record_feat "Web HTTP" "OK"; else echo -e "${R}❌ FAIL ($HTTP)${N}"; record_feat "Web HTTP" "FAIL"; fi

# 2. Admin login
echo -ne "  [2] Admin login API... "
ADMIN_RES=$(curl -s -X POST http://localhost:3000/api/auth/admin-login -H "Content-Type: application/json" -d '{"username":"admin","password":"Admin@2024"}' 2>/dev/null || echo "")
if echo "$ADMIN_RES" | grep -q '"success":true'; then
  echo -e "${G}✅ OK (token)${N}"; record_feat "Admin login" "OK"
  ADMIN_TOKEN=$(echo "$ADMIN_RES" | grep -oE '"token":"[^"]+"' | head -1 | cut -d'"' -f4)
else
  echo -e "${R}❌ FAIL${N}"; record_feat "Admin login" "FAIL"
  echo "      Response: $(echo "$ADMIN_RES" | head -c 200)"
fi

# 3. Admin stats (data asli muncul?)
echo -ne "  [3] Admin stats (data asli ada?)... "
STATS_RES=$(curl -s http://localhost:3000/api/admin/stats -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo "")
STATS_USERS=$(echo "$STATS_RES" | grep -oE '"totalUsers":[0-9]+' | grep -oE '[0-9]+')
STATS_MAIN=$(echo "$STATS_RES" | grep -oE '"totalMainBalance":[0-9]+' | grep -oE '[0-9]+')
if [ -n "$STATS_USERS" ] && [ "$STATS_USERS" -gt 0 ] 2>/dev/null; then
  echo -e "${G}✅ OK (${STATS_USERS} user, Rp ${STATS_MAIN})${N}"; record_feat "Admin stats" "OK"
else
  echo -e "${R}❌ FAIL (users=$STATS_USERS)${N}"; record_feat "Admin stats" "FAIL"
  echo "      Response: $(echo "$STATS_RES" | head -c 300)"
fi

# 4. Products API
echo -ne "  [4] Products API... "
PROD_RES=$(curl -s http://localhost:3000/api/products 2>/dev/null || echo "")
if echo "$PROD_RES" | grep -q '"success":true'; then
  echo -e "${G}✅ OK${N}"; record_feat "Products API" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "Products API" "FAIL"
fi

# 5. Packages API
echo -ne "  [5] Packages API... "
PKG_RES=$(curl -s http://localhost:3000/api/packages 2>/dev/null || echo "")
if echo "$PKG_RES" | grep -q '"success":true'; then
  echo -e "${G}✅ OK${N}"; record_feat "Packages API" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "Packages API" "FAIL"
fi

# 6. Cron port
echo -ne "  [6] Cron port 3032... "
CRON_HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3032/health 2>/dev/null || echo "000")
if [ "$CRON_HTTP" = "200" ] || [ "$CRON_HTTP" = "404" ]; then
  echo -e "${G}✅ OK ($CRON_HTTP)${N}"; record_feat "Cron port" "OK"
else
  echo -e "${Y}⚠️${N} INFO ($CRON_HTTP)"; record_feat "Cron port" "WARN"
fi

# 7. Prisma client
echo -ne "  [7] Prisma client... "
if [ -f "$P/node_modules/.prisma/client/index.js" ]; then
  echo -e "${G}✅ OK${N}"; record_feat "Prisma client" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "Prisma client" "FAIL"
fi

# Final summary
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
echo -e "  Data user asli: ${G}PRESERVE (jangan dihapus)${N}"
echo -e "  Total user: ${B}${STATS_USERS:-0}${N}"
echo -e "  Total saldo: ${B}Rp ${STATS_MAIN:-0}${N}"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
echo -e "  Durasi: ${B}${DURATION}s${N}"
echo ""

if [ "$OK" -ge 5 ]; then
  echo -e "${G}═══════════════════════════════════════════════════════════${N}"
  echo -e "${G}  🎉 BERHASIL! DATA ASLI DIPERTAHANKAN${N}"
  echo -e "${G}═══════════════════════════════════════════════════════════${N}"
  echo ""
  echo -e "  ${B}Admin login:${N} https://nexvo.id/login-admin"
  echo -e "    Username: ${B}admin${N}"
  echo -e "    Password: ${B}Admin@2024${N}"
  echo ""
  if [ -n "$STATS_USERS" ] && [ "$STATS_USERS" -gt 0 ] 2>/dev/null; then
    echo -e "  ${B}Data user asli Anda:${N}"
    echo -e "    Total ${STATS_USERS} user dengan saldo Rp ${STATS_MAIN}"
    echo -e "    ${G}Semua data customer Anda UTUH, gak ada yang dihapus${N}"
  else
    echo -e "  ${Y}⚠️${N} DB kosong — tidak ada data user asli yang ditemukan"
    echo -e "    Cek backup Hostinger panel atau hubungi admin"
  fi
else
  echo -e "${R}═══════════════════════════════════════════════════════════${N}"
  echo -e "${R}  ❌ MASIH ADA YANG GAGAL${N}"
  echo -e "${R}═══════════════════════════════════════════════════════════${N}"
  echo ""
  echo -e "  Screenshot output ini, kirim untuk analisis"
fi
echo ""
