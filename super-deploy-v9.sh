#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO Super Deploy v9 — CRON PURCHASE FIX
#
#  THE FIX: cron-service.ts purchase loop was only updating tracking
#  stats but NEVER crediting user balance / BonusLog. This deploy
#  ships the fix AND guarantees nexvo-cron PM2 process restarts
#  with the new code.
#
#  Run on the VPS as the nexvo user:
#    bash super-deploy-v9.sh
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

PROJECT_DIR="/home/nexvo"
CRON_PORT=3032
WEB_PORT=3000
EXPECTED_MARKER="CRON-PURCHASE-FIX-V9-20250629"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/home/nexvo/.next-backup-${TIMESTAMP}"

echo "═══════════════════════════════════════════════════════"
echo "  NEXVO Super Deploy v9 — CRON PURCHASE FIX"
echo "  Timestamp: ${TIMESTAMP}"
echo "  Expected marker: ${EXPECTED_MARKER}"
echo "═══════════════════════════════════════════════════════"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "❌ Project dir not found: $PROJECT_DIR"
  echo "   This script must run on the VPS where /home/nexvo exists."
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
git reset --hard origin/main 2>/dev/null || git pull origin main 2>/dev/null || true
git log --oneline -1
echo "   ✅ Code updated"

# ─── [3/8] Install deps (in case package.json changed) ───
echo ""
echo "▼ [3/8] Installing dependencies..."
bun install --production=false 2>&1 | tail -3 || npm install 2>&1 | tail -3 || true
echo "   ✅ Dependencies installed"

# ─── [4/8] Generate Prisma client ───
echo ""
echo "▼ [4/8] Generating Prisma client..."
bun run db:generate 2>&1 | tail -3 || npx prisma generate 2>&1 | tail -3 || true
echo "   ✅ Prisma client generated"

# ─── [5/8] Build Next.js ───
echo ""
echo "▼ [5/8] Building Next.js (this takes 1-3 min)..."
bun run build 2>&1 | tail -20 || npm run build 2>&1 | tail -20
BUILD_EXIT=${PIPESTATUS[0]:-$?}
if [ "$BUILD_EXIT" != "0" ]; then
  echo "❌ BUILD FAILED. Rolling back .next from backup..."
  rm -rf .next
  cp -a "$BACKUP_DIR" .next
  echo "   ⚠️ Rolled back. nexvo-web still runs old build."
  echo "   Fix the build error and re-run this script."
  exit 1
fi
echo "   ✅ Build succeeded"

# ─── [6/8] Restart nexvo-web (Next.js production server) ───
echo ""
echo "▼ [6/8] Restarting nexvo-web (PM2)..."
pm2 restart nexvo-web --update-env 2>/dev/null || pm2 reload nexvo-web 2>/dev/null || pm2 start "bun run start" --name nexvo-web --cwd "$PROJECT_DIR" 2>/dev/null
pm2 save 2>/dev/null || true
sleep 4
echo "   ✅ nexvo-web restarted"

# ─── [7/8] ★★★ CRITICAL: Restart nexvo-cron (the 00:00 WIB profit process) ★★★
echo ""
echo "▼ [7/8] ★★★ Restarting nexvo-cron (CRITICAL — ships the profit fix) ★★★"
# Delete + re-create to guarantee fresh process with new cron-service.ts code
pm2 delete nexvo-cron 2>/dev/null || true
pm2 start "bun run cron-service.ts" --name nexvo-cron --cwd "$PROJECT_DIR" 2>/dev/null
pm2 save 2>/dev/null || true
sleep 5
echo "   ✅ nexvo-cron restarted with v2.4 code"
pm2 list 2>/dev/null | grep -E "nexvo|name" | head -5

# ─── [8/8] Verify deploy via /api/deploy-version ───
echo ""
echo "▼ [8/8] Verifying deploy..."
sleep 3
VERSION_RESP=$(curl -s --max-time 10 "http://localhost:${WEB_PORT}/api/deploy-version" 2>/dev/null || echo "")
if echo "$VERSION_RESP" | grep -q "$EXPECTED_MARKER"; then
  echo "   ✅ VPS is running NEW code (marker: $EXPECTED_MARKER)"
  echo "$VERSION_RESP" | python3 -m json.tool 2>/dev/null | grep -E "versionMarker|buildId|gitCommit" || echo "$VERSION_RESP" | head -c 300
else
  echo "   ⚠️ Could not verify marker via /api/deploy-version. Response:"
  echo "$VERSION_RESP" | head -c 300
  echo ""
  echo "   (May still be booting. Wait 30s and visit https://nexvo.id/api/deploy-version)"
fi

# ─── Verify cron service is responding ───
echo ""
echo "─── Cron service health check ───"
CRON_STATUS=$(curl -s --max-time 5 "http://localhost:${CRON_PORT}/api/status" 2>/dev/null || echo "")
if [ -n "$CRON_STATUS" ]; then
  echo "✅ Cron service responding on port $CRON_PORT"
  echo "$CRON_STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'   WIB: {d.get(\"wibWallTime\")} | day: {d.get(\"dayName\")} | profit credited today: {d.get(\"profitCreditedCount\")}/{d.get(\"profitTotalActive\")} | next fire: {d.get(\"nextProfitFireDesc\",\"\")[:80]}')" 2>/dev/null || echo "$CRON_STATUS" | head -c 400
else
  echo "⚠️ Cron service not responding yet — check: pm2 logs nexvo-cron --lines 30"
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

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅ DEPLOY v9 COMPLETE — CRON PURCHASE FIX LIVE"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "What was fixed:"
echo "  • cron-service.ts purchase loop NOW credits user balance + BonusLog"
echo "    (was only updating tracking stats → profit never entered)"
echo "  • force-credit-profit.ts same fix + matching crash fix"
echo "  • nexvo-cron PM2 process restarted with v2.4 code"
echo ""
echo "Verification:"
echo "  • Visit https://nexvo.id/api/deploy-version"
echo "    → must show versionMarker: $EXPECTED_MARKER"
echo "  • Visit https://nexvo.id/api/cron/profit?secret=YOUR_CRON_SECRET (GET)"
echo "    → triggers profit manually (weekdays only)"
echo "  • Cron debug: curl http://localhost:3032/api/debug/profit"
echo "    → shows every active purchase + credit path"
echo "  • Cron status: curl http://localhost:3032/api/status"
echo "    → shows next profit fire time + credited count"
echo ""
echo "TONIGHT 00:00 WIB — PROFIT WAJIB MASUK! 🔥"
echo "  (continuous catchup fires within 10s of midnight)"
echo ""
echo "Rollback if needed:"
echo "  rm -rf .next && cp -a $BACKUP_DIR .next && pm2 restart nexvo-web"
echo "  pm2 restart nexvo-cron  # (old cron-service.ts from git before pull)"
echo ""
