#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO — DIAGNOSTIC + REPAIR (1 command, langsung fix masalah profit)
# ════════════════════════════════════════════════════════════════
#
# Cara pakai (copy-paste 1 baris ini di terminal VPS):
#   bash <(curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/diag-and-repair.sh?t=$(date +%s)")
#
# Atau download dulu:
#   cd /var/www/nexvo
#   curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/diag-and-repair.sh?t=$(date +%s)" -o diag-and-repair.sh
#   bash diag-and-repair.sh
#
# Script ini melakukan:
#   PHASE 1: DIAGNOSTIC — cek apakah code fix v7+ sudah aktif
#   PHASE 2: REPAIR — sync BonusLog untuk semua Purchase profit yang missing
#   PHASE 3: SYNC TOTALS — update User.totalProfit & mainBalance dari BonusLog aggregate
#   PHASE 4: TRIGGER CRON — jalanin profit cron SEKARANG (gak nunggu 00:00)
#
# 🔒 AMAN: Backup DB otomatis sebelum repair. Gak hapus data apapun.
# ════════════════════════════════════════════════════════════════

set +e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  NEXVO DIAG & REPAIR — Diagnostic + Fix Profit  ║"
echo "║  🔒 TIDAK HAPUS DATA APAPUN                     ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ─── CARI PROJECT ───
PROJECT_DIR=""
for candidate in "/var/www/nexvo" "/home/nexvo" "/var/www/html/nexvo" "/var/www/nexvoid" "/home/$USER/nexvo" "/root/nexvo" "/opt/nexvo" "$HOME/nexvo" "$(pwd)"; do
  if [ -f "$candidate/package.json" ] && [ -f "$candidate/.env" ]; then
    PROJECT_DIR="$candidate"
    break
  fi
done

if [ -z "$PROJECT_DIR" ]; then
  echo "❌ Project Nexvo tidak ditemukan!"
  exit 1
fi

cd "$PROJECT_DIR" || exit 1
echo "📂 Project: $PROJECT_DIR"
echo "🕐 WIB now: $(TZ='Asia/Jakarta' date '+%Y-%m-%d %H:%M:%S %A')"
echo ""

# ─── CEK BUN ───
if ! command -v bun &>/dev/null; then
  echo "❌ bun tidak tersedia!"
  exit 1
fi

# ════════════════════════════════════════════════════════════════
# BACKUP DB DULU
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  💾 BACKUP DATABASE (sebelum repair)"
echo "═══════════════════════════════════════════════════"

BACKUP_FILE=""
for db_path in "db/custom.db" "db/production.db" "prisma/dev.db"; do
  if [ -f "$db_path" ]; then
    BACKUP_FILE="${db_path}.repair-backup-$(date +%Y%m%d-%H%M%S)"
    cp "$db_path" "$BACKUP_FILE" 2>/dev/null
    echo "💾 DB backup: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
    break
  fi
done

if [ -z "$BACKUP_FILE" ]; then
  echo "⚠️  DB file tidak ditemukan — tetap lanjut (mungkin pakai external DB)"
fi
echo ""

# ════════════════════════════════════════════════════════════════
# PHASE 1: DIAGNOSTIC
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  🔍 PHASE 1: DIAGNOSTIC (cek code fix sudah aktif?)"
echo "═══════════════════════════════════════════════════"
echo ""

