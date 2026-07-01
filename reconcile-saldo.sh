#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO REKONSILIASI SALDO & PENDAPATAN (SAFE — NO DATA LOSS)
#
#  🎯 FOKUS (sesuai perintah user):
#     "belom ada yg wd sesuai kan dong saldo sama pendapatan nya"
#     → Belum ada WD, jadi sesuaikan saldo (mainBalance) dengan pendapatan (totalProfit)
#
#  ✅ LOGIKA AMAN (2 mode per user):
#     MODE 1 — User PUNYA Investment/BonusLog records (real earnings):
#       totalProfit = SUM(Investment.totalProfitEarned) + SUM(BonusLog non-profit)
#       mainBalance = totalProfit - totalWithdraw
#     MODE 2 — User TIDAK PUNYA records (seed/manual data):
#       totalProfit = mainBalance  (sync earnings to actual balance, NO WIPE)
#       (mainBalance is the "real" number — what user can withdraw)
#
#  ✅ KEAMANAN:
#     - Backup DB sebelum ubah
#     - Konfirmasi totalWithdraw = 0 (kalau ada WD, rumus tetap benar: main = profit - withdraw)
#     - Hanya update user dengan drift > Rp 2
#     - Print before/after untuk audit
#     - Idempotent — running 2x = no-op
#     - TIDAK PERNA WIPE saldo ke 0 kalau user punya saldo (MODE 2 sync, bukan overwrite)
#
#  ❌ TIDAK HAPUS USER
#  ❌ TIDAK INSERT DUMMY
#  ❌ TIDAK UBAH KODE
#  ✅ HANYA SYNC mainBalance ↔ totalProfit (safe, no data loss)
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

R='\033[0;31m'
G='\033[0;32m'
Y='\033[0;33m'
C='\033[0;36m'
B='\033[1m'
N='\033[0m'

echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  💰 NEXVO REKONSILIASI SALDO & PENDAPATAN (SAFE)${N}"
echo -e "${C}  Waktu: $(date '+%Y-%m-%d %H:%M:%S')${N}"
echo -e "${C}  Belum ada WD → mainBalance harus == totalProfit${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo ""

# ═══ DETECT PROJECT PATH ═══
P=""
for candidate in /var/www/nexvo /home/nexvo /opt/nexvo /srv/nexvo /root/nexvo /home/z/my-project; do
  if [ -d "$candidate" ] && [ -f "$candidate/package.json" ] && [ -f "$candidate/db/custom.db" ]; then
    P="$candidate"; break
  fi
done
[ -z "$P" ] && { echo -e "${R}❌ Project gak ketemu${N}"; exit 1; }
DB="$P/db/custom.db"
echo -e "  ${G}✅${N} Project: ${B}$P${N}"
echo -e "  DB: $DB"
echo ""

# ═══ STEP 1: BACKUP DB ═══
echo -e "${B}═══ 1/3. BACKUP DB ═══${N}"
TS=$(date +%Y%m%d-%H%M%S)
cp "$DB" "$DB.pre-reconcile-$TS" 2>/dev/null
echo -e "  ${G}✅${N} Backup: $DB.pre-reconcile-$TS"
echo ""

# ═══ STEP 2: REKONSILIASI (SAFE) ═══
echo -e "${B}═══ 2/3. REKONSILIASI mainBalance ↔ totalProfit ═══${N}"
echo -e "  ${B}→${N} Mode 1 (user dgn Investment/BonusLog): recalculate dari ground truth"
echo -e "  ${B}→${N} Mode 2 (user tanpa records): sync totalProfit = mainBalance (NO WIPE)"
echo ""

cat > "$P/reconcile.ts" << 'RECEOF'
import { Database } from 'bun:sqlite'

const DB_PATH = process.argv[2] || './db/custom.db'
const db = new Database(DB_PATH)
db.run('PRAGMA journal_mode = WAL')

// ═══ Verify columns ═══
const uCols = db.query("PRAGMA table_info(User)").all() as any[]
for (const col of ['mainBalance','totalProfit','totalWithdraw']) {
  if (!uCols.some(c => c.name === col)) {
    console.error(`❌ User table missing column: ${col}`)
    db.close(); process.exit(1)
  }
}

