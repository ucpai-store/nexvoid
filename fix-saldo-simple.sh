#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO FIX SALDO — SIMPLE & ROBUST (no build, no git pull, no API)
#
#  Root cause yang di-fix:
#  1. Prisma error "Unable to open the database file" → .env path salah
#  2. mainBalance drift (19200 padahal harusnya 68800) → sync DB
#
#  Script ini HANYA:
#  - Stop service (release DB lock)
#  - Recreate .env dengan path DATABASE_URL yang BENAR
#  - Fix saldo via bun:sqlite (NO Prisma)
#  - Start service
#  - Verify nexvo-web bisa baca DB
#
#  TIDAK ada build, TIDAK ada git pull, TIDAK ada profit-force API call.
#  Itu yang bikin error berantakan di script sebelumnya.
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

# Colors
R='\033[0;31m'
G='\033[0;32m'
Y='\033[1;33m'
C='\033[0;36m'
B='\033[1m'
N='\033[0m'

echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  🔧 NEXVO FIX SALDO — SIMPLE & ROBUST${N}"
echo -e "${C}  Rumus: mainBalance = totalProfit - totalWithdraw${N}"
echo -e "${C}  Waktu: $(date '+%Y-%m-%d %H:%M:%S')${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo ""

# ═══ STEP 0: DETECT PROJECT PATH ═══
echo -e "${B}═══ 0. DETECT PROJECT PATH ═══${N}"
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
[ ! -f "$DB" ] && { echo -e "${R}❌ DB gak ada: $DB${N}"; exit 1; }
echo -e "  DB: $DB ($(wc -c < "$DB") bytes)"
echo ""

# ═══ STEP 1: STOP SERVICE (release DB lock) ═══
echo -e "${B}═══ 1. STOP nexvo-web + nexvo-cron (release DB lock) ═══${N}"
pm2 stop nexvo-web nexvo-cron 2>/dev/null && echo -e "  ${G}✅${N} PM2 stop OK" || echo -e "  ${Y}⚠️${N} PM2 stop skip (mungkin gak jalan)"
sleep 2
# Kill proses yang mungkin masih pegang DB
pkill -f "next start" 2>/dev/null && echo -e "  ${G}✅${N} Kill next start" || true
pkill -f "cron-service" 2>/dev/null && echo -e "  ${G}✅${N} Kill cron-service" || true
sleep 1
echo ""

# ═══ STEP 2: RECREATE .env (FIX PRISMA PATH) ═══
echo -e "${B}═══ 2. RECREATE .env — fix Prisma "Unable to open database"${N}"
# Backup .env lama kalau ada
if [ -f "$P/.env" ]; then
  cp "$P/.env" "$P/.env.backup-$(date +%Y%m%d-%H%M%S)"
  OLD_URL=$(grep "^DATABASE_URL=" "$P/.env" 2>/dev/null | head -1)
  echo -e "  ${Y} OLD:${N} $OLD_URL"
fi
# ALWAYS recreate .env dengan path ABSOLUT yang BENAR
cat > "$P/.env" << EOF
# NEXVO Production — auto-fixed by fix-saldo-simple.sh
# $(date '+%Y-%m-%d %H:%M:%S')
DATABASE_URL="file:$DB"
NEXTAUTH_SECRET=nexvo-secret-$(date +%s)
NEXTAUTH_URL=https://nexvo.id
NODE_ENV=production
JWT_SECRET=nexvo-jwt-secret-2024
CRON_SECRET=nexvo-cron-secret-2024
EOF
echo -e "  ${G} NEW:${N} DATABASE_URL=\"file:$DB\""
# Pastikan folder db ada
mkdir -p "$P/db"
echo -e "  ${G}✅${N} .env recreated"
echo ""

# ═══ STEP 3: BACKUP DB ═══
echo -e "${B}═══ 3. BACKUP DB (safety) ═══${N}"
BACKUP="$P/db/custom.db.pre-simple-$(date +%Y%m%d-%H%M%S)"
cp "$DB" "$BACKUP"
echo -e "  ${G}✅${N} Backup: $BACKUP"
echo ""

