# ═══════════════════════════════════════════════════════════════
#  NEXVO INLINE FORCE PROFIT — Copy-paste langsung ke terminal VPS
#  (Bypass curl cache sepenuhnya — 100% inline, no download)
#
#  Cara pakai:
#    1. Login ke VPS via Hostinger Web Terminal
#    2. Copy SEMUA baris di bawah ini (mulai dari 'cat > /tmp/force-profit.sh')
#    3. Paste ke terminal VPS, tekan Enter
#    4. Lalu jalankan: bash /tmp/force-profit.sh
# ═══════════════════════════════════════════════════════════════

cat > /tmp/force-profit.sh << 'SCRIPT_EOF'
#!/bin/bash
echo "═══════════════════════════════════════════════════════════"
echo "  NEXVO Inline Force Profit v3.2.3"
echo "  Waktu: $(date '+%Y-%m-%d %H:%M:%S WIB')"
echo "  User: $(whoami) | PWD: $(pwd)"
echo "═══════════════════════════════════════════════════════════"

PROJECT_DIR=""
[ -d "/home/nexvo" ] && [ -f "/home/nexvo/package.json" ] && PROJECT_DIR="/home/nexvo"
[ -z "$PROJECT_DIR" ] && [ -d "/root/nexvo" ] && [ -f "/root/nexvo/package.json" ] && PROJECT_DIR="/root/nexvo"
[ -z "$PROJECT_DIR" ] && [ -d "/var/www/nexvo" ] && [ -f "/var/www/nexvo/package.json" ] && PROJECT_DIR="/var/www/nexvo"
[ -z "$PROJECT_DIR" ] && [ -d "/opt/nexvo" ] && [ -f "/opt/nexvo/package.json" ] && PROJECT_DIR="/opt/nexvo"

if [ -z "$PROJECT_DIR" ]; then
  PM2_CWD=$(pm2 info nexvo-web 2>/dev/null | grep "cwd" | head -1 | sed 's/.*│ *//;s/ *│.*//' | tr -d ' ')
  [ -n "$PM2_CWD" ] && [ -d "$PM2_CWD" ] && PROJECT_DIR="$PM2_CWD"
fi

if [ -z "$PROJECT_DIR" ]; then
  echo "  Searching cron-service.ts..."
  FOUND=$(find / -maxdepth 6 -name "cron-service.ts" -type f 2>/dev/null | head -3)
  if [ -n "$FOUND" ]; then
    PROJECT_DIR=$(echo "$FOUND" | head -1 | xargs dirname)
    echo "  Found: $PROJECT_DIR"
  fi
fi

if [ -z "$PROJECT_DIR" ]; then
  echo "❌ Project dir not found!"
  echo "   cd /home/nexvo lalu jalankan manual:"
  echo "   bun run scripts/run-profit-cleanup.ts"
  echo "   bun run force-credit-profit.ts"
  exit 1
fi

echo "✅ Project: $PROJECT_DIR"
cd "$PROJECT_DIR"

echo ""
echo "▼ [1/4] Pull latest code..."
git fetch --all 2>&1 | tail -2
git reset --hard origin/main 2>&1 | tail -2
echo "  HEAD: $(git log --oneline -1)"

echo ""
echo "▼ [2/4] Run cleanupDuplicateProfits() — STEP 1-5 (CRITICAL)"
echo "  This fixes User.mainBalance drift 68800 → 38400"
echo ""
if command -v bun >/dev/null 2>&1; then
  bun run scripts/run-profit-cleanup.ts 2>&1 | tail -60
else
  npx tsx scripts/run-profit-cleanup.ts 2>&1 | tail -60
fi

echo ""
echo "▼ [3/4] Restart nexvo-cron..."
pkill -f "cron-service.ts" 2>/dev/null
sleep 2
pm2 delete nexvo-cron 2>/dev/null
sleep 1
pm2 start "bun run cron-service.ts" --name nexvo-cron --cwd "$PROJECT_DIR" 2>&1 | tail -3
pm2 info nexvo-cron 2>/dev/null | grep -q "online" || {
  BUN_PATH=$(which bun 2>/dev/null || echo "/root/.bun/bin/bun")
  pm2 start "$BUN_PATH $PROJECT_DIR/cron-service.ts" --name nexvo-cron --cwd "$PROJECT_DIR" 2>&1 | tail -3
}
pm2 save 2>/dev/null
sleep 10

echo ""
echo "▼ [4/4] Run force-credit-profit.ts (credit missed profit)..."
if [ -f "$PROJECT_DIR/force-credit-profit.ts" ]; then
  WIB_DAY=$(date -u -d "+7 hours" +%u 2>/dev/null || date +%u)
  if [ "$WIB_DAY" = "6" ] || [ "$WIB_DAY" = "7" ]; then
    echo "  Weekend — forcing with --force"
    bun run force-credit-profit.ts --force 2>&1 | tail -30
  else
    echo "  Weekday — normal catchup"
    bun run force-credit-profit.ts 2>&1 | tail -30
  fi
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ DONE — Saldo user harusnya 38400 sekarang"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  VERIFY:"
echo "    pm2 list                    → nexvo-cron: online"
echo "    curl http://localhost:3032/api/status"
echo "    pm2 logs nexvo-cron --lines 20"
echo ""
echo "  🔥 Profit WAJIB masuk jam 00:00 WIB besok (Senin-Jumat)"
echo "     Atomic claim + continuous catchup every 10s"
echo "═══════════════════════════════════════════════════════════"
SCRIPT_EOF

echo ""
echo "✅ Script saved to /tmp/force-profit.sh"
echo ""
echo "Sekarang jalankan:"
echo "  bash /tmp/force-profit.sh"
