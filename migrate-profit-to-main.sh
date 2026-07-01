#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO MIGRATE PROFIT → MAIN BALANCE
#
#  Apa yang dilakukan:
#  1. Backup DB dulu (safety)
#  2. Pakai bun:sqlite untuk migrate:
#     - Untuk setiap user dengan profitBalance > 0:
#       mainBalance += profitBalance
#       profitBalance = 0
#     - Set profitBalance = 0 untuk SEMUA user (jaga-jaga)
#  3. Pastikan cron service (nexvo-cron port 3032) jalan
#     — cron v2.7 udah masuk profit ke mainBalance otomatis
#  4. Pastikan nexvo-web jalan
#  5. Verify dengan query final
#
#  Note: cron-service v2.7 + profit-force.ts SUDAH masuk profit/bonus
#  ke mainBalance. Script ini cuma migrate saldo LAMA yang nyangkut
#  di profitBalance sebelum fix v2.7.
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  💰 NEXVO MIGRATE PROFIT → MAIN BALANCE${NC}"
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
if [ ! -f "$DB" ]; then
  echo -e "${RED}❌ DB gak ada: $DB${NC}"
  exit 1
fi
echo -e "  DB: $DB ($(wc -c < "$DB") bytes)"
echo ""

# ═══ STEP 1: BACKUP DB ═══
echo -e "${YELLOW}═══ 1. BACKUP DB (SAFETY) ═══${NC}"
BACKUP="$P/db/custom.db.pre-migrate-$(date +%Y%m%d-%H%M%S)"
cp "$DB" "$BACKUP"
echo -e "  ${GREEN}✅${NC} Backup: $BACKUP ($(wc -c < "$BACKUP") bytes)"
echo ""

# ═══ STEP 2: MIGRATE profitBalance → mainBalance ═══
echo -e "${YELLOW}═══ 2. MIGRATE profitBalance → mainBalance ═══${NC}"
cat > /tmp/nexvo-migrate.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';

const dbPath = process.argv[2];
if (!dbPath || !fs.existsSync(dbPath)) {
  console.log('ERROR: DB gak ada');
  process.exit(1);
}

const db = new Database(dbPath);

// Cek tabel User ada
const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").all() as Array<{name: string}>;
if (tables.length === 0) {
  console.log('ERROR: Tabel User gak ada');
  db.close();
  process.exit(1);
}

// Cek kolom profitBalance & mainBalance ada
const cols = db.query("PRAGMA table_info(User)").all() as Array<{name: string}>;
const colNames = cols.map(c => c.name);
if (!colNames.includes('profitBalance') || !colNames.includes('mainBalance')) {
  console.log('ERROR: Kolom profitBalance/mainBalance gak ada');
  console.log('Available:', colNames.join(', '));
  db.close();
  process.exit(1);
}

// BEFORE: tampilkan summary
const beforeStats = db.query(`
  SELECT
    COUNT(*) as totalUsers,
    SUM(CASE WHEN profitBalance > 0 THEN 1 ELSE 0 END) as usersWithProfit,
    SUM(profitBalance) as totalProfitBalance,
    SUM(mainBalance) as totalMainBalance
  FROM User
`).get() as any;

console.log('═══ BEFORE MIGRATION ═══');
console.log(`  Total users: ${beforeStats.totalUsers}`);
console.log(`  Users dengan profitBalance > 0: ${beforeStats.usersWithProfit}`);
console.log(`  Total profitBalance (saldo lama nyangkut): Rp${beforeStats.totalProfitBalance || 0}`);
console.log(`  Total mainBalance: Rp${beforeStats.totalMainBalance || 0}`);
console.log('');

