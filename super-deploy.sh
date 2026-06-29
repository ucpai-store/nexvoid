#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO — SUPER DEPLOY (1 command, git pull + build + restart)
# ════════════════════════════════════════════════════════════════
#
# Cara pakai (copy-paste 1 baris ini di terminal VPS):
#   bash <(curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/super-deploy.sh?t=$(date +%s)")
#
# Script ini melakukan 4 hal SIMPLE:
#   1. cd ke /var/www/nexvo (atau deteksi otomatis)
#   2. git fetch + git reset --hard origin/main (AMBIL CODE TERBARU)
#   3. bun run build (BUILD NEXT.JS — code baru jadi aktif!)
#   4. pm2 restart nexvo-cron + nexvo-web (RESTART SERVICE)
#
# 🔒 AMAN: TIDAK hapus data apapun (user, purchase, investment tetap)
# ════════════════════════════════════════════════════════════════

set +e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  NEXVO SUPER DEPLOY — git pull + build + restart ║"
echo "║  🔒 TIDAK HAPUS DATA APAPUN                     ║"
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
  exit 1
fi

cd "$PROJECT_DIR" || exit 1
echo "📂 Project: $PROJECT_DIR"
echo "🕐 WIB now: $(TZ='Asia/Jakarta' date '+%Y-%m-%d %H:%M:%S %A')"
echo ""

# ─── CEK TOOLS ───
echo "─── Cek tools ───"
command -v bun &>/dev/null && echo "✅ bun: $(bun --version)" || { echo "❌ bun tidak tersedia!"; exit 1; }
command -v git &>/dev/null && echo "✅ git: $(git --version)" || { echo "❌ git tidak tersedia!"; exit 1; }
command -v pm2 &>/dev/null && echo "✅ pm2: $(pm2 --version)" || echo "⚠️  pm2 tidak tersedia (skip restart)"
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 1: GIT PULL (AMBIL CODE TERBARU)
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  📥 STEP 1: GIT PULL (ambil code terbaru)"
echo "═══════════════════════════════════════════════════"

if [ ! -d ".git" ]; then
  echo "❌ Folder ini bukan git repo!"
  exit 1
fi

echo "🔄 git fetch origin..."
git fetch origin 2>&1 | tail -3
echo ""
echo "🔄 git reset --hard origin/main (HARD RESET ke main)..."
git reset --hard origin/main 2>&1 | tail -3
echo ""
echo "📋 Latest commit:"
git log --oneline -5
echo ""

# Cek apakah code v7 sudah ada
echo "─── Verify code v7 ───"
if grep -q "force-dynamic" src/app/api/admin/asset/route.ts 2>/dev/null; then
  echo "✅ Code v7 ADA di source (force-dynamic)"
else
  echo "❌ Code v7 TIDAK ADA di source — git pull mungkin gagal!"
fi
if grep -q "LEGACY purchase" cron-service.ts 2>/dev/null; then
  echo "✅ cron-service.ts v7 ADA (LEGACY purchase)"
else
  echo "❌ cron-service.ts v7 TIDAK ADA"
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 2: INSTALL DEPS (kalau perlu)
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  📦 STEP 2: INSTALL DEPS (bun install)"
echo "═══════════════════════════════════════════════════"
echo "⏳ bun install (skip kalau sudah terinstall)..."
bun install 2>&1 | tail -5
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 3: REGENERATE PRISMA
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  🔄 STEP 3: REGENERATE PRISMA CLIENT"
echo "═══════════════════════════════════════════════════"
bun run db:generate 2>&1 | tail -3
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 4: CLEAR CACHE + BUILD NEXT.JS
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  🔨 STEP 4: BUILD NEXT.JS (CRITICAL!)"
echo "═══════════════════════════════════════════════════"
echo ""
echo "⚠️  Tanpa build, code baru TIDAK AKAN AKTIF di VPS!"
echo ""

# Backup .next lama
if [ -d ".next" ]; then
  echo "💾 Backup .next lama..."
  rm -rf .next.backup-* 2>/dev/null
  mv .next ".next.backup-$(date +%Y%m%d-%H%M%S)" 2>/dev/null || rm -rf .next
fi

# Clear cache
echo "🧹 Clear cache..."
rm -rf .next/cache 2>/dev/null
rm -rf node_modules/.cache 2>/dev/null

