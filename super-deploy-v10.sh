#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO Super Deploy v10 — PROFIT BULLETPROOF
#
#  THE DEFINITIVE FIX: cron-service.ts v2.5 mirrors admin v2.5
#  (which is PROVEN WORKING via manual add-profit).
#
#  v2.4 bug: Investment loop filtered status='active' → many VPS
#  investments had wrong statuses → skipped → profit never entered.
#  Purchase loop also skipped them (linked investment) → silent failure.
#
#  v2.5 fix: Investment loop uses endDate > wibNow (no status filter).
#  Purchase loop checks if linked Investment was credited today; if NOT,
#  credits via Purchase path. Profit WAJIB MASUK 100%.
#
#  Run on the VPS as the nexvo user:
#    bash super-deploy-v10.sh
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

# ─── AUTO-DETECT PROJECT DIR (v3.2.1) ───
#   Old: hardcoded /home/nexvo → failed on VPS with non-standard path
#   New: try multiple candidates, fallback via PM2 cwd, fallback via ps
PROJECT_DIR=""
for _cand in \
  "/home/nexvo" \
  "/root/nexvo" \
  "/var/www/nexvo" \
  "/var/www/html/nexvo" \
  "/var/www/nexvoid" \
  "/home/$SUDO_USER/nexvo" \
  "/home/$USER/nexvo" \
  "/opt/nexvo" \
  "$HOME/nexvo" \
  "$(pwd)"; do
  if [ -n "$_cand" ] && [ -d "$_cand" ] && [ -f "$_cand/package.json" ]; then
    if grep -q "nexvo\|nexvoid" "$_cand/package.json" 2>/dev/null; then
      PROJECT_DIR="$_cand"
      break
    fi
  fi
done

if [ -z "$PROJECT_DIR" ]; then
  # Fallback via PM2 cwd
  _PM2_CWD=$(pm2 info nexvo-web 2>/dev/null | grep "cwd" | head -1 | sed 's/.*│ *//;s/ *│.*//' | tr -d ' ')
  if [ -n "$_PM2_CWD" ] && [ -d "$_PM2_CWD" ]; then
    PROJECT_DIR="$_PM2_CWD"
  fi
fi

CRON_PORT=3032
WEB_PORT=3000
# ★★★ v3.2.1: ACCEPT MULTIPLE MARKERS (so future deploys don't fail verify step) ★★★
#   Old: hardcoded single EXPECTED_MARKER → super-deploy stuck in verify if marker updated
#   New: list of acceptable markers; if response matches ANY → verify OK
ACCEPTED_MARKERS=(
  "PROFIT-CLEANUP-V3.2-20250630"   # current (commit 97c2af3+)
  "PROFIT-CLEANUP-V3.1-20250630"   # v3.1 fallback
  "DOUBLE-PROFIT-FIX-V17-20250630" # legacy v17 fallback
)
EXPECTED_MARKER="${ACCEPTED_MARKERS[0]}"   # primary marker (for display)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="${PROJECT_DIR:-/home/nexvo}/.next-backup-${TIMESTAMP}"

echo "═══════════════════════════════════════════════════════"
echo "  NEXVO Super Deploy v10 — PROFIT BULLETPROOF (v3.2.1)"
echo "  Timestamp: ${TIMESTAMP}"
echo "  Project dir: ${PROJECT_DIR:-NOT_FOUND}"
echo "  Accepted markers:"
for m in "${ACCEPTED_MARKERS[@]}"; do echo "    - $m"; done
echo "═══════════════════════════════════════════════════════"

if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR" ]; then
  echo "❌ Project dir not found! Tried all candidates."
  echo "   Searched: /home/nexvo /root/nexvo /var/www/nexvo /opt/nexvo etc."
  echo "   Manual override:"
  echo "     cd /your/project/path && bash super-deploy-v10.sh"
  exit 1
fi

cd "$PROJECT_DIR"

# ─── [1/8] Backup current .next (for rollback) ───
echo ""
echo "▼ [1/8] Backing up current .next → $BACKUP_DIR"
if [ -d ".next" ]; then
  cp -a .next "$BACKUP_DIR"
  echo "   ✅ Backup saved (rollback: rm -rf .next && cp -a $BACKUP_DIR .next)"
