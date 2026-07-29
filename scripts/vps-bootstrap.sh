#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  NEXVO — VPS BOOTSTRAP (v20.1)
#  Gunakan ini kalau scripts/vps-update.sh belum ada di VPS:
#
#    cd /var/www/nexvo && curl -sSL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/scripts/vps-bootstrap.sh | bash
#
#  Atau copy-paste langsung semua command di bawah ke terminal VPS.
# ════════════════════════════════════════════════════════════════
set -e

cd /var/www/nexvo 2>/dev/null || {
  echo "❌ ERROR: /var/www/nexvo tidak ada. Cek path VPS kamu."
  exit 1
}

if [ ! -f "package.json" ]; then
  echo "❌ ERROR: package.json tidak ketemu di $(pwd). Pastikan kamu di /var/www/nexvo"
  exit 1
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  NEXVO VPS BOOTSTRAP — v20.1 ANTI-DOUBLE-PROFIT"
echo "  Working dir: $(pwd)"
echo "═══════════════════════════════════════════════════════════════"

echo ""
echo "[1/6] 📦 git fetch + reset ke main terbaru (force sync)..."
git fetch origin main
git reset --hard origin/main

echo ""
echo "[2/6] 📥 bun install..."
bun install

echo ""
echo "[3/6] 🗄️  prisma generate + db push..."
bun run db:generate || true
bun run db:push || true

echo ""
echo "[4/6] 🔨 bun run build..."
bun run build

echo ""
echo "[5/6] ♻️  pm2 restart nexvo-web nexvo-cron..."
pm2 restart nexvo-web nexvo-cron

echo ""
echo "[6/6] ✅ Verifikasi file fix script ada..."
if [ -f "scripts/fix-mulyono5-and-dupes.ts" ]; then
  echo "   ✓ scripts/fix-mulyono5-and-dupes.ts ada"
else
  echo "   ✗ scripts/fix-mulyono5-and-dupes.ts TIDAK ada — DEPLOY GAGAL"
  exit 1
fi
if [ -f "scripts/refund-orphan-profit.ts" ]; then
  echo "   ✓ scripts/refund-orphan-profit.ts ada"
else
  echo "   ✗ scripts/refund-orphan-profit.ts TIDAK ada — DEPLOY GAGAL"
  exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ DEPLOY BERHASIL — v20.1 aktif di VPS"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  🔥 Cron restart akan AUTO-RUN cleanup (self-heal duplicates + refund)"
echo ""
echo "  📋 FIX EXISTING DUPLICATE + REFUND PROFIT DOBEL:"
echo "     bun run scripts/fix-mulyono5-and-dupes.ts --fix-all            # DRY-RUN"
echo "     bun run scripts/fix-mulyono5-and-dupes.ts --fix-all --apply    # EKSEKUSI"
echo ""
echo "  📋 KALAU USER SUDAH HAPUS DUPLICATE MANUAL (profit masih dobel):"
echo "     bun run scripts/refund-orphan-profit.ts            # DRY-RUN"
echo "     bun run scripts/refund-orphan-profit.ts --apply    # EKSEKUSI"
echo ""
echo "═══════════════════════════════════════════════════════════════"