# Cek 1: Apakah code v7 (force-dynamic) sudah ada di file route?
echo "─── Cek 1: Code v7 (force-dynamic) di route files ───"
V7_ROUTES=(
  "src/app/api/admin/asset/route.ts"
  "src/app/api/admin/users/route.ts"
  "src/app/api/admin/investments/route.ts"
  "src/app/api/admin/profit-trigger/route.ts"
  "src/app/api/cron/profit/route.ts"
  "src/app/api/transactions/route.ts"
  "src/app/api/bonuses/route.ts"
  "src/app/api/assets/route.ts"
  "src/app/api/user/route.ts"
  "src/app/api/user/profile/route.ts"
)
V7_FOUND=0
V7_MISSING=0
for route in "${V7_ROUTES[@]}"; do
  if [ -f "$route" ]; then
    if grep -q "force-dynamic" "$route" 2>/dev/null; then
      echo "  ✅ $route — force-dynamic ADA"
      V7_FOUND=$((V7_FOUND+1))
    else
      echo "  ❌ $route — force-dynamic TIDAK ADA (code lama!)"
      V7_MISSING=$((V7_MISSING+1))
    fi
  else
    echo "  ⚠️  $route — file tidak ada"
  fi
done
echo ""
echo "  Summary: $V7_FOUND route sudah v7, $V7_MISSING route masih lama"
echo ""

# Cek 2: Apakah cron-service.ts Purchase path sudah v7?
echo "─── Cek 2: cron-service.ts v7 (Purchase path bikin BonusLog) ───"
if grep -q "LEGACY purchase" cron-service.ts 2>/dev/null; then
  echo "  ✅ cron-service.ts — v7 fix ADA (LEGACY purchase BonusLog)"
else
  echo "  ❌ cron-service.ts — v7 fix TIDAK ADA (Purchase path gak bikin BonusLog!)"
fi
echo ""

# Cek 3: Git commit terbaru
echo "─── Cek 3: Git commit terbaru ───"
if [ -d ".git" ]; then
  git log --oneline -3 2>&1 | head -3
  echo ""
  echo "  Cek apakah commit d18bb08 (cron v7) sudah di-pull:"
  if git log --oneline | grep -q "d18bb08\|cron-v7\|LEGACY purchase"; then
    echo "  ✅ Commit cron-v7 sudah ada di repo local"
  else
    echo "  ❌ Commit cron-v7 BELUM ada — perlu git pull!"
  fi
fi
echo ""

# Cek 4: PM2 status
echo "─── Cek 4: PM2 status ───"
if command -v pm2 &>/dev/null; then
  pm2 list 2>/dev/null | grep -E "nexvo|name|online|stopped|errored" | head -10
else
  echo "  ⚠️  pm2 tidak tersedia"
fi
echo ""

# Cek 5: .next build folder
echo "─── Cek 5: .next build folder ───"
if [ -d ".next" ]; then
  echo "  ✅ .next folder ADA — build sudah pernah jalan"
  echo "  📅 Build terakhir: $(stat -c %y .next 2>/dev/null | cut -d'.' -f1)"
  echo "  📁 Build ID: $(cat .next/BUILD_ID 2>/dev/null || echo 'unknown')"
else
  echo "  ❌ .next folder TIDAK ADA — build belum pernah jalan!"
  echo "     Jalankan: bun run build"
fi
echo ""

# ════════════════════════════════════════════════════════════════
# PHASE 2: REPAIR DATABASE (sync BonusLog untuk Purchase profit)
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  🔧 PHASE 2: REPAIR — Sync BonusLog untuk Purchase profit"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  Logic: Untuk setiap Purchase dengan profitEarned > 0,"
echo "         cek apakah sudah ada BonusLog type='profit'."
echo "         Kalau BELUM ada atau JUMLAHNYA KURANG, bikin BonusLog baru."
echo ""
echo "  ⏳ Menjalankan repair via Prisma..."
echo ""

cat > "$PROJECT_DIR/nexvo-repair-profit.ts" << 'REPAIR_SCRIPT'
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const db = new PrismaClient();

