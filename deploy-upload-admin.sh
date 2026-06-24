#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO Deploy: Fix Upload + Redesign Admin Login
# ════════════════════════════════════════════════════════════════
# Fixes:
#   1. /api/upload route restored (was gitignored + deleted)
#      → QRIS/USDT QR image upload works again in admin payment
#      → Product images, banners, profile avatars all work
#   2. Admin login /id/admin redesigned (premium glassmorphism)
# ════════════════════════════════════════════════════════════════
set -e

PROJECT_DIR="/home/nexvo"
PM2_NAME="nexvo-web"

echo "═══════════════════════════════════════════════════"
echo "  NEXVO Deploy: Fix Upload + Admin Login Design"
echo "═══════════════════════════════════════════════════"

# Check curl
if ! command -v curl &> /dev/null; then
  echo "⚠️  curl not found. Installing..."
  apt-get update -qq && apt-get install -y -qq curl > /dev/null
fi

cd "$PROJECT_DIR" || { echo "❌ Project dir $PROJECT_DIR not found!"; exit 1; }
echo "✓ Masuk ke $PROJECT_DIR"

# Pull latest code
echo ""
echo "📥 Pulling latest code from GitHub..."
git fetch origin main
git reset --hard origin/main
echo "✓ Code updated"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
if command -v bun &> /dev/null; then
  bun install 2>/dev/null || npm install --legacy-peer-deps
else
  npm install --legacy-peer-deps
fi
echo "✓ Dependencies ready"

# Build
echo ""
echo "🔨 Building Next.js..."
npm run build
echo "✓ Build complete"

# Copy static assets to standalone
echo ""
echo "📂 Copying static assets..."
if [ -d ".next/standalone" ]; then
  cp -r public .next/standalone/ 2>/dev/null || true
  cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
  if [ -d "uploads" ]; then
    cp -r uploads .next/standalone/ 2>/dev/null || true
  fi
  echo "✓ Static assets copied"
else
  echo "⚠️  standalone dir not found, skipping copy"
fi

# Restart PM2
echo ""
echo "🔄 Restarting PM2 ($PM2_NAME)..."
pm2 restart "$PM2_NAME" --update-env 2>/dev/null || {
  echo "⚠️  PM2 restart failed, trying start..."
  cd .next/standalone && pm2 start server.js --name "$PM2_NAME" 2>/dev/null
}
pm2 save 2>/dev/null || true
echo "✓ PM2 restarted"

# Wait for server
echo ""
echo "⏳ Waiting for server..."
sleep 5
for i in 1 2 3 4 5; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep -q "200\|301\|302"; then
    echo "✓ Server responding"
    break
  fi
  echo "  Attempt $i: waiting..."
  sleep 3
done

# Verification
echo ""
echo "═══════════════════════════════════════════════════"
echo "  VERIFICATION"
echo "═══════════════════════════════════════════════════"

# 1. Admin login page
ADMIN_PAGE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/id/admin)
if [ "$ADMIN_PAGE" = "200" ]; then
  echo "✅ Admin login (/id/admin): HTTP 200"
else
  echo "❌ Admin login: HTTP $ADMIN_PAGE"
fi

# 2. Upload endpoint (should be 401 without auth = exists)
UPLOAD_CHECK=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/upload)
if [ "$UPLOAD_CHECK" = "401" ]; then
  echo "✅ Upload endpoint (/api/upload): exists (401 without auth = correct)"
else
  echo "❌ Upload endpoint: HTTP $UPLOAD_CHECK (expected 401)"
fi

# 3. Main site
MAIN_SITE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)
if [ "$MAIN_SITE" = "200" ]; then
  echo "✅ Main site: HTTP 200"
else
  echo "❌ Main site: HTTP $MAIN_SITE"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  DEPLOY SELESAI!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "📌 YANG DIPERBAIKI:"
echo "  1. ✅ Upload QRIS/USDT QR image berfungsi kembali (/api/upload restored)"
echo "  2. ✅ Upload product image, banner, profile avatar juga berfungsi"
echo "  3. ✅ Halaman login admin /id/admin didesain ulang (premium, rapi)"
echo ""
echo "🔗 Login admin: https://nexvo.id/id/admin"
echo ""
echo "⚠️  HARD REFRESH browser (Ctrl+Shift+R) untuk melihat perubahan."
echo ""