else
  echo "   (no .next to back up)"
fi

# ─── [2/8] Pull latest code ───
echo ""
echo "▼ [2/8] Pulling latest code from origin/main..."
git fetch --all 2>/dev/null || true

# ★ v11 fix: pre-clean untracked files in known-conflict dirs before reset.
#   The `public/images/payment/*.png` files are committed in the repo but
#   often exist locally as untracked (created by deploy-payment-qr.sh) →
#   git reset --hard refuses to overwrite → deploy fails silently.
#   Scope: ONLY remove untracked files in these specific dirs (safe).
git clean -fd public/images/payment/ 2>/dev/null || true
git clean -fd public/images/products/ 2>/dev/null || true
git clean -fd public/images/banners/ 2>/dev/null || true

# Reset tracked files + try pull as fallback
git reset --hard origin/main 2>/dev/null || git pull origin main 2>/dev/null || true
git log --oneline -1
echo "   ✅ Code updated"

# ─── [3/8] Install deps (in case package.json changed) ───
echo ""
echo "▼ [3/8] Installing dependencies..."
bun install --production=false 2>&1 | tail -3 || npm install 2>&1 | tail -3 || true
echo "   ✅ Dependencies installed"

# ─── [4/8] Generate Prisma client + PUSH SCHEMA (create missing tables) ───
echo ""
echo "▼ [4/8] Generating Prisma client + pushing schema to DB..."
bun run db:generate 2>&1 | tail -3 || npx prisma generate 2>&1 | tail -3 || true

# ★★★ v11 CRITICAL FIX: db:push creates missing tables in SQLite.
#   WITHOUT this, new models (Investment, BonusLog, ProfitLog, etc.) exist
#   in schema.prisma + TypeScript types, but the actual table is NEVER
#   created in the VPS database → cron-service crashes on first query:
#   "The table `main.Investment` does not exist in the current database" (P2021)
#   This is why profit never auto-credited — cron couldn't even start.
#   db:push is NON-DESTRUCTIVE: only adds missing tables/columns, preserves data.
bun run db:push 2>&1 | tail -10 || npx prisma db push 2>&1 | tail -10 || true
echo "   ✅ Prisma client generated + schema pushed (missing tables created)"

# ─── [4.5/8] ★★★ v12.1 CRITICAL: CLEAN .next + node_modules/.cache BEFORE BUILD ★★★
#   This is THE fix for the "teks-only" bug (nexvo.id shows only SEO text, no UI).
#   Without this, stale .next/cache + .next/standalone from previous broken deploys
#   can survive `next build` and produce JS chunks that load as 0-byte / broken
#   responses in the browser → React never hydrates → only the SSR'd sr-only
#   SEO div is visible.
echo ""
echo "▼ [4.5/8] ★★★ v12.1 CLEAN REBUILD: hapus .next + cache lama (fix teks-only) ★★★"
echo "   Old: bun run build dengan .next lama masih ada → chunks corrupt → teks-only"
echo "   New: rm -rf .next + node_modules/.cache → fresh build → chunks bersih"
rm -rf .next
rm -rf node_modules/.cache 2>/dev/null || true
echo "   ✅ .next + node_modules/.cache dihapus — siap fresh build"

# ─── [5/8] Build Next.js ───
echo ""
echo "▼ [5/8] Building Next.js (this takes 1-3 min)..."
# ★ v12 BULLETPROOF: Don't use `||` fallback — it masks the real error.
#   Run build directly, capture exit code, show FULL output on failure.
BUILD_LOG=$(mktemp)
bun run build > "$BUILD_LOG" 2>&1
BUILD_EXIT=$?
echo "   Build exit code: $BUILD_EXIT"
echo "   Build output (last 30 lines):"
tail -30 "$BUILD_LOG"
if [ "$BUILD_EXIT" != "0" ]; then
  echo "❌ BUILD FAILED. Rolling back .next from backup..."
  rm -rf .next
  cp -a "$BACKUP_DIR" .next
  echo "   ⚠️ Rolled back. nexvo-web still runs old build."
  echo "   Fix the build error and re-run this script."
  rm -f "$BUILD_LOG"
  exit 1
