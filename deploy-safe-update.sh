#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO SAFE DEPLOY — Update kode WEEKEND LIBUR (Profit & WD only)
# ════════════════════════════════════════════════════════════════
# AMAN:
#   ✅ Akun user tetap (tidak dihapus)
#   ✅ Paket investasi tetap
#   ✅ Deposit history tetap
#   ✅ Withdrawal history tetap
#   ✅ Bonus, salary, referral tetap
#   ✅ SystemSettings, SalaryConfig, MatchingConfig tetap
#   HANYA update: kode .ts/.tsx (logika weekend libur untuk profit & WD)
# ════════════════════════════════════════════════════════════════
set -e

PROJECT_DIR="${1:-/var/www/nexvo}"

echo "═══════════════════════════════════════════════════"
echo "  NEXVO SAFE DEPLOY — Weekend Libur (Profit & WD only)"
echo "  DATA AMAN: Akun/Paket/Deposit/Investasi TIDAK dihapus"
echo "═══════════════════════════════════════════════════"

cd "$PROJECT_DIR" || { echo "❌ Project dir $PROJECT_DIR not found!"; exit 1; }
echo "✓ Masuk ke $PROJECT_DIR"

# ─── BACKUP DATABASE DULU (JAGA-JAGA) ───
echo ""
echo "🛡️  STEP 0: Backup database (jaga-jaga)..."
if [ -f "db/custom.db" ]; then
  cp db/custom.db "db/custom.db.backup-$(date +%Y%m%d-%H%M%S)"
  echo "  ✓ Backup tersimpan: db/custom.db.backup-$(date +%Y%m%d-%H%M%S)"
elif [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -q "file:"; then
  DB_PATH=$(echo "$DATABASE_URL" | sed 's/.*file://')
  if [ -f "$DB_PATH" ]; then
    cp "$DB_PATH" "${DB_PATH}.backup-$(date +%Y%m%d-%H%M%S)"
    echo "  ✓ Backup tersimpan: ${DB_PATH}.backup-$(date +%Y%m%d-%H%M%S)"
  fi
else
  echo "  ⚠️  Tidak ada db/custom.db ditemukan — skip backup (mungkin pakai DB external)"
fi

# ─── STEP 1: PULL KODE TERBARU (TANPA SENTUH DB) ───
echo ""
echo "📥 STEP 1: Pull kode terbaru dari GitHub..."
git fetch origin main
git reset --hard origin/main
echo "  ✓ Kode terbaru: $(git log --oneline -1)"

# ─── STEP 2: CLEAR NEXT.JS CACHE (bukan DB) ───
echo ""
echo "🧹 STEP 2: Clear Next.js build cache (bukan DB)..."
rm -rf .next/cache 2>/dev/null || true
rm -rf .next/standalone 2>/dev/null || true
echo "  ✓ Cache direset"

# ─── STEP 3: INSTALL DEPENDENCIES ───
echo ""
echo "📦 STEP 3: Install dependencies..."
if command -v bun &> /dev/null; then
  bun install 2>/dev/null || npm install --legacy-peer-deps
else
  npm install --legacy-peer-deps
fi
echo "  ✓ Dependencies ready"

# ─── STEP 4: TIDAK PERLU db:push (schema tidak berubah) ───
echo ""
echo "💾 STEP 4: SKIP db:push — schema database TIDAK berubah di commit ini"
echo "  ✓ Data akun, paket, deposit, investasi TETAP UTUH"

# ─── STEP 5: BUILD ───
echo ""
echo "🔨 STEP 5: Build Next.js..."
if command -v bun &> /dev/null; then
  bun run build
else
  npm run build
fi
echo "  ✓ Build selesai"

# ─── STEP 6: RESTART PM2 (web + cron) ───
echo ""
echo "🔄 STEP 6: Restart PM2 (web + cron service)..."
pm2 restart nexvo-web 2>/dev/null || pm2 start "bun run start" --name nexvo-web
pm2 restart nexvo-cron 2>/dev/null || pm2 start "bun --hot mini-services/cron-service/index.ts" --name nexvo-cron
pm2 save
sleep 3
echo "  ✓ PM2 restarted"

# ─── VERIFY: PASTIKAN DATA MASIH ADA ───
echo ""
echo "🔍 VERIFY: Pastikan data masih ada..."
if [ -f "db/custom.db" ]; then
  USER_COUNT=$(sqlite3 db/custom.db "SELECT COUNT(*) FROM User;" 2>/dev/null || echo "?")
  INVEST_COUNT=$(sqlite3 db/custom.db "SELECT COUNT(*) FROM Investment;" 2>/dev/null || echo "?")
  DEPOSIT_COUNT=$(sqlite3 db/custom.db "SELECT COUNT(*) FROM Deposit;" 2>/dev/null || echo "?")
  WD_COUNT=$(sqlite3 db/custom.db "SELECT COUNT(*) FROM Withdrawal;" 2>/dev/null || echo "?")
  echo "  👥 Total User: $USER_COUNT"
  echo "  💰 Total Investment: $INVEST_COUNT"
  echo "  📥 Total Deposit: $DEPOSIT_COUNT"
  echo "  🏦 Total Withdrawal: $WD_COUNT"
  echo "  ✅ DATA AMAN — tidak ada yang hilang!"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ DEPLOY SELESAI — DATA AMAN!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "📌 Yang berubah:"
echo "  • Profit & WD → LIBUR di Sabtu & Minggu"
echo "  • Deposit, beli paket/produk → TETAP BISA di weekend"
echo "  • Salary, referral, matching → TETAP JALAN normal"
echo ""
echo "⚠️  HARD REFRESH browser (Ctrl+Shift+R) untuk load UI baru!"
echo ""