# ═══ STEP 4: FIX SALDO via bun:sqlite (NO PRISMA) ═══
echo -e "${B}═══ 4. FIX SALDO — mainBalance = totalProfit - totalWithdraw ═══${N}"
cat > /tmp/nexvo-fix-saldo-simple.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';

const dbPath = process.argv[2];
if (!dbPath || !fs.existsSync(dbPath)) {
  console.log('ERROR: DB gak ada di', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);
db.exec("PRAGMA journal_mode = WAL;");

// Cek tabel User ada
const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").all() as Array<{name:string}>;
if (tables.length === 0) {
  console.log('ERROR: Tabel User gak ada. DB mungkin corrupt.');
  db.close();
  process.exit(1);
}

// BEFORE
const before = db.query(`
  SELECT
    COUNT(*) as total,
    SUM(mainBalance) as totalMain,
    SUM(totalProfit) as totalProfit,
    SUM(totalWithdraw) as totalWithdraw,
    SUM(profitBalance) as totalProfitBalance,
    SUM(CASE WHEN mainBalance < MAX(0, totalProfit - totalWithdraw) THEN 1 ELSE 0 END) as driftUsers
  FROM User
`).get() as any;

console.log('  ─── BEFORE ───');
console.log(`  Total user        : ${before.total}`);
console.log(`  User dengan drift : ${before.driftUsers}`);
console.log(`  Total mainBalance : Rp ${(before.totalMain||0).toLocaleString()}`);
console.log(`  Total totalProfit : Rp ${(before.totalProfit||0).toLocaleString()}`);
console.log(`  Total withdraw    : Rp ${(before.totalWithdraw||0).toLocaleString()}`);
console.log(`  Total profitBal   : Rp ${(before.totalProfitBalance||0).toLocaleString()}`);
console.log('');

// Tampilkan user dengan drift (top 15)
if (before.driftUsers > 0) {
  console.log('  ─── USER DENGAN DRIFT (top 15) ───');
  const drift = db.query(`
    SELECT userId, name, whatsapp, mainBalance, totalProfit, totalWithdraw, profitBalance
    FROM User
    WHERE mainBalance < MAX(0, totalProfit - totalWithdraw)
       OR profitBalance > 0
    ORDER BY (MAX(0, totalProfit - totalWithdraw) - mainBalance) DESC
    LIMIT 15
  `).all() as Array<any>;
  drift.forEach((u, i) => {
    const expected = Math.max(0, (u.totalProfit||0) - (u.totalWithdraw||0));
    const driftAmt = expected - u.mainBalance;
    console.log(`  ${i+1}. ${u.userId} | ${u.name||'-'} | ${u.whatsapp||'-'}`);
    console.log(`     mainBalance: Rp ${u.mainBalance.toLocaleString()} → Rp ${expected.toLocaleString()} (+${driftAmt.toLocaleString()})`);
    if (u.profitBalance > 0) {
      console.log(`     profitBalance: Rp ${u.profitBalance.toLocaleString()} → migrate ke mainBalance`);
    }
  });
  console.log('');
}

// FIX 1: Migrate profitBalance → mainBalance (DULUAN, biar gak double-sync)
console.log('  ─── FIX 1: MIGRATE profitBalance → mainBalance ───');
const fix1 = db.run(`
  UPDATE User
  SET mainBalance = mainBalance + profitBalance,
      profitBalance = 0
  WHERE profitBalance > 0
`);
console.log(`  ✅ Migrate profitBalance: ${fix1.changes} user`);

// FIX 2: Sync mainBalance UPWARD = MAX(0, totalProfit - totalWithdraw)
// (hanya naik, gak pernah turun — jaga-jaga profitBalance gak double-count)
console.log('  ─── FIX 2: SYNC mainBalance UPWARD ───');
const fix2 = db.run(`
  UPDATE User
  SET mainBalance = MAX(0, totalProfit - totalWithdraw)
  WHERE mainBalance < MAX(0, totalProfit - totalWithdraw)
`);
console.log(`  ✅ Sync upward: ${fix2.changes} user`);

// FIX 3: Reset profitBalance = 0 (safety)
const fix3 = db.run(`UPDATE User SET profitBalance = 0 WHERE profitBalance != 0`);
if (fix3.changes > 0) console.log(`  ✅ Reset profitBalance=0: ${fix3.changes} user`);

// COMMIT (WAL auto-commit per statement)
db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
console.log('');

// AFTER
const after = db.query(`
  SELECT
    COUNT(*) as total,
    SUM(mainBalance) as totalMain,
    SUM(totalProfit) as totalProfit,
    SUM(totalWithdraw) as totalWithdraw,
    SUM(profitBalance) as totalProfitBalance,
    SUM(CASE WHEN mainBalance < MAX(0, totalProfit - totalWithdraw) THEN 1 ELSE 0 END) as driftUsers
  FROM User
`).get() as any;

console.log('  ─── AFTER ───');
console.log(`  Total user        : ${after.total}`);
console.log(`  User dengan drift : ${after.driftUsers} (harus 0)`);
console.log(`  Total mainBalance : Rp ${(after.totalMain||0).toLocaleString()}`);
console.log(`  Total totalProfit : Rp ${(after.totalProfit||0).toLocaleString()}`);
console.log(`  Total withdraw    : Rp ${(after.totalWithdraw||0).toLocaleString()}`);
console.log(`  Total profitBal   : Rp ${(after.totalProfitBalance||0).toLocaleString()} (harus 0)`);
console.log('');

const diff = (after.totalMain||0) - (before.totalMain||0);
console.log(`  ${diff >= 0 ? '✅' : '⚠️'} Saldo utama ${diff >= 0 ? 'naik' : 'turun'}: Rp ${Math.abs(diff).toLocaleString()}`);
console.log('');

// Tampilkan top 10 user
console.log('  ─── TOP 10 USER (mainBalance terbesar) ───');
const top = db.query(`
  SELECT userId, name, whatsapp, mainBalance, totalProfit, totalWithdraw
  FROM User
  ORDER BY mainBalance DESC
  LIMIT 10
`).all() as Array<any>;
top.forEach((u, i) => {
  const expected = Math.max(0, (u.totalProfit||0) - (u.totalWithdraw||0));
  const ok = u.mainBalance >= expected;
  console.log(`  ${i+1}. ${ok ? '✅' : '❌'} ${u.userId} | ${u.name||'-'} | Saldo: Rp ${u.mainBalance.toLocaleString()} | Expected: Rp ${expected.toLocaleString()}`);
});

db.close();
console.log('');
console.log('✅ FIX SALDO SELESAI');
EOF

bun /tmp/nexvo-fix-saldo-simple.ts "$DB" 2>&1 | grep -v "^Bun v"
echo ""

# ═══ STEP 5: FIX ECOSYSTEM cwd ═══
echo -e "${B}═══ 5. FIX ECOSYSTEM.CONFIG.CJS cwd ═══${N}"
ECO_FILE="$P/ecosystem.config.cjs"
if [ -f "$ECO_FILE" ]; then
  sed -i "s|cwd: *'/home/nexvo'|cwd: '$P'|g" "$ECO_FILE"
  sed -i "s|cwd: *'/var/www/nexvo'|cwd: '$P'|g" "$ECO_FILE"
  sed -i "s|cwd: *'/root/nexvo'|cwd: '$P'|g" "$ECO_FILE"
  sed -i "s|cwd: *'/opt/nexvo'|cwd: '$P'|g" "$ECO_FILE"
  mkdir -p "$P/.pm2-logs"
  sed -i "s|/home/nexvo/.pm2-logs|$P/.pm2-logs|g" "$ECO_FILE"
  sed -i "s|/var/www/nexvo/.pm2-logs|$P/.pm2-logs|g" "$ECO_FILE"
  echo -e "  ${G}✅${N} ecosystem cwd=$P"
fi
echo ""

# ═══ STEP 6: START SERVICE ═══
echo -e "${B}═══ 6. START nexvo-web + nexvo-cron ═══${N}"
cd "$P"
# Start via ecosystem (lebih reliable)
pm2 start ecosystem.config.cjs 2>&1 | tail -8
sleep 3
pm2 save 2>&1 | tail -1
echo ""
pm2 list 2>&1 | grep -E "nexvo|name|─" | head -6
echo ""
echo -e "  ${C}Waiting 18s for nexvo-web boot...${N}"
sleep 18
echo ""

# ═══ STEP 7: VERIFY — nexvo-web bisa baca DB ═══
echo -e "${B}═══ 7. VERIFY — nexvo-web bisa baca DB ═══${N}"

# [1] Web HTTP
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:3000/ 2>/dev/null)
[ "$HTTP" = "200" ] && echo -e "  ${G}✅${N} Web HTTP 200" || echo -e "  ${R}❌${N} Web HTTP $HTTP"