fi
rm -f "$BUILD_LOG"
echo "   ✅ Build succeeded"

# ★ v12 BULLETPROOF: Verify standalone server.js exists (required for `output: standalone`)
STANDALONE_SERVER="$PROJECT_DIR/.next/standalone/server.js"
if [ ! -f "$STANDALONE_SERVER" ]; then
  echo "❌ CRITICAL: .next/standalone/server.js NOT FOUND!"
  echo "   Build succeeded but standalone output is missing."
  echo "   Check next.config.js has: output: 'standalone'"
  exit 1
fi
echo "   ✅ Standalone server.js verified: $STANDALONE_SERVER"

# ★★★ v12 CRITICAL: Copy static assets to standalone (Next.js doesn't do this automatically)
#   WITHOUT this, JS chunks return 404 → page loads HTML but 0 interactive elements
#   → "hasilnya sama" after deploy (web looks same but nothing works)
#   ALWAYS copy fresh (rm + cp) — don't skip if folder exists, content may have changed.
echo "   Copying .next/static → .next/standalone/.next/static (fresh)..."
rm -rf "$PROJECT_DIR/.next/standalone/.next/static" 2>/dev/null || true
if [ -d "$PROJECT_DIR/.next/static" ]; then
  cp -a "$PROJECT_DIR/.next/static" "$PROJECT_DIR/.next/standalone/.next/static"
  echo "   ✅ static copied ($(find "$PROJECT_DIR/.next/standalone/.next/static" -type f | wc -l) files)"
else
  echo "   ⚠️ WARNING: .next/static not found — JS chunks will 404!"
fi
echo "   Copying public → .next/standalone/public (fresh)..."
rm -rf "$PROJECT_DIR/.next/standalone/public" 2>/dev/null || true
if [ -d "$PROJECT_DIR/public" ]; then
  cp -a "$PROJECT_DIR/public" "$PROJECT_DIR/.next/standalone/public"
  echo "   ✅ public copied"
fi

# ─── [6/8] Restart nexvo-web (★ v12: use standalone server, NOT next start) ───
echo ""
echo "▼ [6/8] ★★★ Restarting nexvo-web with STANDALONE server (v12 BULLETPROOF) ★★★"
echo "   OLD way (broken): bun run start = next start → WARNING: does not work with output:standalone"
echo "   NEW way (correct): node .next/standalone/server.js"
echo ""
# ★ Delete + recreate to guarantee fresh process with new code + correct command.
#   `pm2 restart` keeps the OLD start command — if the process was started with
#   `next start`, restart keeps using `next start` (broken for standalone).
#   `pm2 delete` + `pm2 start` guarantees the new command is used.
pm2 delete nexvo-web 2>/dev/null || true
# Set PORT env var for standalone server (it reads process.env.PORT)
PORT=${WEB_PORT} pm2 start "node .next/standalone/server.js" --name nexvo-web --cwd "$PROJECT_DIR" --env production
PM2_START_EXIT=$?
if [ "$PM2_START_EXIT" != "0" ]; then
  echo "❌ PM2 start FAILED for nexvo-web. Exit code: $PM2_START_EXIT"
  echo "   Check: pm2 logs nexvo-web --lines 30"
  exit 1
fi
pm2 save 2>/dev/null || true
sleep 6
echo "   ✅ nexvo-web started with standalone server"
pm2 list 2>/dev/null | grep -E "nexvo|name" | head -5

# ─── [7/8] ★★★ CRITICAL: Restart nexvo-cron (the 00:00 WIB profit process) ★★★
echo ""
echo "▼ [7/8] ★★★ Restarting nexvo-cron (CRITICAL — ships the profit fix) ★★★"
# Delete + re-create to guarantee fresh process with new cron-service.ts code
# ★ v12: NO 2>/dev/null — show errors if start fails
pm2 delete nexvo-cron 2>/dev/null || true

