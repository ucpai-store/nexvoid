#!/bin/bash
# ============================================================================
#  NEXVO - APPLY QUOTA AUTO-BUMP (Kuota Terisi otomatis naik & reset)
# ----------------------------------------------------------------------------
#  Script ini:
#   1. Re-seed products dengan quota=9999 + baseline quotaUsed realistis
#   2. Restart cron-service supaya fungsi bumpProductQuotas() aktif
#   3. Trigger quota-bump sekali langsung supaya counter langsung gerak
#
#  Jalankan di VPS:
#    curl -sL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/apply-quota-bump.sh | bash
# ============================================================================
set +e

PROJECT="/home/nexvo"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║   NEXVO - APPLY QUOTA AUTO-BUMP (Kuota Terisi Ramai)     ║"
echo "╚══════════════════════════════════════════════════════════╝"

[ "$EUID" -ne 0 ] && { echo "Run as root: sudo bash $0"; exit 1; }

export PATH="/root/.bun/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" 2>/dev/null

cd "$PROJECT" 2>/dev/null || { echo "✗ $PROJECT tidak ada!"; exit 1; }

# ──────────── 1. Re-seed (set quota=9999 + baseline quotaUsed) ────────────
echo ""
echo "=== 1. Re-seed products (quota=9999 + baseline) ==="
bunx prisma generate 2>&1 | tail -2
curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/seed-all.js" -o seed-all.js
bun run seed-all.js 2>&1 | tail -30

# ──────────── 2. Update cron-service source ────────────
echo ""
echo "=== 2. Update cron-service source code ==="
mkdir -p mini-services/cron-service
curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/mini-services/cron-service/index.ts" \
  -o mini-services/cron-service/index.ts
echo "✓ mini-services/cron-service/index.ts updated"

# ──────────── 3. Restart nexvo-web (PM2) ────────────
echo ""
echo "=== 3. Restart nexvo-web (PM2) ==="
pm2 restart nexvo-web --update-env 2>/dev/null
sleep 3
echo "✓ nexvo-web restarted"

# ──────────── 4. Restart cron-service (PM2) ────────────
echo ""
echo "=== 4. Restart cron-service (PM2) ==="
# Cek apakah cron-service sudah terdaftar di PM2
if pm2 list 2>/dev/null | grep -q "cron-service"; then
  pm2 restart cron-service --update-env 2>/dev/null
  echo "✓ cron-service restarted"
else
  # Start cron-service baru
  cd mini-services/cron-service
  if [ -f "package.json" ]; then
    bun install 2>&1 | tail -3
  fi
  pm2 start "bun run index.ts" --name cron-service 2>/dev/null
  pm2 save 2>/dev/null
  echo "✓ cron-service started baru"
  cd "$PROJECT"
fi
sleep 4

# ──────────── 5. Trigger quota-bump sekali langsung ────────────
echo ""
echo "=== 5. Trigger quota-bump manual (langsung gerak) ==="
# Cron-service jalan di port 3032
curl -s -X POST "http://localhost:3032/api/trigger/quota-bump" 2>/dev/null | head -c 500
echo ""

# ──────────── 6. Verifikasi via API nexvo-web ────────────
echo ""
echo "=== 6. Verifikasi quota produk via API ==="
curl -s "http://localhost:3000/api/products" 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    if d.get('success') and d.get('data'):
        print(f'✅ {len(d[\"data\"])} produk ditemukan:')
        for p in d['data']:
            q = p.get('quota', 0)
            qu = p.get('quotaUsed', 0)
            pct = (qu/q*100) if q else 0
            print(f'   - {p[\"name\"]}: Kuota Terisi {qu}/{q} ({pct:.0f}%)')
    else:
        print('⚠️  API products:', str(d)[:200])
except Exception as e:
    print(f'⚠️  Gagal parse API products: {e}')
" 2>/dev/null

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ QUOTA AUTO-BUMP AKTIF!                               ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  • quotaUsed auto-increment +2..9 tiap 15 menit          ║"
echo "║  • Saat quotaUsed >= 9999, reset ke 5-12% (batch baru)   ║"
echo "║  • Kelihatan ramai seperti nav.live                      ║"
echo "║                                                          ║"
echo "║  Cek: https://nexvo.id/produk                            ║"
echo "║  Manual trigger:                                         ║"
echo "║  curl -X POST http://localhost:3032/api/trigger/quota-bump ║"
echo "╚══════════════════════════════════════════════════════════╝"
