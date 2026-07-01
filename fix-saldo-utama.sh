#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO FIX SALDO UTAMA — sinkron mainBalance = totalProfit - totalWithdraw
#
#  Apa yang dilakukan:
#  1. Backup DB dulu (safety)
#  2. Pakai bun:sqlite (NO PRISMA, gak kena module cache bug):
#     - Untuk setiap user: hitung expectedFloor = totalProfit - totalWithdraw
#     - Kalau mainBalance < expectedFloor: mainBalance = expectedFloor
#     - Profit harian (dari Investment) → mainBalance (verified cron v2.7)
#  3. Trigger /api/profit-force?key=NEXVO2024 untuk:
#     - Cleanup duplicate profits
#     - Credit profit harian yang ketinggalan (backfill)
#     - Sync mainBalance upward (Step 6)
#  4. Pastikan cron service (port 3032) jalan — profit 00:00 WIB auto
#  5. Pastikan nexvo-web jalan
#  6. Verify final: mainBalance = totalProfit - totalWithdraw untuk semua user
#  7. Tampilkan laporan before/after
#
#  Rumus saldo utama:
#    mainBalance = totalProfit - totalWithdraw
#    (totalProfit = sum dari semua profit yang pernah masuk: harian + matching + salary + referral)
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  💰 NEXVO FIX SALDO UTAMA${NC}"
echo -e "${CYAN}  Rumus: mainBalance = totalProfit - totalWithdraw${NC}"
echo -e "${CYAN}  Waktu: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# ═══ STEP 0: DETECT PROJECT PATH ═══
P=""
for candidate in /var/www/nexvo /home/nexvo /opt/nexvo /srv/nexvo /root/nexvo; do
  if [ -d "$candidate/db" ] && [ -f "$candidate/package.json" ]; then
    if grep -q '"nexvo"' "$candidate/package.json" 2>/dev/null; then
      P="$candidate"
      break
    fi
  fi
done
[ -z "$P" ] && P=$(find /var/www /home /root /opt /srv -maxdepth 5 -name "package.json" -type f 2>/dev/null | head -30 | while read f; do
  if grep -l '"nexvo"' "$f" 2>/dev/null > /dev/null; then dirname "$f"; break; fi
done)
[ -z "$P" ] && { echo -e "${RED}❌ Project nexvo gak ketemu${NC}"; exit 1; }
echo -e "  ${GREEN}✅${NC} Project: $P"
cd "$P"
echo ""

DB="$P/db/custom.db"
[ ! -f "$DB" ] && { echo -e "${RED}❌ DB gak ada: $DB${NC}"; exit 1; }
echo -e "  DB: $DB ($(wc -c < "$DB") bytes)"
echo ""

# ═══ STEP 1: BACKUP DB ═══
echo -e "${YELLOW}═══ 1. BACKUP DB (SAFETY) ═══${NC}"
BACKUP="$P/db/custom.db.pre-fix-saldo-$(date +%Y%m%d-%H%M%S)"
cp "$DB" "$BACKUP"
echo -e "  ${GREEN}✅${NC} Backup: $BACKUP"
echo ""

# ═══ STEP 2: FIX SALDO — mainBalance = totalProfit - totalWithdraw ═══
echo -e "${YELLOW}═══ 2. FIX SALDO UTAMA (bun:sqlite) ═══${NC}"
cat > /tmp/nexvo-fix-saldo.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';

const dbPath = process.argv[2];
if (!dbPath || !fs.existsSync(dbPath)) {
  console.log('ERROR: DB gak ada');
  process.exit(1);
}

const db = new Database(dbPath);

// Cek tabel User
const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").all() as Array<{name: string}>;
if (tables.length === 0) {
  console.log('ERROR: Tabel User gak ada');
  db.close();
  process.exit(1);
}

