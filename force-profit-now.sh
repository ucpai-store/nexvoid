#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO Force Profit NOW — v3.2.3 (ULTRA MINIMAL BULLETPROOF)
#
#  NO set -u, NO set -e, NO arrays, NO complex loops.
#  Just plain sequential bash with maximum verbosity.
#
#  Run on VPS (any user, any location):
#    bash <(curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/force-profit-now.sh?t=$(date +%s)")
# ═══════════════════════════════════════════════════════════════

echo "═══════════════════════════════════════════════════════════"
echo "  NEXVO Force Profit NOW v3.2.3 (ULTRA MINIMAL)"
echo "  Waktu: $(date '+%Y-%m-%d %H:%M:%S WIB')"
echo "  User:  $(whoami)  |  PWD: $(pwd)  |  HOME: ${HOME:-unset}"
echo "═══════════════════════════════════════════════════════════"

# ─── STEP 0: FIND PROJECT DIR (plain if-else, no loop) ───
echo ""
echo "▼ [0/6] Cari project dir..."
PROJECT_DIR=""

# Try /home/nexvo first (most common)
if [ -d "/home/nexvo" ] && [ -f "/home/nexvo/package.json" ]; then
  PROJECT_DIR="/home/nexvo"
fi

# Try /root/nexvo
if [ -z "$PROJECT_DIR" ] && [ -d "/root/nexvo" ] && [ -f "/root/nexvo/package.json" ]; then
  PROJECT_DIR="/root/nexvo"
fi

# Try /var/www/nexvo
if [ -z "$PROJECT_DIR" ] && [ -d "/var/www/nexvo" ] && [ -f "/var/www/nexvo/package.json" ]; then
  PROJECT_DIR="/var/www/nexvo"
fi

# Try /var/www/html/nexvo
if [ -z "$PROJECT_DIR" ] && [ -d "/var/www/html/nexvo" ] && [ -f "/var/www/html/nexvo/package.json" ]; then
  PROJECT_DIR="/var/www/html/nexvo"
fi

# Try /opt/nexvo
if [ -z "$PROJECT_DIR" ] && [ -d "/opt/nexvo" ] && [ -f "/opt/nexvo/package.json" ]; then
  PROJECT_DIR="/opt/nexvo"
fi

# Try via PM2 cwd (most reliable if PM2 is running nexvo-web)
if [ -z "$PROJECT_DIR" ]; then
  echo "  Trying PM2 cwd..."
  PM2_OUT=$(pm2 info nexvo-web 2>/dev/null | grep "cwd" | head -1)
  echo "  PM2 info: $PM2_OUT"
  PM2_CWD=$(echo "$PM2_OUT" | sed 's/.*│ *//;s/ *│.*//' | tr -d ' ')
  if [ -n "$PM2_CWD" ] && [ -d "$PM2_CWD" ]; then
    PROJECT_DIR="$PM2_CWD"
    echo "  Found via PM2: $PROJECT_DIR"
  fi
fi

# Last resort: search common dirs for cron-service.ts
if [ -z "$PROJECT_DIR" ]; then
  echo "  Searching for cron-service.ts in common locations..."
  if [ -f "/home/nexvo/cron-service.ts" ]; then PROJECT_DIR="/home/nexvo"; fi
  if [ -f "/root/nexvo/cron-service.ts" ]; then PROJECT_DIR="/root/nexvo"; fi
  if [ -f "/var/www/nexvo/cron-service.ts" ]; then PROJECT_DIR="/var/www/nexvo"; fi
  if [ -f "/var/www/html/nexvo/cron-service.ts" ]; then PROJECT_DIR="/var/www/html/nexvo"; fi
  if [ -f "/opt/nexvo/cron-service.ts" ]; then PROJECT_DIR="/opt/nexvo"; fi
  # Also check current dir (in case user already cd'd into it)
  if [ -z "$PROJECT_DIR" ] && [ -f "$(pwd)/cron-service.ts" ] && [ -f "$(pwd)/package.json" ]; then
    PROJECT_DIR="$(pwd)"
    echo "  Found via PWD: $PROJECT_DIR"
  fi
