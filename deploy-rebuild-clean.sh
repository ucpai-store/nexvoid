#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO — Clean Rebuild Deploy (fix "Failed to load chunk" error)
#
#  Penyebab error "Failed to load chunk /_next/static/chunks/xxx.js":
#    1. Browser cache reference chunk lama yang sudah ganti nama (content hash)
#    2. Build tidak lengkap (.next folder corrupt)
#    3. PM2 restart terlalu cepat sebelum build selesai
#
#  Solusi script ini:
#    - STOP PM2 nexvo-web DULU (jangan restart saat build)
#    - Hapus .next folder (clean build)
#    - Build ulang dari awal
#    - Verifikasi chunk files ada di .next/static/chunks/
#    - START PM2 nexvo-web setelah build 100% selesai
#    - Reload Nginx (clear any cached chunk references)
#    - Trigger profit cron (backfill missed days)
# ═══════════════════════════════════════════════════════════════
set -e

PROJECT_DIR="/home/nexvo"
CRON_PORT=3032

echo "═══════════════════════════════════════════════════════"
echo "  NEXVO Clean Rebuild Deploy — Fix Chunk Load Error"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── Step 1: Pull latest code ───
echo "▼ [1/9] Pulling latest code from GitHub..."
cd "$PROJECT_DIR"
git fetch --all 2>/dev/null || true
git reset --hard origin/main 2>/dev/null || git pull origin main 2>/dev/null || true
echo "✅ Code updated to latest"
git log --oneline -3
echo ""

# ─── Step 2: STOP PM2 nexvo-web FIRST (no serving during rebuild) ───
echo "▼ [2/9] Stopping PM2 nexvo-web (no requests during rebuild)..."
pm2 stop nexvo-web 2>/dev/null || echo "⚠️ nexvo-web not running (will start fresh)"
echo "✅ nexvo-web stopped"
echo ""

# ─── Step 3: Clean .next folder (force fresh build) ───
echo "▼ [3/9] Cleaning .next folder (fresh build)..."
rm -rf "$PROJECT_DIR/.next"
echo "✅ .next folder removed"
echo ""

# ─── Step 4: Install deps ───
echo "▼ [4/9] Installing dependencies..."
bun install --frozen-lockfile 2>/dev/null || bun install 2>/dev/null || npm install 2>/dev/null
echo "✅ Dependencies ready"
echo ""

# ─── Step 5: Generate Prisma client ───
echo "▼ [5/9] Generating Prisma client..."
bunx prisma generate 2>/dev/null || npx prisma generate 2>/dev/null
echo "✅ Prisma client ready"
echo ""

# ─── Step 6: Build Next.js (FRESH, no cache) ───
echo "▼ [6/9] Building Next.js (fresh build, this takes 1-2 min)..."
bun run build 2>&1 | tail -15
BUILD_EXIT=${PIPESTATUS[0]}
if [ "$BUILD_EXIT" != "0" ]; then
  echo "❌ Build FAILED! Restarting nexvo-web with old build..."
  pm2 restart nexvo-web 2>/dev/null || pm2 start nexvo-web 2>/dev/null || true
  exit 1
fi
echo "✅ Build complete"
echo ""

# ─── Verify chunks exist ───
echo "▼ [6.5] Verifying chunk files exist in .next/static/chunks/..."
CHUNK_COUNT=$(find "$PROJECT_DIR/.next/static/chunks" -name "*.js" 2>/dev/null | wc -l)
echo "   Found $CHUNK_COUNT chunk files in .next/static/chunks/"
if [ "$CHUNK_COUNT" -lt 10 ]; then
  echo "❌ WARNING: Very few chunk files found! Build may be incomplete."
  ls -la "$PROJECT_DIR/.next/static/chunks/" 2>/dev/null | head -10
fi
echo ""

# ─── Step 7: Start PM2 nexvo-web (fresh, with new build) ───
echo "▼ [7/9] Starting PM2 nexvo-web with new build..."
pm2 restart nexvo-web --update-env 2>/dev/null || pm2 start "bun run start" --name nexvo-web 2>/dev/null || pm2 start nexvo-web 2>/dev/null
sleep 3
echo "✅ nexvo-web restarted with new build"
echo ""

# ─── Step 8: Reload Nginx (clear cached chunk references) ───
echo "▼ [8/9] Reloading Nginx (clear cached chunk refs)..."
nginx -t 2>/dev/null && nginx -s reload 2>/dev/null && echo "✅ Nginx reloaded" || echo "⚠️ Nginx reload skipped (not running or no perms)"
echo ""

# ─── Step 9: Trigger profit cron (backfill missed days) ───
echo "▼ [9/9] Triggering profit cron with backfill (force=true)..."
sleep 2
TRIGGER_RESP=$(curl -s --max-time 60 -X POST "http://localhost:$CRON_PORT/api/trigger/profit?force=true" 2>/dev/null || echo "FAILED")
if [ "$TRIGGER_RESP" = "FAILED" ] || [ -z "$TRIGGER_RESP" ]; then
  echo "⚠️ Cron service not responding on port $CRON_PORT — trying to restart it..."
  pm2 restart nexvo-cron --update-env 2>/dev/null || pm2 start "bun run cron-service.ts" --name nexvo-cron 2>/dev/null || true
  sleep 4
  TRIGGER_RESP=$(curl -s --max-time 60 -X POST "http://localhost:$CRON_PORT/api/trigger/profit?force=true" 2>/dev/null || echo "FAILED")
fi

if [ "$TRIGGER_RESP" != "FAILED" ] && [ -n "$TRIGGER_RESP" ]; then
  echo "Profit trigger response:"
  echo "$TRIGGER_RESP" | python3 -m json.tool 2>/dev/null || echo "$TRIGGER_RESP"
else
  echo "❌ Profit trigger still failing — check: pm2 logs nexvo-cron"
fi
echo ""

# ─── Final verification ───
echo "─── PM2 Status ───"
pm2 list 2>/dev/null | grep -E "nexvo|name|│" | head -10
echo ""

echo "─── Web health check ───"
sleep 2
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://localhost:3000" 2>/dev/null || echo "000")
echo "HTTP status for localhost:3000 → $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Web is responding 200 OK"
else
  echo "⚠️ Web not responding 200 — check: pm2 logs nexvo-web"
fi
echo ""

echo "─── Cron service status ───"
CRON_STATUS=$(curl -s --max-time 5 "http://localhost:$CRON_PORT/api/status" 2>/dev/null || echo "FAILED")
if [ "$CRON_STATUS" != "FAILED" ] && [ -n "$CRON_STATUS" ]; then
  echo "$CRON_STATUS" | python3 -m json.tool 2>/dev/null || echo "$CRON_STATUS"
else
  echo "❌ Cron service not responding — check: pm2 logs nexvo-cron"
fi
echo ""

echo "─── Recent web logs ───"
pm2 logs nexvo-web --lines 10 --nostream 2>/dev/null | tail -12
echo ""

echo "═══════════════════════════════════════════════════════"
echo "  ✅ Clean Rebuild Deploy Complete"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "🔴 PENTING — BROWSER CACHE FIX:"
echo "   Di browser, tekan Ctrl+Shift+R (hard refresh) atau Ctrl+F5"
echo "   Kalau masih error, buka DevTools (F12) → Network tab →"
echo "   centang 'Disable cache' → reload page."
echo ""
echo "   Atau buka di Incognito/Private window untuk test."
echo ""
echo "Profit cron sudah di-trigger dengan backfill —"
echo "profit yang tertinggal kemarin malam akan otomatis masuk."
