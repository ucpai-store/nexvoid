#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO Diagnostic — cari tahu PERSIS kenapa web teks-only
#
#  Jalankan di VPS nexvo.id:
#    bash diagnose-nexvo.sh
#
#  Output akan kasih tahu persis apa yang rusak.
# ═══════════════════════════════════════════════════════════════

PROJECT_DIR="${1:-/home/nexvo}"
cd "$PROJECT_DIR" 2>/dev/null || { echo "❌ Folder $PROJECT_DIR tidak ada"; exit 1; }

echo "═══════════════════════════════════════════════════════"
echo "  NEXVO Diagnostic — kenapa web teks-only?"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── 1. PM2 STATUS ───
echo "═══ 1. PM2 STATUS ═══"
pm2 list 2>/dev/null | grep -E "nexvo|name|│" | head -10
echo ""

# ─── 2. .NEXT FOLDER & JS CHUNKS ───
echo "═══ 2. CEK .next/static/chunks/ ═══"
if [ -d ".next/static/chunks" ]; then
  CHUNK_COUNT=$(ls .next/static/chunks/*.js 2>/dev/null | wc -l)
  echo "  ✓ Folder .next/static/chunks/ ADA"
  echo "  ✓ JS chunks count: $CHUNK_COUNT"
  if [ "$CHUNK_COUNT" -lt 5 ]; then
    echo "  ❌ PENYAKIT: JS chunks terlalu sedikit ($CHUNK_COUNT) — build setengah jadi!"
    echo "     SOLUSI: jalankan: rm -rf .next && bun run build && pm2 restart nexvo-web"
  fi
  echo ""
  echo "  ── Sample JS chunks ──"
  ls .next/static/chunks/main*.js 2>/dev/null | head -3
  ls .next/static/chunks/page-*.js 2>/dev/null | head -3
else
  echo "  ❌ PENYAKIT: .next/static/chunks/ TIDAK ADA!"
  echo "     Build belum pernah jalan, atau gagal total."
  echo "     SOLUSI: jalankan: bun run build"
fi
echo ""

# ─── 3. LOCALHOST:3000 HEALTH ───
echo "═══ 3. CEK localhost:3000 (PM2 web server) ═══"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/ 2>/dev/null)
echo "  GET / → HTTP $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ]; then
  echo "  ✓ Web server respond OK"
else
  echo "  ❌ PENYAKIT: PM2 nexvo-web tidak respond di port 3000!"
  echo "     SOLUSI: pm2 restart nexvo-web && sleep 3"
fi
echo ""

# ─── 4. CEK JS CHUNK BISA DI-LOAD DARI LOCALHOST ───
echo "═══ 4. CEK JS chunk bisa di-load dari localhost ═══"
MAIN_JS=$(ls .next/static/chunks/main-*.js 2>/dev/null | head -1 | xargs basename 2>/dev/null)
if [ -n "$MAIN_JS" ]; then
  JS_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:3000/_next/static/chunks/$MAIN_JS" 2>/dev/null)
  echo "  GET /_next/static/chunks/$MAIN_JS → HTTP $JS_CODE"
  if [ "$JS_CODE" = "200" ]; then
    echo "  ✓ JS chunk bisa di-load dari localhost"
  else
    echo "  ❌ PENYAKIT: JS chunk TIDAK bisa di-load dari PM2 (HTTP $JS_CODE)!"
    echo "     Padahal file ada di .next/static/chunks/"
    echo "     SOLUSI: pm2 restart nexvo-web --update-env"
  fi
else
  echo "  ❌ Tidak nemu main-*.js di .next/static/chunks/"
fi
echo ""

# ─── 5. CEK PORT 3000 LISTEN ───
echo "═══ 5. CEK port 3000 listen ═══"
if ss -tlnp 2>/dev/null | grep -q ":3000"; then
  echo "  ✓ Port 3000 LISTEN"
  ss -tlnp 2>/dev/null | grep ":3000" | head -3
else
  echo "  ❌ PENYAKIT: Tidak ada yang listen di port 3000!"
  echo "     SOLUSI: pm2 restart nexvo-web"
fi
echo ""

# ─── 6. PM2 LOGS (last 30 lines, cari error) ───
echo "═══ 6. PM2 LOGS nexvo-web (cari error) ═══"
pm2 logs nexvo-web --lines 50 --nostream 2>/dev/null | grep -iE "error|fail|cannot|undefined|exception" | tail -15
echo "  (kosong = tidak ada error di log)"
echo ""

# ─── 7. CEK REVERSE PROXY (Caddy/Nginx) ───
echo "═══ 7. CEK reverse proxy (Caddy/Nginx) ═══"
if command -v caddy &>/dev/null; then
  echo "  ✓ Caddy terinstall"
  caddy version 2>/dev/null | head -1
  echo ""
  echo "  ── Caddy process ──"
  ps aux | grep -i caddy | grep -v grep | head -3
  echo ""
  echo "  ── Caddy config location ──"
  ls -la /etc/caddy/Caddyfile 2>/dev/null
  ls -la /home/nexvo/Caddyfile 2>/dev/null
  echo ""
  echo "  ── Caddy config content (first 40 lines) ──"
  cat /etc/caddy/Caddyfile 2>/dev/null | head -40 || cat /home/nexvo/Caddyfile 2>/dev/null | head -40
elif command -v nginx &>/dev/null; then
  echo "  ✓ Nginx terinstall"
  nginx -v 2>&1 | head -1
  echo ""
  echo "  ── Nginx process ──"
  ps aux | grep nginx | grep -v grep | head -3
  echo ""
  echo "  ── Nginx config ──"
  nginx -T 2>/dev/null | grep -A 20 "server_name nexvo" | head -30
else
  echo "  ⚠️  Tidak ada Caddy atau Nginx — cek pakai apa"
fi
echo ""

# ─── 8. CEK PORT 80/443 ───
echo "═══ 8. CEK port 80/443 (HTTPS) ═══"
for PORT in 80 443; do
  if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
    echo "  ✓ Port $PORT LISTEN"
    ss -tlnp 2>/dev/null | grep ":$PORT " | head -2
  else
    echo "  ❌ Port $PORT TIDAK listen — reverse proxy mati!"
  fi
done
echo ""

# ─── 9. PUBLIC IP TEST (curl nexvo.id dari VPS) ───
echo "═══ 9. CEK nexvo.id dari VPS sendiri ═══"
PUB_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://nexvo.id/ 2>/dev/null)
echo "  GET https://nexvo.id/ → HTTP $PUB_HTTP"
if [ "$PUB_HTTP" = "200" ]; then
  echo "  ✓ nexvo.id respond dari VPS"
  echo ""
  echo "  ── Cek apakah JS chunk bisa di-load via HTTPS ──"
  PUB_JS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "https://nexvo.id/_next/static/chunks/$MAIN_JS" 2>/dev/null)
  echo "  GET https://nexvo.id/_next/static/chunks/$MAIN_JS → HTTP $PUB_JS"
  if [ "$PUB_JS" = "200" ]; then
    echo "  ✓ JS chunk bisa di-load via HTTPS"
    echo "  → Kalau di VPS JS bisa di-load tapi di browser Anda tidak,"
    echo "    masalahnya di BROWSER (Service Worker cache). Clear cache browser."
  else
    echo "  ❌ PENYAKIT KRITIS: JS chunk TIDAK bisa di-load via HTTPS!"
    echo "     Padahal di localhost bisa. Masalahnya di Caddy/Nginx config"
    echo "     — reverse proxy tidak forward /_next/static/ dengan benar."
    echo "     SOLUSI: cek Caddyfile, pastikan reverse_proxy ke localhost:3000"
  fi
else
  echo "  ❌ nexvo.id tidak respond dari VPS sendiri!"
  echo "     SOLUSI: cek Caddy/nginx jalan, cek SSL certificate"
fi
echo ""

# ─── 10. KESIMPULAN ───
echo "═══════════════════════════════════════════════════════"
echo "  KESIMPULAN"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Kalau di atas ada tanda ❌ PENYAKIT — itu masalahnya."
echo ""
echo "Solusi umum (urut dari yang paling sering):"
echo ""
echo "  1. Build corrupt:"
echo "     rm -rf .next && bun run build && pm2 restart nexvo-web"
echo ""
echo "  2. PM2 stuck:"
echo "     pm2 restart nexvo-web --update-env"
echo ""
echo "  3. Service Worker cache di browser (paling sering!):"
echo "     - Buka nexvo.id di incognito mode"
echo "     - Kalau incognito OK → clear browser cache + unregister SW"
echo "     - F12 → Application → Service Workers → Unregister"
echo "     - F12 → Application → Clear storage → Clear site data"
echo "     - Hard refresh: Ctrl+Shift+R"
echo ""
echo "  4. Reverse proxy salah:"
echo "     Cek Caddyfile/Nginx config, pastikan /_next/* di-forward ke localhost:3000"