# BUILD
echo "🔨 bun run build (1-3 menit, SABAR YAK)..."
BUILD_START=$(date +%s)
BUILD_OUTPUT=$(bun run build 2>&1)
BUILD_EXIT=$?
BUILD_END=$(date +%s)
BUILD_TIME=$((BUILD_END - BUILD_START))

if [ $BUILD_EXIT -eq 0 ]; then
  echo "✅ Build SUKSES dalam ${BUILD_TIME} detik"
  rm -rf .next.backup-* 2>/dev/null
  # Show last 10 lines of build output
  echo ""
  echo "─── Build output (last 10 lines) ───"
  echo "$BUILD_OUTPUT" | tail -10
else
  echo ""
  echo "❌ BUILD GAGAL! (exit code $BUILD_EXIT)"
  echo ""
  echo "─── Build output (last 30 lines) ───"
  echo "$BUILD_OUTPUT" | tail -30
  echo ""
  echo "🔄 Rolling back ke .next lama..."
  if [ -d ".next.backup-$(date +%Y%m%d-%H%M%S)" ]; then
    rm -rf .next
    mv ".next.backup-$(date +%Y%m%d-%H%M%S)" .next
    echo "✅ Rollback berhasil — VPS tetap jalan dengan build lama"
  fi
  echo ""
  echo "🆘 Kirim screenshot output ini ke dev untuk analisa error"
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 5: RESTART PM2
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  🔄 STEP 5: RESTART PM2"
echo "═══════════════════════════════════════════════════"

if ! command -v pm2 &>/dev/null; then
  echo "⚠️  pm2 tidak tersedia — skip restart"
else
  # Restart cron
  if pm2 list 2>/dev/null | grep -q "nexvo-cron"; then
    echo "🔄 pm2 restart nexvo-cron --update-env..."
    pm2 restart nexvo-cron --update-env 2>&1 | tail -3
    echo "✅ nexvo-cron restarted dengan code baru"
  else
    echo "⚠️  nexvo-cron tidak ditemukan di PM2"
    pm2 list 2>/dev/null
  fi

  # Restart web
  if pm2 list 2>/dev/null | grep -q "nexvo-web"; then
    echo "🔄 pm2 restart nexvo-web --update-env..."
    pm2 restart nexvo-web --update-env 2>&1 | tail -3
    echo "✅ nexvo-web restarted dengan build baru"
  fi
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 6: VERIFY (cek code sudah aktif)
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  🔍 STEP 6: VERIFY (cek code sudah aktif)"
echo "═══════════════════════════════════════════════════"
echo ""

# Cek .next folder
if [ -d ".next" ]; then
  echo "✅ .next folder ADA — build sukses"
  echo "📅 Build time: $(stat -c %y .next 2>/dev/null | cut -d'.' -f1)"
else
  echo "❌ .next folder TIDAK ADA — build gagal atau belum jalan"
fi

# Cek PM2 status
if command -v pm2 &>/dev/null; then
  echo ""
  echo "─── PM2 status ───"
  pm2 list 2>/dev/null | grep -E "nexvo|name|online|stopped|errored" | head -10
fi
echo ""

# ════════════════════════════════════════════════════════════════
# SELESAI
# ════════════════════════════════════════════════════════════════
echo "╔══════════════════════════════════════════════════╗"
echo "║  ✅ SUPER DEPLOY SELESAI                       ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  🔒 TIDAK HAPUS DATA APAPUN                      ║"
echo "║  • Git pull: latest code (v7)                    ║"
echo "║  • Build: Next.js rebuild sukses                 ║"
echo "║  • PM2 restart: cron + web                       ║"
echo "║                                                  ║"
echo "║  🔎 CEK HASIL (WAJIB):                           ║"
echo "║  • Ctrl+Shift+R di browser                       ║"
echo "║  • Logout + login lagi                           ║"
echo "║  • Login admin → Kelola Aset → klik + Profit     ║"
echo "║  • User Riwayat muncul + Saldo naik              ║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "📝 Kalau STEP 4 BUILD GAGAL:"
echo "   VPS tetap online pakai build lama."
echo "   Kirim screenshot error ke dev."
echo ""
echo "📝 Kalau setelah ini masih gak berubah:"
echo "   Jalankan: bash diag-and-repair.sh"
echo "   Script itu akan sync data profit yang missing."
echo ""
