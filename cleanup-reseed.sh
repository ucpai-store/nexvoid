#!/bin/bash
# ============================================================================
#  NEXVO - CLEANUP & RE-SEED (Force delete old, create Gold Premium Aset 1-6)
# ============================================================================
set +e

PROJECT="/home/nexvo"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║   NEXVO - CLEANUP & RE-SEED                             ║"
echo "║   Force hapus semua lama, buat Gold Premium Aset 1-6    ║"
echo "╚══════════════════════════════════════════════════════════╝"

[ "$EUID" -ne 0 ] && { echo "Run as root: sudo bash $0"; exit 1; }

export PATH="/root/.bun/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" 2>/dev/null

cd "$PROJECT" 2>/dev/null || { echo "✗ $PROJECT tidak ada!"; exit 1; }

# Generate prisma client
echo ""
echo "=== Generate Prisma Client ==="
bunx prisma generate 2>&1 | tail -3

# Download cleanup-reseed.js dari GitHub
echo ""
echo "=== Download cleanup-reseed.js ==="
curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/cleanup-reseed.js" -o cleanup-reseed.js
[ -f "cleanup-reseed.js" ] && echo "✓ cleanup-reseed.js ready" || { echo "✗ Gagal download"; exit 1; }

# Jalankan cleanup + reseed
echo ""
echo "=== Jalankan cleanup-reseed.js ==="
bun run cleanup-reseed.js 2>&1

# Jika bun gagal, coba node
if [ $? -ne 0 ]; then
  echo ""
  echo "Bun gagal, coba node..."
  node cleanup-reseed.js 2>&1
fi

# Restart PM2
echo ""
echo "=== Restart PM2 ==="
pm2 restart nexvo-web --update-env 2>/dev/null
sleep 4

echo "✓ nexvo-web restarted"
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ CLEANUP & RE-SEED SELESAI!                          ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Sekarang di database:                                  ║"
echo "║   - 6 packages: Gold Premium Aset 1-6                   ║"
echo "║   - 6 products:  Gold Premium Aset 1-6                  ║"
echo "║  Semua data lama (Gold VIP, Bot Trading) sudah dihapus  ║"
echo "║                                                          ║"
echo "║  Cek di:                                                 ║"
echo "║   - https://nexvo.id/#products                           ║"
echo "║   - https://nexvo.id/#paket                              ║"
echo "║   - Admin dashboard > Products / Packages               ║"
echo "╚══════════════════════════════════════════════════════════╝"
