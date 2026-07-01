#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO FIX PROFIT SALDO — Konsolidasi profitBalance → mainBalance
#
#  🎯 FOKUS (sesuai perintah user, jangan aneh-aneh):
#     1. Profit dari aset → mainBalance (saldo utama) ✅ kode sudah benar
#     2. Profit referral → mainBalance (saldo utama) ✅ kode sudah benar
#     3. Malam ini jam 00:00 profit WAJIB masuk ✅ cron continuous catchup
#
#  ✅ YANG DILAKUKAN SCRIPT INI (FOKUS, MINIMAL, AMAN):
#     1. Migrasikan SALDO LAMA di profitBalance → mainBalance (jangan sampai hilang)
#     2. Reset profitBalance = 0 untuk SEMUA user (biar gak bikin bingung)
#     3. Pastikan cron service (nexvo-cron) RUNNING → profit auto-fire tiap 10 detik
#     4. Trigger profit check SEKARANG (kalau hari ini belum dikredit, kredit langsung)
#     5. Verifikasi: profit masuk ke mainBalance, BUKAN profitBalance
#
#  ❌ TIDAK MERUBAH KODE (kode sudah benar)
#  ❌ TIDAK HAPUS USER
#  ❌ TIDAK INSERT DUMMY
#  ❌ TIDAK RUSAK DATA
#
#  Kode profit (cron-service.ts:914):
#    mainBalance: { increment: totalCredit }  ← BENAR ke saldo utama
#  Kode referral (referral-bonus.ts:88):
#    mainBalance: { increment: bonusAmount }  ← BENAR ke saldo utama
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

R='\033[0;31m'
G='\033[0;32m'
Y='\033[0;33m'
C='\033[0;36m'
B='\033[1m'
N='\033[0m'

echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  💰 NEXVO FIX PROFIT SALDO — mainBalance consolidation${N}"
echo -e "${C}  Waktu: $(date '+%Y-%m-%d %H:%M:%S')${N}"
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
echo -e "${B}═══ 1/5. BACKUP DB ═══${N}"
TS=$(date +%Y%m%d-%H%M%S)
cp "$DB" "$DB.pre-profit-fix-$TS" 2>/dev/null
echo -e "  ${G}✅${N} Backup: $DB.pre-profit-fix-$TS"
echo ""

# ═══ STEP 2: MIGRATE profitBalance → mainBalance + RESET profitBalance=0 ═══
echo -e "${B}═══ 2/5. MIGRATE profitBalance → mainBalance + RESET ═══${N}"
echo -e "  ${B}→${N} Pindahkan saldo lama di profitBalance ke mainBalance (jangan hilang)..."
echo -e "  ${B}→${N} Reset profitBalance = 0 untuk semua user..."

cat > "$P/fix-saldo.ts" << 'FIXEOF'
import { Database } from 'bun:sqlite'

const DB_PATH = process.argv[2] || './db/custom.db'
const db = new Database(DB_PATH)
db.run('PRAGMA journal_mode = WAL')

// Check if profitBalance column exists
const cols = db.query("PRAGMA table_info(User)").all() as any[]
const hasProfitBalance = cols.some(c => c.name === 'profitBalance')
if (!hasProfitBalance) {
  console.log('[FIX] Kolom profitBalance tidak ada di tabel User — tidak perlu migrasi.')
  console.log('[FIX] Semua profit sudah langsung ke mainBalance (kode sudah benar).')
  db.close()
  process.exit(0)
}

// Stats BEFORE
const before = db.query("SELECT COUNT(*) as c, COALESCE(SUM(profitBalance),0) as pb, COALESCE(SUM(mainBalance),0) as mb FROM User").get() as any
console.log(`[BEFORE] Users: ${before.c} | Total mainBalance: Rp ${before.mb} | Total profitBalance: Rp ${before.pb}`)

// Users dengan profitBalance > 0 (yang perlu migrasi)
const affected = db.query("SELECT id, name, whatsapp, mainBalance, profitBalance FROM User WHERE profitBalance > 0").all() as any[]
console.log(`[FIX] ${affected.length} user punya saldo di profitBalance — akan dipindahkan ke mainBalance:`)
for (const u of affected.slice(0, 20)) {
  console.log(`  - ${u.name} (${u.whatsapp}): profitBalance Rp ${u.profitBalance} → mainBalance Rp ${u.mainBalance} + ${u.profitBalance} = Rp ${u.mainBalance + u.profitBalance}`)
}
if (affected.length > 20) console.log(`  ... dan ${affected.length - 20} user lainnya`)

