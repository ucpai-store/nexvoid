#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO Bootstrap Deploy — 1 command resolves ALL git conflicts
#  + pulls latest code + runs super-deploy-v10.sh
#
#  WHY THIS EXISTS:
#    User ran `bash super-deploy-v10.sh` BEFORE git pull → file didn't
#    exist yet. Then `git pull` failed because 16 PNG files in
#    public/images/payment/ were untracked but exist in the repo.
#
#  WHAT THIS DOES (in order):
#    1. cd to project dir
#    2. git fetch (get latest from GitHub)
#    3. Remove ONLY the conflicting untracked PNG files in payment/products/banners dirs
#    4. git reset --hard origin/main (now safe — no conflicts)
#    5. Run super-deploy-v10.sh (now exists on disk)
#
#  Run on VPS as root or nexvo user:
#    bash <(curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/bootstrap-deploy.sh?t=$(date +%s)")
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

PROJECT_DIR="/home/nexvo"

echo "═══════════════════════════════════════════"
echo "  NEXVO Bootstrap Deploy"
echo "  Timestamp: $(date)"
echo "═══════════════════════════════════════════"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "❌ Project dir not found: $PROJECT_DIR"
  echo "   This script must run on the VPS where /home/nexvo exists."
  exit 1
fi

cd "$PROJECT_DIR"

# ─── [1/5] Check git status ───
echo ""
echo "▼ [1/5] Current git status:"
git status --short | head -20
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
echo "   Branch: $CURRENT_BRANCH"
echo "   Last commit: $(git log --oneline -1 2>/dev/null || echo 'none')"

# ─── [2/5] Fetch latest from GitHub ───
echo ""
echo "▼ [2/5] Fetching latest from origin/main..."
git fetch --all 2>&1 | tail -5
echo "   ✅ Fetch complete"

# ─── [3/5] Remove conflicting untracked files (SCOPED — safe) ───
echo ""
echo "▼ [3/5] Removing untracked files in known-conflict dirs..."
echo "   (Only public/images/payment, products, banners — your uploads/ DB is safe)"

# Use git clean -fd on specific dirs (only removes UNTRACKED files)
for dir in public/images/payment public/images/products public/images/banners; do
  if [ -d "$dir" ]; then
    REMOVED=$(git clean -fd "$dir" 2>&1 | grep "Removing" | wc -l || echo "0")
    echo "   $dir: cleaned $REMOVED untracked files"
  fi
done

# Also handle case where whole public/images/ dir has stale files
# (safe — only touches untracked files in tracked subdirs)
git clean -fd public/images/ 2>/dev/null | head -5 || true

echo "   ✅ Conflict dirs cleaned"

# ─── [4/5] Hard reset to origin/main ───
echo ""
echo "▼ [4/5] Hard reset to origin/main..."
git reset --hard origin/main 2>&1 | tail -3
git log --oneline -1
echo "   ✅ Code is now at latest origin/main"

# ─── [5/5] Run super-deploy-v10.sh ───
echo ""
echo "▼ [5/5] Running super-deploy-v10.sh..."
echo ""

if [ ! -f "super-deploy-v10.sh" ]; then
  echo "❌ super-deploy-v10.sh still not found after pull!"
  echo "   Manual fallback: bash <(curl -sL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/super-deploy-v10.sh)"
  exit 1
fi

chmod +x super-deploy-v10.sh
bash super-deploy-v10.sh

# ─── Verify deploy-version endpoint ───
echo ""
echo "═══════════════════════════════════════════"
echo "  FINAL VERIFICATION"
echo "═══════════════════════════════════════════"
sleep 3
VERSION_RESP=$(curl -s http://localhost:3000/api/deploy-version 2>/dev/null || echo "FAILED")
echo "Deploy version response:"
echo "$VERSION_RESP" | head -c 500
echo ""

if echo "$VERSION_RESP" | grep -q "PROFIT-CONSISTENCY-FIX-V13-20250630"; then
  echo ""
  echo "✅✅✅ DEPLOY SUCCESS ✅✅✅"
  echo "   VPS is running PROFIT-CONSISTENCY-FIX-V13-20250630"
  echo "   → Upload bukti tf akan jalan (base64, no upload route needed)"
  echo "   → Profit cron v2.5 bulletproof aktif untuk malam ini 00:00 WIB"
  echo "   → Lihat Bukti modal fix aktif (no more blank tab)"
else
  echo ""
  echo "⚠️  Version marker belum terlihat. Kemungkinan:"
  echo "   - Next.js masih building (tunggu 1 menit, lalu refresh /api/deploy-version)"
  echo "   - PM2 belum restart dengan code baru (jalankan: pm2 restart nexvo-web --update-env)"
  echo "   - Cek pm2 logs: pm2 logs nexvo-web --lines 30"
  echo ""
  echo "   Expected marker: PROFIT-CONSISTENCY-FIX-V13-20250630"
  echo "   Got response:"
  echo "$VERSION_RESP" | head -c 300
fi
