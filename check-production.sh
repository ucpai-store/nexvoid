#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO PRODUCTION HEALTH CHECK
#  Test SEMUA halaman + API di nexvo.id langsung
#  Run di VPS atau laptop kamu (yang bisa akses internet)
# ═══════════════════════════════════════════════════════════════
DOMAIN="https://nexvo.id"
TS=$(date +%s)
PASS=0
FAIL=0
ERRORS=""

green() { echo -e "\033[1;32m✓ PASS\033[0m $1"; ((PASS++)); }
red()   { echo -e "\033[1;31m✗ FAIL\033[0m $1"; ((FAIL++)); ERRORS+="\n  - $1"; }
info()  { echo -e "\033[0;36m→\033[0m $1"; }

echo "═══════════════════════════════════════════════════════════"
echo "  🔍 NEXVO PRODUCTION HEALTH CHECK"
echo "  Target: $DOMAIN"
echo "  Time:   $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ─── 1. SW VERSION ───
info "1. Service Worker version"
SW=$(curl -s --max-time 10 "$DOMAIN/sw.js?t=$TS")
if echo "$SW" | grep -q "nexvo-v32"; then
  green "sw.js = v32 (PASSIVE, no auto-refresh) ✓"
elif echo "$SW" | grep -q "nexvo-v31"; then
  red "sw.js masih v31 (ADA auto-refresh bug!) — deploy belum sampai"
elif echo "$SW" | grep -q "nexvo-v30"; then
  red "sw.js masih v30 (chunk-error bug!) — deploy belum sampai"
else
  red "sw.js version tidak dikenali"
  echo "$SW" | grep -i "cache_name\|version" | head -2
fi

# ─── 2. HOMEPAGE ───
info "2. Homepage"
HP=$(curl -s --max-time 15 -o /tmp/hp.html -w "%{http_code}|%{size_download}" "$DOMAIN/?t=$TS")
HPCODE=$(echo "$HP" | cut -d'|' -f1)
HPSIZE=$(echo "$HP" | cut -d'|' -f2)
if [ "$HPCODE" = "200" ] && [ "$HPSIZE" -gt 5000 ]; then
  green "Homepage HTTP 200, size ${HPSIZE} bytes ✓"
  if grep -q "Welcome to NEXVO\|NEXVO" /tmp/hp.html; then
    green "Homepage content contains 'NEXVO' ✓"
  else
    red "Homepage content kosong / gak ada 'NEXVO' text"
  fi
else
  red "Homepage gagal: HTTP $HPCODE, size $HPSIZE"
fi

# ─── 3. ADMIN LOGIN PAGE ───
info "3. Admin login page (/id/admin)"
AD=$(curl -s --max-time 15 -o /tmp/ad.html -w "%{http_code}|%{size_download}" "$DOMAIN/id/admin?t=$TS")
ADCODE=$(echo "$AD" | cut -d'|' -f1)
ADSIZE=$(echo "$AD" | cut -d'|' -f2)
if [ "$ADCODE" = "200" ] && [ "$ADSIZE" -gt 3000 ]; then
  green "Admin login HTTP 200, size ${ADSIZE} bytes ✓"
  if grep -qi "Masuk Admin\|Admin Control\|password" /tmp/ad.html; then
    green "Admin login form ada (Masuk Admin / Admin Control) ✓"
  else
    red "Admin login form gak ketemu (no 'Masuk Admin' / 'Admin Control' text)"
  fi
else
  red "Admin login gagal: HTTP $ADCODE, size $ADSIZE"
fi

# ─── 4. RECOVERY PAGE ───
info "4. Recovery page (/recovery.html)"
RC=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" "$DOMAIN/recovery.html?t=$TS")
if [ "$RC" = "200" ]; then
  green "Recovery page HTTP 200 ✓"
else
  red "Recovery page gagal: HTTP $RC"
fi

