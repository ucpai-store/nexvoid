#!/bin/bash
# ============================================================
# NEXVO - Deploy 20-Language System + Theme Contrast Fix
# ============================================================
# Adds comprehensive language picker (20 languages, English default)
# + fixes light-mode gold button text contrast
#
# Cara pakai (di VPS sebagai root):
#   curl -fsSL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/deploy-languages.sh | bash
# ============================================================
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'
log()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERR]${NC} $1"; }
step() { echo -e "\n${CYAN}==== $1 ====${NC}"; }

PROJECT_DIR="/home/nexvo"

echo -e "${CYAN}"
echo "============================================================"
echo "   NEXVO - Deploy: 20-Language System + Theme Fix"
echo "   $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
  err "Harus jalan sebagai root: sudo bash ..."
  exit 1
fi

# ─── 1. Pull latest code ───
step "1/4 Pull latest code dari GitHub"
if [ ! -d "$PROJECT_DIR" ]; then
  err "Project dir $PROJECT_DIR tidak ada. Jalankan deploy.sh dulu."
  exit 1
fi
cd "$PROJECT_DIR"
git fetch origin main
git reset --hard origin/main
log "Code updated: $(git rev-parse --short HEAD)"

# ─── 2. Build Next.js ───
step "2/4 Build Next.js (npm run build)"
npm run build 2>&1 | tail -25 || {
  err "Build gagal! Cek error di atas."
  exit 1
}
log "Build sukses"

# ─── 3. Copy static assets ───
step "3/4 Copy static + public ke standalone"
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
cp -r public .next/standalone/public 2>/dev/null || true
log "Static assets copied"

# ─── 4. Restart PM2 ───
step "4/4 Restart PM2 (nexvo-web)"
if command -v pm2 &> /dev/null; then
  pm2 restart nexvo-web --update-env 2>/dev/null || {
    warn "nexvo-web belum ada di PM2, starting fresh..."
    cd .next/standalone
    pm2 start server.js --name nexvo-web --update-env
    cd "$PROJECT_DIR"
  }
  pm2 save
  log "PM2 restarted"
  echo ""
  pm2 list
else
  err "PM2 belum terinstall. Install: npm install -g pm2"
  exit 1
fi

# ─── Verifikasi ───
step "Verifikasi"
sleep 3
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200\|307\|308"; then
  log "Web berjalan di port 3000"
else
  warn "Web belum respond 200, cek: pm2 logs nexvo-web --lines 30"
fi

echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  DEPLOY SELESAI!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "Fitur baru:"
echo "  • 20 bahasa (English default + 19 lainnya)"
echo "  • Language switcher: tombol globe di header -> dialog search"
echo "  • Bahasa tersimpan otomatis (localStorage)"
echo "  • Arabic = RTL (kanan-ke-kiri)"
echo "  • Light mode: tombol gold sekarang kontras dengan teks putih"
echo ""
echo "Bahasa tersedia:"
echo "  English, Bahasa Indonesia, Arabic, Chinese, Dutch, Filipino,"
echo "  French, German, Hindi, Italian, Japanese, Korean, Malay,"
echo "  Portuguese, Russian, Spanish, Thai, Turkish, Ukrainian, Vietnamese"
echo ""
echo "Test: buka aplikasi -> klik ikon globe di header -> pilih bahasa"
