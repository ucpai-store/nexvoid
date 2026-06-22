#!/bin/bash
# ============================================================
# NEXVO - Deploy: Payment QRIS + USDT Only (auto-purge legacy)
# ============================================================
# Removes bank/ewallet/crypto from admin payment page.
# Only QRIS and USDT remain. Legacy methods auto-purged from DB.
#
# Cara pakai (di VPS sebagai root):
#   curl -fsSL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/deploy-payment-simplify.sh | bash
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
echo "   NEXVO - Deploy: Payment QRIS + USDT Only"
echo "   Auto-purge bank/ewallet/crypto from database"
echo "   $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
  err "Harus jalan sebagai root: sudo bash ..."
  exit 1
fi

# Pastikan curl tersedia (beberapa VPS minimal install tidak punya)
if ! command -v curl &> /dev/null; then
  err "curl tidak ditemukan. Install dulu: apt-get install -y curl"
  exit 1
fi

step "1/5 Pull latest code dari GitHub"
if [ ! -d "$PROJECT_DIR" ]; then
  err "Project dir $PROJECT_DIR tidak ada. Jalankan deploy.sh dulu."
  exit 1
fi
cd "$PROJECT_DIR"
git fetch origin main
git reset --hard origin/main
log "Code updated: $(git rev-parse --short HEAD)"

step "2/5 Install dependencies"
if command -v bun &> /dev/null; then
  bun install 2>/dev/null || npm install
else
  npm install
fi
log "Dependencies installed"

step "3/5 Build Next.js"
npm run build 2>&1 | tail -25 || { err "Build gagal!"; exit 1; }
log "Build sukses"

step "4/5 Copy static + public ke standalone"
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
cp -r public .next/standalone/public 2>/dev/null || true
log "Static assets copied"

step "5/5 Restart PM2 (nexvo-web)"
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
sleep 4
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200\|307\|308"; then
  log "Web berjalan di port 3000"
else
  warn "Web belum respond 200, cek: pm2 logs nexvo-web --lines 30"
fi

# Test payment API — should only return qris + usdt
echo ""
echo "==== Cek Payment API (harus hanya QRIS + USDT) ===="
curl -s http://localhost:3000/api/payment-methods 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
    types = sorted(set(m['type'] for m in d.get('data', [])))
    print('  Types:', types)
    if set(types) <= {'qris', 'usdt'}:
        print('  [OK] PASS: Only qris + usdt returned')
    else:
        print('  [WARN] Still has legacy types:', set(types) - {'qris','usdt'})
        print('  -> Buka admin Payment page sekali untuk auto-purge legacy methods')
    for m in d.get('data', []):
        print(f'    - {m[\"type\"]}: {m[\"name\"]}')
except Exception as e:
    print('  (could not parse:', e, ')')
" 2>/dev/null || warn "Tidak bisa cek API (server masih starting)"

echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  DEPLOY SELESAI!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "Perubahan:"
echo "  • Admin > Payment: HANYA QRIS dan USDT (tidak ada bank/ewallet/crypto)"
echo "  • Form tambah metode: cuma 2 tombol (QRIS, USDT)"
echo "  • Legacy methods (bank/ewallet/crypto) AUTO-PURGE dari database"
echo "    saat admin buka halaman Payment"
echo "  • API validasi: hanya qris/usdt yang diterima"
echo "  • Public API: hanya return qris/usdt"
echo "  • Deposit page: tab USDT tidak include crypto lagi"
echo ""
echo "Cara verify:"
echo "  1. Login admin > menu Payment"
echo "  2. Page akan auto-purge bank/ewallet/crypto dari DB"
echo "  3. Hanya QRIS dan USDT yang tersisa"
echo ""
echo "Kalau masih kelihatan bank/ewallet:"
echo "  - Hard refresh browser (Ctrl+Shift+R)"
echo "  - Atau buka Payment page lagi (auto-cleanup jalan tiap load)"
echo ""
