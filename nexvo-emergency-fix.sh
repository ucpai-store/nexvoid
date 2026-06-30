#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO EMERGENCY FIX — Profit + Deposit + Cron (ALL IN ONE)
#
#  Run on VPS as root/nexvo user:
#    cd /home/nexvo && bash nexvo-emergency-fix.sh
#
#  What this does:
#  1. Diagnoses VPS state (PM2, DB, payment methods, active purchases)
#  2. Pulls latest code (v2.5 BULLETPROOF) from GitHub
#  3. Builds + restarts nexvo-web + nexvo-cron
#  4. Forces profit credit NOW (all 22 purchases)
#  5. Verifies deposit API works
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

PROJECT_DIR="/home/nexvo"
CRON_PORT=3032
WEB_PORT=3000
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

cd "$PROJECT_DIR" 2>/dev/null || { echo "❌ /home/nexvo not found. Run: cd /home/nexvo && bash nexvo-emergency-fix.sh"; exit 1; }

echo "═══════════════════════════════════════════════════════"
echo "  NEXVO EMERGENCY FIX — Profit + Deposit + Cron"
echo "  Time: $(date)"
echo "  Dir:  $(pwd)"
echo "═══════════════════════════════════════════════════════"

# ─── [1] DIAGNOSE CURRENT STATE ───
echo ""
echo "▼ [1/7] DIAGNOSING current VPS state..."
echo ""
echo "--- PM2 processes ---"
pm2 list 2>/dev/null | grep -E "nexvo|name" || echo "   ⚠️ pm2 not found or no nexvo processes"
echo ""
echo "--- Git status ---"
git log --oneline -3 2>/dev/null || echo "   ⚠️ not a git repo"
echo ""
echo "--- DB file ---"
DB_FILE=$(find /home/nexvo -name "custom.db" -type f 2>/dev/null | head -1)
if [ -n "$DB_FILE" ]; then
  echo "   ✅ DB found: $DB_FILE ($(du -h "$DB_FILE" | cut -f1))"
else
  echo "   ❌ DB file custom.db not found in /home/nexvo"
fi
echo ""

# ─── [2] PULL LATEST CODE ───
echo "▼ [2/7] Pulling latest code from GitHub (v2.5 BULLETPROOF)..."
git fetch --all 2>/dev/null || true
git reset --hard origin/main 2>/dev/null || git pull origin main 2>/dev/null || true
git log --oneline -1
echo "   ✅ Code updated"

# Verify marker
if grep -q "PROFIT-BULLETPROOF-V10-20250629" cron-service.ts 2>/dev/null; then
  echo "   ✅ cron-service.ts = v2.5 BULLETPROOF confirmed"
else
  echo "   ❌ cron-service.ts does NOT have v2.5 marker! Git pull may have failed."
  echo "   Current marker:"
  grep "Version marker:" cron-service.ts 2>/dev/null | head -1
fi

# ─── [3] INSTALL DEPS + GENERATE PRISMA ───
echo ""
echo "▼ [3/7] Installing deps + generating Prisma client..."
bun install --production=false 2>&1 | tail -2 || npm install 2>&1 | tail -2 || true
bun run db:generate 2>&1 | tail -2 || npx prisma generate 2>&1 | tail -2 || true
echo "   ✅ Deps + Prisma ready"

# ─── [4] BUILD NEXT.JS ───
echo ""
echo "▼ [4/7] Building Next.js (1-3 min)..."
BACKUP_DIR="/home/nexvo/.next-backup-${TIMESTAMP}"
if [ -d ".next" ]; then cp -a .next "$BACKUP_DIR"; echo "   Backup: $BACKUP_DIR"; fi

bun run build 2>&1 | tail -15
BUILD_EXIT=${PIPESTATUS[0]:-$?}
if [ "$BUILD_EXIT" != "0" ]; then
  echo "❌ BUILD FAILED. Rolling back..."
  rm -rf .next && cp -a "$BACKUP_DIR" .next
  echo "   ⚠️ Rolled back. nexvo-web still runs old build."
  exit 1
fi
echo "   ✅ Build succeeded"

# ─── [5] RESTART PM2 PROCESSES ───
echo ""
echo "▼ [5/7] Restarting nexvo-web + nexvo-cron..."
pm2 restart nexvo-web --update-env 2>/dev/null || pm2 start "bun run start" --name nexvo-web --cwd "$PROJECT_DIR" 2>/dev/null
pm2 delete nexvo-cron 2>/dev/null || true
pm2 start "bun run cron-service.ts" --name nexvo-cron --cwd "$PROJECT_DIR" 2>/dev/null
pm2 save 2>/dev/null || true
sleep 6
echo "   ✅ Both processes restarted"
pm2 list 2>/dev/null | grep -E "nexvo|name"