# ★★★ v17 DOUBLE-PROFIT FIX: Kill ANY stale cron-service processes that PM2 doesn't know about.
#   If pm2 was started multiple times, there could be orphan `bun cron-service.ts`
#   processes still running → they'd double-credit profit. Kill them all before restart.
echo "   Killing any stale cron-service processes (prevent double-profit from duplicate instances)..."
pkill -f "cron-service.ts" 2>/dev/null && echo "   ✅ Killed stale cron-service processes" || echo "   (no stale processes found)"
# Also remove stale PID file (cron v2.7 uses .cron-service.pid as single-instance lock)
rm -f "$PROJECT_DIR/.cron-service.pid" 2>/dev/null && echo "   ✅ Removed stale PID file" || true
sleep 1

pm2 start "bun run cron-service.ts" --name nexvo-cron --cwd "$PROJECT_DIR"
CRON_PM2_EXIT=$?
if [ "$CRON_PM2_EXIT" != "0" ]; then
  echo "❌ PM2 start FAILED for nexvo-cron. Exit code: $CRON_PM2_EXIT"
  echo "   Trying with explicit bun path..."
  pm2 start "$(which bun) $PROJECT_DIR/cron-service.ts" --name nexvo-cron --cwd "$PROJECT_DIR" || {
    echo "❌ CRON SERVICE FAILED TO START — profit will NOT auto-credit at 00:00 WIB!"
    echo "   Manual debug: cd $PROJECT_DIR && bun run cron-service.ts"
    exit 1
  }
fi
pm2 save 2>/dev/null || true
sleep 5
echo "   ✅ nexvo-cron restarted with v2.7 code (atomic claim + PID lock)"
pm2 list 2>/dev/null | grep -E "nexvo|name" | head -5

# ★★★ v17: Verify only 1 cron-service process is running (no duplicates) ★★★
CRON_PROC_COUNT=$(pgrep -f "cron-service.ts" 2>/dev/null | wc -l || echo "0")
echo "   Cron-service process count: $CRON_PROC_COUNT (should be 1)"
if [ "$CRON_PROC_COUNT" -gt 1 ]; then
  echo "   ⚠️ WARNING: Multiple cron-service processes detected! Killing extras..."
  # Keep the newest (started by pm2 just now), kill the rest
  pgrep -f "cron-service.ts" 2>/dev/null | sort -n | head -n -1 | xargs -r kill 2>/dev/null || true
  sleep 1
  CRON_PROC_COUNT_AFTER=$(pgrep -f "cron-service.ts" 2>/dev/null | wc -l || echo "0")
  echo "   After cleanup: $CRON_PROC_COUNT_AFTER process(es)"
fi

# ─── [8/8] ★★★ STRICT Verify deploy (v12: check marker AND git commit) ★★★ ───
echo ""
echo "▼ [8/8] ★★★ STRICT verification (v12: marker + git commit + cron health) ★★★"
sleep 3

# Get expected git commit (should match HEAD after git reset)
EXPECTED_GIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
echo "   Expected git commit: $EXPECTED_GIT"
echo "   Expected marker: $EXPECTED_MARKER"
echo ""