# ─── 5. ADMIN AUTH API ───
info "5. Admin auth API (/api/admin/auth)"
AA=$(curl -s --max-time 10 -X POST "$DOMAIN/api/admin/auth?t=$TS" \
  -H "Content-Type: application/json" \
  -d '{"username":"__healthcheck__","password":"__wrong__"}')
if echo "$AA" | grep -qi "invalid\|salah\|error\|fail\|incorrect\|tidak"; then
  green "Admin auth API merespon (reject wrong creds) ✓"
elif echo "$AA" | grep -qi "success\|token"; then
  red "Admin auth API terima creds dummy?! (security issue)"
else
  red "Admin auth API gak respon / respon aneh: $(echo "$AA" | head -c 150)"
fi

# ─── 6. USER AUTH API ───
info "6. User auth API (/api/auth/otp/send)"
UA=$(curl -s --max-time 10 -X POST "$DOMAIN/api/auth/otp/send?t=$TS" \
  -H "Content-Type: application/json" \
  -d '{"phone":"__healthcheck__"}')
if echo "$UA" | grep -qi "error\|invalid\|fail\|required\|missing"; then
  green "User auth OTP API merespon ✓"
else
  red "User auth OTP API gak respon: $(echo "$UA" | head -c 150)"
fi

# ─── 7. MANIFEST ───
info "7. PWA Manifest"
MF=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" "$DOMAIN/manifest.webmanifest?t=$TS")
if [ "$MF" = "200" ]; then
  green "Manifest HTTP 200 ✓"
else
  red "Manifest gagal: HTTP $MF"
fi

# ─── 8. STATIC ICONS ───
info "8. PWA Icons"
for icon in icon-192x192.png icon-512x512.png apple-touch-icon.png; do
  IC=$(curl -s --max-time 8 -o /dev/null -w "%{http_code}" "$DOMAIN/$icon?t=$TS")
  if [ "$IC" = "200" ]; then
    green "/$icon HTTP 200 ✓"
  else
    red "/$icon gagal: HTTP $IC"
  fi
done

# ─── 9. NEXT.JS CHUNKS ───
info "9. Next.js build chunks (cek gak 404)"
CHUNK_URL=$(curl -s --max-time 15 "$DOMAIN/?t=$TS" | grep -oE '/_next/static/chunks/[^"]+\.js' | head -1)
if [ -n "$CHUNK_URL" ]; then
  CC=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" "$DOMAIN$CHUNK_URL")
  if [ "$CC" = "200" ]; then
    green "Chunk load OK: $CHUNK_URL → HTTP 200 ✓"
  else
    red "Chunk 404/failed: $CHUNK_URL → HTTP $CC (chunk-error bug still present!)"
  fi
else
  red "Gak nemu chunk URL di homepage HTML"
fi

# ─── 10. NO AUTO-REFRESH (cek gak ada forceClientsReload di SW) ───
info "10. Auto-refresh check (sw.js must NOT have forceClientsReload)"
if echo "$SW" | grep -q "forceClientsReload"; then
  red "sw.js masih punya forceClientsReload → BIKIN AUTO-REFRESH! Deploy belum sampai."
else
  green "sw.js gak ada forceClientsReload → no auto-refresh ✓"
fi

# ─── SUMMARY ───
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  📊 HASIL: $PASS PASS / $FAIL FAIL"
if [ $FAIL -gt 0 ]; then
  echo -e "\033[1;31m  ❌ GAGAL:\033[0m$ERRORS"
  echo ""
  echo "  🔧 FIX: Jalankan deploy command:"
  echo "     bash <(curl -sL \"https://raw.githubusercontent.com/ucpai-store/nexvoid/main/deploy-chunk-fix.sh?t=$TS\")"
else
  echo -e "\033[1;32m  ✅ SEMUA TEST LULUS — nexvo.id production OK\033[0m"
  echo ""
  echo "  Kalau browser kamu masih ada masalah:"
  echo "    1. Buka incognito → https://nexvo.id"
  echo "    2. ATAU buka https://nexvo.id/recovery.html → Clear Cache & Reload"
fi
echo "═══════════════════════════════════════════════════════════"
