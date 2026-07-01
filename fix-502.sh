#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO 502 FIX — delete stale PM2 + start fresh
#
#  ROOT CAUSE: PM2 process nexvo-web still references
#  .next/standalone/server.js (old config). After we removed
#  output:standalone, that file doesn't exist → crash → 502.
#
#  Fix: delete PM2 process, start fresh with `bun run start`
# ═══════════════════════════════════════════════════════════════

echo "═══════════════════════════════════════════════════════════"
echo "  🔧 NEXVO 502 FIX — Rebuild PM2 from scratch"
echo "  Waktu: $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════"

P="/home/nexvo"
[ ! -f "$P/package.json" ] && P=$(find / -maxdepth 5 -name "package.json" -type f 2>/dev/null | xargs grep -l '"nexvo"' 2>/dev/null | head -1 | xargs dirname)
[ -z "$P" ] && { echo "❌ Project gak ketemu"; exit 1; }

echo "  Project: $P"
cd "$P"
echo ""

echo "▼ [1/5] Delete nexvo-web PM2 process (clear stale config)"
pm2 delete nexvo-web 2>&1 | tail -2
echo "  ✅ Deleted"
echo ""

echo "▼ [2/5] Pull latest code (kalau belum)"
git fetch --all 2>&1 | tail -1
git reset --hard origin/main 2>&1 | tail -1
git log --oneline -1
echo ""

echo "▼ [3/5] Rebuild (pastikan .next complete)"
rm -rf .next/cache
if command -v bun >/dev/null 2>&1; then
  bun run build 2>&1 | tail -8
else
  npm run build 2>&1 | tail -8
fi
BUILD_OK=$?
if [ $BUILD_OK -ne 0 ]; then
  echo "❌ Build gagal! Cek error di atas."
  exit 1
fi
echo "  ✅ Build sukses"
echo ""

echo "▼ [4/5] Start nexvo-web FRESH dengan bun run start"
# Start dengan command yang BENAR — next start, bukan standalone
if command -v bun >/dev/null 2>&1; then
  pm2 start "bun run start" --name nexvo-web --cwd "$P" 2>&1 | tail -5
else
  pm2 start "npm run start" --name nexvo-web --cwd "$P" 2>&1 | tail -5
fi
sleep 5

echo ""
echo "▼ [5/5] Verify port 3000 + CSS load"
echo ""
echo "  PM2 status:"
pm2 list 2>&1 | grep -E "nexvo" | head -3
echo ""

echo "  Port 3000:"
ss -tlnp 2>/dev/null | grep ":3000" && echo "  ✅ Port 3000 LISTENING" || echo "  ❌ Port 3000 masih gak listening"
echo ""

echo "  localhost:3000 test:"
curl -s --max-time 8 -o /tmp/nexvo_hp.html -w "  HTTP %{http_code} Size %{size_download}\n" "http://localhost:3000/"
echo ""

# Extract + test CSS
CSS_URL=$(grep -oE '/_next/static/[^"]*\.css' /tmp/nexvo_hp.html 2>/dev/null | head -1)
if [ -n "$CSS_URL" ]; then
  CSS_CODE=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" "http://localhost:3000$CSS_URL")
  echo "  CSS: $CSS_URL"
  echo "  CSS HTTP: $CSS_CODE"
  if [ "$CSS_CODE" = "200" ]; then
    echo "  ✅ CSS LOADS — web bakal styled!"
  else
    echo "  ❌ CSS GAGAL — cek .next/static/css/"
  fi
fi
echo ""

echo "  SW version:"
curl -s --max-time 5 "http://localhost:3000/sw.js" 2>&1 | grep -oE "nexvo-v[0-9]+" | head -1
echo ""

# Save PM2 config so it survives reboot
pm2 save 2>&1 | tail -1

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ FIX SELESAI"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Test di browser:"
echo "    1. Buka https://nexvo.id/recovery.html (clear browser cache)"
echo "    2. Auto-reload ke nexvo.id"
echo "    3. Web harusnya muncul styled (bukan teks doang)"
echo ""
echo "  Kalau masih 502:"
echo "    pm2 logs nexvo-web --lines 50 --err"
echo "    (kirim output ke saya)"
echo "═══════════════════════════════════════════════════════════"
