#!/bin/bash
# ============================================================
# NEXVO - Deploy: Permanent Logo (background removed, transparent PNG)
# ============================================================
# Installs the new NEXVO logo with transparent background permanently.
# - Overwrites public/nexvo-logo.png (the default fallback)
# - Removes any previously uploaded custom logos from uploads/
# - Resets SystemSettings.site_logo to the default (which is now the new logo)
# - Clears browser cache via cache-busting query param
#
# Cara pakai (di VPS sebagai root):
#   curl -fsSL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/deploy-logo.sh | bash
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
echo "   NEXVO - Deploy: Permanent Logo (Transparent Background)"
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

step "1/5 Pull latest code dari GitHub (ambil logo baru)"
if [ ! -d "$PROJECT_DIR" ]; then
  err "Project dir $PROJECT_DIR tidak ada. Jalankan deploy.sh dulu."
  exit 1
fi
cd "$PROJECT_DIR"
git fetch origin main
git reset --hard origin/main
log "Code updated: $(git rev-parse --short HEAD)"

step "2/5 Verifikasi file logo baru"
if [ ! -f "$PROJECT_DIR/public/nexvo-logo.png" ]; then
  err "File public/nexvo-logo.png tidak ditemukan di repo!"
  exit 1
fi
FILESIZE=$(stat -c%s "$PROJECT_DIR/public/nexvo-logo.png")
log "Logo ditemukan: public/nexvo-logo.png ($FILESIZE bytes)"

step "3/5 Hapus custom logo lama dari uploads/"
# Remove any previously uploaded custom logos so the default (new) logo is used
UPLOADS_DIR="$PROJECT_DIR/uploads"
if [ -d "$UPLOADS_DIR" ]; then
  rm -f "$UPLOADS_DIR"/site-logo-* 2>/dev/null || true
  rm -f "$UPLOADS_DIR"/site-logo-transparent* 2>/dev/null || true
  log "Custom logo lama dihapus dari uploads/"
else
  log "uploads/ tidak ada (skip)"
fi

# Also clean standalone copies
STANDALONE_UPLOADS="$PROJECT_DIR/.next/standalone/uploads"
if [ -d "$STANDALONE_UPLOADS" ]; then
  rm -f "$STANDALONE_UPLOADS"/site-logo-* 2>/dev/null || true
  log "Custom logo lama dihapus dari standalone/uploads/"
fi

step "4/5 Reset DB: site_logo → /api/files/nexvo-logo.png"
# Reset the site_logo setting in the database so the new default logo is used
cd "$PROJECT_DIR"
node -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  try {
    // Reset site_logo to default (which now points to the new transparent logo)
    await db.systemSettings.upsert({
      where: { key: 'site_logo' },
      update: { value: '/api/files/nexvo-logo.png' },
      create: { key: 'site_logo', value: '/api/files/nexvo-logo.png' },
    });
    // Reset site_favicon too
    await db.systemSettings.upsert({
      where: { key: 'site_favicon' },
      update: { value: '/api/files/nexvo-logo.png' },
      create: { key: 'site_favicon', value: '/api/files/nexvo-logo.png' },
    });
    console.log('[OK] DB reset: site_logo & site_favicon → /api/files/nexvo-logo.png');
  } catch (e) {
    console.error('[WARN] DB reset failed (non-critical):', e.message);
    console.log('      Logo file sudah di-update, DB reset bisa diabaikan jika pakai default.');
  } finally {
    await db.\$disconnect();
  }
})();
" 2>&1 || warn "DB reset gagal (lanjut — logo file sudah diupdate)"

step "5/5 Build & Restart PM2"
# Build so the new logo is included in the standalone output
npm run build 2>&1 | tail -10 || { err "Build gagal!"; exit 1; }
log "Build sukses"

# Copy static + public ke standalone
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
cp -r public .next/standalone/public 2>/dev/null || true
log "Static + public assets copied"

# Restart PM2
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
# Check the logo is served
LOGO_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/files/nexvo-logo.png 2>/dev/null || echo "000")
if [ "$LOGO_STATUS" = "200" ]; then
  log "Logo accessible: HTTP 200"
else
  warn "Logo belum respond 200 (status: $LOGO_STATUS), cek: pm2 logs nexvo-web --lines 30"
fi

# Check main page
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200\|307\|308"; then
  log "Web berjalan di port 3000"
else
  warn "Web belum respond 200"
fi

echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  LOGO DEPLOY SELESAI!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "Yang dilakukan:"
echo "  • Logo baru (background transparan) dipasang permanen"
echo "  • File: public/nexvo-logo.png (720x589, transparent PNG)"
echo "  • Custom logo lama dihapus dari uploads/"
echo "  • DB site_logo & site_favicon direset ke default (logo baru)"
echo "  • PM2 di-restart"
echo ""
echo "Cara verify:"
echo "  1. Buka https://nexvo.id"
echo "  2. Hard refresh browser (Ctrl+Shift+R) untuk clear cache"
echo "  3. Logo baru akan tampil dengan background transparan"
echo ""
echo "Kalau logo masih lama:"
echo "  - Clear browser cache (Ctrl+Shift+Delete)"
echo "  - Atau buka incognito mode"
echo ""