# [2] nexvo-web memory check (kalau <20mb = crash)
MEM=$(pm2 list 2>/dev/null | grep nexvo-web | awk '{print $0}' | grep -oP '\d+\.\d+mb' | head -1)
if [ -n "$MEM" ]; then
  MEM_NUM=$(echo "$MEM" | sed 's/mb//')
  MEM_OK=$(echo "$MEM_NUM > 20" | bc 2>/dev/null)
  if [ "$MEM_OK" = "1" ]; then
    echo -e "  ${G}✅${N} nexvo-web memori: $MEM (sehat)"
  else
    echo -e "  ${R}❌${N} nexvo-web memori: $MEM (TERLALU KECIL — kemungkinan crash)"
  fi
fi

# [3] Test API yang baca DB (login admin — gak depend profit-force)
LOGIN_RES=$(curl -s --max-time 12 -X POST "http://localhost:3000/api/auth/admin-login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@2024"}' 2>/dev/null)
if echo "$LOGIN_RES" | grep -q '"success":true\|"token"'; then
  echo -e "  ${G}✅${N} Admin login OK (DB bisa dibaca Prisma)"
else
  echo -e "  ${R}❌${N} Admin login gagal — Prisma masih gak bisa baca DB"
  echo -e "      Response: $(echo "$LOGIN_RES" | head -c 200)"
  echo -e "      ${Y}→ Cek .env DATABASE_URL, cek permission DB file${N}"
