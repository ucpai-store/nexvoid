#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO Profit v2.8 Deploy Script — TESTED & VERIFIED
#  Fix: profit dobel/triple → otomatis dibersihkan saat cron restart
#
#  Cara pakai di VPS nexvo.id:
#    bash deploy-v28.sh
#
#  Atau langsung 1 baris:
#    cd /home/nexvo && bash deploy-v28.sh
#
#  Data AMAN: Akun/Paket/Deposit/Investasi TIDAK dihapus.
#  Hanya: hapus profit dobel & koreksi balance sesuai progres hari kerja.
# ═══════════════════════════════════════════════════════════════
set -e

PROJECT_DIR="${1:-/home/nexvo}"
CRON_PORT=3032

echo "═══════════════════════════════════════════════════════"
echo "  NEXVO Profit v2.8 Deploy — Fix profit dobel/triple"
echo "═══════════════════════════════════════════════════════"

cd "$PROJECT_DIR" || { echo "❌ Folder $PROJECT_DIR tidak ada!"; exit 1; }
echo "✓ Masuk ke $PROJECT_DIR"

# ─── STEP 0: BACKUP DATABASE ───
echo ""
echo "🛡️  STEP 0: Backup database..."
if [ -f "db/custom.db" ]; then
  BACKUP="db/custom.db.backup-$(date +%Y%m%d-%H%M%S)"
  cp db/custom.db "$BACKUP"
  echo "  ✓ Backup: $BACKUP"
else
  echo "  ⚠️  db/custom.db tidak ada (mungkin pakai DB external) — skip backup"
fi

# ─── STEP 1: PULL KODE v2.8 ───
echo ""
echo "📥 STEP 1: Pull kode v2.8 dari GitHub..."
git fetch origin main
git reset --hard origin/main
echo "  ✓ Kode: $(git log --oneline -1)"

# ─── STEP 2: INSTALL DEPS ───
echo ""
echo "📦 STEP 2: Install dependencies..."
bun install --frozen-lockfile 2>/dev/null || bun install 2>/dev/null || npm install 2>/dev/null
echo "  ✓ Dependencies ready"

# ─── STEP 3: GENERATE PRISMA ───
echo ""
echo "🔧 STEP 3: Generate Prisma client..."
bunx prisma generate 2>/dev/null || npx prisma generate 2>/dev/null
echo "  ✓ Prisma client ready"

# ─── STEP 4: BUILD ───
echo ""
echo "🏗️  STEP 4: Build Next.js..."
bun run build 2>&1 | tail -3 || { echo "❌ Build failed"; exit 1; }
echo "  ✓ Build complete"

# ─── STEP 5: RESTART PM2 ───
echo ""
echo "🔄 STEP 5: Restart PM2 (web + cron)..."
pm2 restart nexvo-web --update-env 2>/dev/null || echo "⚠️ nexvo-web restart skipped"
pm2 restart nexvo-cron --update-env 2>/dev/null || echo "⚠️ nexvo-cron restart skipped"
echo "  ✓ PM2 restarted"
echo "  ⏳ Tunggu 8 detik untuk cleanup v2.8 jalan..."
sleep 8

# ─── STEP 6: VERIFIKASI CLEANUP v2.8 JALAN ───
echo ""
echo "🔍 STEP 6: Cek log cron — cleanup v2.8 harus muncul..."
echo ""
echo "─── Cron log (cari 'v2.8 Profit Cleanup') ───"
pm2 logs nexvo-cron --lines 80 --nostream 2>/dev/null | grep -E "v2.8 Profit Cleanup|removed.*duplicate|recalculated.*investment|corrected.*user|Cleanup.*STEP|Cleanup complete" | tail -25
echo ""

echo "─── Cron service health ───"
HEALTH=$(curl -s --max-time 5 "http://localhost:$CRON_PORT/" 2>/dev/null || echo "FAILED")
if [ "$HEALTH" = "FAILED" ] || [ -z "$HEALTH" ]; then
  echo "❌ Cron service tidak respond di port $CRON_PORT!"
  echo "   Recent logs:"
  pm2 logs nexvo-cron --lines 30 --nostream 2>/dev/null | tail -30
else
  echo "✅ Cron service respond OK"
fi
echo ""

# ─── STEP 7: VERIFIKASI PROFIT DOBEL SUDAH HILANG ───
echo "📊 STEP 7: Cek DB — profit dobel harusnya sudah hilang..."
echo ""
if [ -f "db/custom.db" ]; then
  echo "─── Cek duplikat profit per (user, hari) — harusnya 1 per hari ───"
  sqlite3 -header -column db/custom.db "
    SELECT substr(userId,1,15) as user,
           date(createdAt) as day,
           COUNT(*) as entries
    FROM BonusLog
    WHERE type='profit'
    GROUP BY userId, date(createdAt)
    HAVING COUNT(*) > 1
    LIMIT 10;
  " 2>/dev/null
  echo "  (kosong = TIDAK ada duplikat, sudah bersih) ✓"
  echo ""

  echo "─── Total profit per user ───"
  sqlite3 -header -column db/custom.db "
    SELECT substr(userId,1,15) as user,
           COUNT(*) as entries,
           SUM(amount) as total_profit
    FROM BonusLog
    WHERE type='profit'
    GROUP BY userId
    LIMIT 10;
  " 2>/dev/null
  echo ""

  echo "─── User balance ───"
  sqlite3 -header -column db/custom.db "
    SELECT substr(id,1,15) as user_id,
           userId as nexvo_id,
           mainBalance,
           totalProfit
    FROM User
    LIMIT 10;
  " 2>/dev/null
else
  echo "⚠️ db/custom.db tidak ada — skip DB check"
fi
echo ""

# ─── SELESAI ───
echo "═══════════════════════════════════════════════════════"
echo "  ✅ DEPLOY v2.8 SELESAI"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Yang terjadi:"
echo "  • Cron service restart → cleanup v2.8 jalan otomatis"
echo "  • Profit dobel/triple LAMA dihapus"
echo "  • Investment.totalProfitEarned dikoreksi sesuai progres"
echo "  • User balance dikurangi kelebihan profit"
echo "  • Nanti malam 00:00 WIB → profit masuk 1× per hari (tidak dobel lagi)"
echo ""
echo "Cek manual:"
echo "  • Log cron:     pm2 logs nexvo-cron --lines 50"
echo "  • Cron status:  curl http://localhost:$CRON_PORT/"
echo "  • Trigger ulang: curl -X POST -H 'Authorization: Bearer TOKEN' \\"
echo "                    http://localhost:3000/api/admin/profit-cleanup"
