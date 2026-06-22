#!/bin/bash
# ============================================================================
#  NEXVO - SEED ALL DATA (Packages + Products + Complete Setup)
# ----------------------------------------------------------------------------
#  Jalankan: bash seed-all.sh
#  Membuat: 6 paket investasi (min 100k) + 6 produk + payment methods + 
#  banners + system settings + matching/salary config
# ============================================================================
set +e

PROJECT="/home/nexvo"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║   NEXVO - SEED ALL DATA (Packages + Products)            ║"
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

# Download seed-all.js dari GitHub
echo ""
echo "=== Download seed-all.js ==="
curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/seed-all.js" -o seed-all.js
[ -f "seed-all.js" ] && echo "✓ seed-all.js ready" || { echo "✗ Gagal download"; exit 1; }

# Jalankan seed
echo ""
echo "=== Jalankan seed-all.js ==="
bun run seed-all.js 2>&1

# Jika bun gagal, coba node
if [ $? -ne 0 ]; then
  echo ""
  echo "Bun gagal, coba node..."
  node seed-all.js 2>&1
fi

# Restart PM2
echo ""
echo "=== Restart PM2 ==="
pm2 restart nexvo-web --update-env 2>/dev/null
sleep 4

echo "✓ nexvo-web restarted"
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ SEEDING SELESAI!                                     ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Cek di:                                                 ║"
echo "║   - https://nexvo.id/paket   (6 paket investasi)         ║"
echo "║   - https://nexvo.id/produk  (6 produk)                  ║"
echo "║   - Admin dashboard > Products                           ║"
echo "║   - Admin dashboard > Investment Packages                ║"
echo "╚══════════════════════════════════════════════════════════╝"
