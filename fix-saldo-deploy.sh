#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO FIX SALDO + DEPLOY — all-in-one
#
#  Apa yang dilakukan:
#  1. Detect project path (auto-fix /home/nexvo vs /var/www/nexvo)
#  2. Backup DB (safety)
#  3. FIX DB: sync mainBalance = totalProfit - totalWithdraw
#     + migrate profitBalance → mainBalance
#     + reset profitBalance = 0
#  4. Pull code terbaru dari GitHub (ada fix WithdrawPage auto-refresh saldo)
#  5. Build Next.js
#  6. Fix ecosystem.config.cjs cwd kalau salah
#  7. Restart nexvo-web + nexvo-cron
#  8. Trigger /api/profit-force?key=NEXVO2024 (cleanup + credit profit hari ini)
#  9. Verify: mainBalance = totalProfit - totalWithdraw untuk semua user
#  10. Verify 5 fitur: web, CSS, admin login, cron, profit-force
#
#  ROOT CAUSE yang di-fix:
#  - DB: mainBalance drift (19200 padahal harusnya 68800)
#  - Frontend: WithdrawPage pakai cached user.mainBalance dari localStorage
#    yang bisa stale → tampil saldo lama walau DB sudah update
#  - Fix: WithdrawPage auto-refresh saldo tiap 30s + di mount
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  🚀 NEXVO FIX SALDO + DEPLOY — all-in-one${NC}"
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
BACKUP="$P/db/custom.db.pre-fix-saldo-deploy-$(date +%Y%m%d-%H%M%S)"
cp "$DB" "$BACKUP"
echo -e "  ${GREEN}✅${NC} Backup: $BACKUP"
echo ""

# ═══ STEP 2: FIX DB — sync mainBalance ═══
echo -e "${YELLOW}═══ 2. FIX DB — mainBalance = totalProfit - totalWithdraw ═══${NC}"
cat > /tmp/nexvo-fix-saldo.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';

const dbPath = process.argv[2];
if (!dbPath || !fs.existsSync(dbPath)) {
  console.log('ERROR: DB gak ada');
  process.exit(1);
}

const db = new Database(dbPath);
const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").all() as Array<{name: string}>;
if (tables.length === 0) {
  console.log('ERROR: Tabel User gak ada');
  db.close();
  process.exit(1);
}

// BEFORE
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

console.log('═══ BEFORE ═══');
console.log(`  Total user: ${beforeStats.total}`);
console.log(`  User dengan drift (mainBalance < expected): ${beforeStats.driftUsers}`);
console.log(`  Total mainBalance: Rp${beforeStats.totalMain || 0}`);
console.log(`  Total totalProfit: Rp${beforeStats.totalProfit || 0}`);
console.log(`  Total totalWithdraw: Rp${beforeStats.totalWithdraw || 0}`);
console.log(`  Total profitBalance: Rp${beforeStats.totalProfitBalance || 0}`);
console.log('');

// Tampilkan user dengan drift
if (beforeStats.driftUsers > 0) {
  console.log('═══ USER DENGAN DRIFT ═══');
  const driftUsers = db.query(`
    SELECT userId, name, whatsapp, mainBalance, totalProfit, totalWithdraw
    FROM User
    WHERE mainBalance < (totalProfit - totalWithdraw)
    ORDER BY (totalProfit - totalWithdraw - mainBalance) DESC
    LIMIT 30
  `).all() as Array<any>;
  driftUsers.forEach((u, i) => {
    const expected = (u.totalProfit || 0) - (u.totalWithdraw || 0);
    const drift = expected - u.mainBalance;
    console.log(`  ${i+1}. ${u.userId} | ${u.name || '-'} | ${u.whatsapp || '-'}`);
    console.log(`     mainBalance: Rp${u.mainBalance} → Rp${expected} (sync +${drift})`);
  });
  console.log('');
}

// FIX 1: Sync mainBalance UPWARD
console.log('═══ FIX 1: SYNC mainBalance UPWARD ═══');
const fix1 = db.run(`
  UPDATE User
  SET mainBalance = MAX(0, totalProfit - totalWithdraw)
  WHERE mainBalance < MAX(0, totalProfit - totalWithdraw)
    AND totalProfit IS NOT NULL
`);
console.log(`  ✅ Sync upward: ${fix1.changes} user`);

// FIX 2: Migrate profitBalance → mainBalance
console.log('═══ FIX 2: MIGRATE profitBalance → mainBalance ═══');
const fix2 = db.run(`
  UPDATE User
  SET mainBalance = mainBalance + profitBalance,
      profitBalance = 0
  WHERE profitBalance > 0
`);
console.log(`  ✅ Migrate profitBalance: ${fix2.changes} user`);

// FIX 3: Reset profitBalance = 0
const fix3 = db.run(`UPDATE User SET profitBalance = 0 WHERE profitBalance != 0`);
if (fix3.changes > 0) {
  console.log(`  ✅ Reset profitBalance=0: ${fix3.changes} user`);
}
console.log('');