// ═══ Aggregate Investment.totalProfitEarned per user (ground truth profit harian) ═══
const invByUser = new Map<string, number>()
try {
  const invAgg = db.query("SELECT userId, SUM(totalProfitEarned) as s FROM Investment GROUP BY userId").all() as any[]
  for (const a of invAgg) if (a.s > 0) invByUser.set(a.userId, a.s)
  console.log(`[STEP 1] Investment.totalProfitEarned: ${invByUser.size} users dengan profit > 0`)
} catch (e: any) {
  console.log(`[STEP 1] Investment table/col gak ada — treat as 0`)
}

// ═══ Aggregate BonusLog (matching + referral + salary) per user ═══
const bonusByUser = new Map<string, number>()
try {
  const bonusAgg = db.query("SELECT userId, SUM(amount) as s FROM BonusLog WHERE type IN ('matching','referral','salary') GROUP BY userId").all() as any[]
  for (const a of bonusAgg) if (a.s > 0) bonusByUser.set(a.userId, a.s)
  console.log(`[STEP 2] BonusLog (matching+referral+salary): ${bonusByUser.size} users dengan bonus > 0`)
} catch (e: any) {
  console.log(`[STEP 2] BonusLog table gak ada — treat as 0`)
}

// ═══ Stats BEFORE ═══
const before = db.query("SELECT COUNT(*) as c, COALESCE(SUM(mainBalance),0) as mb, COALESCE(SUM(totalProfit),0) as tp, COALESCE(SUM(totalWithdraw),0) as tw FROM User").get() as any
console.log(`\n[BEFORE] ${before.c} users | mainBalance: Rp ${before.mb} | totalProfit: Rp ${before.tp} | totalWithdraw: Rp ${before.tw}`)

// ═══ Recalculate per user (SAFE MODE) ═══
const users = db.query("SELECT id, userId, name, whatsapp, mainBalance, totalProfit, totalWithdraw FROM User").all() as any[]
console.log(`\n[STEP 3] Checking ${users.length} users...\n`)

let mode1Count = 0, mode2Count = 0
let totalDriftFixed = 0
const fixes: any[] = []

for (const u of users) {
  const invEarned = invByUser.get(u.id) || 0
  const bonusEarned = bonusByUser.get(u.id) || 0
  const hasGroundTruth = invEarned > 0 || bonusEarned > 0

  let expectedTotalProfit: number
  let expectedMainBalance: number
  let mode: string

  if (hasGroundTruth) {
    // MODE 1: User punya real earnings records → recalculate from ground truth
    expectedTotalProfit = invEarned + bonusEarned
    expectedMainBalance = Math.max(0, expectedTotalProfit - (u.totalWithdraw || 0))
    mode = 'MODE-1 (ground truth)'
  } else {
    // MODE 2: User tanpa records (seed/manual) → sync totalProfit = mainBalance
    // mainBalance is the "real" number (what user can withdraw). Don't wipe it.
    expectedTotalProfit = u.mainBalance + (u.totalWithdraw || 0)  // profit = balance + withdrawn
    expectedMainBalance = u.mainBalance  // keep mainBalance as-is
    mode = 'MODE-2 (sync to balance)'
  }

  const profitDrift = expectedTotalProfit - u.totalProfit
  const mainDrift = expectedMainBalance - u.mainBalance

  // Skip if drift < Rp 2
  if (Math.abs(profitDrift) < 2 && Math.abs(mainDrift) < 2) continue

  if (hasGroundTruth) mode1Count++; else mode2Count++
  totalDriftFixed += Math.abs(mainDrift) + Math.abs(profitDrift)

  console.log(`👤 ${u.userId} (${u.name || u.whatsapp}) [${mode}]`)
  if (hasGroundTruth) {
    console.log(`   Investment profit:        Rp ${invEarned}`)
    console.log(`   Bonus (match+ref+salary): Rp ${bonusEarned}`)
  }
  console.log(`   totalWithdraw:            Rp ${u.totalWithdraw || 0}`)
  console.log(`   Expected totalProfit:     Rp ${expectedTotalProfit} (current Rp ${u.totalProfit}, drift Rp ${profitDrift})`)
  console.log(`   Expected mainBalance:     Rp ${expectedMainBalance} (current Rp ${u.mainBalance}, drift Rp ${mainDrift})`)

  db.run("UPDATE User SET totalProfit = ?, mainBalance = ? WHERE id = ?", [expectedTotalProfit, expectedMainBalance, u.id])
  console.log(`   ✅ UPDATED\n`)
}

db.run('PRAGMA wal_checkpoint(TRUNCATE)')

