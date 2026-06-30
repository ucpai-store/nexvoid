#!/bin/bash
# ════════════════════════════════════════════════════════════════
#  NEXVO v3.1 DIAGNOSTIC — cek apakah v3.1 sudah running & cleanup jalan
#  Jalankan di VPS: bash diag-v31-status.sh
# ════════════════════════════════════════════════════════════════
set +e
PROJECT_DIR="/home/nexvo"
DB="$PROJECT_DIR/db/custom.db"

echo "═══════════════════════════════════════════════════════════"
echo "  NEXVO v3.1 DIAGNOSTIC REPORT"
echo "  Waktu: $(date '+%Y-%m-%d %H:%M:%S WIB')"
echo "═══════════════════════════════════════════════════════════"

echo ""
echo "▼ [1/6] DEPLOY MARKER (harus PROFIT-CLEANUP-V3.1-20250630)"
echo "─────────────────────────────────────────────────"
MARKER=$(curl -s --max-time 5 http://localhost:3000/api/deploy-version 2>/dev/null | grep -o '"versionMarker":"[^"]*"' | head -1)
if [ -z "$MARKER" ]; then
  MARKER=$(curl -s --max-time 5 https://nexvo.id/api/deploy-version 2>/dev/null | grep -o '"versionMarker":"[^"]*"' | head -1)
fi
echo "  $MARKER"
if echo "$MARKER" | grep -q "V3.1"; then
  echo "  ✅ v3.1 SUDAH di-deploy"
else
  echo "  ❌ v3.1 BELUM di-deploy! Jalankan bootstrap-deploy.sh"
fi

echo ""
echo "▼ [2/6] PM2 STATUS (nexvo-web + nexvo-cron harus online)"
echo "─────────────────────────────────────────────────"
pm2 list 2>/dev/null | grep -E "nexvo|name" | head -5

echo ""
echo "▼ [3/6] CRON LOGS — apakah cleanup v3.1 jalan?"
echo "─────────────────────────────────────────────────"
pm2 logs nexvo-cron --lines 30 --nostream 2>&1 | grep -E "v3\.1|Cleanup|Profit Cleanup|STEP|corrected|removed" | tail -15

echo ""
echo "▼ [4/6] CRON PROCESS COUNT (harus 1, bukan 2+)"
echo "─────────────────────────────────────────────────"
PROC_COUNT=$(pgrep -f "cron-service.ts" 2>/dev/null | wc -l)
echo "  cron-service.ts processes: $PROC_COUNT"
if [ "$PROC_COUNT" = "1" ]; then
  echo "  ✅ Tepat 1 instance (benar)"
elif [ "$PROC_COUNT" = "0" ]; then
  echo "  ❌ cron TIDAK running! pm2 restart nexvo-cron"
else
  echo "  ❌ DANGER: $PROC_COUNT instances (double-profit risk!)"
  echo "  Fix: pm2 delete nexvo-cron; pkill -f cron-service.ts; pm2 start 'bun run cron-service.ts' --name nexvo-cron --cwd $PROJECT_DIR"
fi

echo ""
echo "▼ [5/6] DB — Investment.totalProfitEarned per user"
echo "─────────────────────────────────────────────────"
if [ -f "$DB" ]; then
  sqlite3 "$DB" "SELECT userId, COUNT(*) as cnt, SUM(totalProfitEarned) as total_profit, GROUP_CONCAT(status) as statuses FROM Investment GROUP BY userId;" 2>/dev/null | head -20
else
  echo "  ❌ DB tidak ditemukan di $DB"
fi

echo ""
echo "▼ [6/6] DB — User.mainBalance & totalProfit (saldo asli)"
echo "─────────────────────────────────────────────────"
if [ -f "$DB" ]; then
  sqlite3 -header "$DB" "SELECT userId, name, mainBalance, totalProfit FROM User WHERE mainBalance > 0 OR totalProfit > 0 ORDER BY mainBalance DESC LIMIT 10;" 2>/dev/null
else
  echo "  ❌ DB tidak ditemukan"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  DIAGNOSIS:"
echo "═══════════════════════════════════════════════════════════"
if echo "$MARKER" | grep -q "V3.1"; then
  echo "  ✅ v3.1 sudah deploy."
  echo "  → Jika saldo masih 68800 = cleanup belum jalan / cron crash."
  echo "  → Cek [3/6] apakah ada log 'v3.1 Profit Cleanup done'."
  echo "  → Jika tidak ada, jalankan: pm2 restart nexvo-cron"
  echo "  → Tunggu 30 detik, lalu cek lagi log & saldo."
else
  echo "  ❌ v3.1 BELUM deploy."
  echo "  → Saldo 68800 itu BUG lama (belum di-trim)."
  echo "  → DEPLOY SEKARANG:"
  echo "     bash <(curl -sL 'https://raw.githubusercontent.com/ucpai-store/nexvoid/main/bootstrap-deploy.sh?t=\$(date +%s)')"
  echo "  → Setelah deploy, cron auto-restart → cleanup v3.1 jalan → saldo 68800→38400"
fi
echo "═══════════════════════════════════════════════════════════"
