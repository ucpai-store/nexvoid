#!/bin/bash
# ============================================================
# NEXVO - Deploy: Admin USDT QR Upload + Deposit USDT QR Display
# ============================================================
# Admin sekarang bisa upload QR code USDT (selain wallet address)
# User di halaman deposit USDT bakal lihat QR + alamat wallet
#
# Cara pakai (di VPS sebagai root):
#   curl -fsSL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/deploy-payment-qr.sh | bash
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
echo "   NEXVO - Deploy: Admin USDT QR Upload Feature"
echo "   $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
  err "Harus jalan sebagai root: sudo bash ..."
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

step "2/4 Build Next.js (npm run build)"
npm run build 2>&1 | tail -25 || { err "Build gagal!"; exit 1; }
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
  echo ""
  pm2 list
else
  err "PM2 belum terinstall. Install: npm install -g pm2"
  exit 1
fi

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
echo "  • Admin > Payment: USDT sekarang ada upload QR code (opsional)"
echo "    - Pilih tipe 'USDT (BEP20)' saat tambah/edit metode"
echo "    - Isi Wallet Address (BEP20) — wajib"
echo "    - Upload QR Code USDT — opsional, user bisa scan langsung"
echo "  • Halaman Deposit USDT: tampilkan QR (kalau ada) + alamat wallet"
echo "  • Badge 'QR' di list metode admin buat lihat mana yang sudah ada QR"
echo ""
echo "Cara pakai:"
echo "  1. Login admin > menu Payment"
echo "  2. Edit metode USDT (atau tambah baru)"
echo "  3. Upload gambar QR code USDT + isi wallet address"
echo "  4. Simpan. User bakal lihat QR + alamat di halaman deposit USDT"
echo ""
echo "QRIS tetap seperti biasa: upload 1 QRIS untuk semua payment."
