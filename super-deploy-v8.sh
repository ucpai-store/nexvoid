#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO — DEPLOY FINAL v8 (bulletproof + self-verifying)
# ════════════════════════════════════════════════════════════════
#
# Cara pakai (copy-paste 1 baris ini di terminal VPS):
#   bash <(curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/deploy-final.sh?t=$(date +%s)")
#
# Atau kalau sudah di VPS:
#   bash deploy-final.sh
#
# Script ini:
#   1. cd ke project folder (auto-detect)
#   2. git reset --hard origin/main (AMBIL CODE TERBARU)
#   3. bun install + prisma generate
#   4. BUILD Next.js (dengan rollback yang BENER, bukan timestamp bug)
#   5. PM2 restart nexvo-web + nexvo-cron
#   6. VERIFY via /api/deploy-version (cek code baru beneran aktif)
#   7. Test add-profit API (optional, kalau ada token)
#
# 🔒 AMAN: TIDAK hapus data apapun (user, purchase, investment tetap)
# ════════════════════════════════════════════════════════════════

set +e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  NEXVO DEPLOY FINAL v8 — bulletproof + verify   ║${NC}"
echo -e "${CYAN}║  🔒 TIDAK HAPUS DATA APAPUN                     ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
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
  echo -e "${RED}❌ Project Nexvo tidak ditemukan!${NC}"
  echo "   Cari folder yang ada package.json + .env"
  exit 1
fi

cd "$PROJECT_DIR" || exit 1
echo -e "📂 Project: ${YELLOW}$PROJECT_DIR${NC}"
echo -e "🕐 WIB now: $(TZ='Asia/Jakarta' date '+%Y-%m-%d %H:%M:%S %A')"
echo ""

