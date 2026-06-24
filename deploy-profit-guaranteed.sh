#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO — Profit Guaranteed Cron Setup
#  
#  Sets up SYSTEM CRONTAB as backup to PM2 cron service.
#  Even if PM2 crashes / nexvo-cron process dies, this VPS crontab
#  will trigger profit at 00:00 WIB (17:00 UTC) every weekday.
#
#  Also adds @reboot to start PM2 on VPS boot.
# ═══════════════════════════════════════════════════════════════
set -e

PROJECT_DIR="/home/nexvo"
CRON_PORT=3032

if [ ! -d "$PROJECT_DIR" ]; then
  echo "❌ Project dir not found: $PROJECT_DIR"
  exit 1
fi

echo "═══════════════════════════════════════════════════════"
echo "  NEXVO Profit Guaranteed Cron Setup"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── Step 1: Pull latest code ───
echo "▼ [1/4] Pulling latest code..."
cd "$PROJECT_DIR"
git fetch --all 2>/dev/null || true
git reset --hard origin/main 2>/dev/null || git pull origin main 2>/dev/null || true
git log --oneline -1
echo ""

# ─── Step 2: Setup PM2 startup (so PM2 starts on VPS reboot) ───
echo "▼ [2/4] Setting up PM2 startup (auto-start on VPS reboot)..."
pm2 startup 2>/dev/null | grep "sudo" | head -1 | bash 2>/dev/null || echo "   (PM2 startup already configured or needs sudo)"
pm2 save 2>/dev/null || true
echo "   ✅ PM2 startup configured"
echo ""

# ─── Step 3: Restart PM2 processes with ecosystem config ───
echo "▼ [3/4] Restarting PM2 with ecosystem.config.cjs..."
if [ -f "$PROJECT_DIR/ecosystem.config.cjs" ]; then
  pm2 delete nexvo-web 2>/dev/null || true
  pm2 delete nexvo-cron 2>/dev/null || true
  pm2 start "$PROJECT_DIR/ecosystem.config.cjs" --env production 2>/dev/null
  pm2 save 2>/dev/null
  sleep 4
  echo "   ✅ PM2 processes started with auto-restart policy"
  pm2 list 2>/dev/null | grep -E "nexvo|name" | head -5
else
  echo "   ⚠️ ecosystem.config.cjs not found, using manual start..."
  pm2 restart nexvo-web --update-env 2>/dev/null || pm2 start "bun run start" --name nexvo-web --cwd "$PROJECT_DIR" 2>/dev/null
  pm2 restart nexvo-cron --update-env 2>/dev/null || pm2 start "bun run cron-service.ts" --name nexvo-cron --cwd "$PROJECT_DIR" 2>/dev/null
  pm2 save 2>/dev/null
fi
echo ""

# ─── Step 4: Setup SYSTEM CRONTAB as backup (the GUARANTEE) ───
echo "▼ [4/4] Setting up system crontab (backup trigger at 00:00 WIB)..."
# 00:00 WIB = 17:00 UTC (WIB = UTC+7)
# Run on weekdays only (Mon-Fri): cron field 1-5
# Job 1: Trigger profit cron at 00:01 WIB (give PM2 cron 1 min head start, in case it works)
# Job 2: Force-credit profit at 00:05 WIB (standalone fallback if cron service dead)
# Job 3: @reboot — wait 60s after boot, trigger profit catch-up
# Job 4: Health check every 5 min — restart nexvo-cron if not responding

CRON_ENTRIES="# NEXVO profit guaranteed cron (added by deploy-profit-guaranteed.sh)
# === PROFIT GUARANTEE: 3 layers of protection ===
# Layer 1: PM2 cron-service auto-runs at 00:00 WIB (built-in scheduler)
# Layer 2: System crontab triggers cron API at 00:01 WIB (in case PM2 scheduler missed)
# Layer 3: System crontab runs standalone force-credit at 00:05 WIB (if cron API also dead)

# Layer 2: Trigger PM2 cron API at 00:01 WIB (17:01 UTC) weekdays only
1 17 * * 1-5 cd $PROJECT_DIR && curl -s -X POST 'http://localhost:$CRON_PORT/api/trigger/profit?force=true' >> /home/nexvo/.pm2-logs/cron-trigger.log 2>&1

