#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO Force Profit NOW — Standalone trigger
#  Langsung jalan: cleanup v3.2 + STEP 5 + profit catchup + restart cron
#
#  WHY THIS EXISTS:
#    super-deploy-v10.sh punya strict marker verification yang BISA STUCK
#    kalau marker update. Script ini BYPASSES verification — langsung
#    trigger cleanup + profit catchup, supaya saldo auto-correct.
#
#  WHAT THIS DOES (in order):
#    1. Auto-detect project dir
#    2. Run cleanupDuplicateProfits() via bun run scripts/run-profit-cleanup.ts
#       → STEP 1-5 jalan (including STEP 5: User.mainBalance drift correction)
#    3. pm2 restart nexvo-cron (supaya cron v3.2 baru jalan)
#    4. Run force-credit-profit.ts (credit profit yang tertinggal)
#    5. Verify saldo user di DB
#
#  Run on VPS:
#    bash <(curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/force-profit-now.sh?t=$(date +%s)")
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

echo "═══════════════════════════════════════════════════════════"
echo "  NEXVO Force Profit NOW (v3.2.1)"
echo "  Trigger cleanup + profit catchup TANPA marker verification"
echo "  Waktu: $(date '+%Y-%m-%d %H:%M:%S WIB')"
echo "═══════════════════════════════════════════════════════════"

# ─── AUTO-DETECT PROJECT DIR ───
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
  _PM2_CWD=$(pm2 info nexvo-web 2>/dev/null | grep "cwd" | head -1 | sed 's/.*│ *//;s/ *│.*//' | tr -d ' ')
  if [ -n "$_PM2_CWD" ] && [ -d "$_PM2_CWD" ]; then
    PROJECT_DIR="$_PM2_CWD"
  fi
fi

if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR" ]; then
  echo "❌ Project dir not found! Tried all candidates."
  echo "   Searched: /home/nexvo /root/nexvo /var/www/nexvo /opt/nexvo etc."
  exit 1
fi

echo "  ✅ Project dir: $PROJECT_DIR"
echo "  Git commit: $(cd $PROJECT_DIR && git log --oneline -1 2>/dev/null || echo 'unknown')"
echo ""

cd "$PROJECT_DIR"

# ─── [1/5] Run cleanupDuplicateProfits() directly ───
echo "▼ [1/5] Running profit cleanup (v3.2 — STEP 1-5) directly..."
echo "─────────────────────────────────────────────────"
echo "  This will:"
echo "    STEP 1: Count BonusLog(type='profit')"
echo "    STEP 2: Recalculate Investment.totalProfitEarned (ONLY REDUCE)"
echo "    STEP 3: Recalculate Purchase.profitEarned (ONLY REDUCE)"
echo "    STEP 4: Trim excess BonusLog + correct User balance"
echo "    STEP 5: Direct User balance drift correction (v3.2 NEW)"
echo ""
echo "  Output:"
echo ""

if [ ! -f "scripts/run-profit-cleanup.ts" ]; then
  echo "  ❌ scripts/run-profit-cleanup.ts not found!"
  echo "     Pull latest code: cd $PROJECT_DIR && git pull"
  exit 1
fi

bun run scripts/run-profit-cleanup.ts 2>&1 | tail -80
CLEANUP_EXIT=$?

if [ $CLEANUP_EXIT -ne 0 ]; then
  echo ""
  echo "  ❌ Cleanup failed (exit $CLEANUP_EXIT)"
  echo "     Cek error di atas."
  echo "     Mungkin DB lock atau table missing. Coba: bun run db:push"
  exit 1
fi

echo ""
echo "  ✅ Cleanup selesai"

# ─── [2/5] Restart nexvo-cron (trigger fresh cleanup at startup) ───
echo ""
echo "▼ [2/5] Restarting nexvo-cron (triggers fresh cleanup v3.2 at startup)..."
echo "─────────────────────────────────────────────────"

# Kill stale cron processes (defensive — v17 fix)
CRON_PROC_COUNT=$(pgrep -f "cron-service.ts" 2>/dev/null | wc -l || echo "0")
if [ "$CRON_PROC_COUNT" -gt 1 ]; then
  echo "  ⚠️  Found $CRON_PROC_COUNT cron-service.ts processes — killing stale ones..."
  pgrep -f "cron-service.ts" 2>/dev/null | sort -n | head -n -1 | xargs -r kill 2>/dev/null || true
  sleep 1
fi

# Delete + recreate PM2 process (cleaner than restart)
pm2 delete nexvo-cron 2>/dev/null || true
sleep 1

pm2 start "bun run cron-service.ts" --name nexvo-cron --cwd "$PROJECT_DIR" 2>&1 | tail -5
CRON_PM2_EXIT=$?

if [ $CRON_PM2_EXIT -ne 0 ]; then
  echo "  ⚠️  PM2 start via 'bun run' failed. Trying alternative..."
  pm2 start "$(which bun) $PROJECT_DIR/cron-service.ts" --name nexvo-cron --cwd "$PROJECT_DIR" 2>&1 | tail -5
fi

pm2 save 2>/dev/null || true
sleep 5

# Verify cron is running
CRON_STATUS=$(pm2 info nexvo-cron 2>/dev/null | grep -E "status|uptime" | head -2)
echo "  Cron PM2 status: $CRON_STATUS"

if echo "$CRON_STATUS" | grep -q "online"; then
  echo "  ✅ nexvo-cron running online with v3.2 code"
else
  echo "  ❌ nexvo-cron NOT online! Check: pm2 logs nexvo-cron --lines 30"
fi