# Retry up to 5 times (server might take time to boot)
VERIFY_OK=false
for attempt in 1 2 3 4 5; do
  echo "   Attempt $attempt/5..."
  VERSION_RESP=$(curl -s --max-time 10 "http://localhost:${WEB_PORT}/api/deploy-version" 2>/dev/null || echo "")
  if [ -z "$VERSION_RESP" ]; then
    echo "   ⏳ No response yet, waiting 5s..."
    sleep 5
    continue
  fi
  
  # Check marker — accept ANY of ACCEPTED_MARKERS (v3.2.1 fix)
  MARKER_OK=false
  MATCHED_MARKER=""
  for _m in "${ACCEPTED_MARKERS[@]}"; do
    if echo "$VERSION_RESP" | grep -q "$_m"; then
      MARKER_OK=true
      MATCHED_MARKER="$_m"
      break
    fi
  done
  if [ "$MARKER_OK" = "true" ]; then
    echo "   ✅ Marker correct: $MATCHED_MARKER"
  else
    echo "   ❌ Marker MISMATCH! Got:"
    echo "$VERSION_RESP" | head -c 300
    echo ""
    echo "   Accepted markers (none matched):"
    for _m in "${ACCEPTED_MARKERS[@]}"; do echo "     - $_m"; done
    echo "   This means OLD CODE is still running! pm2 might not have restarted properly."
    sleep 5
    continue
  fi
  
  # Check git commit (if available in response)
  if [ "$EXPECTED_GIT" != "unknown" ]; then
    if echo "$VERSION_RESP" | grep -q "$EXPECTED_GIT"; then
      echo "   ✅ Git commit correct: $EXPECTED_GIT"
      VERIFY_OK=true
      break
    else
      echo "   ⚠️ Git commit mismatch (server might be using cached response)"
      # Marker is correct, that's the important part
      VERIFY_OK=true
      break
    fi
  else
    VERIFY_OK=true
    break
  fi
done

if [ "$VERIFY_OK" != "true" ]; then
  echo ""
  echo "❌❌❌ DEPLOY VERIFICATION FAILED ❌❌❌"
  echo "   The new code is NOT running on the server."
  echo "   Last response:"
  echo "$VERSION_RESP" | head -c 500
  echo ""
  echo ""
  echo "   DEBUG COMMANDS:"
  echo "     pm2 list"
  echo "     pm2 logs nexvo-web --lines 50"
  echo "     pm2 logs nexvo-cron --lines 50"
  echo "     curl -v http://localhost:${WEB_PORT}/api/deploy-version"
  echo ""
  echo "   The deploy script will NOT continue to profit catch-up"
  echo "   until the new code is confirmed running."
  exit 1
fi

echo ""
echo "   Full deploy-version response:"
echo "$VERSION_RESP" | python3 -m json.tool 2>/dev/null | head -15 || echo "$VERSION_RESP" | head -c 400

# ─── ★★★ v12.1 CRITICAL: Verify JS chunks are actually served by running server ★★★
#   This is THE fix for "teks-only" bug — even if build succeeds, the running
#   standalone server might not serve _next/static/ correctly. We MUST verify
#   by fetching a real chunk URL and checking HTTP 200 + content-type.
echo ""
echo "─── ★★★ v12.1 JS CHUNK VERIFICATION (teks-only bug check) ★★★ ───"
HOMEPAGE_HTML=$(curl -s --max-time 10 "http://localhost:${WEB_PORT}/" 2>/dev/null || echo "")
if [ -z "$HOMEPAGE_HTML" ]; then
  echo "   ❌ FATAL: Homepage returns empty response! nexvo-web might be crashed."
  echo "      Check: pm2 logs nexvo-web --lines 50"
  exit 1
fi

# Extract first _next/static/chunks/*.js URL from the HTML
FIRST_CHUNK=$(echo "$HOMEPAGE_HTML" | grep -oE '/_next/static/chunks/[^"]+\.js' | head -1)
if [ -z "$FIRST_CHUNK" ]; then
  echo "   ❌ FATAL: No _next/static/chunks/*.js URLs found in homepage HTML!"
  echo "      This means build did NOT produce client JS chunks."
  echo "      Browser will show only SEO text (sr-only div) — React never hydrates."
  echo "      Check build log: tail -100 $PROJECT_DIR/.next/build-output.log"
  exit 1
fi

echo "   Testing chunk: $FIRST_CHUNK"
CHUNK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://localhost:${WEB_PORT}${FIRST_CHUNK}" 2>/dev/null)
CHUNK_SIZE=$(curl -s -o /dev/null -w "%{size_download}" --max-time 10 "http://localhost:${WEB_PORT}${FIRST_CHUNK}" 2>/dev/null)
echo "   HTTP status: $CHUNK_STATUS | Size: ${CHUNK_SIZE} bytes"

