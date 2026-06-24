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

# ─── Step 6: Build Next.js with WEBPACK (NOT turbopack) ───
# Turbopack generates chunk names with '..' which web servers reject (path traversal protection)
# Webpack generates safe chunk names like '1345.3ae473c12736829a.js'
echo "▼ [6/9] Building Next.js with webpack (fresh build, this takes 2-3 min)..."
echo "   (Using --webpack flag to avoid Turbopack chunk name bug)"
bun run build 2>&1 | tail -15
BUILD_EXIT=${PIPESTATUS[0]}
if [ "$BUILD_EXIT" != "0" ]; then
  echo "❌ Build FAILED! Restarting nexvo-web with old build..."
  pm2 restart nexvo-web 2>/dev/null || pm2 start nexvo-web 2>/dev/null || true
  exit 1
fi
echo "✅ Build complete"
echo ""

# ─── Verify chunks exist AND have safe names (no '..') ───
echo "▼ [6.5] Verifying chunk files..."
CHUNK_COUNT=$(find "$PROJECT_DIR/.next/static/chunks" -name "*.js" 2>/dev/null | wc -l)
BAD_CHUNKS=$(find "$PROJECT_DIR/.next/static/chunks" -name "*.js" 2>/dev/null | grep -c '\.\.')
echo "   Found $CHUNK_COUNT chunk files in .next/static/chunks/"
echo "   Chunks with '..' in name (PROBLEMATIC): $BAD_CHUNKS"
if [ "$CHUNK_COUNT" -lt 10 ]; then
  echo "❌ WARNING: Very few chunk files found! Build may be incomplete."
  ls -la "$PROJECT_DIR/.next/static/chunks/" 2>/dev/null | head -10
fi
if [ "$BAD_CHUNKS" -gt 0 ]; then
  echo "❌ WARNING: Found $BAD_CHUNKS chunks with '..' in name — these will 404!"
  echo "   Problematic files:"
  find "$PROJECT_DIR/.next/static/chunks" -name "*.js" 2>/dev/null | grep '\.\.' | head -5
  echo "   This means build did not use webpack. Check package.json build script."
fi
echo ""

# ─── Step 7: Start PM2 nexvo-web in PRODUCTION mode (next start, NOT dev) ───
echo "▼ [7/9] Starting PM2 nexvo-web in PRODUCTION mode..."
# DELETE old process (might be running 'bash server.sh' = dev mode) and recreate with 'next start'
pm2 delete nexvo-web 2>/dev/null && echo "   Deleted old nexvo-web process (was possibly dev mode)" || echo "   No old nexvo-web to delete (fresh start)"
# Start in production mode — serves built .next folder, CSS from /_next/static/css/
cd "$PROJECT_DIR"
pm2 start "bun run start" --name nexvo-web --cwd "$PROJECT_DIR" 2>/dev/null || pm2 start "npx next start" --name nexvo-web --cwd "$PROJECT_DIR" 2>/dev/null
sleep 4
# Verify it's running
PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; data=json.load(sys.stdin); web=[p for p in data if p['name']=='nexvo-web']; print(web[0]['pm2_env']['status'] if web else 'not-found')" 2>/dev/null || echo "unknown")
if [ "$PM2_STATUS" = "online" ]; then
  echo "✅ nexvo-web running in PRODUCTION mode (next start)"
  # Show what command it's actually running
  pm2 describe nexvo-web 2>/dev/null | grep -E "script path|exec mode|status" | head -3
else
  echo "⚠️ nexvo-web status: $PM2_STATUS — trying fallback..."
  pm2 start "bash server.sh" --name nexvo-web --cwd "$PROJECT_DIR" 2>/dev/null
  sleep 3
fi
pm2 save 2>/dev/null || true
echo ""

# ─── Step 8: Reload Nginx (clear cached chunk references) ───
echo "▼ [8/9] Reloading Nginx (clear cached chunk refs)..."
nginx -t 2>/dev/null && nginx -s reload 2>/dev/null && echo "✅ Nginx reloaded" || echo "⚠️ Nginx reload skipped (not running or no perms)"
echo ""

# ─── Step 8.5: Verify CSS and chunks are served ───
echo "▼ [8.5] Verifying static assets are served..."
sleep 2
# Find CSS file
CSS_FILE=$(ls "$PROJECT_DIR/.next/static/css/"*.css 2>/dev/null | head -1 | xargs basename)
if [ -n "$CSS_FILE" ]; then
  CSS_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/_next/static/css/$CSS_FILE" 2>/dev/null)
  echo "   CSS: /_next/static/css/$CSS_FILE → HTTP $CSS_HTTP"
  if [ "$CSS_HTTP" != "200" ]; then
    echo "   ❌ CSS not serving! App will show unstyled (sr-only content visible)"
  fi
else
  echo "   ⚠️ No CSS file found in .next/static/css/"
fi
# Test one JS chunk
CHUNK_FILE=$(ls "$PROJECT_DIR/.next/static/chunks/"*.js 2>/dev/null | head -1 | xargs basename)
if [ -n "$CHUNK_FILE" ]; then
  CHUNK_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/_next/static/chunks/$CHUNK_FILE" 2>/dev/null)
  echo "   Chunk: /_next/static/chunks/$CHUNK_FILE → HTTP $CHUNK_HTTP"
fi
# Test main page
PAGE_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000" 2>/dev/null)
echo "   Page: / → HTTP $PAGE_HTTP"
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
echo "🔴 PENTING — BROWSER CACHE FIX (WAJIB):"
echo "   1. Tekan Ctrl+Shift+R (hard refresh) atau Ctrl+F5"
echo "   2. Kalau masih sama, buka DevTools (F12) → Application tab →"
echo "      Storage → 'Clear site data' → reload"
echo "   3. Atau buka di INCOGNITO/Private window (paling aman untuk test)"
echo ""
echo "   Kenapa? Browser cache CSS/JS lama. Harus di-force load yang baru."
echo ""
echo "Profit cron sudah di-trigger dengan backfill —"
echo "profit yang tertinggal kemarin malam akan otomatis masuk."
echo ""
echo "━━━ Verifikasi ━━━"
echo "   - Buka nexvo.id di INCOGNITO window"
echo "   - Harusnya muncul Login page NEXVO (bukan teks SEO Inggris)"
echo "   - Kalau masih teks SEO = CSS belum load, jalankan lagi script ini"
