#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO FULL REVERT — balik ke state SEBELUM saya sentuh apa-apa
#
#  Ini opsi NUKLIR. Zero risk. Zero code baru dari saya.
#  Revert: sw.js, error.tsx, layout.tsx → exact state commit 80e44b5
#  Keep:   recovery.html, check-production.sh (harmless helpers)
#
#  Cara pakai:
#    bash <(curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/revert-all.sh?t=$(date +%s)")
# ═══════════════════════════════════════════════════════════════

echo "═══════════════════════════════════════════════════════════"
echo "  ⏪ NEXVO FULL REVERT — ke state sebelum semua fix"
echo "  Waktu: $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════"

# ─── DETECT PROJECT DIR ───
P=""
for d in /home/nexvo /root/nexvo /var/www/nexvo /var/www/html/nexvo /opt/nexvo "$(pwd)"; do
  [ -f "$d/package.json" ] && P="$d" && break
done
if [ -z "$P" ]; then
  F=$(find / -maxdepth 6 -name "package.json" -type f 2>/dev/null | xargs grep -l '"nexvo"' 2>/dev/null | head -1)
  [ -n "$F" ] && P=$(dirname "$F")
fi
[ -z "$P" ] && { echo "❌ Project dir gak ketemu"; exit 1; }

echo "  Project: $P"
cd "$P" || exit 1

# ─── FETCH + RESET TO PRE-FIX COMMIT ───
echo ""
echo "▼ [1/4] Fetch + reset ke commit 80e44b5 (pre-fix state)"
git fetch --all 2>&1 | tail -2

# Reset specific files to pre-fix state (keep recovery.html + scripts)
git checkout 80e44b5 -- src/app/error.tsx src/app/layout.tsx public/sw.js 2>&1
echo "  ✅ error.tsx, layout.tsx, sw.js → reverted ke 80e44b5"

echo ""
echo "▼ [2/4] Clear build cache"
rm -rf .next/cache 2>/dev/null && echo "  ✅ .next/cache cleared" || echo "  ℹ️  no cache (OK)"

echo ""
echo "▼ [3/4] Build"
if command -v bun >/dev/null 2>&1; then
  bun run build 2>&1 | tail -8
else
  npm run build 2>&1 | tail -8
fi
[ $? -ne 0 ] && { echo "❌ Build gagal"; exit 1; }

echo ""
echo "▼ [4/4] Restart PM2 (FIX: nexvo-web, bukan nexvo)"
if command -v pm2 >/dev/null 2>&1; then
  pm2 list 2>&1 | grep -E "nexvo|name" | head -5
  pm2 restart nexvo-web 2>&1 | tail -2
  pm2 restart nexvo-cron 2>&1 | tail -1 || echo "  ℹ️  no nexvo-cron (OK)"
  pm2 save 2>&1 | tail -1
  echo "  ✅ PM2 restarted"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ REVERT SELESAI"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  State sekarang = EXACT copy sebelum saya sentuh code."
echo "  error.tsx, layout.tsx, sw.js = original (commit 80e44b5)"
echo ""
echo "  ⚠️  BROWSER CACHE: SW lama masih ke-cache di browser kamu."
echo "     WAJIB clear cache salah satu cara:"
echo "     1. Incognito → https://nexvo.id"
echo "     2. https://nexvo.id/recovery.html → Clear Cache & Reload"
echo "     3. DevTools → Application → Service Workers → Unregister"
echo ""
echo "═══════════════════════════════════════════════════════════"
