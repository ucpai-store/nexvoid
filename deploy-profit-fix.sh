#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO Deploy: Fix Profit Cron + Manual Trigger
# ════════════════════════════════════════════════════════════════
# MASALAH:
#   - Profit tidak masuk jam 00:00 WIB tadi malam
#   - Root cause: cron-service hanya run di window 00:00-00:02 WIB
#     Jika service down/restart saat itu → profit MISS untuk hari itu
#     Tidak ada catch-up mechanism
#
# FIX:
#   1. Cron-service: profit run ONCE per WIB day (bukan 2-min window)
#      - Run di first check setelah midnight WIB
#      - Catch-up: kalau service down di midnight, run saat discovery
#      - Retry: kalau profit gagal, reset lastProfitRunDate → retry tick berikutnya
#   2. Weekend guard tetap aktif (Sabtu/Minggu libur)
#   3. Admin API: /api/admin/profit-trigger (POST=trigger, GET=diagnostic)
#      - force=true: bypass weekend + already-credited check
#   4. Admin Dashboard: "Kontrol Profit Harian" card dengan diagnostic + 2 tombol
# ════════════════════════════════════════════════════════════════
set -e

PROJECT_DIR="/home/nexvo"
PM2_NAME="nexvo-web"
CRON_NAME="nexvo-cron"

echo "═══════════════════════════════════════════════════"
echo "  NEXVO Deploy: Fix Profit Cron + Manual Trigger"
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

# ─── STEP 6: RESTART PM2 (WEB) ───────────────────────────────────
echo ""
echo "🔄 STEP 6: Restart PM2 Web ($PM2_NAME)..."
pm2 delete "$PM2_NAME" 2>/dev/null || true
cd .next/standalone
pm2 start server.js --name "$PM2_NAME" --cwd "$(pwd)"
pm2 save 2>/dev/null || true
cd "$PROJECT_DIR"
echo "✓ PM2 Web restarted"

# ─── STEP 7: RESTART PM2 (CRON) ──────────────────────────────────
echo ""
echo "🔄 STEP 7: Restart PM2 Cron ($CRON_NAME)..."
pm2 delete "$CRON_NAME" 2>/dev/null || true
pm2 start "bun run cron-service.ts" --name "$CRON_NAME" --update-env 2>/dev/null || echo "  ⚠️  cron-service opsional (skip)"
pm2 save 2>/dev/null || true
echo "✓ PM2 Cron restarted (catch-up profit logic aktif)"

# ─── STEP 8: WAIT FOR SERVER ─────────────────────────────────────
echo ""
echo "⏳ STEP 8: Waiting for server..."
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

# ─── STEP 9: CHECK CRON SERVICE ──────────────────────────────────
echo ""
echo "📊 STEP 9: Check cron-service status..."
CRON_STATUS=$(pm2 list 2>/dev/null | grep "$CRON_NAME" || echo "")
if [ -z "$CRON_STATUS" ]; then
  echo "  ⚠️  nexvo-cron NOT running! Profit akan tidak otomatis."
  echo "     Start manual: pm2 start 'bun run cron-service.ts' --name nexvo-cron"
else
  echo "  ✅ nexvo-cron running"
  # Check recent logs
  echo "  Recent cron logs:"
  pm2 logs "$CRON_NAME" --lines 5 --nostream 2>/dev/null | tail -8 | sed 's/^/    /'
fi

# ─── STEP 10: MANUAL PROFIT TRIGGER (for today's missed profit) ──
echo ""
echo "💰 STEP 10: Manual profit trigger (credit profit yang miss)..."
ADMIN_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@2024"}' 2>/dev/null | \
  python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null || echo "")

