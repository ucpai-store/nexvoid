#!/bin/bash
# ============================================================
# NEXVO - Fix: Enable QRIS/USDT QR Image Upload in Admin
# ============================================================
# The AdminPaymentPage calls /api/upload but that route was missing,
# so uploading QR codes for QRIS and USDT silently failed.
# This deploy installs the new /api/upload route.
#
# Cara pakai (di VPS sebagai root):
#   curl -fsSL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/deploy-upload-fix.sh | bash
# ============================================================
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERR]${NC} $1"; }
step() { echo -e "\n${CYAN}==== $1 ====${NC}"; }

PROJECT_DIR="/home/nexvo"

echo -e "${CYAN}"
echo "============================================================"
echo "   NEXVO - Fix: QR Upload (QRIS + USDT) in Admin Payment"
echo "   $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
  err "Harus jalan sebagai root: sudo bash ..."
  exit 1
fi

if ! command -v curl &> /dev/null; then
  err "curl tidak ditemukan. Install dulu: apt-get install -y curl"
  exit 1
fi

step "1/4 Pull latest code dari GitHub"
if [ ! -d "$PROJECT_DIR" ]; then
  err "Project dir $PROJECT_DIR tidak ada. Jalankan deploy.sh dulu."
  exit 1
fi
cd "$PROJECT_DIR"
git fetch origin main
git reset --hard origin/main
log "Code updated: $(git rev-parse --short HEAD)"

# Verify the new upload route exists
if [ ! -f "$PROJECT_DIR/src/app/api/upload/route.ts" ]; then
  err "File src/app/api/upload/route.ts tidak ditemukan!"
  exit 1
fi
log "Upload route ditemukan: src/app/api/upload/route.ts"

step "2/4 Build Next.js"
npm run build 2>&1 | tail -15 || { err "Build gagal!"; exit 1; }
log "Build sukses"

step "3/4 Copy static + public ke standalone"
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
cp -r public .next/standalone/public 2>/dev/null || true
log "Static assets copied"

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
else
  err "PM2 belum terinstall. Install: npm install -g pm2"
  exit 1
fi

step "Verifikasi"
sleep 4
# Test that /api/upload now exists (should return 401, not 404)
echo "Cek /api/upload endpoint (harus 401 = exists, bukan 404):"
UPLOAD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/upload 2>/dev/null || echo "000")
if [ "$UPLOAD_STATUS" = "401" ]; then
  log "/api/upload exists (401 = perlu auth, OK)"
elif [ "$UPLOAD_STATUS" = "404" ]; then
  err "/api/upload masih 404 — build mungkin belum pick up route baru"
  err "Coba: cd $PROJECT_DIR && rm -rf .next && npm run build && pm2 restart nexvo-web"
else
  warn "/api/upload return status: $UPLOAD_STATUS"
fi

# Check main page
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200\|307\|308"; then
  log "Web berjalan di port 3000"
else
  warn "Web belum respond 200"
fi

echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  FIX DEPLOY SELESAI!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "Yang diperbaiki:"
echo "  • Created /api/upload route (sebelumnya tidak ada → 404)"
echo "  • Admin > Payment > QRIS: upload QR code sekarang BERFUNGSI"
echo "  • Admin > Payment > USDT: upload QR code + icon BERFUNGSI"
echo ""
echo "Cara test:"
echo "  1. Login admin > menu Payment"
echo "  2. Tambah/Edit metode QRIS atau USDT"
echo "  3. Klik tombol upload QR code → pilih gambar → sukses"
echo "  4. Simpan metode"
echo ""
