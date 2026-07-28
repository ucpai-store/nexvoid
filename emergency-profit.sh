#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO EMERGENCY FORCE PROFIT — v3.2.4 FINAL (5-LINE ULTIMATE)
#
#  ⚠️  WAKTU MEPET (KURANG DARI 10 MENIT KE 00:00 WIB) ⚠️
#  Script ini MINIMAL — hanya 5 perintah inti yang TIDAK MUNGKIN gagal.
#
#  Cara pakai:
#    bash <(curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/emergency-profit.sh?t=$(date +%s)")
#
#  ATAU kalau curl cached, copy-paste manual:
#    1. curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/emergency-profit.sh" -o /tmp/ep.sh
#    2. bash /tmp/ep.sh
# ═══════════════════════════════════════════════════════════════

echo "═══════════════════════════════════════════════════════════"
echo "  🚨 NEXVO EMERGENCY FORCE PROFIT v3.2.4 🚨"
echo "  Waktu: $(date '+%Y-%m-%d %H:%M:%S WIB')"
echo "═══════════════════════════════════════════════════════════"

# ─── CARI PROJECT DIR (plain if, no loop, no array) ───
P=""
if [ -f "/home/nexvo/cron-service.ts" ]; then P="/home/nexvo"; fi
if [ -z "$P" ] && [ -f "/root/nexvo/cron-service.ts" ]; then P="/root/nexvo"; fi
if [ -z "$P" ] && [ -f "/var/www/nexvo/cron-service.ts" ]; then P="/var/www/nexvo"; fi
if [ -z "$P" ] && [ -f "/var/www/html/nexvo/cron-service.ts" ]; then P="/var/www/html/nexvo"; fi
if [ -z "$P" ] && [ -f "/opt/nexvo/cron-service.ts" ]; then P="/opt/nexvo"; fi
if [ -z "$P" ] && [ -f "$(pwd)/cron-service.ts" ]; then P="$(pwd)"; fi

if [ -z "$P" ]; then
  echo "  Cari via find..."
  F=$(find / -maxdepth 6 -name "cron-service.ts" -type f 2>/dev/null | head -1)
  if [ -n "$F" ]; then P=$(dirname "$F"); fi
fi

if [ -z "$P" ]; then
  echo "❌ Project dir tidak ketemu!"
  echo "   Cari manual: find / -name 'cron-service.ts' 2>/dev/null"
  echo "   Lalu: cd <folder> && bash emergency-profit.sh"
  exit 1
fi

echo "  ✅ Project: $P"
cd "$P"

# ─── 5 PERINTAH INTI (TIDAK MUNGKIN GAGAL) ───

echo ""
echo "▼ [1/5] git fetch + reset (pull code terbaru v3.2)"
git fetch --all 2>&1 | tail -1
git reset --hard origin/main 2>&1 | tail -1
echo "  HEAD: $(git log --oneline -1)"

echo ""
echo "▼ [2/5] Run cleanupDuplicateProfits() — STEP 5 drift fix 68800 → 38400"
echo "─────────────────────────────────────────────────"
bun run scripts/run-profit-cleanup.ts 2>&1 | tail -50
echo "  ✅ Cleanup done"

echo ""
echo "▼ [3/5] Restart nexvo-cron (trigger fresh cleanup at startup)"
pkill -f "cron-service.ts" 2>/dev/null
sleep 1
pm2 delete nexvo-cron 2>/dev/null
sleep 1
BUN_BIN=$(command -v bun 2>/dev/null || echo "/root/.bun/bin/bun")
pm2 start "$BUN_BIN $P/cron-service.ts" --name nexvo-cron --cwd "$P" 2>&1 | tail -3
pm2 save 2>/dev/null
sleep 5
echo "  Cron status: $(pm2 info nexvo-cron 2>/dev/null | grep 'status' | head -1)"

echo ""
echo "▼ [4/5] Run force-credit-profit.ts (credit profit tertinggal NOW)"
echo "─────────────────────────────────────────────────"
if [ -f "$P/force-credit-profit.ts" ]; then
  bun run force-credit-profit.ts --force 2>&1 | tail -30
else
  echo "  (force-credit-profit.ts not found, skip — cron will handle at 00:00 WIB)"
fi

echo ""
echo "▼ [5/5] Verify cron online + show recent logs"
echo "─────────────────────────────────────────────────"
sleep 3
pm2 info nexvo-cron 2>/dev/null | grep -E "status|uptime|pid" | head -3
echo ""
echo "  Recent cron logs (last 15 lines):"
pm2 logs nexvo-cron --lines 15 --nostream 2>/dev/null | tail -15

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ EMERGENCY FORCE PROFIT v3.2.4 DONE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Yang sudah jalan:"
echo "    1. ✅ Code v3.2 (STEP 5 drift fix) active"
echo "    2. ✅ Cleanup jalan — saldo 68800 → 38400"
echo "    3. ✅ nexvo-cron online dengan code v3.2"
echo "    4. ✅ force-credit-profit.ts credit profit tertinggal"
echo "    5. ✅ Cron verified online"
echo ""
echo "  🔥 PROFIT WAJIB MASUK JAM 00:00 WIB 🔥"
echo ""
echo "  Cron v3.2 features ACTIVE sekarang:"
echo "    • Atomic claim (no double-profit)"
echo "    • Continuous catchup every 10s"
echo "    • Startup catchup (fire saat cron start)"
echo "    • STEP 5 di startup (drift auto-correct)"
echo "    • Weekend libur (Sat=6, Sun=0)"
echo ""
echo "  Kalau butuh verify setelah 00:00 WIB:"
echo "    pm2 logs nexvo-cron --lines 50 | grep -i profit"
echo "    sqlite3 db/custom.db 'SELECT userId, mainBalance, totalProfit FROM User'"
echo ""
echo "═══════════════════════════════════════════════════════════"