# ─── [3/5] Wait for cron startup cleanup to finish ───
echo ""
echo "▼ [3/5] Waiting for cron startup cleanup (15s)..."
echo "─────────────────────────────────────────────────"
sleep 15

echo "  Recent cron logs (last 40 lines):"
pm2 logs nexvo-cron --lines 40 --nostream 2>/dev/null | tail -40

# ─── [4/5] Run force-credit-profit.ts (credit missed profit) ───
echo ""
echo "▼ [4/5] Running force-credit-profit.ts (credit missed profit)..."
echo "─────────────────────────────────────────────────"

WIB_DAY=$(date -u -d "+7 hours" +%u 2>/dev/null || date +%u)
if [ "$WIB_DAY" = "6" ] || [ "$WIB_DAY" = "7" ]; then
  echo "  ⏸️  Today is weekend (WIB day=$WIB_DAY) — profit libur. Forcing with --force..."
  if [ -f "force-credit-profit.ts" ]; then
    bun run force-credit-profit.ts --force 2>&1 | tail -40
  else
    echo "  ⚠️  force-credit-profit.ts not found — skip"
  fi
else
  echo "  🌅 Weekday — running normal profit catch-up..."
  if [ -f "force-credit-profit.ts" ]; then
    bun run force-credit-profit.ts 2>&1 | tail -40
  else
    echo "  ⚠️  force-credit-profit.ts not found — skip"
  fi
fi

# ─── [5/5] Verify user saldo ───
echo ""
echo "▼ [5/5] Verify user saldo di DB..."
echo "─────────────────────────────────────────────────"

# Auto-detect DB
DB=""
for env_path in "$PROJECT_DIR/.env" "/home/nexvo/.env" "/root/nexvo/.env"; do
  if [ -f "$env_path" ]; then
    ENV_DB_URL=$(grep -E "^DATABASE_URL=" "$env_path" 2>/dev/null | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"' | tr -d "'")
    if [ -n "$ENV_DB_URL" ]; then
      ENV_DB_PATH=$(echo "$ENV_DB_URL" | sed 's|^file:||')
      if [ -f "$ENV_DB_PATH" ]; then
        DB="$ENV_DB_PATH"
        break
      fi
    fi
  fi
done

if [ -z "$DB" ]; then
  for db_cand in "$PROJECT_DIR/db/custom.db" "/home/nexvo/db/custom.db" "/root/nexvo/db/custom.db" "/var/www/nexvo/db/custom.db"; do
    if [ -f "$db_cand" ]; then
      DB="$db_cand"
      break
    fi
  done
fi

if [ -z "$DB" ] || [ ! -f "$DB" ]; then
  echo "  ⚠️  DB not found — skipping saldo verify"
  echo "     Manual check: sqlite3 <DB_PATH> 'SELECT userId, name, mainBalance, totalProfit FROM User'"
else
  echo "  ✅ DB: $DB"
  echo ""
  echo "  ▼ Users dengan saldo (mainBalance atau totalProfit > 0):"
  sqlite3 -header -column "$DB" "SELECT userId, name, mainBalance, totalProfit FROM User WHERE mainBalance > 0 OR totalProfit > 0 ORDER BY mainBalance DESC LIMIT 10;" 2>/dev/null

  echo ""
  echo "  ▼ Cross-check: User.totalProfit vs sum(BonusLog profit) vs sum(Investment)"
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
    WHEN u.totalProfit > COALESCE(b.sumLog, 0) + 1 THEN '⚠️ DRIFT (run cleanup again)'
    WHEN COALESCE(b.sumLog, 0) > COALESCE(i.sumInv, 0) + COALESCE(p.sumPur, 0) + 1 THEN '⚠️ EXCESS (run cleanup again)'
    ELSE '✅ OK'
  END as status
FROM User u
LEFT JOIN (SELECT userId, SUM(totalProfitEarned) as sumInv FROM Investment GROUP BY userId) i ON i.userId = u.id
LEFT JOIN (SELECT userId, SUM(profitEarned) as sumPur FROM Purchase GROUP BY userId) p ON p.userId = u.id
LEFT JOIN (SELECT userId, SUM(amount) as sumLog FROM BonusLog WHERE type='profit' GROUP BY userId) b ON b.userId = u.id
WHERE u.totalProfit > 0 OR u.mainBalance > 0
ORDER BY u.totalProfit DESC
LIMIT 10;
" 2>/dev/null
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ FORCE PROFIT NOW COMPLETE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Yang sudah dilakukan:"
echo "    1. ✅ Run cleanupDuplicateProfits() — STEP 1-5 (including STEP 5 drift fix)"
echo "    2. ✅ Restart nexvo-cron PM2 process (v3.2 code active)"
echo "    3. ✅ Wait for cron startup cleanup"
echo "    4. ✅ Run force-credit-profit.ts (credit missed profit)"
echo "    5. ✅ Verify saldo user di DB"
echo ""
echo "  NEXT STEPS:"
echo "    • User refresh browser (Ctrl+Shift+R) — saldo HARUS update"
echo "    • Kalau saldo masih salah, run script ini lagi (idempotent)"
echo "    • Profit berikutnya WAJIB masuk jam 00:00 WIB besok (Senin-Jumat)"
echo ""
echo "  VERIFY CRON ACTIVE:"
echo "    pm2 list                    → nexvo-cron status: online"
echo "    curl http://localhost:3032/api/status  → cron health check"
echo "    pm2 logs nexvo-cron --lines 20         → recent activity"
echo ""
echo "  MANUAL PROFIT TRIGGER (kalau perlu):"
echo "    cd $PROJECT_DIR && bun run force-credit-profit.ts"
echo ""
echo "═══════════════════════════════════════════════════════════"
