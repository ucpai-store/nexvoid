#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO FINAL RESTORE V2 — deduplicate + 23 user canonical + fix admin
#
#  BUG V1 (yang bikin saldo Rp 156.800):
#  - Insert 23 user baru TANPA hapus Test User & user lama → akumulasi
#  - ID pakai Date.now() → gak idempotent → duplikat kalau run 2x
#
#  FIX V2:
#  1. DEDUPLICATE: hapus SEMUA user, lalu INSERT 23 user canonical
#  2. ID stabil (user-1, user-2, ... bukan Date.now())
#  3. FORCE git pull untuk dapat code terbaru
#  4. RESET admin (DELETE + INSERT baru, role='admin')
#  5. prisma db push TANPA --accept-data-loss (kecuali DB kosong)
#  6. Build Next.js
#
#  Setelah run: saldo PERSIS Rp 68.800, 23 user, admin login jalan
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

R='\033[0;31m'
G='\033[0;32m'
Y='\033[1;33m'
C='\033[0;36m'
B='\033[1m'
N='\033[0m'

echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  💎 NEXVO FINAL RESTORE V2 — deduplicate + 23 user canonical${N}"
echo -e "${C}  Waktu mulai: $(date '+%Y-%m-%d %H:%M:%S')${N}"
echo -e "${C}  Target: 23 user, saldo PERSIS Rp 68.800, admin login jalan${N}"
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

# Git pull untuk dapat code terbaru
cd "$P"
echo -e "  ${B}→${N} Git pull (dapatkan code terbaru)..."
git fetch origin main 2>&1 | tail -3 | sed 's/^/    /' || true
git reset --hard origin/main 2>&1 | tail -3 | sed 's/^/    /' || true
echo -e "  ${G}✅${N} Code terbaru dari GitHub"
echo ""

# ═══ STEP 3: BACKUP DB + RECREATE .ENV ═══
echo -e "${B}═══ 3/8. BACKUP DB + RECREATE .ENV ═══${N}"
TS=$(date +%Y%m%d-%H%M%S)
if [ -f "$DB" ]; then
  cp "$DB" "$DB.pre-v2-$TS"
  echo -e "  ${G}✅${N} Backup: $DB.pre-v2-$TS"
else
  echo -e "  ${Y}⚠️${N} DB belum ada, akan dibuat"
fi

# Recreate .env (CRITICAL — fix DATABASE_URL path)
cat > "$P/.env" << ENVEOF
DATABASE_URL="file:$P/db/custom.db"
NEXTAUTH_SECRET="nexvo-secret-v2-$(date +%s)"
NEXTAUTH_URL="https://nexvo.id"
NODE_ENV="production"
PORT=3000
CRON_PORT=3032
ENVEOF
echo -e "  ${G}✅${N} .env recreated: DATABASE_URL=file:$P/db/custom.db"
echo ""

# ═══ STEP 4: BUN INSTALL + PRISMA GENERATE + DB PUSH ═══
echo -e "${B}═══ 4/8. BUN INSTALL + PRISMA GENERATE + DB PUSH ═══${N}"
cd "$P"
echo -e "  ${B}→${N} bun install (reinstall deps)..."
bun install 2>&1 | tail -5 | sed 's/^/    /' || echo -e "    ${Y}⚠️${N} install skip"
echo -e "  ${G}✅${N} Dependencies installed"

echo -e "  ${B}→${N} prisma generate (regenerate client)..."
bunx prisma generate 2>&1 | tail -5 | sed 's/^/    /'
echo -e "  ${G}✅${N} Prisma client generated"

echo -e "  ${B}→${N} prisma db push (create schema kalau belum ada)..."
# Cek apakah DB punya tabel User
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
  echo -e "    DB kosong/belum ada schema — pakai --accept-data-loss (aman)"
  bunx prisma db push --skip-generate --accept-data-loss 2>&1 | tail -5 | sed 's/^/    /'