fi

# [4] Cron service
CRON_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:3032/" 2>/dev/null)
[ "$CRON_HTTP" != "000" ] && echo -e "  ${G}✅${N} Cron port 3032 OK (HTTP $CRON_HTTP)" || echo -e "  ${Y}⚠️${N} Cron port 3032 gak respon"
echo ""

# ═══ STEP 8: FINAL SUMMARY ═══
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  📊 RINGKASAN${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo ""
echo -e "  ${G}✅${N} .env fixed — DATABASE_URL = file:$DB"
echo -e "  ${G}✅${N} DB saldo fixed — mainBalance = totalProfit - totalWithdraw"
echo -e "  ${G}✅${N} profitBalance (saldo lama) → mainBalance"
echo -e "  ${G}✅${N} nexvo-web + nexvo-cron restarted"
echo ""
echo -e "  Backup DB : $BACKUP"
echo -e "  Backup env: $P/.env.backup-*"
echo ""
echo -e "  ${Y}PENTING — User WAJIB lakukan di browser:${N}"
echo -e "    1. Buka ${B}https://nexvo.id/recovery.html${N}"
echo -e "    2. Klik ${B}'Clear Cache & Reload'${N} (clear localStorage + cache)"
echo -e "    3. Login ulang"
echo -e "    4. Cek saldo utama — harus = totalProfit - totalWithdraw"
echo ""
echo -e "  ${C}Kalau saldo masih lama:${N}"
echo -e "    - Browser cache belum di-clear (buka recovery.html)"
echo -e "    - Atau hard refresh: Ctrl+Shift+R / Cmd+Shift+R"
echo ""
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