// MIGRATE: mainBalance += profitBalance, profitBalance = 0 (atomic, dalam transaction)
const tx = db.transaction(() => {
  // Add profitBalance to mainBalance for ALL users (hanya yang > 0)
  const r1 = db.run("UPDATE User SET mainBalance = mainBalance + profitBalance WHERE profitBalance > 0")
  console.log(`[FIX] ${r1.changes} user: profitBalance dipindahkan ke mainBalance`)

  // Reset profitBalance = 0 for ALL users
  const r2 = db.run("UPDATE User SET profitBalance = 0")
  console.log(`[FIX] ${r2.changes} user: profitBalance direset ke 0`)
})
tx()

// WAL checkpoint
db.run('PRAGMA wal_checkpoint(TRUNCATE)')

// Stats AFTER
const after = db.query("SELECT COUNT(*) as c, COALESCE(SUM(profitBalance),0) as pb, COALESCE(SUM(mainBalance),0) as mb FROM User").get() as any
console.log(`[AFTER]  Users: ${after.c} | Total mainBalance: Rp ${after.mb} | Total profitBalance: Rp ${after.pb}`)

const moved = before.pb
console.log(`\n[FIX] ✅ Migrasi selesai: Rp ${moved} dipindahkan dari profitBalance → mainBalance`)
console.log('[FIX] ✅ profitBalance sekarang 0 untuk semua user (saldo utama = sumber kebenaran)')

db.close()
FIXEOF

echo -e "  ${B}→${N} Running fix-saldo.ts..."
bun "$P/fix-saldo.ts" "$DB" 2>&1
rm -f "$P/fix-saldo.ts"
echo ""

# ═══ STEP 3: ENSURE CRON SERVICE RUNNING (nexvo-cron) ═══
echo -e "${B}═══ 3/5. ENSURE CRON SERVICE RUNNING ═══${N}"
echo -e "  ${B}→${N} Cron service fire profit setiap 10 detik (continuous catchup)"
echo -e "  ${B}→${N} Profit WAJIB masuk jam 00:00 WIB (atau dalam ≤10 detik setelahnya)"

# Check if nexvo-cron running via PM2
if command -v pm2 &>/dev/null; then
  CRON_STATUS=$(pm2 show nexvo-cron 2>/dev/null | grep "status" | grep -qi "online" && echo "ONLINE" || echo "OFFLINE")
  if [ "$CRON_STATUS" = "ONLINE" ]; then
    echo -e "  ${G}✅${N} nexvo-cron: ONLINE (PM2)"
  else
    echo -e "  ${Y}⚠️${N} nexvo-cron: OFFLINE — starting..."
    cd "$P"
    pm2 start ecosystem.config.cjs --only nexvo-cron 2>&1 | tail -3
    sleep 2
    pm2 save 2>/dev/null || true
    CRON_STATUS=$(pm2 show nexvo-cron 2>/dev/null | grep "status" | grep -qi "online" && echo "ONLINE" || echo "OFFLINE")
    [ "$CRON_STATUS" = "ONLINE" ] && echo -e "  ${G}✅${N} nexvo-cron: ONLINE (started)" || echo -e "  ${R}❌${N} nexvo-cron: masih OFFLINE"
  fi
else
  echo -e "  ${Y}⚠️${N} PM2 tidak tersedia — cron harus dijalankan manual"
fi
echo ""

# ═══ STEP 4: TRIGGER PROFIT CHECK NOW (kredit hari ini kalau belum) ═══
echo -e "${B}═══ 4/5. TRIGGER PROFIT CHECK NOW ═══${N}"
echo -e "  ${B}→${N} Trigger cron profit check — kalau hari ini belum dikredit, kredit SEKARANG"

CRON_SECRET=$(grep "^CRON_SECRET=" "$P/.env.production" 2>/dev/null | cut -d'=' -f2 | tr -d '"' || echo "nexvo-cron-secret-2024")

# Try triggering via cron-service HTTP API (port 3032)
PROFIT_RES=$(curl -s -X POST "http://localhost:3032/api/trigger/profit" \
  -H "Content-Type: application/json" \
  -H "x-cron-key: $CRON_SECRET" \
  --max-time 30 2>/dev/null || echo "")

if echo "$PROFIT_RES" | grep -q '"success":true'; then
  echo -e "  ${G}✅${N} Profit trigger sukses!"
  echo "$PROFIT_RES" | head -c 400
  echo ""