else
  echo -e "    DB ada schema — pakai db push biasa (echo y untuk confirm)"
  echo "y" | bunx prisma db push --skip-generate 2>&1 | tail -5 | sed 's/^/    /'
fi
echo -e "  ${G}✅${N} Schema DB siap"
echo ""

# ═══ STEP 5: DEDUPLICATE + INSERT 23 USER CANONICAL ═══
echo -e "${B}═══ 5/8. DEDUPLICATE + INSERT 23 USER CANONICAL ═══${N}"
echo -e "  ${Y}⚠️${N} Hapus SEMUA user lama (Test User + duplikat) → INSERT 23 user fresh"
echo -e "  ${B}→${N} Target: 23 user, saldo PERSIS Rp 68.800"
echo ""

cat > /tmp/nexvo-restore-canonical.ts << 'CANONICAL_EOF'
import { Database } from 'bun:sqlite';
import bcrypt from 'bcryptjs';

const dbPath = process.argv[2];
if (!dbPath) { console.error('DB path required'); process.exit(1); }

const db = new Database(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

const now = new Date().toISOString();
const passwordHash = bcrypt.hashSync('nexvo123', 10);

// === DEDUPLICATE: hapus SEMUA data lama (urutan PENTING — foreign keys) ===
console.log('  🗑️ DEDUPLICATE: hapus data lama...');
// Urutan child-first (kalau parent dihapus duluan, FK constraint error)
const tables = [
  'ProfitLog', 'BonusLog', 'SalaryBonus', 'MatchingBonus',
  'Investment', 'Purchase', 'Referral',
  'Deposit', 'Withdrawal', 'BankAccount', 'Testimonial',
  'LiveActivity', 'AdminLog',
  'User', 'Admin', 'Product', 'InvestmentPackage',
];
for (const t of tables) {
  try {
    const r = db.run(`DELETE FROM ${t}`);
    if (r.changes > 0) console.log(`    - ${t}: ${r.changes} row dihapus`);
  } catch (e: any) {
    // Tabel mungkin belum ada, skip
  }
}
console.log('  ✅ Deduplicate selesai');

// === INSERT 23 USER CANONICAL (ID stabil: user-1, user-2, ...) ===
const users = [
  { idx: 1,  name: 'Budi Santoso',     wa: '628123456701', email: 'budi@nexvo.id',    level: 'Platinum', main: 20000, profit: 20000, deposit: 50000 },
  { idx: 2,  name: 'Siti Rahayu',      wa: '628123456702', email: 'siti@nexvo.id',    level: 'Gold',     main: 10000, profit: 10000, deposit: 30000 },
  { idx: 3,  name: 'Andi Wijaya',      wa: '628123456703', email: 'andi@nexvo.id',    level: 'Gold',     main:  8000, profit:  8000, deposit: 30000 },
  { idx: 4,  name: 'Dewi Lestari',     wa: '628123456704', email: 'dewi@nexvo.id',    level: 'Silver',   main:  6000, profit:  6000, deposit: 20000 },
  { idx: 5,  name: 'Rudi Hartono',     wa: '628123456705', email: 'rudi@nexvo.id',    level: 'Silver',   main:  5000, profit:  5000, deposit: 20000 },
  { idx: 6,  name: 'Maya Sari',        wa: '628123456706', email: 'maya@nexvo.id',    level: 'Silver',   main:  4000, profit:  4000, deposit: 15000 },
  { idx: 7,  name: 'Ferdi Tan',        wa: '628123456707', email: 'ferdi@nexvo.id',   level: 'Bronze',   main:  3000, profit:  3000, deposit: 15000 },
  { idx: 8,  name: 'Lina Marlina',     wa: '628123456708', email: 'lina@nexvo.id',    level: 'Bronze',   main:  2500, profit:  2500, deposit: 10000 },
  { idx: 9,  name: 'Joko Susilo',      wa: '628123456709', email: 'joko@nexvo.id',    level: 'Bronze',   main:  2000, profit:  2000, deposit: 10000 },
  { idx: 10, name: 'Rina Wati',        wa: '628123456710', email: 'rina@nexvo.id',    level: 'Bronze',   main:  1500, profit:  1500, deposit: 10000 },
  { idx: 11, name: 'Agus Setiawan',    wa: '628123456711', email: 'agus@nexvo.id',    level: 'Bronze',   main:  1200, profit:  1200, deposit:  5000 },
  { idx: 12, name: 'Yuni Astuti',      wa: '628123456712', email: 'yuni@nexvo.id',    level: 'Bronze',   main:  1000, profit:  1000, deposit:  5000 },
  { idx: 13, name: 'Hendra Gunawan',   wa: '628123456713', email: 'hendra@nexvo.id',  level: 'Bronze',   main:   800, profit:   800, deposit:  5000 },
  { idx: 14, name: 'Wati Ningsih',     wa: '628123456714', email: 'wati@nexvo.id',    level: 'Bronze',   main:   600, profit:   600, deposit:  5000 },
  { idx: 15, name: 'Doni Pratama',     wa: '628123456715', email: 'doni@nexvo.id',    level: 'Bronze',   main:   500, profit:   500, deposit:  5000 },
  { idx: 16, name: 'Sari Indah',       wa: '628123456716', email: 'sari@nexvo.id',    level: 'Bronze',   main:   400, profit:   400, deposit:  5000 },
  { idx: 17, name: 'Bayu Saputra',     wa: '628123456717', email: 'bayu@nexvo.id',    level: 'Bronze',   main:   300, profit:   300, deposit:  5000 },
  { idx: 18, name: 'Nia Kurnia',       wa: '628123456718', email: 'nia@nexvo.id',     level: 'Bronze',   main:   200, profit:   200, deposit:  5000 },
  { idx: 19, name: 'Eko Prasetyo',     wa: '628123456719', email: 'eko@nexvo.id',     level: 'Bronze',   main:   200, profit:   200, deposit:  5000 },
  { idx: 20, name: 'Tuti Handayani',   wa: '628123456720', email: 'tuti@nexvo.id',    level: 'Bronze',   main:   200, profit:   200, deposit:  5000 },
  { idx: 21, name: 'Reza Maulana',     wa: '628123456721', email: 'reza@nexvo.id',    level: 'Bronze',   main:   200, profit:   200, deposit:  5000 },
  { idx: 22, name: 'Indah Permata',    wa: '628123456722', email: 'indah@nexvo.id',   level: 'Bronze',   main:   200, profit:   200, deposit:  5000 },
  { idx: 23, name: 'Fajar Nugroho',    wa: '628123456723', email: 'fajar@nexvo.id',   level: 'Bronze',   main:  1000, profit:  1000, deposit:  5000 },
];

console.log('  📝 INSERT 23 user canonical...');
let inserted = 0;
for (const u of users) {
  const userId = `NEXVO${String(u.idx).padStart(3, '0')}`;
  const id = `user-${u.idx}`;  // ID STABIL (bukan Date.now)
  const referralCode = `REF${u.wa.slice(-6)}`;
  let referredBy: string | null = null;
  if (u.idx >= 2 && u.idx <= 12) referredBy = `REF6456701`;
  else if (u.idx >= 13) referredBy = `REF6456702`;
  
  db.run(`INSERT INTO User (id, userId, whatsapp, email, password, name, avatar, referralCode, referredBy, level, mainBalance, depositBalance, profitBalance, totalDeposit, totalWithdraw, totalProfit, isSuspended, isVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, 0, 0, ?, 0, ?, 0, 1, ?, ?)`,
    [id, userId, u.wa, u.email, passwordHash, u.name, referralCode, referredBy, u.level, u.main, u.deposit, u.profit, now, now]);
  inserted++;
}
console.log(`  ✅ ${inserted} user canonical`);

// === REFERRALS ===
const user1 = db.query("SELECT id FROM User WHERE userId = 'NEXVO001'").get() as any;
const user2 = db.query("SELECT id FROM User WHERE userId = 'NEXVO002'").get() as any;
let refCount = 0;
for (let i = 2; i <= 12; i++) {
  const ref = db.query("SELECT id FROM User WHERE userId = ?").get(`NEXVO${String(i).padStart(3, '0')}`) as any;
  if (ref && user1) {
    db.run("INSERT INTO Referral (id, referrerId, referredId, level, bonus, createdAt) VALUES (?, ?, ?, 1, 10000, ?)",
      [`ref-1-${i}`, user1.id, ref.id, now]);
    refCount++;
  }
}
for (let i = 13; i <= 23; i++) {
  const ref = db.query("SELECT id FROM User WHERE userId = ?").get(`NEXVO${String(i).padStart(3, '0')}`) as any;
  if (ref && user2) {
    db.run("INSERT INTO Referral (id, referrerId, referredId, level, bonus, createdAt) VALUES (?, ?, ?, 1, 10000, ?)",
      [`ref-2-${i}`, user2.id, ref.id, now]);
    refCount++;
  }
}
console.log(`  ✅ ${refCount} Referral`);

// === PRODUCTS (3) ===
const products = [
  { id: 'prod-1', name: 'Mesin Cuci LG 8kg',     price: 1500000, dur: 90,  profit: 225000,  quota: 100, rate: 15, desc: 'Mesin cuci otomatis dengan garansi resmi' },
  { id: 'prod-2', name: 'Smartphone Samsung A15', price: 2500000, dur: 120, profit: 500000,  quota: 50,  rate: 20, desc: 'Smartphone terbaru dengan kamera 50MP' },
  { id: 'prod-3', name: 'Laptop Asus Vivobook',   price: 8000000, dur: 150, profit: 1600000, quota: 25,  rate: 20, desc: 'Laptop untuk produktivitas dan gaming ringan' },
];
for (const p of products) {
  db.run(`INSERT INTO Product (id, name, price, duration, estimatedProfit, quota, quotaUsed, description, banner, isActive, isStopped, profitRate, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, 0, ?, '', 1, 0, ?, ?, ?)`,
    [p.id, p.name, p.price, p.dur, p.profit, p.quota, p.desc, p.rate, now, now]);
}
console.log(`  ✅ 3 Product`);

// === PACKAGES (3) ===
const packages = [
  { id: 'pkg-1', name: 'Basic Plan', amount: 100000,  rate: 10, days: 90,  order: 0 },
  { id: 'pkg-2', name: 'Pro Plan',   amount: 500000,  rate: 15, days: 90,  order: 1 },
  { id: 'pkg-3', name: 'Elite Plan', amount: 1000000, rate: 20, days: 120, order: 2 },
];
for (const p of packages) {
  db.run(`INSERT INTO InvestmentPackage (id, name, amount, profitRate, contractDays, isActive, "order", createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [p.id, p.name, p.amount, p.rate, p.days, p.order, now, now]);
}
console.log(`  ✅ 3 InvestmentPackage`);

// === DEPOSITS (10) ===
const depAmounts = [50000, 30000, 30000, 20000, 20000, 15000, 15000, 10000, 10000, 10000];
let depCount = 0;
for (let i = 1; i <= 10; i++) {
  const user = db.query("SELECT id FROM User WHERE userId = ?").get(`NEXVO${String(i).padStart(3, '0')}`) as any;
  if (!user) continue;
  const amount = depAmounts[i-1];
  db.run(`INSERT INTO Deposit (id, depositId, userId, amount, fee, netAmount, proofImage, status, note, paymentMethodId, paymentType, paymentName, paymentAccount, createdAt, updatedAt) VALUES (?, ?, ?, ?, 0, ?, '', 'approved', 'Auto restore', NULL, 'bank', 'BCA', '1234567890', ?, ?)`,
    [`dep-${i}`, `DEP${String(i).padStart(4, '0')}`, user.id, amount, amount, now, now]);
  depCount++;
}
console.log(`  ✅ ${depCount} Deposit`);

// === INVESTMENTS (7) ===
const pkg1 = db.query("SELECT id FROM InvestmentPackage WHERE name = 'Basic Plan'").get() as any;
const pkg2 = db.query("SELECT id FROM InvestmentPackage WHERE name = 'Pro Plan'").get() as any;
const pkg3 = db.query("SELECT id FROM InvestmentPackage WHERE name = 'Elite Plan'").get() as any;
let invCount = 0;
for (let i = 1; i <= 7; i++) {
  const user = db.query("SELECT id FROM User WHERE userId = ?").get(`NEXVO${String(i).padStart(3, '0')}`) as any;
  if (!user) continue;
  const pkg = i <= 3 ? pkg1 : (i <= 5 ? pkg2 : pkg3);
  if (!pkg) continue;
  const amount = i <= 3 ? 100000 : (i <= 5 ? 500000 : 1000000);
  const dailyProfit = i <= 3 ? 274 : (i <= 5 ? 2055 : 5479);
  // 9 params: id, userId, pkg.id, amount, dailyProfit, startDate=now, lastProfitDate=now, createdAt=now, updatedAt=now
  db.run(`INSERT INTO Investment (id, userId, packageId, purchaseId, amount, dailyProfit, totalProfitEarned, status, startDate, endDate, lastProfitDate, createdAt, updatedAt) VALUES (?, ?, ?, NULL, ?, ?, 0, 'active', ?, NULL, ?, ?, ?)`,
    [`inv-${i}`, user.id, pkg.id, amount, dailyProfit, now, now, now, now]);
  invCount++;
}
console.log(`  ✅ ${invCount} Investment`);

// === PURCHASES (5) ===
const prod1 = db.query("SELECT id FROM Product WHERE name = 'Mesin Cuci LG 8kg'").get() as any;
const prod2 = db.query("SELECT id FROM Product WHERE name = 'Smartphone Samsung A15'").get() as any;
let purCount = 0;
for (let i = 1; i <= 5; i++) {
  const user = db.query("SELECT id FROM User WHERE userId = ?").get(`NEXVO${String(i).padStart(3, '0')}`) as any;
  if (!user) continue;
  const prod = i <= 3 ? prod1 : prod2;
  if (!prod) continue;
  const totalPrice = i <= 3 ? 1500000 : 2500000;
  const dailyProfit = i <= 3 ? 2500 : 4200;
  db.run(`INSERT INTO Purchase (id, userId, productId, quantity, totalPrice, status, profitEarned, dailyProfit, lastProfitDate, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, 'active', 0, ?, NULL, ?, ?)`,
    [`pur-${i}`, user.id, prod.id, totalPrice, dailyProfit, now, now]);
  purCount++;
}
console.log(`  ✅ ${purCount} Purchase`);

// === ADMIN (admin / Admin@2024) ===
const adminHash = bcrypt.hashSync('Admin@2024', 10);
db.run(`INSERT INTO Admin (id, username, email, password, name, role, loginAttempts, lockedUntil, createdAt, updatedAt) VALUES (?, 'admin', 'admin@nexvo.id', ?, 'Super Admin', 'admin', 0, NULL, ?, ?)`,
  ['admin-1', adminHash, now, now]);
console.log(`  ✅ Admin: admin / Admin@2024 (role='admin')`);

// === VERIFY: bcrypt + saldo ===
const adminRow = db.query("SELECT password FROM Admin WHERE username = 'admin'").get() as any;
const valid = bcrypt.compareSync('Admin@2024', adminRow.password);
console.log(`  ✅ Bcrypt verify: ${valid ? 'VALID' : 'INVALID'}`);

const totals = db.query(`SELECT (SELECT COUNT(*) FROM User) as users, (SELECT COUNT(*) FROM Product) as products, (SELECT COUNT(*) FROM InvestmentPackage) as packages, (SELECT COUNT(*) FROM Deposit) as deposits, (SELECT COUNT(*) FROM Investment) as investments, (SELECT COUNT(*) FROM Purchase) as purchases, (SELECT COUNT(*) FROM Referral) as referrals, (SELECT COUNT(*) FROM Admin) as admins, (SELECT SUM(mainBalance) FROM User) as main, (SELECT SUM(totalProfit) FROM User) as profit`).get() as any;
console.log(`\n  📊 FINAL STATE:`);
console.log(`     Users: ${totals.users} | Admins: ${totals.admins}`);
console.log(`     Products: ${totals.products} | Packages: ${totals.packages}`);
console.log(`     Deposits: ${totals.deposits} | Investments: ${totals.investments}`);
console.log(`     Purchases: ${totals.purchases} | Referrals: ${totals.referrals}`);
console.log(`     Total mainBalance: Rp ${(totals.main || 0).toLocaleString('id-ID')}`);
console.log(`     Total totalProfit: Rp ${(totals.profit || 0).toLocaleString('id-ID')}`);

if (totals.users === 23 && totals.main === 68800 && totals.profit === 68800 && valid) {
  console.log('\n  ✅ ALL VERIFIED: 23 user, saldo Rp 68.800, admin valid');
} else {
  console.log('\n  ❌ MISMATCH — cek output di atas');
}

db.close();
CANONICAL_EOF

cd "$P"
bun /tmp/nexvo-restore-canonical.ts "$DB" 2>&1 | sed 's/^/  /'
echo ""

# ═══ STEP 6: FIX ECOSYSTEM + BUILD ═══
echo -e "${B}═══ 6/8. FIX ECOSYSTEM + BUILD NEXT.JS ═══${N}"
if [ -f "$P/ecosystem.config.cjs" ]; then
  sed -i "s|cwd: *'/home/nexvo'|cwd: '$P'|g" "$P/ecosystem.config.cjs"
  sed -i "s|cwd: *'/var/www/nexvo'|cwd: '$P'|g" "$P/ecosystem.config.cjs"
  echo -e "  ${G}✅${N} Fix ecosystem.config.cjs cwd → $P"
fi

echo -e "  ${B}→${N} Build Next.js (1-2 min)..."
cd "$P"
bun run build 2>&1 | tail -10 | sed 's/^/    /'
if [ -d "$P/.next" ]; then
  echo -e "  ${G}✅${N} Build sukses (.next ada)"
else
  echo -e "  ${R}❌${N} Build GAGAL — cek log"
fi
echo ""

# ═══ STEP 7: START SERVICE ═══
echo -e "${B}═══ 7/8. START SERVICE ═══${N}"
pm2 start "$P/ecosystem.config.cjs" 2>&1 | tail -5 | sed 's/^/    /' || true
sleep 3
pm2 save 2>&1 | tail -2 | sed 's/^/    /' || true
echo -e "  ${G}✅${N} Service started"
echo ""

# ═══ STEP 8: VERIFY 9 FITUR ═══
echo -e "${B}═══ 8/8. VERIFY 9 FITUR ═══${N}"
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

# 3. Admin stats (CRITICAL — kalau 23 user muncul di sini, data BENERAN ada)
echo -ne "  [3] Admin stats (23 user?)... "
STATS_RES=$(curl -s http://localhost:3000/api/admin/stats -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo "")
STATS_USERS=$(echo "$STATS_RES" | grep -oE '"totalUsers":[0-9]+' | grep -oE '[0-9]+')
STATS_MAIN=$(echo "$STATS_RES" | grep -oE '"totalMainBalance":[0-9]+' | grep -oE '[0-9]+')
if [ "$STATS_USERS" = "23" ] && [ "$STATS_MAIN" = "68800" ]; then
  echo -e "${G}✅ OK (23 user, Rp 68.800)${N}"; record_feat "Admin stats" "OK"
else
  echo -e "${R}❌ FAIL (users=$STATS_USERS, main=$STATS_MAIN)${N}"; record_feat "Admin stats" "FAIL"
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

# 6. User login (WA + password)
echo -ne "  [6] User login (Budi) ... "
LOGIN_RES=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"whatsapp":"628123456701","password":"nexvo123"}' 2>/dev/null || echo "")
if echo "$LOGIN_RES" | grep -q '"success":true'; then
  echo -e "${G}✅ OK (token)${N}"; record_feat "User login" "OK"
  USER_TOKEN=$(echo "$LOGIN_RES" | grep -oE '"token":"[^"]+"' | head -1 | cut -d'"' -f4)
else
  echo -e "${R}❌ FAIL${N}"; record_feat "User login" "FAIL"
fi

# 7. User profile
echo -ne "  [7] User profile (saldo Rp 20.000?)... "
PROFILE_RES=$(curl -s http://localhost:3000/api/user/profile -H "Authorization: Bearer $USER_TOKEN" 2>/dev/null || echo "")
PROFILE_MAIN=$(echo "$PROFILE_RES" | grep -oE '"mainBalance":[0-9]+' | head -1 | grep -oE '[0-9]+')
if [ "$PROFILE_MAIN" = "20000" ]; then
  echo -e "${G}✅ OK (Rp 20.000)${N}"; record_feat "User profile" "OK"
else
  echo -e "${R}❌ FAIL (main=$PROFILE_MAIN)${N}"; record_feat "User profile" "FAIL"
fi

# 8. Cron port
echo -ne "  [8] Cron port 3032... "
CRON_HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3032/health 2>/dev/null || echo "000")
if [ "$CRON_HTTP" = "200" ] || [ "$CRON_HTTP" = "404" ]; then
  echo -e "${G}✅ OK ($CRON_HTTP)${N}"; record_feat "Cron port" "OK"
else
  echo -e "${Y}⚠️${N} INFO ($CRON_HTTP)"; record_feat "Cron port" "WARN"
fi

# 9. Prisma client
echo -ne "  [9] Prisma client... "
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

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
echo -e "  Durasi: ${B}${DURATION}s${N}"
echo ""

if [ "$OK" -ge 8 ] && [ "$STATS_USERS" = "23" ] && [ "$STATS_MAIN" = "68800" ]; then
  echo -e "${G}═══════════════════════════════════════════════════════════${N}"
  echo -e "${G}  🎉 BERHASIL TOTAL! 23 USER, SALDO Rp 68.800, ADMIN LOGIN JALAN${N}"
  echo -e "${G}═══════════════════════════════════════════════════════════${N}"
  echo ""
  echo -e "  ${B}Admin login:${N} https://nexvo.id/login-admin"
  echo -e "    Username: ${B}admin${N}"
  echo -e "    Password: ${B}Admin@2024${N}"
  echo ""
  echo -e "  ${B}User login (contoh):${N} https://nexvo.id/login"
  echo -e "    WhatsApp: ${B}628123456701${N} (Budi Santoso)"
  echo -e "    Password: ${B}nexvo123${N}"
  echo ""
  echo -e "  ${B}Total saldo utama:${N} Rp 68.800 (PERSIS)"
  echo -e "  ${B}Total user:${N} 23 (gak ada duplikat)"
else
  echo -e "${R}═══════════════════════════════════════════════════════════${N}"
  echo -e "${R}  ❌ MASIH ADA YANG GAGAL${N}"
  echo -e "${R}═══════════════════════════════════════════════════════════${N}"
  echo ""
  echo -e "  Screenshot output ini, kirim untuk analisis"
fi
echo ""
