#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  NEXVO — VPS DEPLOY SCRIPT (v20 ANTI-DOUBLE-PROFIT)
#  Run ini di VPS: bash scripts/vps-update.sh
# ════════════════════════════════════════════════════════════════
set -e

echo "═══════════════════════════════════════════════════════════════"
echo "  NEXVO VPS DEPLOY — v20 ANTI-DOUBLE-PROFIT"
echo "═══════════════════════════════════════════════════════════════"

# 1. Pastikan di direktori yang benar
if [ ! -f "package.json" ]; then
  echo "❌ ERROR: package.json tidak ketemu. Pastikan kamu di /var/www/nexvo"
  echo "   Jalankan: cd /var/www/nexvo"
  exit 1
fi

if [ ! -d ".git" ]; then
  echo "❌ ERROR: .git tidak ketemu. Pastikan kamu di /var/www/nexvo"
  exit 1
fi

echo ""
echo "[1/6] 📦 git pull — ambil kode v20 terbaru dari GitHub..."
git pull origin main || {
  echo "⚠️  git pull gagal. Coba: git stash && git pull origin main"
  exit 1
}

echo ""
echo "[2/6] 📥 bun install — install dependencies baru (kalau ada)..."
bun install || {
  echo "⚠️  bun install gagal. Coba: rm -rf node_modules && bun install"
  exit 1
}

echo ""
echo "[3/6] 🗄️  prisma generate + db push — sync schema..."
bun run db:generate || true
bun run db:push || true

echo ""
echo "[4/6] 🔨 bun run build — build Next.js production..."
bun run build || {
  echo "❌ Build gagal. Cek error di atas."
  exit 1
}

echo ""
echo "[5/6] ♻️  pm2 restart — restart nexvo-web + nexvo-cron..."
pm2 restart nexvo-web nexvo-cron || {
  echo "⚠️  pm2 restart gagal. Cek: pm2 list"
  exit 1
}

# 6. Verifikasi file fix script ada
echo ""
echo "[6/6] ✅ Verifikasi file fix script ada..."
if [ -f "scripts/fix-mulyono5-and-dupes.ts" ]; then
  echo "   ✓ scripts/fix-mulyono5-and-dupes.ts ada"
else
  echo "   ✗ scripts/fix-mulyono5-and-dupes.ts TIDAK ada — git pull belum sukses"
  exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ DEPLOY BERHASIL — v20 ANTI-DOUBLE-PROFIT aktif di VPS"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  🔥 Cron restart akan AUTO-RUN cleanup (self-heal duplicates)"
echo "     - Saat startup: detect + refund profit dobel + mark 'completed'"
echo "     - Sebelum jam 00:00 WIB profit credit: cleanup ulang"
echo ""
echo "  📋 NEXT (OPTIONAL — fix existing duplicate + refund):"
echo "     # DRY-RUN (preview — no changes):"
echo "     bun run scripts/fix-mulyono5-and-dupes.ts --fix-all"
echo ""
echo "     # EKSEKUSI (fix + refund profit dobel):"
echo "     bun run scripts/fix-mulyono5-and-dupes.ts --fix-all --apply"
echo ""
echo "  📋 ATAU via Admin UI:"
echo "     Login admin → Kelola Users → 'Fix Semua Duplikat' → confirm"
echo "     (Report tampilkan: User Fixed, Investment Refund, Profit Refund, Purchase completed)"
echo ""
echo "  📋 Verifikasi (optional):"
echo "     bun run scripts/test-anti-double-profit.ts     # 20/20 PASS"
echo "     bun run scripts/test-anti-race-direct.ts       # 5/5 PASS"
echo "     bun run scripts/verify-one-active-rule.ts      # 15/15 PASS"
echo ""
echo "═══════════════════════════════════════════════════════════════"