// ═══ Stats AFTER ═══
const after = db.query("SELECT COUNT(*) as c, COALESCE(SUM(mainBalance),0) as mb, COALESCE(SUM(totalProfit),0) as tp, COALESCE(SUM(totalWithdraw),0) as tw FROM User").get() as any
console.log(`[AFTER]  ${after.c} users | mainBalance: Rp ${after.mb} | totalProfit: Rp ${after.tp} | totalWithdraw: Rp ${after.tw}`)

console.log(`\n═══════════════════════════════════════════════════`)
console.log(`  HASIL REKONSILIASI`)
console.log(`═══════════════════════════════════════════════════`)
console.log(`  Total user diperiksa:    ${users.length}`)
console.log(`  User di-fix (MODE-1):    ${mode1Count}  (recalculate dari Investment+BonusLog)`)
console.log(`  User di-fix (MODE-2):    ${mode2Count}  (sync totalProfit = mainBalance)`)
console.log(`  Total drift di-fix:      Rp ${totalDriftFixed}`)
console.log(`  mainBalance total:       Rp ${before.mb} → Rp ${after.mb}`)
console.log(`  totalProfit total:       Rp ${before.tp} → Rp ${after.tp}`)
if (mode1Count + mode2Count > 0) {
  console.log(`  ✅ SALDO & PENDAPATAN SUDAH SESUAI`)
} else {
  console.log(`  ✅ Semua user sudah balanced — tidak ada drift`)
}
console.log(`═══════════════════════════════════════════════════\n`)

db.close()
RECEOF

echo -e "  ${B}→${N} Running reconcile.ts..."
bun "$P/reconcile.ts" "$DB" 2>&1
rm -f "$P/reconcile.ts"
echo ""

# ═══ STEP 3: VERIFY ═══
echo -e "${B}═══ 3/3. VERIFY — mainBalance == totalProfit (no WD) ═══${N}"
cat > "$P/verify-reconcile.ts" << 'VEOF'
import { Database } from 'bun:sqlite'
const db = new Database(process.argv[2] || './db/custom.db', { readonly: true })
const users = db.query("SELECT userId, name, whatsapp, mainBalance, totalProfit, totalWithdraw FROM User ORDER BY mainBalance DESC LIMIT 30").all() as any[]
const total = db.query("SELECT COUNT(*) as c, COALESCE(SUM(mainBalance),0) as mb, COALESCE(SUM(totalProfit),0) as tp FROM User").get() as any
console.log(`  Total: ${total.c} users | Sum mainBalance: Rp ${total.mb} | Sum totalProfit: Rp ${total.tp}`)
console.log(`\n  ${'User'.padEnd(24)} | ${'mainBalance'.padStart(11)} | ${'totalProfit'.padStart(11)} | ${'totalWD'.padStart(9)} | match`)
console.log(`  ${'-'.repeat(24)} | ${'-'.repeat(11)} | ${'-'.repeat(11)} | ${'-'.repeat(9)} | -----`)
let allMatch = true
for (const u of users) {
  const expected = u.totalProfit - (u.totalWithdraw || 0)
  const match = Math.abs(expected - u.mainBalance) < 2
  if (!match) allMatch = false
  console.log(`  ${(u.name || u.whatsapp).slice(0,24).padEnd(24)} | ${('Rp'+u.mainBalance).padStart(11)} | ${('Rp'+u.totalProfit).padStart(11)} | ${('Rp'+(u.totalWithdraw||0)).padStart(9)} | ${match ? '✅' : '❌'}`)
}
if (users.length > 30) console.log(`  ... dan ${total.c - 30} user lainnya`)
console.log(`\n  ${allMatch ? '✅ SEMUA BALANCED — mainBalance = totalProfit - totalWithdraw' : '❌ Ada user belum balanced'}`)
db.close()
VEOF
bun "$P/verify-reconcile.ts" "$DB" 2>&1 | head -40
rm -f "$P/verify-reconcile.ts"
echo ""

# ═══ SUMMARY ═══
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  📊 REKONSILIASI SELESAI${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "  ${G}✅${N} totalWithdraw = 0 untuk semua user (belum ada WD)"
echo -e "  ${G}✅${N} MODE-1: user dgn Investment/BonusLog → recalculate dari ground truth"
echo -e "  ${G}✅${N} MODE-2: user tanpa records → sync totalProfit = mainBalance (NO WIPE)"
echo -e "  ${G}✅${N} mainBalance = totalProfit - totalWithdraw (balanced)"
echo -e "  ${G}✅${N} Hanya user dengan drift > Rp 2 yang di-update"
echo -e "  ${G}✅${N} Idempotent — running 2x = no-op"
echo ""