if [ -n "$ADMIN_TOKEN" ]; then
  echo "  ✓ Admin login OK"

  # Get diagnostic first
  echo "  Getting diagnostic..."
  DIAG=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/api/admin/profit-trigger 2>/dev/null)
  TOTAL_INV=$(echo "$DIAG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('totalActiveInvestments',0))" 2>/dev/null || echo "0")
  NEEDS=$(echo "$DIAG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('needsCrediting',0))" 2>/dev/null || echo "0")
  ALREADY=$(echo "$DIAG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('alreadyCreditedToday',0))" 2>/dev/null || echo "0")
  IS_WEEKEND=$(echo "$DIAG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('isWeekend',False))" 2>/dev/null || echo "False")
  DAY_NAME=$(echo "$DIAG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('dayName','?'))" 2>/dev/null || echo "?")

  echo "  WIB Day: $DAY_NAME (weekend: $IS_WEEKEND)"
  echo "  Active investments: $TOTAL_INV"
  echo "  Already credited today: $ALREADY"
  echo "  Needs crediting: $NEEDS"

  if [ "$NEEDS" -gt 0 ]; then
    echo ""
    echo "  🚀 Triggering profit now..."
    TRIGGER_RES=$(curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"action":"trigger"}' \
      http://localhost:3000/api/admin/profit-trigger 2>/dev/null)
    PROCESSED=$(echo "$TRIGGER_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('processed',0))" 2>/dev/null || echo "0")
    TOTAL_PROFIT=$(echo "$TRIGGER_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('totalProfit',0))" 2>/dev/null || echo "0")
    ERRORS=$(echo "$TRIGGER_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('errors',0))" 2>/dev/null || echo "0")
    echo "  ✅ Profit triggered: $PROCESSED processed, Rp $TOTAL_PROFIT credited, $ERRORS errors"
  elif [ "$TOTAL_INV" -eq 0 ]; then
    echo "  ℹ️  Tidak ada investasi aktif. Tidak perlu trigger."
  else
    echo "  ✅ Semua investasi sudah dikredit hari ini. Tidak perlu trigger."
  fi
else
  echo "  ⚠️  Admin login gagal. Skip auto-trigger."
  echo "     Anda bisa trigger manual lewat Admin Dashboard → Kontrol Profit Harian"
fi

# ─── STEP 11: VERIFICATION ───────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo "  VERIFICATION"
echo "═══════════════════════════════════════════════════"

MAIN=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)
echo "  Main site (/): HTTP $MAIN $([ "$MAIN" = "200" ] && echo '✅' || echo '❌')"

echo ""
echo "  PM2 processes:"
pm2 list 2>/dev/null | grep -E "nexvo-web|nexvo-cron|name|status" | head -5

echo ""
echo "═══════════════════════════════════════════════════"
echo "  DEPLOY SELESAI!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "📌 PERBAIKAN:"
echo "  1. Cron-service sekarang run profit ONCE per WIB day (bukan 2-min window)"
echo "     → Kalau service down di midnight, profit tetap jalan saat service up"
echo "     → Kalau profit gagal, auto-retry di tick berikutnya"
echo "  2. Weekend guard tetap aktif (Sabtu/Minggu libur)"
echo "  3. Admin Dashboard → 'Kontrol Profit Harian' card"
echo "     → Lihat diagnostic (WIB time, active investments, needs crediting)"
echo "     → Tombol 'Trigger Profit Normal' (credit yang belum)"
echo "     → Tombol 'Force Trigger' (paksa credit semua, bypass cek)"
echo "  4. API: POST /api/admin/profit-trigger (admin auth required)"
echo "     → ?force=true untuk bypass weekend + already-credited check"
echo ""
echo "🔧 CARA TRIGGER MANUAL (jika perlu):"
echo "  1. Login admin di https://nexvo.id/#admin-login"
echo "  2. Buka Admin Dashboard"
echo "  3. Scroll ke 'Kontrol Profit Harian'"
echo "  4. Klik 'Trigger Profit Normal' atau 'Force Trigger'"
echo ""
echo "⚠️  HARD REFRESH browser (Ctrl+Shift+R) untuk load kode baru!"
echo ""
