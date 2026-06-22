#!/bin/bash
# ============================================================================
#  NEXVO - CLEANUP OLD PACKAGES & PRODUCTS
# ----------------------------------------------------------------------------
#  Hapus semua paket & produk LAMA (selain Gold Premium Aset 1..6).
#  Aman terhadap foreign key (hapus investments/purchases terkait dulu).
#
#  Jalankan di VPS:
#    curl -sL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/cleanup-old-packages.sh | bash
# ============================================================================
set +e

PROJECT="/home/nexvo"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║   NEXVO - CLEANUP OLD PACKAGES & PRODUCTS                ║"
echo "╚══════════════════════════════════════════════════════════╝"

[ "$EUID" -ne 0 ] && { echo "Run as root: sudo bash $0"; exit 1; }

export PATH="/root/.bun/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" 2>/dev/null

cd "$PROJECT" 2>/dev/null || { echo "✗ $PROJECT tidak ada!"; exit 1; }

# Pastikan prisma client sudah di-generate
echo ""
echo "=== Generate Prisma Client ==="
bunx prisma generate 2>&1 | tail -3

# Download cleanup script dari GitHub
echo ""
echo "=== Download cleanup-old-packages.js ==="
curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/cleanup-old-packages.js" -o cleanup-old-packages.js
[ -f "cleanup-old-packages.js" ] && echo "✓ cleanup-old-packages.js ready" || { echo "✗ Gagal download"; exit 1; }

# Jalankan cleanup
echo ""
echo "=== Jalankan cleanup-old-packages.js ==="
bun run cleanup-old-packages.js 2>&1

# Jika bun gagal, coba node
if [ $? -ne 0 ]; then
  echo ""
  echo "Bun gagal, coba node..."
  node cleanup-old-packages.js 2>&1
fi

# Restart PM2
echo ""
echo "=== Restart PM2 ==="
pm2 restart nexvo-web --update-env 2>/dev/null
sleep 4

echo "✓ nexvo-web restarted"
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ CLEANUP SELESAI!                                     ║"
echo "║  Paket & produk lama (Gold VIP, Bot Trading, dll)        ║"
echo "║  sudah dihapus. Hanya Gold Premium Aset 1..6 tersisa.    ║"
echo "╚══════════════════════════════════════════════════════════╝"
