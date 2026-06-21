#!/bin/bash
# ============================================================
# NEXVO - Auto Deploy Script
# ============================================================
# Cara pakai (jalankan di VPS sebagai root):
#   bash /home/nexvo/deploy.sh
#
# Atau langsung dari GitHub (saat VPS sudah online):
#   curl -fsSL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/deploy.sh | bash
# ============================================================

set -e

PROJECT_DIR="/home/nexvo"
REPO_URL="https://github.com/ucpai-store/nexvoid.git"
BRANCH="main"

echo "=================================================="
echo "  NEXVO Auto Deploy - $(date '+%Y-%m-%d %H:%M:%S')"
echo "=================================================="

# 1. Pastikan direktori project ada
if [ ! -d "$PROJECT_DIR" ]; then
  echo "[1/6] Cloning repo ke $PROJECT_DIR ..."
  git clone -b "$BRANCH" "$REPO_URL" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
else
  echo "[1/6] Update repo di $PROJECT_DIR ..."
  cd "$PROJECT_DIR"
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
  git pull origin "$BRANCH" || true
fi

# 2. Install dependencies
echo ""
echo "[2/6] Install dependencies (npm install) ..."
npm install --legacy-peer-deps

# 3. Generate Prisma client
echo ""
echo "[3/6] Generate Prisma client ..."
npx prisma generate || true

# 4. Push schema (jangan reset data! hanya sync schema)
echo ""
echo "[4/6] Push prisma schema (db push, KEEP data) ..."
npx prisma db push --accept-data-loss=false || npx prisma db push

# 5. Build Next.js
echo ""
echo "[5/6] Build Next.js (npm run build) ..."
npm run build

# Copy static assets ke standalone
echo ""
echo "  Copy static -> standalone ..."
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
cp -r public .next/standalone/public 2>/dev/null || true

# 6. Restart PM2
echo ""
echo "[6/6] Restart PM2 ..."
if command -v pm2 &> /dev/null; then
  pm2 restart nexvo-web nexvo-cron 2>/dev/null || {
    echo "  PM2 process belum ada, starting fresh ..."
    cd .next/standalone
    pm2 start server.js --name nexvo-web --update-env
    cd "$PROJECT_DIR"
    pm2 start "npm run cron" --name nexvo-cron --update-env 2>/dev/null || true
  }
  pm2 save
  echo "  PM2 status:"
  pm2 list
else
  echo "  [WARNING] PM2 belum terinstall. Install dengan: npm install -g pm2"
fi

echo ""
echo "=================================================="
echo "  DEPLOY SELESAI!"
echo "  Web: http://nexvo.id  (atau http://76.13.198.125:3000)"
echo "  Cek log: pm2 logs nexvo-web --lines 50"
echo "=================================================="
echo ""
echo "NOTE: Untuk hapus semua akun user yang sudah daftar:"
echo "  1. Login sebagai super admin di /admin"
echo "  2. Buka Settings > tab 'Reset Data'"
echo "  3. Klik 'Factory Reset Sekarang'"
echo "  4. Ketik: RESET ALL USER DATA"
echo "  5. Konfirmasi. Selesai."