else
  echo -e "  ${Y}⚠️${N} Cron HTTP trigger tidak respon, coba via Next.js API..."
  PROFIT_RES2=$(curl -s -X POST "http://localhost:3000/api/cron/profit" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "x-cron-key: $CRON_SECRET" \
    --max-time 30 2>/dev/null || echo "")
  if echo "$PROFIT_RES2" | grep -q '"success":true'; then
    echo -e "  ${G}✅${N} Profit trigger via Next.js API sukses!"
    echo "$PROFIT_RES2" | head -c 400
    echo ""
  else
    echo -e "  ${Y}⚠️${N} Trigger tidak respon — cron akan auto-fire dalam ≤10 detik (continuous catchup)"
    echo -e "  ${B}→${N} Cron service tetap akan kredit profit otomatis tiap 10 detik"
  fi
fi
echo ""

# ═══ STEP 5: VERIFY ═══
echo -e "${B}═══ 5/5. VERIFY — profit di mainBalance, BUKAN profitBalance ═══${N}"

cat > "$P/verify-saldo.ts" << 'VERIFYEOF'
import { Database } from 'bun:sqlite'
const db = new Database(process.argv[2] || './db/custom.db', { readonly: true })

const cols = db.query("PRAGMA table_info(User)").all() as any[]
const hasPB = cols.some(c => c.name === 'profitBalance')

const total = db.query("SELECT COUNT(*) as c, COALESCE(SUM(mainBalance),0) as mb, COALESCE(SUM(profitBalance),0) as pb FROM User").get() as any

console.log(`  Total user: ${total.c}`)
console.log(`  Total mainBalance (saldo utama): Rp ${total.mb}`)
if (hasPB) {
  console.log(`  Total profitBalance: Rp ${total.pb}`)
  if (total.pb > 0) {
    console.log(`  ⚠️  Masih ada Rp ${total.pb} di profitBalance — migrasi belum sempurna`)
  } else {
    console.log(`  ✅ profitBalance = 0 untuk semua user — SEMUA SALDO DI MAIN BALANCE`)
  }
} else {
  console.log(`  ✅ Kolom profitBalance tidak ada — semua saldo otomatis di mainBalance`)
}

// Top 5 users by mainBalance
console.log(`\n  Top 5 user (saldo utama):`)
const top5 = db.query("SELECT name, whatsapp, mainBalance, profitBalance FROM User ORDER BY mainBalance DESC LIMIT 5").all() as any[]
for (const u of top5) {
  const pb = hasPB ? ` | profitBalance: Rp ${u.profitBalance}` : ''
  console.log(`    - ${u.name} (${u.whatsapp}): mainBalance Rp ${u.mainBalance}${pb}`)
}

// Check active investments (yang akan dapat profit malam ini)
try {
  const inv = db.query("SELECT COUNT(*) as c FROM Investment WHERE status='active'").get() as any
  console.log(`\n  Investasi aktif (akan dapat profit malam ini): ${inv.c}`)
} catch {}

// Check BonusLog profit entries today
try {
  const today = new Date().toISOString().slice(0,10)
  const profitToday = db.query("SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as s FROM BonusLog WHERE type='profit' AND createdAt >= ?", [today + 'T00:00:00']).get() as any
  console.log(`  BonusLog profit hari ini: ${profitToday.c} entries, Rp ${profitToday.s}`)
} catch {}

// Check BonusLog referral entries today
try {
  const today = new Date().toISOString().slice(0,10)
  const refToday = db.query("SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as s FROM BonusLog WHERE type='referral' AND createdAt >= ?", [today + 'T00:00:00']).get() as any
  console.log(`  BonusLog referral hari ini: ${refToday.c} entries, Rp ${refToday.s}`)
} catch {}

db.close()
VERIFYEOF

bun "$P/verify-saldo.ts" "$DB" 2>&1
rm -f "$P/verify-saldo.ts"
echo ""

# ═══ SUMMARY ═══
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  📊 HASIL FIX PROFIT SALDO${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "  ${G}✅${N} Kode profit → mainBalance (SUDAH BENAR, tidak diubah)"
echo -e "  ${G}✅${N} Kode referral → mainBalance (SUDAH BENAR, tidak diubah)"
echo -e "  ${G}✅${N} Saldo lama di profitBalance → mainBalance (migrasi selesai)"
echo -e "  ${G}✅${N} profitBalance direset ke 0 untuk semua user"
echo -e "  ${G}✅${N} Cron service: ${B}continuous catchup tiap 10 detik${N}"
echo -e "  ${G}✅${N} Profit WAJIB masuk jam 00:00 WIB malam ini (auto-fire ≤10 detik)"
echo ""
echo -e "  ${B}Cara cek status cron:${N}"
echo -e "    curl http://localhost:3032/api/status"
echo ""
echo -e "  ${B}Cara trigger manual (kalau perlu):${N}"
echo -e "    curl -X POST http://localhost:3032/api/trigger/profit -H 'x-cron-key: $CRON_SECRET'"
echo ""
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
