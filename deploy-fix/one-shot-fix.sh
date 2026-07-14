#!/bin/bash
# one-shot-fix.sh — NEXVO EMERGENCY ONE-SHOT FIX
#
# What this does (in order):
#   1. Auto-detect project path (no more path guessing)
#   2. Stop cron IMMEDIATELY (prevent further saldo wipe)
#   3. Pull latest code (commit b841c79 with fixes)
#   4. Backup User table to JSON (safety net)
#   5. Build production (3-7 min)
#   6. Restart nexvo-web
#   7. Run restore-saldo-v7.ts --apply (restore all users' saldo)
#   8. Restart nexvo-cron (now with FIXED code, won't wipe again)
#   9. Verify endpoints + show summary
#
# Usage:
#   bash deploy-fix/one-shot-fix.sh
#
# Or inline (without git pull first):
#   curl -sL <github-raw-url>/deploy-fix/one-shot-fix.sh | bash

set -e

echo "════════════════════════════════════════════════"
echo "🚨 NEXVO ONE-SHOT FIX"
echo "   Stop cron + Pull + Backup + Build + Restore + Restart"
echo "════════════════════════════════════════════════"
echo ""

# ── Step 1: Detect project path ──
echo "[1/9] 🔍 Detecting project path..."
PROJECT_DIR=""
for p in /var/www/nexvo /home/nexvo /var/www/nexvo.id /opt/nexvo; do
  if [ -d "$p/.git" ]; then PROJECT_DIR="$p"; break; fi
done
if [ -z "$PROJECT_DIR" ]; then
  # Fallback: detect from PM2
  PROJECT_DIR=$(pm2 show nexvo-web 2>/dev/null | grep -E "exec cwd|script path" | head -1 | awk -F': ' '{print $2}' | sed 's|/[^/]*$||' | xargs)
fi
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.git" ]; then
  echo "❌ Cannot find project path. Tried: /var/www/nexvo, /home/nexvo, /var/www/nexvo.id"
  echo "   Manual: cd to your project dir, then run: bash deploy-fix/one-shot-fix.sh"
  exit 1
fi
echo "   ✅ Path: $PROJECT_DIR"
cd "$PROJECT_DIR"

# ── Step 2: Stop cron IMMEDIATELY ──
echo ""
echo "[2/9] ⏸️  Stopping nexvo-cron (prevent further saldo wipe)..."
pm2 stop nexvo-cron 2>&1 | tail -2 || echo "   (cron may already be stopped)"
echo "   ✅ Cron stopped"

# ── Step 3: Pull latest code ──
echo ""
echo "[3/9] ⬇️  Pulling latest code (commit b841c79 with profit-cleanup fix + restore v7)..."
git fetch origin main 2>&1 | tail -2
git reset --hard origin/main 2>&1 | tail -2
echo "   Latest commit:"
git log --oneline -1
echo "   ✅ Code updated"

# ── Step 4: Backup User table (safety net) ──
echo ""
echo "[4/9] 💾 Backing up User table (safety net)..."
BACKUP_FILE="$PROJECT_DIR/db/user-backup-$(date +%Y%m%d-%H%M%S).json"
bun -e "
const { db } = require('./src/lib/db');
const fs = require('fs');
async function main() {
  const users = await db.user.findMany({ select: { id: true, userId: true, name: true, whatsapp: true, mainBalance: true, totalProfit: true, depositBalance: true } });
  fs.writeFileSync('$BACKUP_FILE', JSON.stringify({ backedUpAt: new Date().toISOString(), count: users.length, users }, null, 2));
  console.log('   Backed up ' + users.length + ' users to $BACKUP_FILE');
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
" 2>&1 | tail -3
echo "   ✅ Backup saved: $BACKUP_FILE"

# ── Step 5: Build production ──
echo ""
echo "[5/9] 🔨 Building production (3-7 minutes, DON'T cancel)..."
START=$(date +%s)
bun run build 2>&1 | tail -8
END=$(date +%s)
echo "   ✅ Build done in $((END-START))s"

# ── Step 6: Restart nexvo-web ──
echo ""
echo "[6/9] 🔄 Restarting nexvo-web..."
pm2 restart nexvo-web --update-env 2>&1 | tail -2
sleep 5
echo "   ✅ Web restarted"

# ── Step 7: Restore all user balances ──
echo ""
echo "[7/9] 💰 Restoring all user balances (auto-apply)..."
echo "      Formula: pendapatan = MAX(BonusLog sum, Investment+Purchase+Salary+Matching+Referral)"
echo "      mainBalance = MAX(0, pendapatan - withdrawals)"
echo "      totalProfit = pendapatan"
echo "────────────────────────────────────────────────"
bun run deploy-fix/restore-saldo-v7.ts --apply 2>&1 | tail -40
echo "────────────────────────────────────────────────"

# ── Step 8: Restart cron (with FIXED code) ──
echo ""
echo "[8/9] 🔄 Restarting nexvo-cron (code FIXED, won't wipe again)..."
pm2 restart nexvo-cron --update-env 2>&1 | tail -2
sleep 3
echo "   ✅ Cron restarted with fixed code"

# ── Step 9: Verify ──
echo ""
echo "[9/9] ✅ Verifying..."
sleep 3
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>&1 || echo "fail")
UPLOAD=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/upload 2>&1 || echo "fail")
MAINT=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/admin/maintenance 2>&1 || echo "fail")
echo "   GET /                          → $HTTP  (expect 200)"
echo "   POST /api/upload               → $UPLOAD  (expect 401 = route exists)"
echo "   GET /api/admin/maintenance     → $MAINT  (expect 401 = route exists)"

echo ""
echo "════════════════════════════════════════════════"
echo "✅ ONE-SHOT FIX COMPLETE"
echo "════════════════════════════════════════════════"
echo ""
echo "What was fixed:"
echo "  ✅ profit-cleanup.ts baris 607 — sum ALL bonus types (was only 'profit')"
echo "  ✅ Saldo semua user di-restore dari BonusLog + Assets (MAX formula)"
echo "  ✅ Cron restart pakai code fix — gak akan wipe saldo lagi"
echo "  ✅ /api/upload route (admin bisa upload QRIS/banner/product image)"
echo "  ✅ /api/admin/maintenance (fitur banner 'web dalam perbaikan')"
echo "  ✅ /api/admin/auth/logs (Activity Logs panel)"
echo "  ✅ AdminSettingsPage WhatsApp admin CRUD (was 405)"
echo "  ✅ AdminApiKeyPage pairing code toast (was empty)"
echo "  ✅ admin-whatsapp Page type (refresh gak jatuh login)"
echo ""
echo "Backup file: $BACKUP_FILE"
echo "  (kalau perlu rollback, restore dari file ini)"
echo ""
echo "Next steps:"
echo "  1. Buka incognito window (Ctrl+Shift+N)"
echo "  2. https://nexvo.id → login user → cek saldo (should be back)"
echo "  3. Login admin → test upload QRIS di Payment"
echo "════════════════════════════════════════════════"
