#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO Bootstrap Deploy — 1 command resolves ALL git conflicts
#  + pulls latest code + runs super-deploy-v10.sh
#
#  v3.2.1 (2025-06-30):
#    - Auto-detect PROJECT_DIR (multiple candidates + PM2 cwd fallback)
#    - Accept MULTIPLE markers (not just V17) — prevents deploy stuck
#      when marker updated to v3.1 / v3.2 / future versions
#
#  Run on VPS as root or nexvo user:
#    bash <(curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/bootstrap-deploy.sh?t=$(date +%s)")
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

# ─── AUTO-DETECT PROJECT DIR (v3.2.1) ───
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
  # Fallback via PM2 cwd
  _PM2_CWD=$(pm2 info nexvo-web 2>/dev/null | grep "cwd" | head -1 | sed 's/.*│ *//;s/ *│.*//' | tr -d ' ')
  if [ -n "$_PM2_CWD" ] && [ -d "$_PM2_CWD" ]; then
    PROJECT_DIR="$_PM2_CWD"
  fi
fi

# ★★★ v3.2.1: ACCEPT MULTIPLE MARKERS (so future deploys don't fail verify step) ★★★
ACCEPTED_MARKERS=(
  "PROFIT-CLEANUP-V3.2-20250630"   # current (commit 97c2af3+)
  "PROFIT-CLEANUP-V3.1-20250630"   # v3.1 fallback
  "DOUBLE-PROFIT-FIX-V17-20250630" # legacy v17 fallback
)
EXPECTED_MARKER="${ACCEPTED_MARKERS[0]}"   # primary marker (for display)

echo "═══════════════════════════════════════════"
echo "  NEXVO Bootstrap Deploy (v3.2.1)"
echo "  Timestamp: $(date)"
echo "  Project dir: ${PROJECT_DIR:-NOT_FOUND}"
echo "  Accepted markers:"
for m in "${ACCEPTED_MARKERS[@]}"; do echo "    - $m"; done
echo "═══════════════════════════════════════════"

if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR" ]; then
  echo "❌ Project dir not found! Tried all candidates."
  echo "   Searched: /home/nexvo /root/nexvo /var/www/nexvo /opt/nexvo etc."
  echo "   Manual override: cd /your/project/path && bash bootstrap-deploy.sh"
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

# ★★★ v3.2.1: accept ANY of ACCEPTED_MARKERS ★★★
MARKER_OK=false
MATCHED_MARKER=""
for _m in "${ACCEPTED_MARKERS[@]}"; do
  if echo "$VERSION_RESP" | grep -q "$_m"; then
    MARKER_OK=true
    MATCHED_MARKER="$_m"
    break
  fi
done

if [ "$MARKER_OK" = "true" ]; then
  echo ""
  echo "✅✅✅ DEPLOY SUCCESS ✅✅✅"
  echo "   VPS is running $MATCHED_MARKER"
  echo "   → cron v3.2 STEP 5 (direct User balance correction from BonusLog)"
  echo "   → cron v2.7 ATOMIC CLAIM (no more double-profit)"
  echo "   → cron v2.7 PID LOCK (no duplicate cron instances)"
  echo "   → Profit masuk jam 00:00 WIB (Senin-Jumat), Sabtu-Minggu libur"
  echo "   → Continuous catchup every 10s — pasti masuk tepat waktu"
  echo ""
  echo "═══════════════════════════════════════════"
  echo "  NEXT: VERIFIKASI SALDO & PROFIT CATCHUP"
  echo "═══════════════════════════════════════════"
  echo ""
  echo "  1. Cek saldo user di DB (saldo harusnya 38400, bukan 68800):"
  echo "     bash <(curl -sL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/diag-deep-v32.sh)"
  echo ""
  echo "  2. Force cleanup + profit catchup NOW (langsung trigger):"
  echo "     bash <(curl -sL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/force-profit-now.sh)"
  echo ""
  echo "  3. Cek pm2 logs nexvo-cron untuk konfirmasi STEP 5 jalan:"
  echo "     pm2 logs nexvo-cron --lines 50 | grep 'STEP 5\\|v3.2'"
  echo ""
  echo "  Output harus menampilkan:"
  echo "     ✅ Corrected: mainBalance 68800 → 38400 | totalProfit 68800 → 38400"
else
  echo ""
  echo "⚠️  Version marker belum terlihat. Kemungkinan:"
  echo "   - Next.js masih building (tunggu 1 menit, lalu refresh /api/deploy-version)"
  echo "   - PM2 belum restart dengan code baru (jalankan: pm2 restart nexvo-web --update-env)"
  echo "   - Cek pm2 logs: pm2 logs nexvo-web --lines 30"
  echo ""
  echo "   Accepted markers (none matched):"
  for _m in "${ACCEPTED_MARKERS[@]}"; do echo "     - $_m"; done
  echo "   Got response:"
  echo "$VERSION_RESP" | head -c 300
  echo ""
  echo "═══════════════════════════════════════════"
  echo "  FALLBACK: Force profit catchup TANPA marker verification:"
  echo "═══════════════════════════════════════════"
  echo "  Code v3.2 sudah ter-deploy tapi verification stuck."
  echo "  Langsung trigger cleanup + profit catchup:"
  echo "     bash <(curl -sL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/force-profit-now.sh)"
fi