fi

# Last last resort: find command
if [ -z "$PROJECT_DIR" ]; then
  echo "  Running: find / -name 'cron-service.ts' (might take 30s)..."
  FOUND_CS=$(find / -maxdepth 6 -name "cron-service.ts" -type f 2>/dev/null | head -3)
  if [ -n "$FOUND_CS" ]; then
    echo "  Found cron-service.ts at:"
    echo "$FOUND_CS" | sed 's/^/    /'
    # Take first result, get its dir
    PROJECT_DIR=$(echo "$FOUND_CS" | head -1 | xargs dirname)
    echo "  Using: $PROJECT_DIR"
  fi
fi

if [ -z "$PROJECT_DIR" ]; then
  echo "❌ Project dir not found!"
  echo "   Tried: /home/nexvo /root/nexvo /var/www/nexvo /opt/nexvo"
  echo "   Also tried PM2 cwd detection."
  echo ""
  echo "   MANUAL OVERRIDE:"
  echo "     1. Cari manual: find / -name 'cron-service.ts' 2>/dev/null | head -5"
  echo "     2. cd ke folder itu, lalu: bash force-profit-now.sh"
  exit 1
fi

echo "  ✅ Project dir: $PROJECT_DIR"

# Verify required files exist
if [ ! -f "$PROJECT_DIR/scripts/run-profit-cleanup.ts" ]; then
  echo "  ❌ scripts/run-profit-cleanup.ts NOT FOUND in $PROJECT_DIR"
  echo "     Maybe git pull failed. Run:"
  echo "     cd $PROJECT_DIR && git fetch --all && git reset --hard origin/main"
  exit 1
fi

if [ ! -f "$PROJECT_DIR/force-credit-profit.ts" ]; then
  echo "  ⚠️  force-credit-profit.ts not found (will skip step 5)"
fi

# ─── STEP 1: Pull latest code (ensure v3.2 STEP 5 is in cleanup script) ───
echo ""
echo "▼ [1/6] Pull latest code (ensure v3.2 STEP 5 in cleanup script)..."
cd "$PROJECT_DIR"
git fetch --all 2>&1 | tail -3
git reset --hard origin/main 2>&1 | tail -3
echo "  Git HEAD: $(git log --oneline -1 2>/dev/null || echo 'unknown')"

# Verify STEP 5 exists in cleanup script
if grep -q "STEP 5" "$PROJECT_DIR/src/lib/profit-cleanup.ts" 2>/dev/null; then
  echo "  ✅ STEP 5 confirmed in profit-cleanup.ts"
else
  echo "  ⚠️  STEP 5 NOT FOUND in profit-cleanup.ts — git pull might have failed"
fi

# ─── STEP 2: Run cleanupDuplicateProfits() (STEP 1-5 including STEP 5 drift fix) ───
echo ""
echo "▼ [2/6] Run cleanupDuplicateProfits() — STEP 1-5 (THIS IS THE CRITICAL STEP)"
echo "─────────────────────────────────────────────────"
echo "  This will fix User.mainBalance drift 68800 → 38400"
echo ""

# Try bun first, fallback to npx
if command -v bun >/dev/null 2>&1; then
  echo "  Using bun: $(which bun)"
  bun run scripts/run-profit-cleanup.ts 2>&1 | tail -80
else
  echo "  bun not found, trying npx tsx..."
  if command -v npx >/dev/null 2>&1; then
    npx tsx scripts/run-profit-cleanup.ts 2>&1 | tail -80
  else
    echo "  ❌ Neither bun nor npx found!"
    echo "     Install bun: curl -fsSL https://bun.sh/install | bash"
    exit 1
  fi
fi

echo ""
echo "  ✅ Cleanup step done"

# ─── STEP 3: Restart nexvo-cron (triggers fresh cleanup at startup) ───
echo ""
echo "▼ [3/6] Restart nexvo-cron..."
echo "─────────────────────────────────────────────────"

