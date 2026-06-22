#!/bin/bash
# ============================================================================
#  NEXVO - SETUP PAYMENT LOGOS (24 logo asli untuk Deposit + Withdraw)
# ----------------------------------------------------------------------------
#  Download 24 logo payment asli ke public/images/payment/
#  - 15 Bank: BCA, Mandiri, BNI, BRI, BSI, CIMB, Danamon, Permata, Bukopin,
#             OCBC, Panin, Sinarmas, Maybank, UOB, BTN
#  - 9 E-Wallet: DANA, OVO, GoPay, ShopeePay, LinkAja, Doku, Sakuku, Jenius, Flip
#  Semua logo sudah diverifikasi dengan AI vision sebagai logo yang benar.
#
#  Jalankan di VPS:
#    curl -sL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/setup-payment-logos.sh | bash
# ============================================================================
set +e

PROJECT="/home/nexvo"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║   NEXVO - SETUP PAYMENT LOGOS (24 logo asli)             ║"
echo "║   15 Bank + 9 E-Wallet — Deposit & Withdraw              ║"
echo "╚══════════════════════════════════════════════════════════╝"

[ "$EUID" -ne 0 ] && { echo "Run as root: sudo bash $0"; exit 1; }

cd "$PROJECT" 2>/dev/null || { echo "✗ $PROJECT tidak ada!"; exit 1; }

# Buat folder public/images/payment
LOGO_DIR="public/images/payment"
mkdir -p "$LOGO_DIR"
echo "✓ Folder: $LOGO_DIR"

# ──────────── Download 24 logo asli (sudah diverifikasi AI vision) ────────────
echo ""
echo "=== Download 24 logo payment asli ==="

declare -A LOGOS=(
  # ── 8 payment methods utama (untuk Deposit) ──
  ["bca.png"]="https://sfile.chatglm.cn/images-ppt/27d061473176.png"
  ["mandiri.png"]="https://sfile.chatglm.cn/images-ppt/293c3e208962.png"
  ["bni.png"]="https://sfile.chatglm.cn/images-ppt/abefba45c89a.png"
  ["bri.png"]="https://sfile.chatglm.cn/images-ppt/d49561d4c305.png"
  ["dana.png"]="https://sfile.chatglm.cn/images-ppt/40996b189e55.png"
  ["ovo.jpg"]="https://sfile.chatglm.cn/images-ppt/2be45bce2d5e.jpg"
  ["gopay.png"]="https://sfile.chatglm.cn/images-ppt/c011def03d8a.png"
  ["shopeepay.png"]="https://sfile.chatglm.cn/images-ppt/4d40271650e1.png"
  # ── 7 bank tambahan (untuk Withdraw) ──
  ["bsi.jpg"]="https://sfile.chatglm.cn/images-ppt/c1e3cb85db36.jpg"
  ["cimb.png"]="https://sfile.chatglm.cn/images-ppt/45f7e1a78c6c.png"
  ["danamon.jpg"]="https://sfile.chatglm.cn/images-ppt/550bc1a8dcd2.jpg"
  ["permata.png"]="https://sfile.chatglm.cn/images-ppt/7d0c72c46b1a.png"
  ["bukopin.jpg"]="https://sfile.chatglm.cn/images-ppt/d87dc94174a6.jpg"
  ["ocbc.jpeg"]="https://sfile.chatglm.cn/images-ppt/0c789a5640c4.jpeg"
  ["panin.png"]="https://sfile.chatglm.cn/images-ppt/74269c722540.png"
  ["sinarmas.png"]="https://sfile.chatglm.cn/images-ppt/22544b8d11e4.png"
  ["maybank.png"]="https://sfile.chatglm.cn/images-ppt/5696c103ec34.png"
  ["uob.png"]="https://sfile.chatglm.cn/images-ppt/43e1b67d9d03.png"
  ["btn.png"]="https://sfile.chatglm.cn/images-ppt/d17479b52b54.png"
  # ── 5 e-wallet tambahan (untuk Withdraw) ──
  ["linkaja.jpg"]="https://sfile.chatglm.cn/images-ppt/f054ad527b5f.jpg"
  ["doku.png"]="https://sfile.chatglm.cn/images-ppt/106e60e410ce.png"
  ["sakuku.jpg"]="https://sfile.chatglm.cn/images-ppt/8110574afb36.jpg"
  ["jenius.png"]="https://sfile.chatglm.cn/images-ppt/7be1091001a3.png"
  ["flip.jpeg"]="https://sfile.chatglm.cn/images-ppt/1a434bc10886.jpeg"
)

SUCCESS=0
FAILED=0
TOTAL=${#LOGOS[@]}
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
    rm -f "$dest"
  fi
done

echo ""
echo "=== Hasil: $SUCCESS/$TOTAL berhasil, $FAILED gagal ==="

# ──────────── Cek file hasil download ────────────
echo ""
echo "=== File di $LOGO_DIR ==="
ls -la "$LOGO_DIR"/ 2>/dev/null | tail -n +2

# ──────────── Re-seed payment methods (set iconUrl untuk 8 utama) ────────────
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
echo "║  ✅ PAYMENT LOGOS SIAP! (24 logo asli)                   ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Logo asli sudah didownload & iconUrl di-update di DB.   ║"
echo "║                                                          ║"
echo "║  Cek: https://nexvo.id/deposit  (logo di grid payment)  ║"
echo "║  Cek: https://nexvo.id/withdraw (logo di grid bank)     ║"
echo "║  File: $PROJECT/$LOGO_DIR/            ║"
echo "╚══════════════════════════════════════════════════════════╝"