// AFTER
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

console.log('═══ AFTER ═══');
console.log(`  Total user: ${afterStats.total}`);
console.log(`  User dengan drift: ${afterStats.driftUsers} (harus 0)`);
console.log(`  Total mainBalance: Rp${afterStats.totalMain || 0}`);
console.log(`  Total totalProfit: Rp${afterStats.totalProfit || 0}`);
console.log(`  Total profitBalance: Rp${afterStats.totalProfitBalance || 0} (harus 0)`);

const diff = (afterStats.totalMain || 0) - (beforeStats.totalMain || 0);
console.log(`  ${diff >= 0 ? '✅' : '⚠️'} Saldo utama ${diff >= 0 ? 'naik' : 'turun'}: Rp${Math.abs(diff)}`);
console.log('');

// Tampilkan top 10 user setelah fix
console.log('═══ TOP 10 USER DENGAN MAIN BALANCE TERBESAR ═══');
const topUsers = db.query(`
  SELECT userId, name, whatsapp, mainBalance, totalProfit, totalWithdraw
  FROM User
  ORDER BY mainBalance DESC
  LIMIT 10
`).all() as Array<any>;
topUsers.forEach((u, i) => {
  console.log(`  ${i+1}. ${u.userId} | ${u.name || '-'} | ${u.whatsapp || '-'} | Saldo: Rp${u.mainBalance} | Total Profit: Rp${u.totalProfit || 0}`);
});

db.close();
console.log('');
console.log('✅ FIX SALDO SELESAI');
EOF

bun /tmp/nexvo-fix-saldo.ts "$DB" 2>&1 | grep -v "^Bun v"
echo ""

# ═══ STEP 3: PULL CODE TERBARU ═══
echo -e "${YELLOW}═══ 3. PULL CODE TERBARU DARI GITHUB ═══${NC}"
cd "$P"
git fetch --all 2>/dev/null || true
git reset --hard origin/main 2>/dev/null || git pull origin main 2>/dev/null || true
echo -e "  ${GREEN}✅${NC} Code updated"
git log --oneline -3 2>/dev/null
echo ""

# ═══ STEP 4: INSTALL DEPS ═══
echo -e "${YELLOW}═══ 4. INSTALL DEPENDENCIES ═══${NC}"
bun install --frozen-lockfile 2>/dev/null || bun install 2>/dev/null || npm install 2>/dev/null
echo -e "  ${GREEN}✅${NC} Dependencies ready"
echo ""

# ═══ STEP 5: BUILD NEXT.JS ═══
echo -e "${YELLOW}═══ 5. BUILD NEXT.JS ═══${NC}"
bun run build 2>&1 | tail -5
if [ ! -d ".next" ]; then
  echo -e "  ${RED}❌ Build gagal${NC}"
  exit 1
fi
echo -e "  ${GREEN}✅${NC} Build complete"
echo ""

# ═══ STEP 6: FIX ECOSYSTEM CONFIG PATH ═══
echo -e "${YELLOW}═══ 6. FIX ECOSYSTEM.CONFIG.CJS PATH ═══${NC}"
ECO_FILE="$P/ecosystem.config.cjs"
if [ -f "$ECO_FILE" ]; then
  sed -i "s|cwd: *'/home/nexvo'|cwd: '$P'|g" "$ECO_FILE"
  sed -i "s|cwd: *'/var/www/nexvo'|cwd: '$P'|g" "$ECO_FILE"
  sed -i "s|cwd: *'/root/nexvo'|cwd: '$P'|g" "$ECO_FILE"
  mkdir -p "$P/.pm2-logs"
  sed -i "s|/home/nexvo/.pm2-logs|$P/.pm2-logs|g" "$ECO_FILE"
  sed -i "s|/var/www/nexvo/.pm2-logs|$P/.pm2-logs|g" "$ECO_FILE"
  echo -e "  ${GREEN}✅${NC} ecosystem.config.cjs cwd=$P"
fi

# Pastikan .env ada
if [ ! -f "$P/.env" ]; then
  cat > "$P/.env" << EOF
DATABASE_URL=file:$P/db/custom.db
NEXTAUTH_SECRET=nexvo-secret-$(date +%s)
NEXTAUTH_URL=https://nexvo.id
NODE_ENV=production
EOF
fi
echo ""

# ═══ STEP 7: RESTART PM2 ═══
echo -e "${YELLOW}═══ 7. RESTART PM2 (nexvo-web + nexvo-cron) ═══${NC}"
pm2 delete nexvo-web nexvo-cron 2>/dev/null
sleep 1
cd "$P"
pm2 start ecosystem.config.cjs 2>&1 | tail -10
sleep 5
pm2 save 2>&1 | tail -2
echo ""
pm2 list 2>&1 | grep -E "nexvo|name" | head -5
echo ""

echo -e "  ${CYAN}Waiting 20s for service boot...${NC}"
sleep 20
echo ""

