#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO EMERGENCY DIAGNOSTIC — fix 502 Bad Gateway
#  Run ini kalau nexvo.id 502 / blank / teks doang
# ═══════════════════════════════════════════════════════════════

echo "═══════════════════════════════════════════════════════════"
echo "  🚨 NEXVO EMERGENCY DIAGNOSTIC"
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
cd "$P"
echo ""

echo "═══ 1. PM2 STATUS ═══"
pm2 list 2>&1 | grep -E "name|nexvo|online|errored|stopped|disabled" | head -10
echo ""

echo "═══ 2. NEXVO-WEB LOGS (50 baris terakhir) ═══"
pm2 logs nexvo-web --nostream --lines 50 --err 2>&1 | tail -40
echo ""

echo "═══ 3. PORT 3000 LISTENING? ═══"
ss -tlnp 2>/dev/null | grep ":3000" || netstat -tlnp 2>/dev/null | grep ":3000" || echo "❌ PORT 3000 GAK ADA YG LISTEN — nexvo-web down!"
echo ""

echo "═══ 4. TEST LOCALHOST:3000 ═══"
curl -s --max-time 5 -o /dev/null -w "  localhost:3000 → HTTP %{http_code}\n" "http://localhost:3000/" 2>&1
echo ""

echo "═══ 5. CSS FILE ADA? ═══"
CSS_FILE=$(ls .next/static/css/*.css 2>/dev/null | head -1)
if [ -n "$CSS_FILE" ]; then
  CSS_SIZE=$(wc -c < "$CSS_FILE")
  echo "  ✅ CSS: $(basename $CSS_FILE) ($CSS_SIZE bytes)"
else
  echo "  ❌ CSS GAK ADA — build gagal. Run: bun run build"
fi
echo ""

echo "═══ 6. NEXT.CONFIG — standalone mode? ═══"
if grep -E "output.*standalone" next.config.ts 2>/dev/null | grep -v "//" | grep -v REMOVED; then
  echo "  ⚠️  standalone masih ada — bisa bikin CSS 404"
else
  echo "  ✅ standalone removed (correct)"
fi
echo ""

echo "═══ 7. .next FOLDER ADA? ═══"
if [ -d ".next" ]; then
  echo "  ✅ .next folder ada"
  ls .next/BUILD_ID 2>/dev/null && echo "  ✅ BUILD_ID ada" || echo "  ⚠️  BUILD_ID gak ada"
else
  echo "  ❌ .next GAK ADA — belum build. Run: bun run build"
fi
echo ""

echo "═══ 8. SW.JS VERSION ═══"
SW_VER=$(grep -oE "nexvo-v[0-9]+" public/sw.js 2>/dev/null | head -1)
echo "  SW version: ${SW_VER:-gak nemu} (harus nexvo-v33)"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  🔧 AUTO-FIX: Restart nexvo-web..."
echo "═══════════════════════════════════════════════════════════"

# Try restart
pm2 restart nexvo-web --update-env 2>&1 | tail -3
sleep 5

echo ""
echo "═══ POST-RESTART CHECK ═══"
echo "  PM2 status:"
pm2 list 2>&1 | grep -E "nexvo-web|online|errored|stopped" | head -3
echo ""
echo "  Port 3000:"
ss -tlnp 2>/dev/null | grep ":3000" || echo "  ⚠️  port 3000 still not listening"
echo ""
echo "  localhost:3000 test:"
curl -s --max-time 5 -o /tmp/nexvo_test.html -w "  HTTP %{http_code} Size %{size_download}\n" "http://localhost:3000/"
echo ""

# Test CSS load
HP=$(cat /tmp/nexvo_test.html 2>/dev/null)
CSS_URL=$(echo "$HP" | grep -oE '/_next/static/[^"]*\.css' | head -1)
if [ -n "$CSS_URL" ]; then
  CSS_CODE=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" "http://localhost:3000$CSS_URL")
  echo "  CSS test: $CSS_URL → HTTP $CSS_CODE"
  if [ "$CSS_CODE" = "200" ]; then
    echo "  ✅ CSS LOADS — web bakal styled"
  else
    echo "  ❌ CSS GAGAL — rebuild needed: bun run build && pm2 restart nexvo-web"
  fi
else
  echo "  ⚠️  Gak nemu CSS URL di HTML — mungkin belum build"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  JIKA MASIH 502:"
echo "  1. Cek log lengkap: pm2 logs nexvo-web --lines 100 --err"
echo "  2. Rebuild: bun run build && pm2 restart nexvo-web"
echo "  3. Cek port: ss -tlnp | grep 3000"
echo "═══════════════════════════════════════════════════════════"