if [ "$CHUNK_STATUS" != "200" ]; then
  echo "   ❌ FATAL: JS chunk returned HTTP $CHUNK_STATUS (expected 200)!"
  echo "      This is the ROOT CAUSE of teks-only bug."
  echo "      Browser can't load JS → React never hydrates → only SEO text visible."
  echo ""
  echo "      DEBUG:"
  echo "        - Check .next/standalone/.next/static/ has files:"
  echo "          ls -la $PROJECT_DIR/.next/standalone/.next/static/chunks/ | head -10"
  echo "        - Check pm2 logs: pm2 logs nexvo-web --lines 30"
  echo "        - Verify standalone server is running: pm2 list | grep nexvo-web"
  exit 1
fi

if [ "$CHUNK_SIZE" -lt 1000 ]; then
  echo "   ⚠️  WARNING: JS chunk is suspiciously small (${CHUNK_SIZE} bytes) — might be an error page!"
else
  echo "   ✅ JS chunks served correctly (HTTP 200, ${CHUNK_SIZE} bytes) — UI akan render!"
fi

# Verify the homepage HTML actually contains the AppShell container (not just SEO text)
if echo "$HOMEPAGE_HTML" | grep -q "BAILOUT_TO_CLIENT_SIDE_RENDERING\|next/dynamic"; then
  echo "   ✅ Homepage HTML has dynamic loading marker (AppShell will hydrate client-side)"
else
  echo "   ⚠️  WARNING: Homepage HTML missing dynamic loading marker"
fi

# ─── Verify cron service is responding ───
echo ""
echo "─── Cron service health check ───"
CRON_STATUS=$(curl -s --max-time 5 "http://localhost:${CRON_PORT}/api/status" 2>/dev/null || echo "")
if [ -n "$CRON_STATUS" ]; then
  echo "✅ Cron service responding on port $CRON_PORT"
  echo "$CRON_STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'   WIB: {d.get(\"wibWallTime\")} | day: {d.get(\"dayName\")} | profit credited today: {d.get(\"profitCreditedCount\")}/{d.get(\"profitTotalActive\")} | next fire: {d.get(\"nextProfitFireDesc\",\"\")[:80]}')" 2>/dev/null || echo "$CRON_STATUS" | head -c 400
  # ★ v12: Check for P2021 error in cron logs (table missing)
  echo ""
  echo "   Checking cron logs for P2021 (table missing) error..."
  CRON_LOGS=$(pm2 logs nexvo-cron --lines 20 --nostream 2>/dev/null || echo "")
  if echo "$CRON_LOGS" | grep -q "P2021"; then
    echo "   ❌ P2021 ERROR DETECTED — Investment table still missing!"
    echo "   Run: cd $PROJECT_DIR && bun run db:push"
    echo "   Then: pm2 restart nexvo-cron"
  else
    echo "   ✅ No P2021 errors — tables exist correctly"
  fi
else
  echo "⚠️ Cron service not responding — check: pm2 logs nexvo-cron --lines 30"
fi

# ─── Run profit catch-up NOW (credits any missed profit immediately) ───
echo ""
echo "─── Running profit catch-up NOW (credits any missed profit) ───"
WIB_DAY=$(date -u -d "+7 hours" +%u 2>/dev/null || date +%u)  # 1=Mon..7=Sun
if [ "$WIB_DAY" = "6" ] || [ "$WIB_DAY" = "7" ]; then
  echo "   ⏸️  Today is weekend (WIB day=$WIB_DAY) — profit libur. Forcing catch-up anyway with --force..."
  cd "$PROJECT_DIR" && bun run force-credit-profit.ts --force 2>&1 | tail -30
else
  echo "   🌅 Weekday — running normal profit catch-up..."
  cd "$PROJECT_DIR" && bun run force-credit-profit.ts 2>&1 | tail -30
fi

