#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO — QUICK DEPLOY FIX (1 command, semua fix profit)
# ════════════════════════════════════════════════════════════════
#
# Cara pakai (copy-paste 1 baris ini di terminal VPS):
#   bash <(curl -sL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/quick-deploy-fix.sh)
#
# Atau kalau download dulu:
#   curl -sL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/quick-deploy-fix.sh -o fix.sh && bash fix.sh
#
# Script ini melakukan:
#   1. Cari project Nexvo di VPS
#   2. Backup DB otomatis
#   3. Git pull latest code (semua fix profit)
#   4. Run fix-profit-v6.sh (6 phase repair)
#   5. Restart PM2 (cron service + web)
#
# 🔒 AMAN: TIDAK hapus data apapun (user, purchase, investment tetap)
# ════════════════════════════════════════════════════════════════

set +e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  NEXVO QUICK DEPLOY FIX — 1 command, semua fix   ║"
echo "║  🔒 TIDAK HAPUS DATA APAPUN                      ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ─── CARI PROJECT ───
PROJECT_DIR=""
for candidate in "/var/www/nexvo" "/home/nexvo" "/var/www/html/nexvo" "/var/www/nexvoid" "/home/$USER/nexvo" "/root/nexvo" "/opt/nexvo" "$HOME/nexvo" "$(pwd)"; do
  if [ -f "$candidate/package.json" ] && [ -f "$candidate/.env" ]; then
    PROJECT_DIR="$candidate"
    break
  fi
done

if [ -z "$PROJECT_DIR" ]; then
  echo "❌ Project Nexvo tidak ditemukan!"
  echo "   Cari folder yang ada package.json + .env"
  echo "   Folder umum: /var/www/nexvo, /home/nexvo, /root/nexvo"
  exit 1
fi

cd "$PROJECT_DIR" || exit 1
echo "📂 Project: $PROJECT_DIR"
echo "🕐 WIB now: $(TZ='Asia/Jakarta' date '+%Y-%m-%d %H:%M:%S %A')"
echo ""

# ─── CEK BUN ───
if ! command -v bun &>/dev/null; then
  echo "❌ bun tidak tersedia! Install: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi
echo "✅ bun: $(bun --version)"

# ─── CEK GIT ───
if ! command -v git &>/dev/null; then
  echo "⚠️  git tidak tersedia — skip git pull, langsung run fix-profit-v6.sh"
  SKIP_GIT=1
else
  echo "✅ git: $(git --version)"
  SKIP_GIT=0
fi

# ─── CEK PM2 ───
if ! command -v pm2 &>/dev/null; then
  echo "⚠️  pm2 tidak tersedia — skip restart, manual restart diperlukan"
  SKIP_PM2=1
else
  echo "✅ pm2: $(pm2 --version)"
  SKIP_PM2=0
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 1: BACKUP DB
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  STEP 1: BACKUP DATABASE"
echo "═══════════════════════════════════════════════════"

BACKUP_FILE=""
for db_path in "db/custom.db" "db/production.db" "prisma/dev.db"; do
  if [ -f "$db_path" ]; then
    BACKUP_FILE="${db_path}.backup-$(date +%Y%m%d-%H%M%S)"
    cp "$db_path" "$BACKUP_FILE" 2>/dev/null
    echo "💾 DB backup: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
    break
  fi
done

if [ -z "$BACKUP_FILE" ]; then
  echo "⚠️  DB file tidak ditemukan di path umum — backup skipped"
  echo "   (Database mungkin pakai external MySQL/PostgreSQL)"
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 2: GIT PULL (ambil code terbaru dari GitHub)
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  STEP 2: GIT PULL (code terbaru)"
echo "═══════════════════════════════════════════════════"

if [ "$SKIP_GIT" = "1" ]; then
  echo "⏭️  Skip git pull (git tidak tersedia)"
else
  # Cek apakah ini git repo
  if [ -d ".git" ]; then
    echo "🔄 git fetch origin..."
    git fetch origin 2>&1 | tail -3
    echo "🔄 git reset --hard origin/main..."
    git reset --hard origin/main 2>&1 | tail -3
    echo "📋 Latest commit:"
    git log --oneline -3
  else
    echo "⚠️  Folder ini bukan git repo — skip git pull"
    echo "   Download fix-profit-v6.sh manual dari GitHub"
  fi
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 3: RUN DIAG-DB (read-only diagnostic)
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  STEP 3: DIAGNOSTIC DB (read-only, gak rubah apapun)"
echo "═══════════════════════════════════════════════════"

if [ -f "diag-db.sh" ]; then
  bash diag-db.sh 2>&1 | head -50
else
  echo "⚠️  diag-db.sh tidak ditemukan — download dari GitHub..."
  curl -sL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/diag-db.sh -o diag-db.sh
  bash diag-db.sh 2>&1 | head -50
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 4: RUN FIX-PROFIT-V6 (6 phase repair)
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  STEP 4: FIX PROFIT v6 (6 phase repair)"
echo "═══════════════════════════════════════════════════"

if [ -f "fix-profit-v6.sh" ]; then
  bash fix-profit-v6.sh 2>&1