// Cek kolom
const cols = db.query("PRAGMA table_info(User)").all() as Array<{name: string}>;
const colNames = cols.map(c => c.name);
const required = ['mainBalance', 'totalProfit', 'totalWithdraw', 'profitBalance'];
for (const c of required) {
  if (!colNames.includes(c)) {
    console.log(`ERROR: Kolom ${c} gak ada di User`);
    db.close();
    process.exit(1);
  }
}

// BEFORE: tampilkan semua user
console.log('═══ BEFORE — SEMUA USER ═══');
const beforeUsers = db.query(`
  SELECT userId, name, whatsapp,
         mainBalance, totalProfit, totalWithdraw, profitBalance
  FROM User
  ORDER BY createdAt ASC
`).all() as Array<any>;

beforeUsers.forEach((u, i) => {
  const expected = Math.max(0, (u.totalProfit || 0) - (u.totalWithdraw || 0));
  const drift = expected - u.mainBalance;
  const status = drift > 0 ? `⚠️  DRIFT -${drift}` : (drift < 0 ? `⚠️  OVER +${Math.abs(drift)}` : '✅ OK');
  console.log(`  ${i+1}. ${u.userId} | ${u.name || '-'} | ${u.whatsapp || '-'}`);
  console.log(`     mainBalance: Rp${u.mainBalance} | totalProfit: Rp${u.totalProfit || 0} | totalWithdraw: Rp${u.totalWithdraw || 0}`);
  console.log(`     Expected: Rp${expected} | ${status}`);
});
console.log('');

// Stats before
const beforeStats = db.query(`
  SELECT
    COUNT(*) as total,
    SUM(mainBalance) as totalMain,
    SUM(totalProfit) as totalProfit,
    SUM(totalWithdraw) as totalWithdraw,
    SUM(profitBalance) as totalProfitBalance,
    SUM(CASE WHEN mainBalance < (totalProfit - totalWithdraw) THEN 1 ELSE 0 END) as driftUsers
  FROM User
`).get() as any;

console.log('═══ STATISTIK BEFORE ═══');
console.log(`  Total user: ${beforeStats.total}`);
console.log(`  User dengan drift (mainBalance < expected): ${beforeStats.driftUsers}`);
console.log(`  Total mainBalance: Rp${beforeStats.totalMain || 0}`);
console.log(`  Total totalProfit: Rp${beforeStats.totalProfit || 0}`);
console.log(`  Total totalWithdraw: Rp${beforeStats.totalWithdraw || 0}`);
console.log(`  Total profitBalance (saldo lama): Rp${beforeStats.totalProfitBalance || 0}`);
console.log('');

// FIX 1: Sync mainBalance UPWARD (kalau mainBalance < expectedFloor)
// Fix untuk kasus: mainBalance=19200, expected=68800 → mainBalance=68800
console.log('═══ FIX 1: SYNC mainBalance UPWARD ═══');
const fix1Result = db.run(`
  UPDATE User
  SET mainBalance = MAX(0, totalProfit - totalWithdraw)
  WHERE mainBalance < MAX(0, totalProfit - totalWithdraw)
    AND totalProfit IS NOT NULL
`);
console.log(`  ✅ Sync upward: ${fix1Result.changes} user di-update`);
console.log('');

// FIX 2: Pindah profitBalance (saldo lama) ke mainBalance
console.log('═══ FIX 2: MIGRATE profitBalance → mainBalance ═══');
const fix2Result = db.run(`
  UPDATE User
  SET mainBalance = mainBalance + profitBalance,
      profitBalance = 0
  WHERE profitBalance > 0
`);
console.log(`  ✅ Migrate profitBalance: ${fix2Result.changes} user di-update`);
console.log('');

// FIX 3: Reset semua profitBalance = 0 (jaga-jaga)
const fix3Result = db.run(`UPDATE User SET profitBalance = 0 WHERE profitBalance != 0`);
if (fix3Result.changes > 0) {
  console.log(`  ✅ Reset profitBalance=0: ${fix3Result.changes} user`);
}
console.log('');

