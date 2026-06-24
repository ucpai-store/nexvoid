#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO — INSTANT Profit Trigger (with backfill)
#  
#  2 methods, auto-fallback:
#    1. STANDALONE bun script (force-credit-profit.ts) — directly manipulates DB
#       Works even if cron service is broken/not running
#    2. Cron API trigger (fallback) — if standalone fails
#  
#  Credits ALL missed profit for every active investment, with backfill.
# ═══════════════════════════════════════════════════════════════
set +e

PROJECT_DIR="${PROJECT_DIR:-/home/nexvo}"
CRON_PORT=3032

# If /home/nexvo doesn't exist, use current dir (for local testing)
if [ ! -d "$PROJECT_DIR" ]; then
  PROJECT_DIR="$(pwd)"
fi

echo "═══════════════════════════════════════════════════════"
echo "  NEXVO Instant Profit Trigger (with backfill)"
echo "  Project: $PROJECT_DIR"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── Step 1: Pull latest code ───
echo "▼ [1/6] Pulling latest code..."
cd "$PROJECT_DIR"
git fetch --all 2>/dev/null
git reset --hard origin/main 2>/dev/null || git pull origin main 2>/dev/null || true
git log --oneline -1 2>/dev/null
echo ""

# ─── Step 2: Check current DB state (BEFORE) ───
echo "▼ [2/6] Current DB state (BEFORE):"
DB_FILE=""
for candidate in "$PROJECT_DIR/prisma/custom.db" "$PROJECT_DIR/db/custom.db" "$PROJECT_DIR/custom.db"; do
  if [ -f "$candidate" ]; then
    DB_FILE="$candidate"
    break
  fi
done

if [ -n "$DB_FILE" ] && command -v sqlite3 >/dev/null 2>&1; then
  echo "   DB: $DB_FILE"
  TODAY_WIB=$(TZ='Asia/Jakarta' date '+%Y-%m-%d' 2>/dev/null || date -u '+%Y-%m-%d')
  echo "   Today (WIB): $TODAY_WIB"
  echo ""
  echo "   Active investments:"
  sqlite3 -header -column "$DB_FILE" "SELECT substr(id,1,12) as inv_id, substr(userId,1,12) as user, amount, totalProfitEarned, date(lastProfitDate) as last_profit, date(startDate) as start FROM Investment WHERE status='active' LIMIT 15;" 2>/dev/null
  echo ""
  echo "   Active purchases:"
  sqlite3 -header -column "$DB_FILE" "SELECT substr(id,1,12) as pur_id, substr(userId,1,12) as user, totalPrice, profitEarned, date(lastProfitDate) as last_profit FROM Purchase WHERE status='active' LIMIT 15;" 2>/dev/null
  echo ""
else
  echo "   ⚠️ DB file not found or sqlite3 not available"
fi

# ─── Step 3: Install deps (in case prisma client not generated) ───
echo "▼ [3/6] Ensuring dependencies..."
cd "$PROJECT_DIR"
bun install --frozen-lockfile 2>/dev/null || bun install 2>/dev/null || npm install 2>/dev/null
bunx prisma generate 2>/dev/null || npx prisma generate 2>/dev/null
echo "   ✅ Dependencies ready"
echo ""

# ─── Step 4: METHOD 1 — Run standalone bun script (PRIMARY) ───
echo "▼ [4/6] METHOD 1: Running standalone profit credit script (force mode)..."
echo "   This directly manipulates DB — works even if cron service is broken."
echo ""
if [ -f "$PROJECT_DIR/force-credit-profit.ts" ]; then
  cd "$PROJECT_DIR"
  bun run force-credit-profit.ts --force 2>&1 | tail -60
  BUN_EXIT=$?
  if [ "$BUN_EXIT" = "0" ]; then
    echo ""
    echo "   ✅ Standalone script completed successfully"
  else
    echo ""
    echo "   ⚠️ Standalone script exited with code $BUN_EXIT, trying cron API fallback..."
  fi
else
  echo "   ❌ force-credit-profit.ts not found in $PROJECT_DIR"
  BUN_EXIT=1
fi
echo ""

# ─── Step 5: METHOD 2 — Cron API trigger (FALLBACK, only if Method 1 failed) ───
if [ "$BUN_EXIT" != "0" ]; then
  echo "▼ [5/6] METHOD 2: Triggering cron API (fallback)..."
  # Ensure cron service is running
  PM2_CRON_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; data=json.load(sys.stdin); cron=[p for p in data if p['name']=='nexvo-cron']; print(cron[0]['pm2_env']['status'] if cron else 'not-found')" 2>/dev/null || echo "unknown")
  if [ "$PM2_CRON_STATUS" != "online" ]; then
    echo "   nexvo-cron not running, starting it..."
    cd "$PROJECT_DIR"
    pm2 delete nexvo-cron 2>/dev/null
    pm2 start "bun run cron-service.ts" --name nexvo-cron --cwd "$PROJECT_DIR" 2>/dev/null
    sleep 5
    pm2 save 2>/dev/null
  fi
  TRIGGER_RESP=$(curl -s --max-time 120 -X POST "http://localhost:$CRON_PORT/api/trigger/profit?force=true" 2>/dev/null)
  if [ -n "$TRIGGER_RESP" ]; then
    echo "   Cron API response:"
    echo "$TRIGGER_RESP" | python3 -m json.tool 2>/dev/null || echo "$TRIGGER_RESP"
  else
    echo "   ❌ Cron API also failed. Check: pm2 logs nexvo-cron"
  fi
else
  echo "▼ [5/6] METHOD 2 skipped (Method 1 succeeded)"
fi
echo ""

# ─── Step 6: Verify profit credited (AFTER) ───
echo "▼ [6/6] Verifying profit was credited (AFTER):"
sleep 2
if [ -n "$DB_FILE" ] && command -v sqlite3 >/dev/null 2>&1; then
  echo "   Active investments AFTER:"
  sqlite3 -header -column "$DB_FILE" "SELECT substr(id,1,12) as inv_id, substr(userId,1,12) as user, totalProfitEarned, date(lastProfitDate) as last_profit FROM Investment WHERE status='active' LIMIT 15;" 2>/dev/null
  echo ""
  echo "   Recent profit bonuses (last 15):"
  sqlite3 -header -column "$DB_FILE" "SELECT substr(userId,1,12) as user, amount, substr(description,1,60) as desc_short, datetime(createdAt) as time FROM BonusLog WHERE type='profit' ORDER BY createdAt DESC LIMIT 15;" 2>/dev/null
  echo ""
  echo "   Summary:"
  sqlite3 "$DB_FILE" "SELECT 'Active investments: ' || COUNT(*) FROM Investment WHERE status='active'; SELECT 'Credited today: ' || COUNT(*) FROM Investment WHERE status='active' AND date(lastProfitDate) >= date('$TODAY_WIB'); SELECT 'Total profit bonuses: ' || COUNT(*) || ' (Rp ' || IFNULL(SUM(amount),0) || ')' FROM BonusLog WHERE type='profit';" 2>/dev/null
fi
echo ""

echo "═══════════════════════════════════════════════════════"
echo "  ✅ Profit Trigger Complete"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Refresh Admin Asset page → Total Profit column should show Rp 3.200+ per aset."
echo ""
echo "Cron akan auto-run jam 00:00 WIB setiap hari kerja (Senin-Jumat)."
echo "Sabtu & Minggu = libur."
echo "Kalau cron down, backfill otomatis credit semua hari kerja yang tertinggal."
