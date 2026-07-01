#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO CHUNK-ERROR FIX DEPLOYER v2
#
#  v2 FIXES:
#  - PM2 process name: nexvo → nexvo-web (v1 bug caused restart to FAIL)
#  - sw.js v32: passive, NO forceClientsReload (no more refresh loops)
#
#  Cara pakai (pilih salah):
#
#  OPSI A (curl pipe — pakai cache-buster):
#    bash <(curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/deploy-chunk-fix.sh?t=$(date +%s)")
#
#  OPSI B (download dulu, lalu jalanin):
#    curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/deploy-chunk-fix.sh" -o /tmp/fix.sh
#    bash /tmp/fix.sh
#
#  OPSI C (kalau udah ada di folder project):
#    bash deploy-chunk-fix.sh
# ═══════════════════════════════════════════════════════════════

echo "═══════════════════════════════════════════════════════════"
echo "  🔧 NEXVO CHUNK-ERROR FIX DEPLOYER v2"
echo "  Waktu: $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════"

# ─── 1. DETECT PROJECT DIR (plain if, no loop) ───
P=""
if [ -f "/home/nexvo/package.json" ]; then P="/home/nexvo"; fi
if [ -z "$P" ] && [ -f "/root/nexvo/package.json" ]; then P="/root/nexvo"; fi
if [ -z "$P" ] && [ -f "/var/www/nexvo/package.json" ]; then P="/var/www/nexvo"; fi
if [ -z "$P" ] && [ -f "/var/www/html/nexvo/package.json" ]; then P="/var/www/html/nexvo"; fi
if [ -z "$P" ] && [ -f "/opt/nexvo/package.json" ]; then P="/opt/nexvo"; fi
if [ -z "$P" ] && [ -f "$(pwd)/package.json" ]; then P="$(pwd)"; fi

if [ -z "$P" ]; then
  echo "  Cari via find (bisa lambat)..."
  F=$(find / -maxdepth 6 -name "package.json" -type f 2>/dev/null | xargs grep -l '"nexvo"' 2>/dev/null | head -1)
  if [ -n "$F" ]; then P=$(dirname "$F"); fi
fi

if [ -z "$P" ]; then
  echo "❌ Project dir tidak ketemu!"
  echo "   Cari manual: find / -name 'package.json' 2>/dev/null | xargs grep -l nexvo"
  echo "   Lalu: cd <folder> && bash deploy-chunk-fix.sh"
  exit 1
fi

echo "  ✅ Project: $P"
cd "$P" || { echo "❌ Gagal cd ke $P"; exit 1; }

# ─── 2. DETECT BUN ───
BUN=""
if command -v bun >/dev/null 2>&1; then BUN=$(command -v bun); fi
if [ -z "$BUN" ] && [ -x "/root/.bun/bin/bun" ]; then BUN="/root/.bun/bin/bun"; fi
if [ -z "$BUN" ] && [ -x "$HOME/.bun/bin/bun" ]; then BUN="$HOME/.bun/bin/bun"; fi
if [ -z "$BUN" ] && command -v npx >/dev/null 2>&1; then
  echo "  ⚠️  bun tidak ketemu, pakai npx"
  BUN="npx"
fi
if [ -z "$BUN" ]; then
  echo "❌ bun/npx tidak ketemu! Install bun: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi
echo "  ✅ Runtime: $BUN"

echo ""
echo "▼ [1/5] git fetch + reset ke origin/main (pull fix chunk-error)"
git fetch --all 2>&1 | tail -2
git reset --hard origin/main 2>&1 | tail -2
git log --oneline -1 2>&1

echo ""
echo "▼ [2/5] Clear Next.js build cache (.next/cache) — fix stale chunks"
rm -rf .next/cache 2>/dev/null && echo "  ✅ .next/cache cleared" || echo "  ℹ️  .next/cache tidak ada (OK)"

echo ""
echo "▼ [3/5] Install dependencies (skip kalau node_modules masih valid)"
if [ "$BUN" = "npx" ]; then
  npm install --omit=dev 2>&1 | tail -3
else
  $BUN install --frozen-lockfile 2>&1 | tail -3 || $BUN install 2>&1 | tail -3
fi

echo ""
echo "▼ [4/5] Build Next.js production"
if [ "$BUN" = "npx" ]; then
  npm run build 2>&1 | tail -10
else
  $BUN run build 2>&1 | tail -10
fi
BUILD_EXIT=$?
if [ $BUILD_EXIT -ne 0 ]; then
  echo "❌ Build gagal! Cek error di atas."
  exit 1
fi

echo ""
echo "▼ [5/5] Restart PM2 (FIX: nexvo-web + nexvo-cron — bukan 'nexvo')"
if command -v pm2 >/dev/null 2>&1; then
  echo "  📋 PM2 process list:"
  pm2 list 2>&1 | grep -E "name|nexvo|online|disabled" | head -10

  echo ""
  echo "  🔄 Restart nexvo-web (v1 bug: namanya 'nexvo', fix: 'nexvo-web')..."
  pm2 restart nexvo-web 2>&1 | tail -3
  WEB_OK=$?

  echo "  🔄 Restart nexvo-cron..."
  pm2 restart nexvo-cron 2>&1 | tail -3 || echo "  ℹ️  nexvo-cron tidak ada (OK)"

  if [ $WEB_OK -ne 0 ]; then
    echo "  ⚠️  nexvo-web restart gagal! Coba alternatif:"
    echo "     pm2 list  (lihat nama process yang benar)"
    echo "     pm2 restart all  (restart semuanya)"
    echo "     pm2 reload nexvo-web  (coba reload)"
  else
    echo "  ✅ PM2 restarted (nexvo-web + nexvo-cron)"
  fi

  # Save PM2 config so it survives reboot
  pm2 save 2>&1 | tail -1
else
  echo "  ⚠️  pm2 tidak ketemu — restart manual Next.js kamu"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ DEPLOY SELESAI"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "🔍 VERIFIKASI (cek sw.js version harus v32):"
echo "   curl -s 'https://nexvo.id/sw.js?t=\$(date +%s)' | grep CACHE_NAME"
echo "   → harus: const CACHE_NAME = 'nexvo-v32';"
echo ""
echo "🔍 VERIFIKASI PM2 (cek process running):"
echo "   pm2 list  (nexvo-web harus 'online' dan restart count naik)"
echo ""
echo "🌐 TEST DI BROWSER (pakai cache-buster, bypass cache):"
echo "   https://nexvo.id/?_cb=$(date +%s)"
echo ""
echo "🩹 KALAU BROWSER MASIH STUCK (SW lama masih ke-cache):"
echo "   1. Buka https://nexvo.id/recovery.html (clear cache otomatis)"
echo "   2. Atau buka incognito/private window ke https://nexvo.id"
echo "   3. Atau DevTools (F12) → Application → Service Workers → Unregister"
echo ""
echo "📝 Commit yang ter-deploy:"
git log --oneline -3 2>&1
echo "═══════════════════════════════════════════════════════════"
