#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO Deploy: Weekend Libur (Sabtu & Minggu — ONLY Profit & WD OFF)
# ════════════════════════════════════════════════════════════════
# PERUBAHAN:
#   - HANYA Profit & Withdrawal (WD) yang LIBUR di Sabtu & Minggu
#   - Deposit, salary, referral bonus, matching bonus TETAP JALAN normal di weekend
#   - Withdraw API: block dengan pesan "Withdrawal (WD) diblokir..."
#   - Profit cron: skip profit distribution di Sabtu & Minggu (no daily profit)
#   - UI: WeekendNoticeBanner di halaman Withdraw & Profit (NOT Deposit)
#   - profit-status API: return isWeekend flag + next profit = Senin 00:00 WIB
# ════════════════════════════════════════════════════════════════
set -e

PROJECT_DIR="/home/nexvo"
PM2_NAME="nexvo-web"
CRON_NAME="nexvo-cron"

echo "═══════════════════════════════════════════════════"
echo "  NEXVO Deploy: Weekend Libur (Sabtu & Minggu)"
echo "  ONLY Profit & WD OFF — deposit, salary, referral tetap jalan"
echo "═══════════════════════════════════════════════════"

cd "$PROJECT_DIR" || { echo "❌ Project dir $PROJECT_DIR not found!"; exit 1; }
echo "✓ Masuk ke $PROJECT_DIR"

# ─── STEP 1: PULL LATEST CODE ────────────────────────────────────
echo ""
echo "📥 STEP 1: Pull latest code..."
git fetch origin main
git reset --hard origin/main
echo "✓ Code updated"

# ─── STEP 2: CLEAR BUILD CACHE ───────────────────────────────────
echo ""
echo "🧹 STEP 2: Clear Next.js build cache..."
rm -rf .next/cache 2>/dev/null || true
rm -rf .next/standalone 2>/dev/null || true
echo "✓ Cache cleared"

# ─── STEP 3: INSTALL DEPENDENCIES ────────────────────────────────
echo ""
echo "📦 STEP 3: Install dependencies..."
if command -v bun &> /dev/null; then
  bun install 2>/dev/null || npm install --legacy-peer-deps
else
  npm install --legacy-peer-deps
fi
echo "✓ Dependencies ready"

# ─── STEP 4: BUILD ───────────────────────────────────────────────
echo ""
echo "🔨 STEP 4: Build Next.js (fresh)..."
npm run build
echo "✓ Build complete"

