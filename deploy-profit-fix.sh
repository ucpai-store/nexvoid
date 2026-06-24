#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO — Profit Cron Fix Deploy + Diagnostic + Manual Trigger
#  - Pulls latest code (with robust profit cron fixes)
#  - Rebuilds Next.js app
#  - Restarts PM2 nexvo-web + nexvo-cron
#  - Runs full diagnostic on cron health
#  - Manually triggers today's profit (force=true to bypass weekend)
#  - Verifies profit was credited in DB
# ═══════════════════════════════════════════════════════════════
set -e

PROJECT_DIR="/home/nexvo"
CRON_PORT=3032

echo "═══════════════════════════════════════════════════════"
echo "  NEXVO Profit Cron Fix — Deploy & Diagnostic"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── Step 1: Pull latest code ───
echo "▼ [1/7] Pulling latest code from GitHub..."
cd "$PROJECT_DIR"
git fetch --all 2>/dev/null || true
git reset --hard origin/main 2>/dev/null || git pull origin main 2>/dev/null || true
echo "✅ Code updated"
echo ""

# ─── Step 2: Install deps ───
echo "▼ [2/7] Installing dependencies..."
bun install --frozen-lockfile 2>/dev/null || bun install 2>/dev/null || npm install 2>/dev/null
echo "✅ Dependencies ready"
echo ""

# ─── Step 3: Build Next.js ───
echo "▼ [3/7] Building Next.js app..."
bun run build 2>&1 | tail -5 || { echo "❌ Build failed"; exit 1; }
echo "✅ Build complete"
echo ""

# ─── Step 4: Generate Prisma client ───
echo "▼ [4/7] Generating Prisma client..."
bunx prisma generate 2>/dev/null || npx prisma generate 2>/dev/null
echo "✅ Prisma client ready"
echo ""

# ─── Step 5: Restart PM2 ───
echo "▼ [5/7] Restarting PM2 processes..."
pm2 restart nexvo-web --update-env 2>/dev/null || pm2 restart nexvo-web 2>/dev/null || echo "⚠️ nexvo-web restart skipped"
pm2 restart nexvo-cron --update-env 2>/dev/null || pm2 restart nexvo-cron 2>/dev/null || echo "⚠️ nexvo-cron restart skipped"
pm2 save 2>/dev/null || true
sleep 3
echo "✅ PM2 restarted"
echo ""

# ─── Step 6: Diagnostic ───
echo "▼ [6/7] Running diagnostic..."
echo ""
echo "─── PM2 Process Status ───"
pm2 list 2>/dev/null | grep -E "nexvo|name|│" | head -10
echo ""

echo "─── Cron Service Health (port $CRON_PORT) ───"
CRON_STATUS=$(curl -s --max-time 5 "http://localhost:$CRON_PORT/api/status" 2>/dev/null || echo "FAILED")
if [ "$CRON_STATUS" = "FAILED" ] || [ -z "$CRON_STATUS" ]; then
  echo "❌ Cron service NOT responding on port $CRON_PORT!"
  echo "   Recent PM2 logs:"
  pm2 logs nexvo-cron --lines 15 --nostream 2>/dev/null | tail -20
  echo ""
  echo "   Attempting to start cron service..."
  pm2 start "bun run cron-service.ts" --name nexvo-cron 2>/dev/null || pm2 start nexvo-cron 2>/dev/null || true
  sleep 3
  CRON_STATUS=$(curl -s --max-time 5 "http://localhost:$CRON_PORT/api/status" 2>/dev/null || echo "FAILED")
fi

if [ "$CRON_STATUS" != "FAILED" ] && [ -n "$CRON_STATUS" ]; then
  echo "$CRON_STATUS" | python3 -m json.tool 2>/dev/null || echo "$CRON_STATUS"
else
  echo "❌ Cron service still not responding. Check: pm2 logs nexvo-cron"
fi
echo ""

echo "─── Recent Cron Logs (last 25 lines) ───"
pm2 logs nexvo-cron --lines 25 --nostream 2>/dev/null | tail -30
echo ""