function formatRupiah(n: number): string {
  return 'Rp' + Math.floor(n).toLocaleString('id-ID');
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  🔧 REPAIR PROFIT DATA — Sync BonusLog + User totals');
  console.log('═══════════════════════════════════════════════════\n');

  // ─── STEP 1: Cari semua Purchase dengan profitEarned > 0 ───
  console.log('📊 Step 1: Cari semua Purchase dengan profitEarned > 0...\n');
  const purchases = await db.purchase.findMany({
    where: { profitEarned: { gt: 0 } },
    include: {
      user: { select: { id: true, name: true, userId: true, mainBalance: true, totalProfit: true } },
      product: { select: { name: true } },
    },
  });
  console.log(`  Found ${purchases.length} purchases dengan profitEarned > 0\n`);

  let repairedPurchases = 0;
  let skippedPurchases = 0;
  let totalBonusLogsCreated = 0;
  let totalProfitSynced = 0;

  for (const pur of purchases) {
    // Hitung total BonusLog type='profit' yang sudah ada untuk user ini
    const existingProfitBonusLogs = await db.bonusLog.aggregate({
      where: { userId: pur.userId, type: 'profit' },
      _sum: { amount: true },
      _count: true,
    });

    const existingProfitTotal = existingProfitBonusLogs._sum.amount || 0;

    // Hitung total profit dari Investment (linked ke purchase ini)
    const linkedInvestments = await db.investment.findMany({
      where: { purchaseId: pur.id },
      select: { totalProfitEarned: true },
    });
    const investmentProfit = linkedInvestments.reduce((sum, inv) => sum + inv.totalProfitEarned, 0);

    // Profit yang HARUS ada di BonusLog (dari Purchase.profitEarned)
    // Tapi kurangi profit yang sudah di-credit via Investment (anti double-count)
    const expectedProfitFromPurchase = Math.max(0, pur.profitEarned - investmentProfit);

    // Selisih = profit yang belum ada di BonusLog
    const shortfall = expectedProfitFromPurchase - existingProfitTotal;

    if (shortfall <= 0) {
      skippedPurchases++;
      continue;
    }

    // Bikin BonusLog baru untuk shortfall
    const productName = pur.product?.name || 'Produk';
    const userName = pur.user?.name || pur.user?.userId || 'User';

    await db.bonusLog.create({
      data: {
        userId: pur.userId,
        fromUserId: pur.userId,
        type: 'profit',
        level: 0,
        amount: shortfall,
        description: `[REPAIR] Profit terakumulasi produk ${productName} (${pur.quantity}x) — ${formatRupiah(shortfall)} [sync dari profitEarned]`,
      },
    });

    // Update User.totalProfit dan mainBalance dengan shortfall
    await db.user.update({
      where: { id: pur.userId },
      data: {
        totalProfit: { increment: shortfall },
        mainBalance: { increment: shortfall },
      },
    });

    // Bikin LiveActivity juga
    await db.liveActivity.create({
      data: {
        type: 'profit',
        userName,
        amount: shortfall,
        productName,
        isFake: false,
      },
    });

    repairedPurchases++;
    totalBonusLogsCreated++;
    totalProfitSynced += shortfall;
    console.log(`  ✅ Purchase ${pur.id} (user ${userName}): +${formatRupiah(shortfall)} → BonusLog + User balance`);
  }

  console.log(`\n📊 Step 1 selesai:`);
  console.log(`  • Purchases dianalisa: ${purchases.length}`);
  console.log(`  • Purchases di-repair: ${repairedPurchases}`);
  console.log(`  • Purchases di-skip (sudah sync): ${skippedPurchases}`);
  console.log(`  • BonusLog dibuat: ${totalBonusLogsCreated}`);
  console.log(`  • Total profit di-sync: ${formatRupiah(totalProfitSynced)}\n`);

  // ─── STEP 2: Sync Investment-linked profit juga (kalau ada yang missed) ───
  console.log('📊 Step 2: Sync Investment profit yang mungkin missed...\n');
  const investments = await db.investment.findMany({
    where: { totalProfitEarned: { gt: 0 } },
    include: {
      user: { select: { id: true, name: true, userId: true } },
      package: { select: { name: true } },
    },
  });
  console.log(`  Found ${investments.length} investments dengan totalProfitEarned > 0\n`);

  let repairedInvestments = 0;
  let invTotalSynced = 0;

  for (const inv of investments) {
    const existingProfitBonusLogs = await db.bonusLog.aggregate({
      where: { userId: inv.userId, type: 'profit' },
      _sum: { amount: true },
    });
    const existingProfitTotal = existingProfitBonusLogs._sum.amount || 0;

    // Total profit yang seharusnya ada (dari Investment + Purchase yang linked)
    const linkedPurchase = inv.purchaseId
      ? await db.purchase.findUnique({ where: { id: inv.purchaseId }, select: { profitEarned: true } })
      : null;
    const purchaseProfit = linkedPurchase?.profitEarned || 0;

    // Expected: max(investmentProfit, purchaseProfit) — karena Investment profit sudah include Purchase profit
    const expectedTotal = Math.max(inv.totalProfitEarned, purchaseProfit);

    const shortfall = expectedTotal - existingProfitTotal;
    if (shortfall <= 0) continue;

    const pkgName = inv.package?.name || 'Investment';
    const userName = inv.user?.name || inv.user?.userId || 'User';

    await db.bonusLog.create({
      data: {
        userId: inv.userId,
        fromUserId: inv.userId,
        type: 'profit',
        level: 0,
        amount: shortfall,
        description: `[REPAIR] Profit terakumulasi investasi ${pkgName} — ${formatRupiah(shortfall)} [sync dari totalProfitEarned]`,
      },
    });

    await db.user.update({
      where: { id: inv.userId },
      data: {
        totalProfit: { increment: shortfall },
        mainBalance: { increment: shortfall },
      },
    });

    repairedInvestments++;
    invTotalSynced += shortfall;
    console.log(`  ✅ Investment ${inv.id} (user ${userName}): +${formatRupiah(shortfall)}`);
  }

  console.log(`\n📊 Step 2 selesai:`);
  console.log(`  • Investments di-repair: ${repairedInvestments}`);
  console.log(`  • Total profit di-sync: ${formatRupiah(invTotalSynced)}\n`);

  // ─── STEP 3: Final summary ───
  console.log('═══════════════════════════════════════════════════');
  console.log('  🎉 REPAIR SELESAI');
  console.log('═══════════════════════════════════════════════════\n');
  console.log(`  Total BonusLog dibuat: ${totalBonusLogsCreated + repairedInvestments}`);
  console.log(`  Total profit di-sync ke user: ${formatRupiah(totalProfitSynced + invTotalSynced)}`);
  console.log('');
  console.log('  Sekarang:');
  console.log('  • Riwayat user akan muncul entry profit [REPAIR]');
  console.log('  • User.totalProfit & mainBalance sudah sync dengan profit yang terakumulasi');
  console.log('  • Admin Kelola Aset tetap menampilkan profitEarned (tidak berubah)');
  console.log('');

  // ─── STEP 4: Final DB state ───
  console.log('═══════════════════════════════════════════════════');
  console.log('  📊 FINAL DB STATE');
  console.log('═══════════════════════════════════════════════════\n');

  const totalUsers = await db.user.count();
  const totalPurchases = await db.purchase.count();
  const totalInvestments = await db.investment.count();
  const totalBonusLogsProfit = await db.bonusLog.count({ where: { type: 'profit' } });
  const totalBonusLogsAll = await db.bonusLog.count();
  const totalProfitAmount = await db.bonusLog.aggregate({
    where: { type: 'profit' },
    _sum: { amount: true },
  });

  console.log(`  Users: ${totalUsers}`);
  console.log(`  Purchases: ${totalPurchases}`);
  console.log(`  Investments: ${totalInvestments}`);
  console.log(`  BonusLog type='profit': ${totalBonusLogsProfit} entries`);
  console.log(`  BonusLog all types: ${totalBonusLogsAll} entries`);
  console.log(`  Total profit amount: ${formatRupiah(totalProfitAmount._sum.amount || 0)}`);
  console.log('');

  await db.$disconnect();
}