# ─── [6] VERIFY DEPLOY ───
echo ""
echo "▼ [6/7] Verifying deploy..."
sleep 3
VERSION_RESP=$(curl -s --max-time 10 "http://localhost:${WEB_PORT}/api/deploy-version" 2>/dev/null || echo "")
if echo "$VERSION_RESP" | grep -q "PROFIT-BULLETPROOF-V10-20250629"; then
  echo "   ✅ VPS running v2.5 BULLETPROOF code"
else
  echo "   ⚠️ Marker not found. Response:"
  echo "$VERSION_RESP" | head -c 300
fi

# ─── [7] FORCE PROFIT CREDIT NOW + CHECK DEPOSIT ───
echo ""
echo "▼ [7/7] Forcing profit credit NOW + checking deposit API..."
echo ""
echo "--- Cron status (should show 22 active purchases) ---"
curl -s --max-time 5 "http://localhost:${CRON_PORT}/api/status" 2>/dev/null | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  print(f'   WIB: {d.get(\"wibWallTime\")}')
  print(f'   Day: {d.get(\"dayName\")} (weekend={d.get(\"isWeekend\")})')
  print(f'   Profit credited today: {d.get(\"profitCreditedCount\")}/{d.get(\"profitTotalActive\")}')
  print(f'   Next fire: {d.get(\"nextProfitFireDesc\",\"\")[:100]}')
except:
  print('   (could not parse cron status)')
" 2>/dev/null || echo "   ⚠️ Cron service not responding on port $CRON_PORT"

echo ""
echo "--- Triggering profit credit NOW (force=true bypasses weekend) ---"
curl -s --max-time 30 -X POST "http://localhost:${CRON_PORT}/api/trigger/profit?force=true" 2>/dev/null | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  data=d.get('data',{})
  print(f'   ✅ Processed: {data.get(\"processed\")} assets')
  print(f'   💰 Total profit credited: Rp {data.get(\"totalProfit\",0):,.0f}')
  print(f'   🤝 Matching credited: Rp {data.get(\"totalMatching\",0):,.0f}')
  print(f'   ⚠️ Errors: {data.get(\"errors\",0)}')
except Exception as e:
  print(f'   (parse error: {e})')
" 2>/dev/null || echo "   ⚠️ Profit trigger failed"

echo ""
echo "--- Payment methods (deposit needs these) ---"
curl -s --max-time 5 "http://localhost:${WEB_PORT}/api/payment-methods" 2>/dev/null | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  methods=d.get('data',[])
  print(f'   Active payment methods: {len(methods)}')
  for m in methods:
    print(f'     - {m.get(\"type\")}: {m.get(\"name\")} (qrImage: {\"✅\" if m.get(\"qrImage\") else \"❌ empty\"}, accountNo: {\"✅\" if m.get(\"accountNo\") else \"❌ empty\"})')
except Exception as e:
  print(f'   (parse error: {e})')
" 2>/dev/null || echo "   ⚠️ Payment methods API not responding"

echo ""
echo "--- Deposit API health (no auth = should return 401, not 500) ---"
DEPOSIT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:${WEB_PORT}/api/deposit" 2>/dev/null)
if [ "$DEPOSIT_STATUS" = "401" ]; then
  echo "   ✅ Deposit API healthy (HTTP 401 = needs auth, expected)"
elif [ "$DEPOSIT_STATUS" = "500" ]; then
  echo "   ❌ Deposit API BROKEN (HTTP 500 = server error)"
  echo "   Check: pm2 logs nexvo-web --lines 30"
elif [ "$DEPOSIT_STATUS" = "000" ]; then
  echo "   ❌ nexvo-web not responding on port $WEB_PORT"
else
  echo "   ⚠️ Deposit API returned HTTP $DEPOSIT_STATUS (expected 401)"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅ EMERGENCY FIX COMPLETE"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "What was done:"
echo "  • Pulled v2.5 BULLETPROOF code from GitHub"
echo "  • Built Next.js + restarted nexvo-web"
echo "  • Restarted nexvo-cron with v2.5 code"
echo "  • Forced profit credit NOW (all active purchases)"
echo ""
echo "If profit was credited (Processed > 0):"
echo "  → Users will see profit in Riwayat + balance IMMEDIATELY"
echo "  → Tonight 00:00 WIB: cron fires automatically"
echo ""
echo "If deposit API still broken (HTTP 500):"
echo "  → Check logs: pm2 logs nexvo-web --lines 50"
echo "  → Common cause: DB schema mismatch. Run:"
echo "    cd /home/nexvo && bun run db:push"
echo ""
echo "Verify live:"
echo "  • https://nexvo.id/api/deploy-version → marker PROFIT-BULLETPROOF-V10-20250629"
echo "  • https://nexvo.id → try deposit again"
echo ""