echo "─── VPS System Time vs WIB ───"
echo "VPS UTC time:  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "VPS local time: $(date '+%Y-%m-%d %H:%M:%S %Z')"
TZ='Asia/Jakarta' date '+WIB time:      %Y-%m-%d %H:%M:%S WIB (%A)' 2>/dev/null || echo "WIB time:      (TZ Asia/Jakarta not available, computing manually)"
echo ""

# ─── Step 7: Manual profit trigger ───
echo "▼ [7/7] Manually triggering today's profit (force=true to bypass weekend)..."
echo ""
TRIGGER_RESP=$(curl -s --max-time 30 -X POST "http://localhost:$CRON_PORT/api/trigger/profit?force=true" 2>/dev/null || echo "FAILED")
if [ "$TRIGGER_RESP" = "FAILED" ] || [ -z "$TRIGGER_RESP" ]; then
  echo "❌ Manual trigger FAILED — cron service not responding"
else
  echo "Trigger response:"
  echo "$TRIGGER_RESP" | python3 -m json.tool 2>/dev/null || echo "$TRIGGER_RESP"
fi
echo ""

# ─── Verify profit credited ───
echo "─── Verifying profit was credited in DB ───"
sleep 2
DB_FILE="$PROJECT_DIR/prisma/custom.db"
if [ -f "$DB_FILE" ]; then
  TODAY_WIB=$(TZ='Asia/Jakarta' date '+%Y-%m-%d' 2>/dev/null || date -u '+%Y-%m-%d')
  echo "Checking investments with lastProfitDate >= $TODAY_WIB 00:00 WIB..."
  sqlite3 "$DB_FILE" "SELECT COUNT(*) as credited_count, COUNT(*) FILTER (WHERE status='active') as active_count FROM Investment WHERE date(lastProfitDate) >= date('$TODAY_WIB');" 2>/dev/null || echo "(sqlite3 not available or query failed)"
  echo ""
  echo "─── Profit bonuses credited today (last 10) ───"
  sqlite3 -header -column "$DB_FILE" "SELECT substr(userId,1,12) as user, amount, substr(description,1,60) as desc_short, datetime(createdAt) as time FROM BonusLog WHERE type='profit' AND date(createdAt) >= date('$TODAY_WIB') ORDER BY createdAt DESC LIMIT 10;" 2>/dev/null || echo "(could not query bonus logs)"
  echo ""
  echo "─── Investments that STILL need backfill (lastProfitDate < today) ───"
  sqlite3 -header -column "$DB_FILE" "SELECT substr(id,1,12) as inv_id, substr(userId,1,12) as user, status, date(startDate) as start, date(lastProfitDate) as last_profit FROM Investment WHERE status='active' AND (lastProfitDate IS NULL OR date(lastProfitDate) < date('$TODAY_WIB')) LIMIT 10;" 2>/dev/null || echo "(could not query)"
  echo ""
  echo "─── Summary: active investments vs credited today ───"
  sqlite3 "$DB_FILE" "SELECT 'Active investments: ' || COUNT(*) FROM Investment WHERE status='active'; SELECT 'Credited today: ' || COUNT(*) FROM Investment WHERE status='active' AND date(lastProfitDate) >= date('$TODAY_WIB'); SELECT 'Need backfill: ' || COUNT(*) FROM Investment WHERE status='active' AND (lastProfitDate IS NULL OR date(lastProfitDate) < date('$TODAY_WIB'));" 2>/dev/null || echo "(query failed)"
else
  echo "⚠️ DB file not found at $DB_FILE"
fi
echo ""

echo "═══════════════════════════════════════════════════════"
echo "  ✅ Deploy & Diagnostic Complete"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  • Check profit-status: curl http://localhost:$CRON_PORT/api/status"
echo "  • View live logs:      pm2 logs nexvo-cron"
echo "  • Manual trigger again: curl -X POST 'http://localhost:$CRON_PORT/api/trigger/profit?force=true'"
echo ""
echo "The cron will now auto-run at 00:00 WIB every weekday (Mon-Fri)."
echo "Saturday & Sunday = libur (no profit)."
echo "If PM2 restarts after midnight, the startup catch-up will run profit automatically."