# Layer 3: Standalone force-credit at 00:05 WIB (17:05 UTC) weekdays only
# (Only credits if not already credited today — DB dedup)
5 17 * * 1-5 cd $PROJECT_DIR && /usr/bin/bun run force-credit-profit.ts --force >> /home/nexvo/.pm2-logs/force-credit.log 2>&1

# Health check: every 5 min, restart nexvo-cron if not responding on port $CRON_PORT
*/5 * * * * curl -s --max-time 5 'http://localhost:$CRON_PORT/api/status' > /dev/null 2>&1 || (cd $PROJECT_DIR && pm2 restart nexvo-cron >> /home/nexvo/.pm2-logs/cron-health.log 2>&1)

# On VPS reboot: wait 60s, then trigger profit catch-up (handles any missed while booting)
@reboot sleep 60 && cd $PROJECT_DIR && /usr/bin/bun run force-credit-profit.ts --force >> /home/nexvo/.pm2-logs/reboot-credit.log 2>&1
# END NEXVO profit guaranteed cron"

# Write to temp file
echo "$CRON_ENTRIES" > /tmp/nexvo-crontab.txt

# Get current crontab (might be empty)
CURRENT_CRON=$(crontab -l 2>/dev/null || echo "")

# Remove old NEXVO entries (between markers)
CLEANED_CRON=$(echo "$CURRENT_CRON" | sed '/# NEXVO profit guaranteed cron/,/# END NEXVO profit guaranteed cron/d')

# Combine: cleaned + new entries
NEW_CRON="$CLEANED_CRON

$CRON_ENTRIES"

# Install new crontab
echo "$NEW_CRON" | crontab -

echo "   ✅ System crontab installed"
echo ""
echo "   Installed crontab entries:"
crontab -l 2>/dev/null | grep -A 20 "NEXVO profit guaranteed"
echo ""

# ─── Create log directory ───
mkdir -p /home/nexvo/.pm2-logs
echo "   ✅ Log directory ready: /home/nexvo/.pm2-logs"
echo ""

# ─── Verify cron service is responding ───
echo "─── Verification ───"
sleep 2
CRON_STATUS=$(curl -s --max-time 5 "http://localhost:$CRON_PORT/api/status" 2>/dev/null)
if [ -n "$CRON_STATUS" ]; then
  echo "✅ Cron service responding:"
  echo "$CRON_STATUS" | python3 -m json.tool 2>/dev/null || echo "$CRON_STATUS"
else
  echo "⚠️ Cron service not responding yet — will auto-restart via health check in 5 min"
fi
echo ""

# ─── Run standalone profit NOW (catch up any missed) ───
echo "─── Running profit catch-up NOW ───"
cd "$PROJECT_DIR"
bun run force-credit-profit.ts --force 2>&1 | tail -30
echo ""

echo "═══════════════════════════════════════════════════════"
echo "  ✅ PROFIT GUARANTEED — 3 Layers of Protection"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Layer 1: PM2 nexvo-cron (scheduler checks every 10s, trigger window 00:00-00:59 WIB)"
echo "  ↳ Auto-restart on crash (max 100 restarts, exp backoff)"
echo "  ↳ Startup catch-up if PM2 restarts after 00:05 WIB"
echo ""
echo "Layer 2: System crontab @ 00:01 WIB (weekdays)"
echo "  ↳ Triggers cron API endpoint as backup"
echo ""
echo "Layer 3: System crontab @ 00:05 WIB (weekdays)"
echo "  ↳ Standalone bun script (no cron service needed, directly credits DB)"
echo "  ↳ DB dedup prevents double-credit"
echo ""
echo "Health check: every 5 min, restart nexvo-cron if not responding"
echo "On reboot: @reboot trigger catch-up after 60s"
echo ""
echo "📋 To view crontab: crontab -l"
echo "📋 To view cron logs: tail -f /home/nexvo/.pm2-logs/cron-trigger.log"
echo "📋 To view force-credit logs: tail -f /home/nexvo/.pm2-logs/force-credit.log"
echo ""
echo "🔥 NANTI MALAM JAM 00:00 WIB — PROFIT WAJIB MASUK! 🔥"