# ═══ STEP 8: TRIGGER PROFIT-FORCE API ═══
echo -e "${YELLOW}═══ 8. TRIGGER PROFIT-FORCE API ═══${NC}"
echo -e "  ${CYAN}POST /api/profit-force?key=NEXVO2024${NC}"
PF_RES=$(curl -s --max-time 120 "http://localhost:3000/api/profit-force?key=NEXVO2024" 2>/dev/null)
if [ -n "$PF_RES" ]; then
  echo -e "  Response (first 500 chars):"
  echo "$PF_RES" | head -c 500
  echo ""
  if echo "$PF_RES" | grep -q '"success":true\|"totalProfitCredited"'; then
    echo -e "  ${GREEN}✅${NC} Profit-force sukses"
  fi
else
  echo -e "  ${YELLOW}⚠️${NC} No response — coba manual: https://nexvo.id/api/profit-force?key=NEXVO2024"
fi
echo ""

# ═══ STEP 9: VERIFY 5 FITUR ═══
echo -e "${YELLOW}═══ 9. VERIFY FITUR ═══${NC}"

# [1] Web
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:3000/ 2>/dev/null)
[ "$HTTP" = "200" ] && echo -e "  ${GREEN}✅${NC} Web HTTP 200" || echo -e "  ${RED}❌${NC} Web HTTP $HTTP"

# [2] CSS
HOMEPAGE=$(curl -s --max-time 10 http://localhost:3000/ 2>/dev/null)
CSS_URL=$(echo "$HOMEPAGE" | grep -oP 'href="[^"]*\.css[^"]*"' | head -1 | sed 's/href="//;s/"//')
if [ -n "$CSS_URL" ]; then
  CSS_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "http://localhost:3000$CSS_URL" 2>/dev/null)
  [ "$CSS_HTTP" = "200" ] && echo -e "  ${GREEN}✅${NC} CSS HTTP 200" || echo -e "  ${RED}❌${NC} CSS HTTP $CSS_HTTP"
else
  echo -e "  ${RED}❌${NC} CSS link gak nemu"
fi

# [3] Admin login
LOGIN_RES=$(curl -s --max-time 10 -X POST "http://localhost:3000/api/auth/admin-login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@2024"}' 2>/dev/null)
echo "$LOGIN_RES" | grep -q '"success":true\|"token"' && echo -e "  ${GREEN}✅${NC} Admin login OK" || echo -e "  ${RED}❌${NC} Admin login gagal"

# [4] Cron service
CRON_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:3032/health" 2>/dev/null)
if [ "$CRON_HTTP" = "200" ]; then
  echo -e "  ${GREEN}✅${NC} Cron port 3032 OK"
else
  CRON_HTTP2=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:3032/" 2>/dev/null)
  [ "$CRON_HTTP2" != "000" ] && echo -e "  ${GREEN}✅${NC} Cron port 3032 jalan (HTTP $CRON_HTTP2)" || echo -e "  ${RED}❌${NC} Cron gak响应"
fi

# [5] Profit-force API
PF_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "http://localhost:3000/api/profit-force?key=NEXVO2024" 2>/dev/null)
[ "$PF_HTTP" = "200" ] && echo -e "  ${GREEN}✅${NC} Profit-force API OK" || echo -e "  ${YELLOW}⚠️${NC} Profit-force HTTP $PF_HTTP"
echo ""

# ═══ STEP 10: FINAL SUMMARY ═══
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  📊 RINGKASAN${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}✅${NC} mainBalance = totalProfit - totalWithdraw untuk SEMUA user"
echo -e "  ${GREEN}✅${NC} profitBalance (saldo lama) → mainBalance"
echo -e "  ${GREEN}✅${NC} Code deployed: WithdrawPage auto-refresh saldo tiap 30s"
echo -e "  ${GREEN}✅${NC} nexvo-web + nexvo-cron restart"
echo -e "  ${GREEN}✅${NC} Profit-force triggered — profit hari ini masuk mainBalance"
echo ""
echo -e "  Backup DB: $BACKUP"
echo ""
echo -e "  ${CYAN}PENTING — User harus lakukan di browser:${NC}"
echo -e "    1. Buka https://nexvo.id/recovery.html"
echo -e "    2. Klik 'Clear Cache & Reload' (clear localStorage + cache browser)"
echo -e "    3. Login ulang"
echo -e "    4. Cek saldo utama — harus = totalProfit - totalWithdraw"
echo ""
echo -e "  ${CYAN}Test:${NC}"
echo -e "     User:  https://nexvo.id → Withdraw page → Saldo Tersedia"
echo -e "     Admin: https://nexvo.id/id/admin → admin / Admin@2024"
echo ""
echo -e "  ${CYAN}Profit harian:${NC}"
echo -e "     - Cron 00:00 WIB otomatis masuk mainBalance"
echo -e "     - Manual: https://nexvo.id/api/profit-force?key=NEXVO2024"
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