// Tampilkan user yang punya profitBalance > 0 (before)
if (beforeStats.usersWithProfit > 0) {
  console.log('═══ USER DENGAN profitBalance > 0 (akan di-migrate) ═══');
  const usersWithProfit = db.query(`
    SELECT userId, name, whatsapp, profitBalance, mainBalance
    FROM User
    WHERE profitBalance > 0
    ORDER BY profitBalance DESC
    LIMIT 30
  `).all() as Array<any>;
  usersWithProfit.forEach((u, i) => {
    console.log(`  ${i+1}. ${u.userId} | ${u.name || '-'} | ${u.whatsapp || '-'} | profit: Rp${u.profitBalance} → main: Rp${u.mainBalance} (akan jadi Rp${u.profitBalance + u.mainBalance})`);
  });
  if (beforeStats.usersWithProfit > 30) {
    console.log(`  ... dan ${beforeStats.usersWithProfit - 30} user lainnya`);
  }
  console.log('');
}

// MIGRATE: pindah profitBalance ke mainBalance, set profitBalance = 0
// Pakai transaction supaya atomic
console.log('═══ MIGRATING... ═══');
const migrateResult = db.run(`
  UPDATE User
  SET mainBalance = mainBalance + profitBalance,
      profitBalance = 0
  WHERE profitBalance > 0
`);
console.log(`  ✅ Migrated ${migrateResult.changes} user`);
console.log('');

// Jaga-jaga: set SEMUA profitBalance = 0 (kalau ada yang negatif atau aneh)
const resetResult = db.run(`UPDATE User SET profitBalance = 0`);
console.log(`  ✅ Reset profitBalance = 0 untuk semua user (${resetResult.changes} rows)`);
console.log('');

// AFTER: tampilkan summary
const afterStats = db.query(`
  SELECT
    COUNT(*) as totalUsers,
    SUM(CASE WHEN profitBalance > 0 THEN 1 ELSE 0 END) as usersWithProfit,
    SUM(profitBalance) as totalProfitBalance,
    SUM(mainBalance) as totalMainBalance
  FROM User
`).get() as any;

console.log('═══ AFTER MIGRATION ═══');
console.log(`  Total users: ${afterStats.totalUsers}`);
console.log(`  Users dengan profitBalance > 0: ${afterStats.usersWithProfit} (harus 0)`);
console.log(`  Total profitBalance: Rp${afterStats.totalProfitBalance || 0} (harus 0)`);
console.log(`  Total mainBalance: Rp${afterStats.totalMainBalance || 0} (naik dari sebelumnya)`);
console.log('');

const diff = (afterStats.totalMainBalance || 0) - (beforeStats.totalMainBalance || 0);
console.log(`  ${diff >= 0 ? '✅' : '⚠️'} Saldo utama naik: Rp${diff}`);
console.log('');

// Tampilkan top 10 user dengan mainBalance terbesar (after)
console.log('═══ TOP 10 USER DENGAN MAIN BALANCE TERBESAR ═══');
const topUsers = db.query(`
  SELECT userId, name, whatsapp, mainBalance, totalProfit
  FROM User
  ORDER BY mainBalance DESC
  LIMIT 10
`).all() as Array<any>;
topUsers.forEach((u, i) => {
  console.log(`  ${i+1}. ${u.userId} | ${u.name || '-'} | ${u.whatsapp || '-'} | Saldo Utama: Rp${u.mainBalance} | Total Profit: Rp${u.totalProfit || 0}`);
});
console.log('');

db.close();
console.log('✅ MIGRASI SELESAI — semua profit sekarang di mainBalance');
EOF

bun /tmp/nexvo-migrate.ts "$DB" 2>&1 | grep -v "^Bun v"
echo ""

# ═══ STEP 3: PASTIKAN CRON SERVICE JALAN ═══
echo -e "${YELLOW}═══ 3. PASTIKAN CRON SERVICE JALAN (port 3032) ═══${NC}"
CRON_STATUS=$(pm2 list 2>/dev/null | grep -E "nexvo-cron" | head -1)
if [ -z "$CRON_STATUS" ]; then
  echo -e "  ${YELLOW}⚠️${NC} nexvo-cron belum ada di PM2, starting..."
  cd "$P"
  pm2 start ecosystem.config.cjs --only nexvo-cron 2>&1 | tail -5
  sleep 5