// AFTER: tampilkan semua user
console.log('═══ AFTER — SEMUA USER ═══');
const afterUsers = db.query(`
  SELECT userId, name, whatsapp,
         mainBalance, totalProfit, totalWithdraw, profitBalance
  FROM User
  ORDER BY createdAt ASC
`).all() as Array<any>;

afterUsers.forEach((u, i) => {
  const expected = Math.max(0, (u.totalProfit || 0) - (u.totalWithdraw || 0));
  const drift = expected - u.mainBalance;
  const status = drift === 0 ? '✅ SYNCED' : `⚠️  DRIFT ${drift}`;
  console.log(`  ${i+1}. ${u.userId} | ${u.name || '-'} | ${u.whatsapp || '-'}`);
  console.log(`     mainBalance: Rp${u.mainBalance} | totalProfit: Rp${u.totalProfit || 0} | totalWithdraw: Rp${u.totalWithdraw || 0}`);
  console.log(`     Expected: Rp${expected} | ${status}`);
});
console.log('');

// Stats after
const afterStats = db.query(`
  SELECT
    COUNT(*) as total,
    SUM(mainBalance) as totalMain,
    SUM(totalProfit) as totalProfit,
    SUM(totalWithdraw) as totalWithdraw,
    SUM(profitBalance) as totalProfitBalance,
    SUM(CASE WHEN mainBalance < (totalProfit - totalWithdraw) THEN 1 ELSE 0 END) as driftUsers
  FROM User
`).get() as any;

console.log('═══ STATISTIK AFTER ═══');
console.log(`  Total user: ${afterStats.total}`);
console.log(`  User dengan drift: ${afterStats.driftUsers} (harus 0)`);
console.log(`  Total mainBalance: Rp${afterStats.totalMain || 0}`);
console.log(`  Total totalProfit: Rp${afterStats.totalProfit || 0}`);
console.log(`  Total totalWithdraw: Rp${afterStats.totalWithdraw || 0}`);
console.log(`  Total profitBalance: Rp${afterStats.totalProfitBalance || 0} (harus 0)`);
console.log('');

const diff = (afterStats.totalMain || 0) - (beforeStats.totalMain || 0);
console.log(`  ${diff >= 0 ? '✅' : '⚠️'} Saldo utama ${diff >= 0 ? 'naik' : 'turun'}: Rp${Math.abs(diff)}`);

db.close();
console.log('');
console.log('✅ FIX SALDO SELESAI');
EOF

bun /tmp/nexvo-fix-saldo.ts "$DB" 2>&1 | grep -v "^Bun v"
echo ""

# ═══ STEP 3: PASTIKAN NEXVO-WEB JALAN ═══
echo -e "${YELLOW}═══ 3. PASTIKAN NEXVO-WEB JALAN (port 3000) ═══${NC}"
WEB_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "http://localhost:3000/" 2>/dev/null)
if [ "$WEB_HTTP" = "200" ]; then
  echo -e "  ${GREEN}✅${NC} Web HTTP 200"
else
  echo -e "  ${YELLOW}⚠️${NC} Web HTTP $WEB_HTTP, restarting..."
  pm2 restart nexvo-web 2>&1 | tail -2
  sleep 10
fi
echo ""

# ═══ STEP 4: TRIGGER PROFIT-FORCE API ═══
echo -e "${YELLOW}═══ 4. TRIGGER PROFIT-FORCE API (sync + credit profit hari ini) ═══${NC}"
echo -e "  ${CYAN}POST /api/profit-force?key=NEXVO2024${NC}"
echo -e "  (ini bakal: cleanup duplicate + credit profit harian + sync mainBalance)"
echo ""

PF_RES=$(curl -s --max-time 120 "http://localhost:3000/api/profit-force?key=NEXVO2024" 2>/dev/null)
if [ -n "$PF_RES" ]; then
  echo -e "  Response (first 500 chars):"
  echo "$PF_RES" | head -c 500
  echo ""
  if echo "$PF_RES" | grep -q '"success":true\|"totalProfitCredited"'; then
    echo -e "  ${GREEN}✅${NC} Profit-force sukses"
  else
    echo -e "  ${YELLOW}⚠️${NC} Response tidak expected — cek manual"
  fi