main().catch((err) => {
  console.error('❌ Repair ERROR:', err);
  process.exit(1);
});
REPAIR_SCRIPT

# Jalankan repair script dari project directory (supaya bisa resolve @prisma/client)
if bun run "$PROJECT_DIR/nexvo-repair-profit.ts" 2>&1; then
  echo "✅ Repair script sukses dijalankan"
else
  echo "❌ Repair script gagal — cek error di atas"
fi

# Cleanup repair script (gak perlu commit ke repo)
rm -f "$PROJECT_DIR/nexvo-repair-profit.ts" 2>/dev/null
echo ""

# ════════════════════════════════════════════════════════════════
# PHASE 3: TRIGGER CRON SEKARANG (gak nunggu 00:00)
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  ⚡ PHASE 3: TRIGGER PROFIT CRON SEKARANG"
echo "═══════════════════════════════════════════════════"
echo ""

# Restart cron service dulu agar load code terbaru
if command -v pm2 &>/dev/null; then
  if pm2 list 2>/dev/null | grep -q "nexvo-cron"; then
    echo "🔄 Restart nexvo-cron (load code terbaru)..."
    pm2 restart nexvo-cron --update-env 2>&1 | tail -3
    sleep 3
    echo "✅ nexvo-cron restarted"
    echo ""

    # Trigger via HTTP API
    echo "📡 Trigger profit cron via HTTP API..."
    CRON_PORT=$(pm2 env nexvo-cron 2>/dev/null | grep CRON_PORT | cut -d'"' -f2 || echo "3032")
    CRON_PORT=${CRON_PORT:-3032}

    # Coba beberapa port umum
    for port in 3032 3031 3033 3030; do
      RESPONSE=$(curl -s -X POST "http://localhost:$port/api/trigger/profit" -H "Content-Type: application/json" --max-time 30 2>&1)
      if echo "$RESPONSE" | grep -q "success\|processed\|totalProfit"; then
        echo "✅ Cron triggered via port $port"
        echo "📊 Response:"
        echo "$RESPONSE" | head -50
        break
      fi
    done
    echo ""
  else
    echo "⚠️  nexvo-cron tidak ditemukan di PM2"
  fi
