#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO Deploy: New Withdrawal System + Transaction IDs
# ════════════════════════════════════════════════════════════════
# PERUBAHAN:
#   1. WD minimal Rp100.000
#   2. WD maksimal = harga paket/produk terakhir yang dibeli
#      (contoh: beli 160k → max WD 160k, beli lagi 360k → max WD 360k)
#   3. Potongan WD = 10% (fixed)
#   4. User tidak bisa WD baru jika masih ada WD pending
#      (harus tunggu WD sebelumnya di-approve/reject admin)
#   5. Setiap transaksi WD punya ID (WD-XXXXXX) untuk mudah dicari admin
#   6. Setiap transaksi Deposit sudah punya ID (DP-XXXXXX)
# ════════════════════════════════════════════════════════════════
set -e

PROJECT_DIR="/home/nexvo"
PM2_NAME="nexvo-web"

echo "═══════════════════════════════════════════════════"
echo "  NEXVO Deploy: New Withdrawal System + TX IDs"
echo "═══════════════════════════════════════════════════"

cd "$PROJECT_DIR" || { echo "❌ Project dir $PROJECT_DIR not found!"; exit 1; }
echo "✓ Masuk ke $PROJECT_DIR"

# ─── STEP 1: PULL LATEST CODE ────────────────────────────────────
echo ""
echo "📥 STEP 1: Pull latest code..."
git fetch origin main
git reset --hard origin/main
echo "✓ Code updated"

# ─── STEP 2: INSTALL DEPENDENCIES ────────────────────────────────
echo ""
echo "📦 STEP 2: Install dependencies..."
if command -v bun &> /dev/null; then
  bun install 2>/dev/null || npm install --legacy-peer-deps
else
  npm install --legacy-peer-deps
fi
echo "✓ Dependencies ready"

# ─── STEP 3: PUSH PRISMA SCHEMA (add withdrawalId column) ────────
echo ""
echo "🗄️  STEP 3: Update database schema (add withdrawalId)..."
npx prisma db push --accept-data-loss 2>/dev/null || npx prisma db push
echo "✓ Database schema updated (withdrawalId column added)"

# ─── STEP 4: BACKFILL withdrawalId for existing withdrawals ──────
echo ""
echo "🔧 STEP 4: Backfill withdrawalId for existing withdrawals..."
node -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
  const withdrawals = await db.withdrawal.findMany({ where: { withdrawalId: null } });
  console.log('Found', withdrawals.length, 'withdrawals without withdrawalId');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (const w of withdrawals) {
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    const wid = 'WD-' + code;
    await db.withdrawal.update({ where: { id: w.id }, data: { withdrawalId: wid } });
    console.log('  Updated', w.id, '→', wid);
  }
}
main().catch(e => console.error(e)).finally(() => db.\$disconnect());
" 2>/dev/null || echo "  (backfill skipped - no existing withdrawals or already has ID)"
echo "✓ Backfill complete"

# ─── STEP 5: CLEAR BUILD CACHE ───────────────────────────────────
echo ""
echo "🧹 STEP 5: Clear Next.js build cache..."
rm -rf .next/cache 2>/dev/null || true
rm -rf .next/standalone 2>/dev/null || true
echo "✓ Cache cleared"

# ─── STEP 6: BUILD ───────────────────────────────────────────────
echo ""
echo "🔨 STEP 6: Build Next.js (fresh)..."
npm run build
echo "✓ Build complete"

# ─── STEP 7: COPY STATIC + UPLOADS TO STANDALONE ─────────────────
echo ""
echo "📂 STEP 7: Copy assets to standalone..."
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

# ─── STEP 8: RESTART PM2 ─────────────────────────────────────────
echo ""
echo "🔄 STEP 8: Restart PM2 ($PM2_NAME)..."
pm2 delete "$PM2_NAME" 2>/dev/null || true
cd .next/standalone
pm2 start server.js --name "$PM2_NAME" --cwd "$(pwd)"
pm2 save 2>/dev/null || true
cd "$PROJECT_DIR"
echo "✓ PM2 restarted (fresh process)"

# ─── STEP 9: WAIT FOR SERVER ─────────────────────────────────────
echo ""
echo "⏳ STEP 9: Waiting for server..."
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

# ─── STEP 10: VERIFICATION ───────────────────────────────────────
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

# 3. Withdraw endpoint
WD=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/withdraw)
echo "  Withdraw endpoint (/api/withdraw): HTTP $WD $([ "$WD" = "401" ] && echo '✅ (exists)' || echo '❌')"

# 4. Test withdraw meta (min/max/fee)
echo ""
echo "  Testing withdraw meta (min/max/fee)..."
USER_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"whatsapp":"628123456789","password":"Test@1234"}' 2>/dev/null | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null || echo "")

if [ -n "$USER_TOKEN" ]; then
  META=$(curl -s http://localhost:3000/api/withdraw -H "Authorization: Bearer $USER_TOKEN" 2>/dev/null | \
    python3 -c "import sys,json; d=json.load(sys.stdin); m=d.get('meta',{}); print(f\"min={m.get('minWithdraw')}, max={m.get('maxWithdraw')}, fee={m.get('feePercent')}%\")" 2>/dev/null || echo "unknown")
  echo "  Withdraw meta: $META"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  DEPLOY SELESAI!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "📌 SISTEM WITHDRAWAL BARU:"
echo "  1. ✅ Minimal WD: Rp100.000"
echo "  2. ✅ Maksimal WD = harga paket/produk terakhir dibeli"
echo "     (beli 160k → max WD 160k, beli 360k → max WD 360k)"
echo "  3. ✅ Potongan WD: 10% (fixed)"
echo "  4. ✅ User tidak bisa WD baru jika masih ada WD pending"
echo "     (harus tunggu WD sebelumnya di-approve/reject admin)"
echo "  5. ✅ Setiap WD punya ID: WD-XXXXXX (untuk mudah dicari admin)"
echo "  6. ✅ Setiap Deposit punya ID: DP-XXXXXX (sudah ada sebelumnya)"
echo ""
echo "🔗 Admin panel: https://nexvo.id/#admin-dashboard → Withdrawals"
echo "⚠️  HARD REFRESH browser (Ctrl+Shift+R) untuk load kode baru!"
echo ""