# ─── STEP 5: COPY STATIC + UPLOADS TO STANDALONE ─────────────────
echo ""
echo "📂 STEP 5: Copy assets to standalone..."
if [ -d ".next/standalone" ]; then
  cp -r public .next/standalone/ 2>/dev/null || true
  cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
  mkdir -p .next/standalone/uploads 2>/dev/null || true
  if [ -d "uploads" ]; then
    cp -r uploads/* .next/standalone/uploads/ 2>/dev/null || true
  fi
  echo "✓ Assets + uploads dir copied"
else
  echo "⚠️  standalone dir not found!"
fi

# ─── STEP 6: RESTART PM2 (WEB) ───────────────────────────────────
echo ""
echo "🔄 STEP 6: Restart PM2 Web ($PM2_NAME)..."
pm2 delete "$PM2_NAME" 2>/dev/null || true
cd .next/standalone
pm2 start server.js --name "$PM2_NAME" --cwd "$(pwd)"
pm2 save 2>/dev/null || true
cd "$PROJECT_DIR"
echo "✓ PM2 Web restarted (fresh process)"

# ─── STEP 7: RESTART PM2 (CRON) ──────────────────────────────────
echo ""
echo "🔄 STEP 7: Restart PM2 Cron ($CRON_NAME)..."
pm2 delete "$CRON_NAME" 2>/dev/null || true
pm2 start "bun run cron-service.ts" --name "$CRON_NAME" --update-env 2>/dev/null || echo "  ⚠️  cron-service opsional (skip)"
pm2 save 2>/dev/null || true
echo "✓ PM2 Cron restarted (weekend guard aktif)"

# ─── STEP 8: WAIT FOR SERVER ─────────────────────────────────────
echo ""
echo "⏳ STEP 8: Waiting for server..."
sleep 5
SERVER_OK=false
for i in 1 2 3 4 5 6 7 8; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
  if echo "$CODE" | grep -q "200\|301\|302"; then
    echo "  ✓ Server responding (HTTP $CODE)"
    SERVER_OK=true
    break
  fi
  echo "  Attempt $i: HTTP $CODE, waiting..."
  sleep 3
done

if [ "$SERVER_OK" = false ]; then
  echo "❌ Server not responding! Check PM2 logs:"
  pm2 logs "$PM2_NAME" --lines 30 --nostream
  exit 1
fi

# ─── STEP 9: VERIFICATION ────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo "  VERIFICATION"
echo "═══════════════════════════════════════════════════"

# 1. Main site
MAIN=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)
echo "  Main site (/): HTTP $MAIN $([ "$MAIN" = "200" ] && echo '✅' || echo '❌')"

# 2. Check current day in WIB
WIB_DAY=$(TZ=Asia/Jakarta date +"%A")
WIB_DATE=$(TZ=Asia/Jakarta date +"%Y-%m-%d %H:%M")
echo "  Current WIB time: $WIB_DATE ($WIB_DAY)"
if [ "$WIB_DAY" = "Saturday" ] || [ "$WIB_DAY" = "Sunday" ]; then
  echo "  → Today is WEEKEND — all activities should be BLOCKED"
else
  echo "  → Today is weekday — activities normal (weekend guard standby)"
fi

# 3. Test deposit API (check if weekend block works)
echo ""
echo "  Testing deposit API weekend guard..."
USER_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"whatsapp":"628123456789","password":"Test@1234"}' 2>/dev/null | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null || echo "")

if [ -n "$USER_TOKEN" ]; then
  DEPOSIT_RES=$(curl -s -X POST http://localhost:3000/api/deposit \
    -H "Authorization: Bearer $USER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"amount":100000,"paymentType":"qris","paymentName":"QRIS"}' 2>/dev/null)
  
  DEPOSIT_ERR=$(echo "$DEPOSIT_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',''))" 2>/dev/null || echo "")
  
  if echo "$DEPOSIT_ERR" | grep -qi "diblokir\|Sabtu\|Minggu"; then
    echo "  Deposit API: ✅ Weekend block ACTIVE (blocked with weekend message)"
  elif [ -z "$DEPOSIT_ERR" ]; then
    if [ "$WIB_DAY" = "Saturday" ] || [ "$WIB_DAY" = "Sunday" ]; then
      echo "  Deposit API: ❌ Should be blocked (weekend) but wasn't!"
    else
      echo "  Deposit API: ✅ No weekend block (correct — today is $WIB_DAY)"
    fi
  else
    echo "  Deposit API: Other error: $DEPOSIT_ERR"
  fi
fi

# 4. Test profit-status API (check isWeekend field)
echo ""
echo "  Testing profit-status API (isWeekend field)..."
if [ -n "$USER_TOKEN" ]; then
  PROFIT_RES=$(curl -s -H "Authorization: Bearer $USER_TOKEN" http://localhost:3000/api/user/profit-status 2>/dev/null)
  IS_WEEKEND=$(echo "$PROFIT_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('isWeekend','N/A'))" 2>/dev/null || echo "N/A")
  SCHEDULE=$(echo "$PROFIT_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('schedule',{}).get('dailyProfit','N/A'))" 2>/dev/null || echo "N/A")
  echo "  isWeekend: $IS_WEEKEND"
  echo "  schedule.dailyProfit: $SCHEDULE"
  if echo "$SCHEDULE" | grep -qi "Senin-Jumat\|libur Sabtu"; then
    echo "  ✅ Schedule text updated (mentions weekend libur)"
  else
    echo "  ❌ Schedule text NOT updated"
  fi
fi

# 5. Check cron-service is running
echo ""
echo "  PM2 processes:"
pm2 list 2>/dev/null | grep -E "nexvo-web|nexvo-cron|name" || echo "  (pm2 list failed)"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  DEPLOY SELESAI!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "📌 PERILAKU BARU (Weekend Libur — ONLY Profit & WD):"
echo "  • Sabtu & Minggu = Profit & WD (Withdrawal) LIBUR"
echo "  • Deposit  → TETAP BISA (deposit allowed on weekends)"
echo "  • Withdraw → diblokir dengan pesan jelas"
echo "  • Profit harian → tidak dikreditkan di weekend"
echo "  • Salary, referral, matching → TETAP JALAN normal"
echo "  • Senin pagi 00:00 WIB → profit cron jalan lagi"
echo "  • UI: banner kuning muncul otomatis di Withdraw/Profit saat weekend (NOT deposit)"
echo ""
echo "⚠️  HARD REFRESH browser (Ctrl+Shift+R) untuk load kode baru!"
echo ""