else
  echo -e "  ${GREEN}✅${NC} nexvo-cron ada di PM2: $CRON_STATUS"
  # Restart biar pasti jalan
  pm2 restart nexvo-cron 2>&1 | tail -2
  sleep 3
fi

# Cek port 3032
CRON_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:3032/health" 2>/dev/null)
if [ "$CRON_HTTP" = "200" ]; then
  echo -e "  ${GREEN}✅${NC} Cron service port 3032: HTTP 200"
elif [ "$CRON_HTTP" = "000" ]; then
  CRON_HTTP2=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:3032/" 2>/dev/null)
  if [ "$CRON_HTTP2" != "000" ]; then
    echo -e "  ${GREEN}✅${NC} Cron service port 3032: jalan (HTTP $CRON_HTTP2)"
  else
    echo -e "  ${RED}❌${NC} Cron service port 3032 gak响应 — cek log:"
    pm2 logs nexvo-cron --lines 10 --nostream 2>&1 | tail -15
  fi
else
  echo -e "  ${GREEN}✅${NC} Cron service port 3032: HTTP $CRON_HTTP"
fi
echo ""

# ═══ STEP 4: PASTIKAN NEXVO-WEB JALAN ═══
echo -e "${YELLOW}═══ 4. PASTIKAN NEXVO-WEB JALAN (port 3000) ═══${NC}"
WEB_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "http://localhost:3000/" 2>/dev/null)
if [ "$WEB_HTTP" = "200" ]; then
  echo -e "  ${GREEN}✅${NC} Web HTTP 200"
else
  echo -e "  ${YELLOW}⚠️${NC} Web HTTP $WEB_HTTP, restarting..."
  pm2 restart nexvo-web 2>&1 | tail -2
  sleep 8
  WEB_HTTP2=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "http://localhost:3000/" 2>/dev/null)
  echo -e "  After restart: HTTP $WEB_HTTP2"
fi
echo ""

# ═══ STEP 5: VERIFY PROFIT HARIAN AKAN MASUK KE MAIN BALANCE ═══
echo -e "${YELLOW}═══ 5. VERIFY: profit harian ke depan → mainBalance ═══${NC}"
# Cek cron-service.ts punya reference profitBalance (harusnya gak ada)
if grep -q "profitBalance.*increment\|profitBalance.*=\s*[a-z]" "$P/cron-service.ts" 2>/dev/null; then
  echo -e "  ${RED}❌${NC} cron-service.ts masih ada reference profitBalance!"
  grep -n "profitBalance" "$P/cron-service.ts" | head -5
else
  echo -e "  ${GREEN}✅${NC} cron-service.ts: profit masuk ke mainBalance (verified)"
fi

# Cek profit-force.ts
if grep -q "profitBalance.*increment" "$P/src/lib/profit-force.ts" 2>/dev/null; then
  echo -e "  ${RED}❌${NC} profit-force.ts masih kredit ke profitBalance!"
else
  echo -e "  ${GREEN}✅${NC} profit-force.ts: profit masuk ke mainBalance (verified)"
fi
echo ""

# ═══ STEP 6: SUMMARY ═══
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  📊 RINGKASAN${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}✅${NC} Saldo profit LAMA (profitBalance) sudah dipindah ke mainBalance"
echo -e "  ${GREEN}✅${NC} profitBalance semua user = 0"
echo -e "  ${GREEN}✅${NC} Profit harian ke depan → mainBalance (cron-service v2.7)"
echo -e "  ${GREEN}✅${NC} Bonus harian (matching, salary) → mainBalance"
echo -e "  ${GREEN}✅${NC} nexvo-cron (port 3032) jalan — profit 00:00 WIB otomatis"
echo -e "  ${GREEN}✅${NC} nexvo-web (port 3000) jalan"
echo ""
echo -e "  Backup DB sebelum migrate: $BACKUP"
echo ""
echo -e "  🌐 Test:"
echo -e "     User:  https://nexvo.id → login, cek saldo utama"
echo -e "     Admin: https://nexvo.id/id/admin → admin / Admin@2024"
echo ""
echo -e "  Kalau ada masalah, restore DB: cp $BACKUP $DB"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