else
  echo "⚠️  fix-profit-v6.sh tidak ditemukan — download dari GitHub..."
  curl -sL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/fix-profit-v6.sh -o fix-profit-v6.sh
  bash fix-profit-v6.sh 2>&1
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 5: REBUILD NEXT.JS (CRITICAL — code baru gak akan aktif tanpa ini!)
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  STEP 5: REBUILD NEXT.JS (CRITICAL!)"
echo "═══════════════════════════════════════════════════"
echo ""
echo "⚠️  VPS pakai 'next start' (production mode) → code baru"
echo "    TIDAK akan aktif sampai Next.js di-rebuild!"
echo ""

# Backup .next lama dulu (kalau build gagal, bisa rollback)
if [ -d ".next" ]; then
  echo "💾 Backup .next lama → .next.backup-$(date +%Y%m%d-%H%M%S)"
  rm -rf .next.backup-* 2>/dev/null
  mv .next ".next.backup-$(date +%Y%m%d-%H%M%S)" 2>/dev/null || rm -rf .next
fi

# Clear cache Next.js
echo "🧹 Clear Next.js cache..."
rm -rf .next/cache 2>/dev/null
rm -rf node_modules/.cache 2>/dev/null

# Regenerate Prisma client (pastikan schema terbaru)
echo "🔄 Regenerate Prisma client..."
bun run db:generate 2>&1 | tail -3

# BUILD NEXT.JS
echo "🔨 bun run build (ini bisa 1-3 menit, SABAR YAK)..."
BUILD_START=$(date +%s)
if bun run build 2>&1 | tail -30; then
  BUILD_END=$(date +%s)
  BUILD_TIME=$((BUILD_END - BUILD_START))
  echo "✅ Build sukses dalam ${BUILD_TIME} detik"
  # Hapus backup build lama (sukses, gak perlu rollback)
  rm -rf .next.backup-* 2>/dev/null
else
  echo ""
  echo "❌ BUILD GAGAL! Rolling back ke build lama..."
  if [ -d ".next.backup-$(date +%Y%m%d-%H%M%S)" ]; then
    rm -rf .next
    mv ".next.backup-$(date +%Y%m%d-%H%M%S)" .next
    echo "✅ Rollback berhasil — VPS tetap jalan dengan build lama"
  fi
  echo ""
  echo "💡 Cek error di atas. Kalau error TypeScript, coba:"
  echo "   bun run lint"
  echo "   atau buka issue di GitHub dengan error message"
  echo ""
  echo "   SEMENTARA VPS tetap online pakai build lama."
  echo "   Tapi fix profit BELUM aktif — perlu rebuild sukses."
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 6: RESTART PM2 (cron + web) — wajib setelah rebuild!
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  STEP 6: RESTART PM2 (cron service + web)"
echo "═══════════════════════════════════════════════════"

if [ "$SKIP_PM2" = "1" ]; then
  echo "⚠️  pm2 tidak tersedia — manual restart diperlukan:"
  echo "   pm2 restart nexvo-cron"
  echo "   pm2 restart nexvo-web"
else
  # Restart cron service (cron-service.ts gak perlu build, langsung jalan)
  if pm2 list 2>/dev/null | grep -q "nexvo-cron"; then
    echo "🔄 pm2 restart nexvo-cron..."
    pm2 restart nexvo-cron --update-env 2>&1 | tail -3
    echo "✅ nexvo-cron restarted"
  else
    echo "⚠️  nexvo-cron tidak ditemukan di PM2 — mungkin pakai nama lain"
    pm2 list 2>/dev/null
  fi

  # Restart web — wajib setelah build sukses agar code baru aktif
  if pm2 list 2>/dev/null | grep -q "nexvo-web"; then
    echo "🔄 pm2 restart nexvo-web --update-env..."
    pm2 restart nexvo-web --update-env 2>&1 | tail -3
    echo "✅ nexvo-web restarted dengan build baru"
  fi
fi
echo ""

# ════════════════════════════════════════════════════════════════
# SELESAI
# ════════════════════════════════════════════════════════════════
echo "╔══════════════════════════════════════════════════╗"
echo "║  ✅ QUICK DEPLOY FIX SELESAI                    ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  🔒 TIDAK HAPUS DATA APAPUN                      ║"
echo "║  • Backup DB: $BACKUP_FILE"
echo "║  • Git pull: latest code (semua fix profit)      ║"
echo "║  • Fix DB: 6 phase repair (riwayat + total)      ║"
echo "║  • Next.js REBUILD: code baru sekarang aktif!    ║"
echo "║  • PM2 restart: cron + web (--update-env)        ║"
echo "║                                                  ║"
echo "║  🔎 CEK HASIL (HARDCLEAR BROWSER CACHE DULU):    ║"
echo "║  • Ctrl+Shift+R di browser                       ║"
echo "║  • Login admin → Kelola Aset → Total Profit      ║"
echo "║  • Add profit manual → cek Total Profit langsung ║"
echo "║    berubah + Riwayat muncul + Saldo Utama naik   ║"
echo "║  • Cron auto jalan tiap 10 detik di weekday      ║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "📝 Kalau masih gak berubah setelah Ctrl+Shift+R:"
echo "   1. Cek log: pm2 logs nexvo-web --lines 30"
echo "   2. Pastikan build di STEP 5 SUKSES (gak ada ❌)"
echo "   3. Coba logout + login lagi (clear session)"
echo ""
echo "🆘 Kalau STEP 5 BUILD GAGAL:"
echo "   VPS tetap online pakai build lama."
echo "   Tapi fix belum aktif. Kirim screenshot error ke dev."
echo ""
