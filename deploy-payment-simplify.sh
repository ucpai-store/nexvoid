#!/bin/bash
# ============================================================
# NEXVO Deploy: Simplify admin payment to QRIS + USDT only
# ============================================================
# This script:
#   1. Pulls latest code from GitHub
#   2. Rebuilds the Next.js app
#   3. Restarts PM2
#   4. Verifies the payment API only returns qris + usdt
# ============================================================

set -e

PROJECT_DIR="/var/www/nexvo"
REPO_URL="https://github.com/ucpai-store/nexvoid.git"
BRANCH="main"

echo "=========================================="
echo "  NEXVO Deploy: Payment QRIS + USDT Only"
echo "=========================================="
echo ""

# Step 1: Navigate to project
cd "$PROJECT_DIR" || {
  echo "ERROR: Project directory $PROJECT_DIR not found"
  exit 1
}

echo "[1/5] Pulling latest code from GitHub ($BRANCH)..."
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
echo "  ✓ Code updated"

# Step 2: Install dependencies
echo ""
echo "[2/5] Installing dependencies..."
if command -v bun &>/dev/null; then
  bun install --frozen-lockfile 2>/dev/null || bun install
else
  npm install --production=false
fi
echo "  ✓ Dependencies installed"

# Step 3: Generate Prisma client
echo ""
echo "[3/5] Generating Prisma client..."
npx prisma generate
echo "  ✓ Prisma client generated"

# Step 4: Build Next.js
echo ""
echo "[4/5] Building Next.js app..."
if command -v bun &>/dev/null; then
  bun run build
else
  npm run build
fi
echo "  ✓ Build complete"

# Step 5: Restart PM2
echo ""
echo "[5/5] Restarting PM2..."
pm2 restart nexvo 2>/dev/null || pm2 restart all
pm2 save
echo "  ✓ PM2 restarted"

# Verify
echo ""
echo "=========================================="
echo "  Verification"
echo "=========================================="
sleep 3

# Test the payment API
PAYMENT_RESPONSE=$(curl -s http://localhost:3000/api/payment-methods 2>/dev/null || echo "")
if [ -n "$PAYMENT_RESPONSE" ]; then
  echo "Payment API response:"
  echo "$PAYMENT_RESPONSE" | python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
    types = sorted(set(m['type'] for m in d.get('data', [])))
    print(f'  Types: {types}')
    if set(types) <= {'qris', 'usdt'}:
        print('  ✓ PASS: Only qris + usdt returned')
    else:
        print('  ✗ FAIL: Found extra types')
    for m in d.get('data', []):
        print(f'    - {m[\"type\"]}: {m[\"name\"]}')
except Exception as e:
    print(f'  Parse error: {e}')
" 2>/dev/null || echo "  (could not parse response)"
else
  echo "  ⚠ Could not reach API (server may still be starting)"
fi

# Test main page
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
echo "  Main page: HTTP $HTTP_CODE"

echo ""
echo "=========================================="
echo "  Deploy Complete!"
echo "=========================================="
echo ""
echo "Changes deployed:"
echo "  • Admin Payment page now ONLY shows QRIS + USDT — no legacy notices"
echo "  • Legacy bank/ewallet/crypto methods auto-purged from DB on page load"
echo "  • Form type selector: 2 buttons (QRIS, USDT) — no bank/ewallet/crypto"
echo "  • API validation: only qris+usdt accepted"
echo "  • Public API: only returns qris+usdt methods"
echo "  • Deposit page: USDT tab no longer includes crypto"
echo "  • New API: DELETE /api/admin/payment-methods/cleanup-legacy"
echo ""
echo "Admin > Payment now manages DEPOSIT payments only."
echo "Withdraw uses user's own bank accounts (separate system)."
echo ""