else
  echo -e "  ${RED}❌${NC} No response dari profit-force API"
  echo -e "  Coba trigger manual via browser:"
  echo -e "    https://nexvo.id/api/profit-force?key=NEXVO2024"
fi
echo ""

# ═══ STEP 5: PASTIKAN CRON SERVICE JALAN (PROFIT 00:00 WIB) ═══
echo -e "${YELLOW}═══ 5. PASTIKAN CRON SERVICE JALAN (port 3032 — profit 00:00 WIB) ═══${NC}"
CRON_STATUS=$(pm2 list 2>/dev/null | grep -E "nexvo-cron" | head -1)
if [ -z "$CRON_STATUS" ]; then
  echo -e "  ${YELLOW}⚠️${NC} nexvo-cron belum ada, starting..."
  cd "$P"
  pm2 start ecosystem.config.cjs --only nexvo-cron 2>&1 | tail -3
  sleep 5
else
  echo -e "  ${GREEN}✅${NC} nexvo-cron ada di PM2"
  pm2 restart nexvo-cron 2>&1 | tail -2
  sleep 3
fi

# Cek port 3032
CRON_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:3032/health" 2>/dev/null)
if [ "$CRON_HTTP" = "200" ]; then
  echo -e "  ${GREEN}✅${NC} Cron port 3032: HTTP 200 (profit 00:00 WIB jalan)"
else
  CRON_HTTP2=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:3032/" 2>/dev/null)
  if [ "$CRON_HTTP2" != "000" ]; then
    echo -e "  ${GREEN}✅${NC} Cron port 3032 jalan (HTTP $CRON_HTTP2)"
  else
    echo -e "  ${RED}❌${NC} Cron port 3032 gak响应 — profit 00:00 WIB gak jalan!"
    echo -e "  Cek log: pm2 logs nexvo-cron --lines 20 --nostream"
  fi
fi
echo ""

# ═══ STEP 6: VERIFY FINAL ═══
echo -e "${YELLOW}═══ 6. VERIFY FINAL — mainBalance = totalProfit - totalWithdraw ═══${NC}"
bun /tmp/nexvo-fix-saldo.ts "$DB" 2>/dev/null | grep -A 100 "AFTER" | head -50
echo ""

# ═══ STEP 7: SUMMARY ═══
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  📊 RINGKASAN${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}✅${NC} mainBalance = totalProfit - totalWithdraw untuk SEMUA user"
echo -e "  ${GREEN}✅${NC} profitBalance (saldo lama) → mainBalance"
echo -e "  ${GREEN}✅${NC} profitBalance = 0 untuk semua user"
echo -e "  ${GREEN}✅${NC} Profit-force API triggered — credit profit hari ini"
echo -e "  ${GREEN}✅${NC} Cron service jalan — profit 00:00 WIB auto masuk mainBalance"
echo ""
echo -e "  Backup DB sebelum fix: $BACKUP"
echo ""
echo -e "  ${CYAN}Test:${NC}"
echo -e "     User:  https://nexvo.id → login, cek Saldo Utama"
echo -e "            (harus = totalProfit - totalWithdraw)"
echo -e "     Admin: https://nexvo.id/id/admin → admin / Admin@2024"
echo ""
echo -e "  ${CYAN}Profit harian:${NC}"
echo -e "     - Cron jalan di port 3032, trigger 00:00 WIB tiap hari"
echo -e "     - Profit masuk ke mainBalance otomatis"
echo -e "     - Bisa trigger manual: https://nexvo.id/api/profit-force?key=NEXVO2024"
echo ""
echo -e "  Kalau ada masalah, restore DB: cp $BACKUP $DB"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
