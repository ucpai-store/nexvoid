#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO Deploy: Deposit Manual Approval (Admin cek dulu)
# ════════════════════════════════════════════════════════════════
# PERUBAHAN:
#   - Deposit TIDAK auto-approved lagi
#   - Deposit status = 'pending' setelah user submit
#   - Admin HARUS approve di admin panel, BARU saldo masuk
#   - Admin fee tetap 0 di deposit (hanya di withdrawal)
#   - User lihat status "Menunggu Persetujuan Admin" di success modal
# ════════════════════════════════════════════════════════════════
set -e

PROJECT_DIR="/home/nexvo"
PM2_NAME="nexvo-web"

echo "═══════════════════════════════════════════════════"
echo "  NEXVO Deploy: Deposit Manual Approval"
echo "  (Admin cek dulu, baru saldo masuk)"
echo "═══════════════════════════════════════════════════"

cd "$PROJECT_DIR" || { echo "❌ Project dir $PROJECT_DIR not found!"; exit 1; }
echo "✓ Masuk ke $PROJECT_DIR"

# ─── STEP 1: PULL LATEST CODE ────────────────────────────────────
echo ""
echo "📥 STEP 1: Pull latest code..."
git fetch origin main
git reset --hard origin/main
echo "✓ Code updated"

# ─── STEP 2: CLEAR BUILD CACHE ───────────────────────────────────
echo ""
echo "🧹 STEP 2: Clear Next.js build cache..."
rm -rf .next/cache 2>/dev/null || true
rm -rf .next/standalone 2>/dev/null || true
echo "✓ Cache cleared"

# ─── STEP 3: INSTALL DEPENDENCIES ────────────────────────────────
echo ""
echo "📦 STEP 3: Install dependencies..."
if command -v bun &> /dev/null; then
  bun install 2>/dev/null || npm install --legacy-peer-deps
else
  npm install --legacy-peer-deps
fi
echo "✓ Dependencies ready"

# ─── STEP 4: BUILD ───────────────────────────────────────────────
echo ""
echo "🔨 STEP 4: Build Next.js (fresh)..."
npm run build
echo "✓ Build complete"

# ─── STEP 5: COPY STATIC + UPLOADS TO STANDALONE ─────────────────
echo ""
echo "📂 STEP 5: Copy assets to standalone..."
if [ -d ".next/standalone" ]; then
  cp -r public .next/standalone/ 2>/dev/null || true
  cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
  mkdir -p .next/standalone/uploads 2>/dev/null || true
  if [ -d "uploads" ]; then
    cp -r uploads/* .next/standalone/uploads/ 2>/dev/null || true
  fi
  echo "✓ Assets + uploads dir copied"
else
  echo "⚠️  standalone dir not found!"
fi

# ─── STEP 6: RESTART PM2 ─────────────────────────────────────────
echo ""
echo "🔄 STEP 6: Restart PM2 ($PM2_NAME)..."
pm2 delete "$PM2_NAME" 2>/dev/null || true
cd .next/standalone
pm2 start server.js --name "$PM2_NAME" --cwd "$(pwd)"
pm2 save 2>/dev/null || true
cd "$PROJECT_DIR"
echo "✓ PM2 restarted (fresh process)"

# ─── STEP 7: WAIT FOR SERVER ─────────────────────────────────────
echo ""
echo "⏳ STEP 7: Waiting for server..."
sleep 5
SERVER_OK=false
for i in 1 2 3 4 5 6 7 8; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
  if echo "$CODE" | grep -q "200\|301\|302"; then
    echo "  ✓ Server responding (HTTP $CODE)"
    SERVER_OK=true
    break
  fi
  echo "  Attempt $i: HTTP $CODE, waiting..."
  sleep 3
done

if [ "$SERVER_OK" = false ]; then
  echo "❌ Server not responding! Check PM2 logs:"
  pm2 logs "$PM2_NAME" --lines 30 --nostream
  exit 1
fi

# ─── STEP 8: VERIFICATION ────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo "  VERIFICATION"
echo "═══════════════════════════════════════════════════"

# 1. Main site
MAIN=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)
echo "  Main site (/): HTTP $MAIN $([ "$MAIN" = "200" ] && echo '✅' || echo '❌')"

# 2. Admin login
ADMIN=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/id/admin)
echo "  Admin login (/id/admin): HTTP $ADMIN $([ "$ADMIN" = "200" ] && echo '✅' || echo '❌')"

# 3. Deposit upload endpoint
UPLOAD=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/deposit/upload)
echo "  Deposit upload (/api/deposit/upload): HTTP $UPLOAD $([ "$UPLOAD" = "401" ] && echo '✅ (exists)' || echo '❌')"

# 4. Test deposit flow (should create pending deposit)
echo ""
echo "  Testing deposit flow (should be PENDING, not auto-approved)..."
USER_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"whatsapp":"628123456789","password":"Test@1234"}' 2>/dev/null | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null || echo "")

if [ -n "$USER_TOKEN" ]; then
  # Create a small test image
  echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==" | base64 -d > /tmp/test-proof.png 2>/dev/null
  PROOF_URL=$(curl -s -X POST http://localhost:3000/api/deposit/upload \
    -H "Authorization: Bearer $USER_TOKEN" \
    -F "file=@/tmp/test-proof.png;type=image/png" 2>/dev/null | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('url',''))" 2>/dev/null || echo "")

  if [ -n "$PROOF_URL" ]; then
    DEPOSIT_STATUS=$(curl -s -X POST http://localhost:3000/api/deposit \
      -H "Authorization: Bearer $USER_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"amount\":100000,\"paymentType\":\"qris\",\"paymentName\":\"QRIS\",\"proofImage\":\"$PROOF_URL\"}" 2>/dev/null | \
      python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('status','unknown'))" 2>/dev/null || echo "unknown")

    if [ "$DEPOSIT_STATUS" = "pending" ]; then
      echo "  Deposit status: pending ✅ (menunggu persetujuan admin - CORRECT!)"
    elif [ "$DEPOSIT_STATUS" = "approved" ]; then
      echo "  Deposit status: approved ❌ (masih auto-approved, kode lama belum terdeploy!)"
    else
      echo "  Deposit status: $DEPOSIT_STATUS ⚠️  (unexpected)"
    fi
  fi
  rm -f /tmp/test-proof.png
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  DEPLOY SELESAI!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "📌 PERILAKU BARU:"
echo "  1. User deposit + upload bukti → status = PENDING"
echo "  2. Saldo BELUM masuk (tunggu admin approve)"
echo "  3. Admin cek bukti di /#admin-dashboard → Deposits"
echo "  4. Admin klik ✓ (Approve) → saldo masuk ke user"
echo "  5. Admin klik ✗ (Reject) → deposit ditolak, saldo tidak masuk"
echo "  6. Admin fee tetap 0 di deposit (hanya di withdrawal)"
echo ""
echo "🔗 Admin panel: https://nexvo.id/#admin-dashboard → Deposits"
echo "⚠️  HARD REFRESH browser (Ctrl+Shift+R) untuk load kode baru!"
echo ""
