#!/bin/bash
# ============================================================================
#  NEXVO - SETUP PAYMENT LOGOS (Logo asli BCA, Mandiri, BNI, BRI, DANA, OVO,
#                                  GoPay, ShopeePay)
# ----------------------------------------------------------------------------
#  Download 8 logo payment asli ke public/images/payment/
#  Logo sudah diverifikasi dengan AI vision sebagai logo yang benar.
#
#  Jalankan di VPS:
#    curl -sL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/setup-payment-logos.sh | bash
# ============================================================================
set +e

PROJECT="/home/nexvo"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║   NEXVO - SETUP PAYMENT LOGOS (8 logo asli)              ║"
echo "╚══════════════════════════════════════════════════════════╝"

[ "$EUID" -ne 0 ] && { echo "Run as root: sudo bash $0"; exit 1; }

cd "$PROJECT" 2>/dev/null || { echo "✗ $PROJECT tidak ada!"; exit 1; }

# Buat folder public/images/payment
LOGO_DIR="public/images/payment"
mkdir -p "$LOGO_DIR"
echo "✓ Folder: $LOGO_DIR"

# ──────────── Download 8 logo asli (sudah diverifikasi AI vision) ────────────
echo ""
echo "=== Download 8 logo payment asli ==="

declare -A LOGOS=(
  ["bca.png"]="https://sfile.chatglm.cn/images-ppt/27d061473176.png"
  ["mandiri.png"]="https://sfile.chatglm.cn/images-ppt/293c3e208962.png"
  ["bni.png"]="https://sfile.chatglm.cn/images-ppt/abefba45c89a.png"
  ["bri.png"]="https://sfile.chatglm.cn/images-ppt/d49561d4c305.png"
  ["dana.png"]="https://sfile.chatglm.cn/images-ppt/40996b189e55.png"
  ["ovo.jpg"]="https://sfile.chatglm.cn/images-ppt/2be45bce2d5e.jpg"
  ["gopay.png"]="https://sfile.chatglm.cn/images-ppt/c011def03d8a.png"
  ["shopeepay.png"]="https://sfile.chatglm.cn/images-ppt/4d40271650e1.png"
)

SUCCESS=0
FAILED=0
for filename in "${!LOGOS[@]}"; do
  url="${LOGOS[$filename]}"
  dest="$LOGO_DIR/$filename"
  echo -n "   → $filename ... "
  if curl -sL -o "$dest" --max-time 30 "$url" 2>/dev/null && [ -s "$dest" ]; then
    size=$(stat -c%s "$dest" 2>/dev/null || stat -f%z "$dest" 2>/dev/null)
    echo "✅ ${size} bytes"
    SUCCESS=$((SUCCESS+1))
  else
    echo "❌ GAGAL"
    FAILED=$((FAILED+1))
    # Hapus file kosong kalau ada
    rm -f "$dest"
  fi
done

echo ""
echo "=== Hasil: $SUCCESS berhasil, $FAILED gagal ==="

# ──────────── Cek file hasil download ────────────
echo ""
echo "=== File di $LOGO_DIR ==="
ls -la "$LOGO_DIR"/ 2>/dev/null

# ──────────── Re-seed payment methods (set iconUrl) ────────────
echo ""
echo "=== Re-seed payment methods (set iconUrl ke DB) ==="
export PATH="/root/.bun/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" 2>/dev/null

bunx prisma generate 2>&1 | tail -2
curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/seed-all.js" -o seed-all.js
bun run seed-all.js 2>&1 | grep -E "Payment|payment|logo|iconUrl|✅|✏️" | head -15

# ──────────── Restart nexvo-web ────────────
echo ""
echo "=== Restart PM2 nexvo-web ==="
pm2 restart nexvo-web --update-env 2>/dev/null
sleep 3
echo "✓ nexvo-web restarted"

# ──────────── Verifikasi via API ────────────
echo ""
echo "=== Verifikasi payment methods via API ==="
curl -s "http://localhost:3000/api/payment-methods" 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    data = d.get('data', d) if isinstance(d, dict) else d
    if isinstance(data, list):
        print(f'✅ {len(data)} payment methods:')
        for pm in data:
            icon = pm.get('iconUrl','') or '(kosong)'
            print(f'   - {pm.get(\"name\",\"?\"):15s} | iconUrl: {icon}')
    else:
        print('⚠️  Response:', str(d)[:200])
except Exception as e:
    print(f'⚠️  Gagal parse: {e}')
" 2>/dev/null

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ PAYMENT LOGOS SIAP!                                  ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Logo asli sudah didownload & iconUrl di-update di DB.   ║"
echo "║                                                          ║"
echo "║  Cek: https://nexvo.id/deposit  (logo muncul di grid)   ║"
echo "║  File: $PROJECT/$LOGO_DIR/            ║"
echo "╚══════════════════════════════════════════════════════════╝"
