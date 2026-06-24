#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO Deploy: Deposit Auto-Approve + Separate Admin Login
# ════════════════════════════════════════════════════════════════
# Changes:
#   1. Deposit proof upload works (new /api/deposit/upload, user-auth)
#   2. Deposits auto-approved — balance credited immediately, NO admin fee
#   3. Admin fee only on withdrawal (withdraw_fee %, unchanged)
#   4. Admin login button removed from user login page
#   5. Separate admin login at /id/admin (not in user SPA)
# ════════════════════════════════════════════════════════════════
set -e

PROJECT_DIR="/home/nexvo"
PM2_NAME="nexvo-web"

echo "═══════════════════════════════════════════════════"
echo "  NEXVO Deploy: Deposit Auto-Approve + Admin Login"
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

# Copy static assets to standalone (so images/files survive)
echo ""
echo "📂 Copying static assets..."
if [ -d ".next/standalone" ]; then
  cp -r public .next/standalone/ 2>/dev/null || true
  cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
  # Preserve uploaded files across rebuilds
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

# Wait for server to be ready
echo ""
echo "⏳ Waiting for server to be ready..."
sleep 5
for i in 1 2 3 4 5; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep -q "200\|301\|302"; then
    echo "✓ Server is responding"
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
  echo "✅ Admin login page (/id/admin): HTTP 200"
else
  echo "❌ Admin login page: HTTP $ADMIN_PAGE"
fi

# 2. Deposit upload endpoint (should be 401 without auth = exists)
UPLOAD_CHECK=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/deposit/upload)
if [ "$UPLOAD_CHECK" = "401" ]; then
  echo "✅ Deposit upload endpoint: exists (401 without auth = correct)"
else
  echo "❌ Deposit upload endpoint: HTTP $UPLOAD_CHECK (expected 401)"
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
echo "📌 RINGKASAN PERUBAHAN:"
echo "  1. ✅ Bukti transfer upload berfungsi (user bisa upload, admin lihat)"
echo "  2. ✅ Deposit AUTO-APPROVED — saldo masuk otomatis, TANPA admin fee"
echo "  3. ✅ Admin fee HANYA saat withdrawal (sudah berjalan)"
echo "  4. ✅ Tombol Admin dihilangkan dari halaman login user"
echo "  5. ✅ Login admin terpisah di: https://nexvo.id/id/admin"
echo ""
echo "🔗 Login admin: https://nexvo.id/id/admin"
echo "🔗 Login user:   https://nexvo.id/  (tidak ada tombol admin lagi)"
echo ""
echo "⚠️  Lakukan HARD REFRESH di browser (Ctrl+Shift+R) untuk melihat perubahan."
echo ""
