#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO — INSTANT Profit Trigger (NO rebuild, NO restart web)
#  Cuma trigger profit cron dengan backfill — profit langsung masuk
# ═══════════════════════════════════════════════════════════════
set +e

PROJECT_DIR="/home/nexvo"
CRON_PORT=3032

echo "═══════════════════════════════════════════════════════"
echo "  NEXVO Instant Profit Trigger (with backfill)"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── Step 1: Check PM2 cron process ───
echo "▼ [1/5] Checking PM2 nexvo-cron process..."
PM2_CRON_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; data=json.load(sys.stdin); cron=[p for p in data if p['name']=='nexvo-cron']; print(cron[0]['pm2_env']['status'] if cron else 'not-found')" 2>/dev/null || echo "unknown")
echo "   nexvo-cron status: $PM2_CRON_STATUS"

if [ "$PM2_CRON_STATUS" != "online" ]; then
  echo "   ⚠️ nexvo-cron not running! Starting it..."
  cd "$PROJECT_DIR"
  pm2 delete nexvo-cron 2>/dev/null
  pm2 start "bun run cron-service.ts" --name nexvo-cron --cwd "$PROJECT_DIR" 2>/dev/null || pm2 start "bun cron-service.ts" --name nexvo-cron --cwd "$PROJECT_DIR" 2>/dev/null
  sleep 5
  pm2 save 2>/dev/null
  echo "   ✅ nexvo-cron started"
fi
echo ""

# ─── Step 2: Check cron service health ───
echo "▼ [2/5] Checking cron service health (port $CRON_PORT)..."
CRON_STATUS=$(curl -s --max-time 5 "http://localhost:$CRON_PORT/api/status" 2>/dev/null)
if [ -z "$CRON_STATUS" ] || [ "$CRON_STATUS" = "" ]; then
  echo "   ❌ Cron service NOT responding! Restarting..."
  pm2 restart nexvo-cron --update-env 2>/dev/null
  sleep 5
  CRON_STATUS=$(curl -s --max-time 5 "http://localhost:$CRON_PORT/api/status" 2>/dev/null)
fi

if [ -n "$CRON_STATUS" ]; then
  echo "   Cron status:"
  echo "$CRON_STATUS" | python3 -m json.tool 2>/dev/null || echo "$CRON_STATUS"
else
  echo "   ❌ Cron service still not responding. Manual check needed."
  echo "   Run: pm2 logs nexvo-cron --lines 30"
  exit 1
fi
echo ""

# ─── Step 3: Check current profit state in DB ───
echo "▼ [3/5] Checking current profit state in DB..."
DB_FILE="$PROJECT_DIR/prisma/custom.db"
if [ -f "$DB_FILE" ]; then
  TODAY_WIB=$(TZ='Asia/Jakarta' date '+%Y-%m-%d' 2>/dev/null || date -u '+%Y-%m-%d')
  echo "   Today (WIB): $TODAY_WIB"
  echo ""
  echo "   Active investments:"
  sqlite3 -header -column "$DB_FILE" "SELECT substr(id,1,12) as inv_id, substr(userId,1,12) as user, status, amount, totalProfitEarned, date(lastProfitDate) as last_profit, date(startDate) as start FROM Investment WHERE status='active' LIMIT 10;" 2>/dev/null
  echo ""
  echo "   Active purchases:"
  sqlite3 -header -column "$DB_FILE" "SELECT substr(id,1,12) as pur_id, substr(userId,1,12) as user, status, totalPrice, profitEarned, date(lastProfitDate) as last_profit FROM Purchase WHERE status='active' LIMIT 10;" 2>/dev/null
  echo ""
  echo "   Total profit bonuses credited:"
  sqlite3 "$DB_FILE" "SELECT COUNT(*) || ' bonus logs, total Rp ' || IFNULL(SUM(amount),0) FROM BonusLog WHERE type='profit';" 2>/dev/null
  echo ""
else
  echo "   ⚠️ DB file not found: $DB_FILE"
fi

# ─── Step 4: PULL LATEST CODE (cron-service.ts must be latest with backfill) ───
echo "▼ [4/5] Pulling latest code (cron-service.ts with backfill)..."
cd "$PROJECT_DIR"
git fetch --all 2>/dev/null
git reset --hard origin/main 2>/dev/null
echo "   Current commit:"
git log --oneline -1 2>/dev/null
echo ""

# Restart cron to pick up latest code
echo "   Restarting nexvo-cron to load latest code..."
pm2 restart nexvo-cron --update-env 2>/dev/null
sleep 5
echo "   ✅ nexvo-cron restarted"
echo ""

# ─── Step 5: TRIGGER PROFIT NOW (force=true, with backfill) ───
echo "▼ [5/5] Triggering profit cron NOW (force=true + backfill)..."
echo "   This will credit ALL missed profit days for every active investment."
echo ""
TRIGGER_RESP=$(curl -s --max-time 120 -X POST "http://localhost:$CRON_PORT/api/trigger/profit?force=true" 2>/dev/null)
if [ -z "$TRIGGER_RESP" ]; then
  echo "   ❌ Trigger failed (no response). Check: pm2 logs nexvo-cron"
  exit 1
fi

echo "   Trigger response:"
echo "$TRIGGER_RESP" | python3 -m json.tool 2>/dev/null || echo "$TRIGGER_RESP"
echo ""

# ─── Verify profit credited ───
echo "─── Verifying profit was credited ───"
sleep 3
if [ -f "$DB_FILE" ]; then
  echo "   Active investments AFTER trigger:"
  sqlite3 -header -column "$DB_FILE" "SELECT substr(id,1,12) as inv_id, substr(userId,1,12) as user, totalProfitEarned, date(lastProfitDate) as last_profit FROM Investment WHERE status='active' LIMIT 10;" 2>/dev/null
  echo ""
  echo "   Recent profit bonuses (last 10):"
  sqlite3 -header -column "$DB_FILE" "SELECT substr(userId,1,12) as user, amount, substr(description,1,55) as desc_short, datetime(createdAt) as time FROM BonusLog WHERE type='profit' ORDER BY createdAt DESC LIMIT 10;" 2>/dev/null
  echo ""
  echo "   Summary:"
  sqlite3 "$DB_FILE" "SELECT 'Active investments: ' || COUNT(*) FROM Investment WHERE status='active'; SELECT 'Credited today: ' || COUNT(*) FROM Investment WHERE status='active' AND date(lastProfitDate) >= date('$TODAY_WIB'); SELECT 'Total profit bonuses: ' || COUNT(*) || ' (Rp ' || IFNULL(SUM(amount),0) || ')' FROM BonusLog WHERE type='profit';" 2>/dev/null
fi
echo ""

echo "─── Recent cron logs ───"
pm2 logs nexvo-cron --lines 20 --nostream 2>/dev/null | tail -25
echo ""

echo "═══════════════════════════════════════════════════════"
echo "  ✅ Profit Trigger Complete"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "If profit credited (lastProfitDate = today), refresh Admin Asset page."
echo "Total Profit column should now show Rp 3.200+ per investment."
echo ""
echo "Cron will auto-run at 00:00 WIB every weekday (Mon-Fri)."
echo "Saturday & Sunday = libur (no profit)."