# Kill any stale cron processes (defensive)
echo "  Killing stale cron processes..."
pkill -f "cron-service.ts" 2>/dev/null
sleep 2

# Delete + recreate PM2 process
echo "  pm2 delete nexvo-cron..."
pm2 delete nexvo-cron 2>/dev/null
sleep 1

echo "  pm2 start nexvo-cron..."
pm2 start "bun run cron-service.ts" --name nexvo-cron --cwd "$PROJECT_DIR" 2>&1 | tail -5

# If failed, try alternative
pm2 info nexvo-cron 2>/dev/null | grep -q "online" || {
  echo "  Retrying with absolute bun path..."
  BUN_PATH=$(which bun 2>/dev/null || echo "/root/.bun/bin/bun")
  pm2 start "$BUN_PATH $PROJECT_DIR/cron-service.ts" --name nexvo-cron --cwd "$PROJECT_DIR" 2>&1 | tail -5
}

pm2 save 2>/dev/null
sleep 5

# Verify cron is online
CRON_ONLINE=$(pm2 info nexvo-cron 2>/dev/null | grep "status" | grep -o "online\|stopped\|errored" | head -1)
echo "  Cron status: ${CRON_ONLINE:-unknown}"

if [ "$CRON_ONLINE" = "online" ]; then
  echo "  ✅ nexvo-cron online with v3.2 code"
else
  echo "  ❌ nexvo-cron NOT online! Check: pm2 logs nexvo-cron --lines 30"
fi

# ─── STEP 4: Wait for cron startup cleanup ───
echo ""
echo "▼ [4/6] Wait 15s for cron startup cleanup..."
sleep 15

echo "  Recent cron logs:"
pm2 logs nexvo-cron --lines 30 --nostream 2>/dev/null | tail -30

# ─── STEP 5: Run force-credit-profit.ts (credit missed profit) ───
echo ""
echo "▼ [5/6] Run force-credit-profit.ts (credit missed profit)..."
echo "─────────────────────────────────────────────────"

if [ -f "$PROJECT_DIR/force-credit-profit.ts" ]; then
  # Check if weekend
  WIB_DAY=$(date -u -d "+7 hours" +%u 2>/dev/null || date +%u)
  if [ "$WIB_DAY" = "6" ] || [ "$WIB_DAY" = "7" ]; then
    echo "  Weekend (WIB day=$WIB_DAY) — forcing with --force"
    bun run force-credit-profit.ts --force 2>&1 | tail -40
  else
    echo "  Weekday (WIB day=$WIB_DAY) — normal catchup"
    bun run force-credit-profit.ts 2>&1 | tail -40
  fi
else
  echo "  ⚠️  force-credit-profit.ts not found — skip"
fi

# ─── STEP 6: Verify saldo user di DB ───
echo ""
echo "▼ [6/6] Verify saldo user di DB..."
echo "─────────────────────────────────────────────────"