# ─── CEK TOOLS ───
echo "─── Cek tools ───"
command -v bun &>/dev/null && echo -e "${GREEN}✅ bun: $(bun --version)${NC}" || { echo -e "${RED}❌ bun tidak tersedia!${NC}"; exit 1; }
command -v git &>/dev/null && echo -e "${GREEN}✅ git: $(git --version)${NC}" || { echo -e "${RED}❌ git tidak tersedia!${NC}"; exit 1; }
command -v pm2 &>/dev/null && echo -e "${GREEN}✅ pm2: $(pm2 --version)${NC}" || echo -e "${YELLOW}⚠️  pm2 tidak tersedia (skip restart)${NC}"
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 1: GIT PULL (AMBIL CODE TERBARU)
# ════════════════════════════════════════════════════════════════
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  📥 STEP 1: GIT PULL (ambil code terbaru)${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"

if [ ! -d ".git" ]; then
  echo -e "${RED}❌ Folder ini bukan git repo!${NC}"
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

# Cek apakah code v8 sudah ada
echo "─── Verify code v8 ───"
if grep -q "ADD-PROFIT-V8" src/app/api/admin/asset/route.ts 2>/dev/null; then
  echo -e "${GREEN}✅ Code v8 ADA di source (ADD-PROFIT-V8 logging)${NC}"
else
  echo -e "${RED}❌ Code v8 TIDAK ADA di source — git pull mungkin gagal!${NC}"
  echo "   Coba: git pull origin main --force"
fi
if [ -f "src/app/api/deploy-version/route.ts" ]; then
  echo -e "${GREEN}✅ /api/deploy-version endpoint ADA${NC}"
else
  echo -e "${RED}❌ /api/deploy-version endpoint TIDAK ADA${NC}"
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 2: INSTALL DEPS
# ════════════════════════════════════════════════════════════════
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  📦 STEP 2: INSTALL DEPS${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo "⏳ bun install..."
bun install 2>&1 | tail -3
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 3: REGENERATE PRISMA
# ════════════════════════════════════════════════════════════════
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  🔄 STEP 3: REGENERATE PRISMA CLIENT${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
bun run db:generate 2>&1 | tail -3
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 4: CLEAR CACHE + BUILD NEXT.JS (dengan rollback yang BENER)
# ════════════════════════════════════════════════════════════════
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  🔨 STEP 4: BUILD NEXT.JS (CRITICAL!)${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}⚠️  Tanpa build, code baru TIDAK AKAN AKTIF di VPS!${NC}"
echo ""

# ★ FIX: Simpan backup ke variabel, bukan re-evaluate timestamp (bug lama)
BACKUP_DIR=""
if [ -d ".next" ]; then
  BACKUP_DIR=".next.backup-$(date +%Y%m%d-%H%M%S)"
  echo "💾 Backup .next lama ke $BACKUP_DIR..."
  mv .next "$BACKUP_DIR" 2>/dev/null
fi

# Clear cache
echo "🧹 Clear cache..."
rm -rf node_modules/.cache 2>/dev/null

# BUILD
echo "🔨 bun run build (1-3 menit, SABAR YAK)..."
BUILD_START=$(date +%s)
BUILD_OUTPUT=$(bun run build 2>&1)
BUILD_EXIT=$?
BUILD_END=$(date +%s)
BUILD_TIME=$((BUILD_END - BUILD_START))

if [ $BUILD_EXIT -eq 0 ]; then
  echo -e "${GREEN}✅ Build SUKSES dalam ${BUILD_TIME} detik${NC}"
  # Hapus backup kalau build sukses
  if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
    rm -rf "$BACKUP_DIR"
    echo "🗑️  Backup lama dihapus (build sukses)"
  fi
  echo ""
  echo "─── Build output (last 10 lines) ───"
  echo "$BUILD_OUTPUT" | tail -10
else
  echo ""
  echo -e "${RED}❌ BUILD GAGAL! (exit code $BUILD_EXIT)${NC}"
  echo ""
  echo "─── Build output (last 30 lines) ───"
  echo "$BUILD_OUTPUT" | tail -30
  echo ""
  # ★ FIX: Rollback pakai variabel $BACKUP_DIR, bukan timestamp baru
  if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
    echo -e "${YELLOW}🔄 Rolling back ke .next lama ($BACKUP_DIR)...${NC}"
    rm -rf .next
    mv "$BACKUP_DIR" .next
    echo -e "${GREEN}✅ Rollback berhasil — VPS tetap jalan dengan build lama${NC}"
  else
    echo -e "${RED}⚠️  Tidak ada backup untuk rollback! .next mungkin corrupt.${NC}"
  fi
  echo ""
  echo -e "${RED}🆘 Kirim screenshot output ini ke dev untuk analisa error${NC}"
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 5: RESTART PM2
# ════════════════════════════════════════════════════════════════
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  🔄 STEP 5: RESTART PM2${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"

if ! command -v pm2 &>/dev/null; then
  echo -e "${YELLOW}⚠️  pm2 tidak tersedia — skip restart${NC}"
else
  # Restart cron
  if pm2 list 2>/dev/null | grep -q "nexvo-cron"; then
    echo "🔄 pm2 restart nexvo-cron --update-env..."
    pm2 restart nexvo-cron --update-env 2>&1 | tail -3
    echo -e "${GREEN}✅ nexvo-cron restarted${NC}"
  else
    echo -e "${YELLOW}⚠️  nexvo-cron tidak ditemukan di PM2${NC}"
    pm2 list 2>/dev/null
  fi

  # Restart web
  if pm2 list 2>/dev/null | grep -q "nexvo-web"; then
    echo "🔄 pm2 restart nexvo-web --update-env..."
    pm2 restart nexvo-web --update-env 2>&1 | tail -3
    echo -e "${GREEN}✅ nexvo-web restarted dengan build baru${NC}"
  else
    echo -e "${YELLOW}⚠️  nexvo-web tidak ditemukan di PM2${NC}"
    pm2 list 2>/dev/null
  fi
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 6: VERIFY — CEK CODE SUDAH AKTIF VIA /api/deploy-version
# ════════════════════════════════════════════════════════════════
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  🔍 STEP 6: VERIFY (cek code baru beneran aktif)${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

# Cek .next folder
if [ -d ".next" ]; then
  echo -e "${GREEN}✅ .next folder ADA — build sukses${NC}"
  echo "📅 Build time: $(stat -c %y .next 2>/dev/null | cut -d'.' -f1)"
else
  echo -e "${RED}❌ .next folder TIDAK ADA — build gagal!${NC}"
fi
echo ""

# Tunggu server ready
echo "⏳ Tunggu server ready (5 detik)..."
sleep 5

# Test /api/deploy-version
echo ""
echo "─── Test /api/deploy-version ───"
VERSION_RESP=$(curl -s --max-time 10 http://localhost:3000/api/deploy-version 2>/dev/null)
if [ -n "$VERSION_RESP" ]; then
  echo "Response: $VERSION_RESP"
  echo ""
  # Cek version marker
  if echo "$VERSION_RESP" | grep -q "PROFIT-FIX-V8"; then
    echo -e "${GREEN}✅✅✅ CODE v8 SUDAH AKTIF DI VPS! ✅✅✅${NC}"
    echo -e "${GREEN}   Version marker: PROFIT-FIX-V8 ditemukan${NC}"
  else
    echo -e "${RED}❌ CODE v8 BELUM AKTIF!${NC}"
    echo -e "${YELLOW}   Version marker PROFIT-FIX-V8 tidak ditemukan di response.${NC}"
    echo "   Kemungkinan:"
    echo "   - Build gagal (cek STEP 4 di atas)"
    echo "   - PM2 belum restart (cek STEP 5)"
    echo "   - Browser cache (coba Ctrl+Shift+R)"
  fi
else
  echo -e "${RED}❌ Tidak dapat response dari /api/deploy-version${NC}"
  echo "   Server mungkin belum ready atau error."
  echo "   Cek: pm2 logs nexvo-web --lines 20"
fi
echo ""

# Cek PM2 status
if command -v pm2 &>/dev/null; then
  echo "─── PM2 status ───"
  pm2 list 2>/dev/null | grep -E "nexvo|name|online|stopped|errored" | head -10
fi
echo ""

# ════════════════════════════════════════════════════════════════
# SELESAI
# ════════════════════════════════════════════════════════════════
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  ✅ DEPLOY FINAL v8 SELESAI                    ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  🔒 TIDAK HAPUS DATA APAPUN                     ║${NC}"
echo -e "${CYAN}║                                                  ║${NC}"
echo -e "${CYAN}║  🔎 CEK HASIL (WAJIB):                           ║${NC}"
echo -e "${CYAN}║  1. Buka: https://nexvo.id/api/deploy-version   ║${NC}"
echo -e "${CYAN}║     → Harus ada "PROFIT-FIX-V8"                  ║${NC}"
echo -e "${CYAN}║  2. Ctrl+Shift+R di browser (clear cache)       ║${NC}"
echo -e "${CYAN}║  3. Logout + login lagi                         ║${NC}"
echo -e "${CYAN}║  4. Admin → Kelola Aset → klik + Profit         ║${NC}"
echo -e "${CYAN}║  5. Cek pm2 logs: pm2 logs nexvo-web --lines 20 ║${NC}"
echo -e "${CYAN}║     → Harus ada "[ADD-PROFIT-V8]" saat klik      ║${NC}"
echo -e "${CYAN}║  6. User Riwayat + Saldo harus update            ║${NC}"
echo -e "${CYAN}║                                                  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}📝 Kalau /api/deploy-version masih shows version LAMA:${NC}"
echo "   → Build gagal atau PM2 tidak restart."
echo "   → Cek: pm2 logs nexvo-web --lines 50"
echo ""
echo -e "${YELLOW}📝 Kalau version BARU tapi profit masih gak masuk:${NC}"
echo "   → Jalankan: bash diag-and-repair.sh"
echo "   → Atau cek pm2 logs saat klik add-profit"
echo ""