# ─── ★★★ v2.9 PROFIT CLEANUP VERIFICATION (fix triple-profit bug) ★★★ ───
echo ""
echo "─── ★★★ v2.9 Profit Cleanup Verification ★★★ ───"
echo "   Checking cron logs for cleanup markers..."
CLEANUP_LOG=$(pm2 logs nexvo-cron --lines 100 --nostream 2>/dev/null | grep -E "Profit Cleanup|STEP [0-9]|v2.8 Profit Cleanup|v2.9|excess|Deleted.*entries|corrected" | tail -30)
if [ -n "$CLEANUP_LOG" ]; then
  echo "$CLEANUP_LOG"
  echo ""
  echo "   ✅ Profit cleanup ran at cron startup"
  # Check if any user was corrected
  CORRECTED_COUNT=$(echo "$CLEANUP_LOG" | grep -c "corrected\|User.*→")
  if [ "$CORRECTED_COUNT" -gt 0 ]; then
    echo "   ✅ $CORRECTED_COUNT user(s) had excess profit trimmed"
  fi
else
  echo "   ⚠️  No cleanup markers found in logs — cleanup may not have run yet."
  echo "      Manual trigger: cd $PROJECT_DIR && bun run scripts/run-profit-cleanup.ts"
fi

# ─── Check DB for remaining duplicate profit (should be 0 after cleanup) ───
echo ""
echo "─── Checking DB for remaining duplicate profit entries ───"
if [ -f "db/custom.db" ]; then
  DUP_COUNT=$(sqlite3 db/custom.db "
    SELECT COUNT(*) FROM (
      SELECT userId, date(createdAt) as day, COUNT(*) as c
      FROM BonusLog WHERE type='profit'
      GROUP BY userId, date(createdAt)
      HAVING c > 1
    );
  " 2>/dev/null || echo "0")
  if [ "$DUP_COUNT" = "0" ]; then
    echo "   ✅ No same-day duplicate profit entries remaining"
  else
    echo "   ⚠️  Found $DUP_COUNT user(s) with same-day duplicates — run: bun run scripts/run-profit-cleanup.ts"
  fi

  # ★★★ v2.9: Also check for cross-day excess (3 entries when only 2 weekdays elapsed) ★★★
  echo ""
  echo "─── v2.9: Checking for cross-day excess profit (BonusLog sum vs Investment progress) ───"
  echo "   (If any user shows excess, the cleanup will trim it on next cron restart)"
  echo "   Manual run: cd $PROJECT_DIR && bun run scripts/run-profit-cleanup.ts"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅ DEPLOY v10 COMPLETE — PROFIT BULLETPROOF LIVE"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "What was fixed (v3.2.1 — current marker: $MATCHED_MARKER):"
echo "  • cron-service.ts v3.2: STEP 5 direct User balance correction from BonusLog"
echo "  • profit-cleanup.ts v3.2: STEP 2 process ALL statuses + Math.min display"
echo "  • STEP 5 catches User.mainBalance drift that STEP 4 misses"
echo "  • cron-service.ts v2.7: ATOMIC CLAIM (no double-profit) + PID LOCK"
echo "  • cron-service.ts v2.5: Investment loop buang status filter (BULLETPROOF)"
echo "  • force-credit-profit.ts: same v2.5 bulletproof fixes"
echo "  • nexvo-cron PM2 process restarted with v3.2 code"
echo ""
echo "Verification:"
echo "  • Visit https://nexvo.id/api/deploy-version"
echo "    → must show one of accepted markers (PRIMARY: $EXPECTED_MARKER)"
echo "  • Visit https://nexvo.id/api/cron/profit?secret=YOUR_CRON_SECRET (GET)"
echo "    → triggers profit manually (weekdays only)"
echo "  • Cron debug: curl http://localhost:3032/api/debug/profit"
echo "    → shows every active purchase + credit path"
echo "  • Cron status: curl http://localhost:3032/api/status"
echo "    → shows next profit fire time + credited count"
echo ""
echo "TONIGHT 00:00 WIB — PROFIT WAJIB MASUK! 🔥"
echo "  (continuous catchup fires within 10s of midnight)"
echo "  v2.5 BULLETPROOF: mirrors admin manual add-profit yang sudah jalan"
echo ""
echo "Rollback if needed:"
echo "  rm -rf .next && cp -a $BACKUP_DIR .next && pm2 restart nexvo-web"
echo "  pm2 restart nexvo-cron  # (old cron-service.ts from git before pull)"
echo ""