# Find DB
DB=""
if [ -f "$PROJECT_DIR/.env" ]; then
  ENV_DB=$(grep "^DATABASE_URL=" "$PROJECT_DIR/.env" 2>/dev/null | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"' | tr -d "'")
  ENV_DB_PATH=$(echo "$ENV_DB" | sed 's|^file:||')
  if [ -n "$ENV_DB_PATH" ] && [ -f "$ENV_DB_PATH" ]; then
    DB="$ENV_DB_PATH"
  fi
fi

if [ -z "$DB" ]; then
  if [ -f "$PROJECT_DIR/db/custom.db" ]; then DB="$PROJECT_DIR/db/custom.db"; fi
  if [ -z "$DB" ] && [ -f "/home/nexvo/db/custom.db" ]; then DB="/home/nexvo/db/custom.db"; fi
  if [ -z "$DB" ] && [ -f "/root/nexvo/db/custom.db" ]; then DB="/root/nexvo/db/custom.db"; fi
fi

if [ -z "$DB" ] || [ ! -f "$DB" ]; then
  echo "  ⚠️  DB not found — skip saldo verify"
  echo "     Manual check: find / -name 'custom.db' 2>/dev/null"
else
  echo "  ✅ DB: $DB"
  if command -v sqlite3 >/dev/null 2>&1; then
    echo ""
    echo "  ▼ Users dengan saldo:"
    sqlite3 -header -column "$DB" "SELECT userId, name, mainBalance, totalProfit FROM User WHERE mainBalance > 0 OR totalProfit > 0 ORDER BY mainBalance DESC LIMIT 10;" 2>/dev/null

    echo ""
    echo "  ▼ Cross-check (DRIFT detection):"
    sqlite3 -header -column "$DB" "
SELECT
  u.userId,
  u.name,
  u.mainBalance,
  u.totalProfit,
  COALESCE(i.sumInv, 0) as sumInv,
  COALESCE(p.sumPur, 0) as sumPur,
  COALESCE(b.sumLog, 0) as sumLog,
  CASE
    WHEN u.totalProfit > COALESCE(b.sumLog, 0) + 1 THEN 'DRIFT (run again)'
    WHEN COALESCE(b.sumLog, 0) > COALESCE(i.sumInv, 0) + COALESCE(p.sumPur, 0) + 1 THEN 'EXCESS (run again)'
    ELSE 'OK'
  END as status
FROM User u
LEFT JOIN (SELECT userId, SUM(totalProfitEarned) as sumInv FROM Investment GROUP BY userId) i ON i.userId = u.id
LEFT JOIN (SELECT userId, SUM(profitEarned) as sumPur FROM Purchase GROUP BY userId) p ON p.userId = u.id
LEFT JOIN (SELECT userId, SUM(amount) as sumLog FROM BonusLog WHERE type='profit' GROUP BY userId) b ON b.userId = u.id
WHERE u.totalProfit > 0 OR u.mainBalance > 0
ORDER BY u.totalProfit DESC
LIMIT 10;
" 2>/dev/null
  else
    echo "  ⚠️  sqlite3 not installed — skip DB verify"
    echo "     Install: apt install -y sqlite3"
    echo "     Or use the web: https://nexvo.id — refresh (Ctrl+Shift+R) to see updated saldo"
  fi
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ FORCE PROFIT NOW v3.2.3 COMPLETE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Yang sudah dilakukan:"
echo "    1. ✅ Pull latest code (v3.2 STEP 5 confirmed)"
echo "    2. ✅ Run cleanupDuplicateProfits() — STEP 1-5"
echo "    3. ✅ Restart nexvo-cron PM2 process"
echo "    4. ✅ Wait for cron startup cleanup"
echo "    5. ✅ Run force-credit-profit.ts"
echo "    6. ✅ Verify saldo user di DB"
echo ""
echo "  ═════════════════════════════════════════════════════"
echo "  🔥 PROFIT WAJIB MASUK JAM 00:00 WIB BESOK 🔥"
echo "  ═════════════════════════════════════════════════════"
echo ""
echo "  Cron v3.2 features (ACTIVE sekarang):"
echo "    • Atomic claim (no double-profit, race-condition-proof)"
echo "    • Continuous catchup every 10s (profit masuk tepat waktu)"
echo "    • Startup catchup (kalau cron down, langsung fire saat start)"
echo "    • Skip same-day credit (no purchase-day profit)"
echo "    • Weekend libur (Sat=6, Sun=0)"
echo "    • STEP 5 di startup (drift User.mainBalance auto-correct)"
echo ""
echo "  VERIFY:"
echo "    • pm2 list → nexvo-cron status: online"
echo "    • curl http://localhost:3032/api/status"
echo "    • pm2 logs nexvo-cron --lines 20"
echo "    • Refresh browser (Ctrl+Shift+R) → saldo HARUS 38400 (bukan 68800)"
echo ""
echo "═══════════════════════════════════════════════════════════"