fi

# ════════════════════════════════════════════════════════════════
# SELESAI
# ════════════════════════════════════════════════════════════════
echo "╔══════════════════════════════════════════════════╗"
echo "║  ✅ DIAG & REPAIR SELESAI                       ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  🔒 TIDAK HAPUS DATA APAPUN                      ║"
echo "║  • Backup DB: $BACKUP_FILE"
echo "║  • Diagnostic: cek code v7+ status               ║"
echo "║  • Repair: sync BonusLog + User totals           ║"
echo "║  • Trigger cron: profit di-credit sekarang       ║"
echo "║                                                  ║"
echo "║  🔎 CEK HASIL (WAJIB):                           ║"
echo "║  • Ctrl+Shift+R di browser                       ║"
echo "║  • Logout + login lagi                           ║"
echo "║  • Login user → Riwayat → lihat entry [REPAIR]   ║"
echo "║  • Login user → Saldo Utama + Total Profit naik  ║"
echo "║  • Login admin → Kelola Aset → Total Profit      ║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "📝 Kalau masih gak berubah:"
echo "   1. Cek apakah PHASE 1 menunjukkan code v7 TIDAK ADA"
echo "      → perlu git pull + bun run build"
echo "   2. Cek apakah PHASE 2 menunjukkan 'BonusLog dibuat: 0'"
echo "      → berarti semua profit sudah sync (cek ulang Riwayat)"
echo "   3. Screenshot output terminal ini kirim ke dev"
echo ""
