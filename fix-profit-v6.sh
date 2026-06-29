#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO — FIX PROFIT v6 (BULLETPROOF + SYNC TOTAL PROFIT)
# ════════════════════════════════════════════════════════════════
#
# 🔒 JAMINAN KEAMANAN DATA:
#   • Script ini TIDAK MENGHAPUS user, purchase, investment, bonusLog, atau data apapun
#   • Script ini hanya CREATE (bikin baru) atau UPDATE (perbaiki field)
#   • Backup DB otomatis sebelum jalan
#   • Aman di-run berkali-kali (idempoten)
#
# 🎯 ROOT CAUSE yang di-fix v6:
#   v4 masih filter `status: "active"` → kalau di VPS beda dikit, tetep 0
#   v6 GAK filter status sama sekali — scan SEMUA purchase + investment
#   Pakai endDate sebagai source of truth (bukan status string)
#
# CARA PAKAI:
#   cd /var/www/nexvo && bash fix-profit-v6.sh
# ════════════════════════════════════════════════════════════════

set +e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  NEXVO FIX PROFIT v6 — BULLETPROOF + SYNC TOTAL   ║"
echo "║  🔒 TIDAK HAPUS DATA APAPUN (create/update only)  ║"
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

if ! command -v bun &>/dev/null; then
  echo "❌ bun tidak tersedia!"
  exit 1
fi

# ─── BACKUP DB ──
BACKUP_FILE="db/custom.db.backup-v6-$(date +%Y%m%d-%H%M%S)"
if [ -f "db/custom.db" ]; then
  cp db/custom.db "$BACKUP_FILE" 2>/dev/null && echo "💾 DB backup: $BACKUP_FILE"
  echo ""
fi

# ─── MAIN ──
bun -e '
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

let DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  const envPaths = [path.join(process.cwd(), ".env"), "/var/www/nexvo/.env", "/home/nexvo/.env"];
  for (const ep of envPaths) {
    if (fs.existsSync(ep)) {
      try {
        const c = fs.readFileSync(ep, "utf8");
        const m = c.match(/^DATABASE_URL=(.+)$/m);
        if (m) { DB_URL = m[1].trim().replace(/^["\x27]|["\x27]$/g, ""); break; }
      } catch {}
    }
  }
}
if (!DB_URL) { console.error("❌ DATABASE_URL tidak ketemu!"); process.exit(1); }
console.log("📁 DB URL:", DB_URL);
console.log("");

const p = new PrismaClient({ datasources: { db: { url: DB_URL } } });

const WIB_OFFSET = 7;
function getWibNow() {
  const now = new Date();
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
}
function getWibDateString(date) {
  const wibDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
  return wibDate.getFullYear() + "-" + String(wibDate.getMonth() + 1).padStart(2, "0") + "-" + String(wibDate.getDate()).padStart(2, "0");
}
function formatRupiah(amount) { return "Rp" + Math.floor(amount).toLocaleString("id-ID"); }

(async () => {
  const wibNow = getWibNow();
  const todayWIB = getWibDateString(new Date());
  const startOfDayWIB = new Date(todayWIB + "T00:00:00+07:00");
  const todayDow = wibNow.getDay();
  const isTodayWeekday = todayDow !== 0 && todayDow !== 6;

  console.log("🕐 WIB Time:", wibNow.toISOString());
  console.log("📅 Today WIB:", todayWIB, "(dow=" + todayDow + ", weekday=" + isTodayWeekday + ")");
  console.log("");

  // ═══════════════════════════════════════════════════════════
  // PHASE 1: DIAGNOSTIC (NO FILTER — lihat SEMUA data)
  // ═══════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 1: DIAGNOSTIC (SEMUA data, no filter)");
  console.log("═══════════════════════════════════════════════════");

  const [users, purchases, investments, bonusLogs, profitLogs] = await Promise.all([
    p.user.count(),
    p.purchase.count(),
    p.investment.count(),
    p.bonusLog.count(),
    p.profitLog.count(),
  ]);

  console.log("👥 Users         :", users);
  console.log("🛒 Purchases     :", purchases);
  console.log("📈 Investments   :", investments);
  console.log("📝 BonusLogs     :", bonusLogs);
  console.log("💰 ProfitLogs    :", profitLogs);
  console.log("");

  const purchaseByStatus = await p.purchase.groupBy({ by: ["status"], _count: true });
  console.log("🛒 Purchase by status:", JSON.stringify(purchaseByStatus));

  const invByStatus = await p.investment.groupBy({ by: ["status"], _count: true });
  console.log("📈 Investment by status:", JSON.stringify(invByStatus));
  console.log("");

  // Show sample purchases
  const samplePurchases = await p.purchase.findMany({
    take: 3,
    include: { product: true, user: { select: { userId: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (samplePurchases.length > 0) {
    console.log("🛒 Sample purchases (first 3):");
    for (const sp of samplePurchases) {
      console.log("   • " + sp.user?.userId + " — " + sp.product?.name + " — status=" + sp.status + " — dailyProfit=" + sp.dailyProfit + " — profitEarned=" + sp.profitEarned + " — lastProfitDate=" + (sp.lastProfitDate ? getWibDateString(new Date(sp.lastProfitDate)) : "null"));
    }
    console.log("");
  }

  // Show sample investments
  const sampleInvestments = await p.investment.findMany({
    take: 3,
    include: { package: true, user: { select: { userId: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (sampleInvestments.length > 0) {
    console.log("📈 Sample investments (first 3):");
    for (const si of sampleInvestments) {
      console.log("   • " + si.user?.userId + " — " + si.package?.name + " — status=" + si.status + " — dailyProfit=" + si.dailyProfit + " — totalProfitEarned=" + si.totalProfitEarned + " — lastProfitDate=" + (si.lastProfitDate ? getWibDateString(new Date(si.lastProfitDate)) : "null") + " — endDate=" + (si.endDate ? getWibDateString(new Date(si.endDate)) : "null"));
    }
    console.log("");
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 2: REPAIR (NO STATUS FILTER — scan SEMUA purchase)
  //   Untuk setiap purchase, pastikan linked Investment ada & active
  // ═══════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 2: REPAIR (SEMUA purchase, no status filter)");
  console.log("═══════════════════════════════════════════════════");

  // ★ KEY CHANGE: fetch ALL purchases (any status), not just active
  const allPurchases = await p.purchase.findMany({
    include: { product: true, user: { select: { userId: true, name: true } } },
  });
  console.log("🛒 Total purchases to process:", allPurchases.length);
  console.log("");

  let createdInvestments = 0;
  let reactivatedInvestments = 0;
  let fixedDailyProfit = 0;
  let alreadyOk = 0;

  for (const pur of allPurchases) {
    const product = pur.product;
    const expectedDailyProfit = Math.floor((product?.price || pur.totalPrice) * ((product?.profitRate || 0) / 100));
    const contractDays = product?.duration || 90;

    const startDate = new Date(pur.createdAt);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + contractDays);
    const isContractActive = endDate > wibNow;

    // Cari linked investment
    let linkedInv = await p.investment.findFirst({
      where: { purchaseId: pur.id },
    });

    if (!linkedInv) {
      // ★ CREATE missing Investment (status based on endDate, NOT purchase status)
      let packageId = await p.investmentPackage.findFirst({ where: { isActive: true }, select: { id: true } });
      if (!packageId) {
        packageId = await p.investmentPackage.create({
          data: { name: "_internal_default", amount: 0, profitRate: 0, contractDays: 0, isActive: false, order: -1 },
        });
      }

      linkedInv = await p.investment.create({
        data: {
          userId: pur.userId,
          packageId: packageId.id,
          purchaseId: pur.id,
          amount: product?.price || pur.totalPrice,
          dailyProfit: expectedDailyProfit,
          totalProfitEarned: pur.profitEarned || 0,
          status: isContractActive ? "active" : "completed",
          startDate,
          endDate,
          lastProfitDate: pur.lastProfitDate || null,
        },
      });
      createdInvestments++;
      console.log("  ✅ CREATED Investment — " + pur.user?.userId + " — " + product?.name + " — dailyProfit=" + formatRupiah(expectedDailyProfit) + " — status=" + (isContractActive ? "active" : "completed"));
    } else {
      // Investment exists — check if needs repair
      const linkedEndDate = linkedInv.endDate ? new Date(linkedInv.endDate) : endDate;
      const linkedIsActive = linkedEndDate > wibNow;

      const needsReactivate = linkedInv.status !== "active" && linkedIsActive;
      const needsDailyProfitFix = (!linkedInv.dailyProfit || linkedInv.dailyProfit === 0) && expectedDailyProfit > 0;
      const needsEndDate = !linkedInv.endDate;

      if (needsReactivate || needsDailyProfitFix || needsEndDate) {
        const updateData = {};
        if (needsReactivate) updateData.status = "active";
        if (needsDailyProfitFix) updateData.dailyProfit = expectedDailyProfit;
        if (needsEndDate) updateData.endDate = endDate;
        await p.investment.update({ where: { id: linkedInv.id }, data: updateData });
        if (needsReactivate) reactivatedInvestments++;
        if (needsDailyProfitFix) fixedDailyProfit++;
        console.log("  🔧 FIXED Investment — " + pur.user?.userId + " — " + JSON.stringify(updateData));
      } else {
        alreadyOk++;
      }
    }
  }

  console.log("");
  console.log("📊 PHASE 2 SUMMARY:");
  console.log("   ✅ Created investments    :", createdInvestments);
  console.log("   ♻️  Reactivated investments:", reactivatedInvestments);
  console.log("   🔧 Fixed dailyProfit       :", fixedDailyProfit);
  console.log("   ✓  Already OK              :", alreadyOk);
  console.log("");

  // ═══════════════════════════════════════════════════════════
  // PHASE 3: SYNC BonusLog (untuk ProfitLog yang gak punya BonusLog)
  // ═══════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 3: SYNC BonusLog (riwayat muncul)");
  console.log("═══════════════════════════════════════════════════");

  const allProfitLogs = await p.profitLog.findMany({
    include: { purchase: { include: { product: true } } },
  });
  console.log("💰 Total ProfitLogs:", allProfitLogs.length);

  let syncedRecords = 0;
  let syncedTotal = 0;

  for (const pl of allProfitLogs) {
    // Cek apakah sudah ada BonusLog untuk profit ini (anti double)
    const existingBonus = await p.bonusLog.count({
      where: {
        userId: pl.userId,
        type: "profit",
        amount: pl.amount,
        createdAt: {
          gte: new Date(pl.createdAt.getTime() - 60 * 1000),
          lte: new Date(pl.createdAt.getTime() + 60 * 1000),
        },
      },
    });
    if (existingBonus > 0) continue;

    const pur = pl.purchase;
    const productName = pur?.product?.name || "Produk";
    const plDateWIB = getWibDateString(new Date(pl.createdAt));

    await p.bonusLog.create({
      data: {
        userId: pl.userId,
        fromUserId: pl.userId,
        type: "profit",
        level: 0,
        amount: pl.amount,
        description: "Profit harian " + productName + " [SYNC-V5] (saldo sudah di-credit manual, records di-sync)",
      },
    });

    // Update Investment.totalProfitEarned + lastProfitDate
    const linkedInv = await p.investment.findFirst({ where: { purchaseId: pl.purchaseId } });
    if (linkedInv) {
      await p.investment.update({
        where: { id: linkedInv.id },
        data: {
          totalProfitEarned: { increment: pl.amount },
          lastProfitDate: new Date(pl.createdAt),
        },
      });
    }

    // Update User.totalProfit (statistik)
    await p.user.update({
      where: { id: pl.userId },
      data: { totalProfit: { increment: pl.amount } },
    });

    syncedRecords++;
    syncedTotal += pl.amount;
    console.log("  ✅ SYNCED — user " + pl.userId.slice(-8) + " — " + productName + " — +" + formatRupiah(pl.amount) + " (" + plDateWIB + ")");
  }

  console.log("");
  console.log("📊 PHASE 3 SUMMARY:");
  console.log("   ✅ Records synced  :", syncedRecords);
  console.log("   💰 Total profit    :", formatRupiah(syncedTotal) + " (di-sync ke records, BUKAN ke saldo)");
  console.log("");

  // ═══════════════════════════════════════════════════════════
  // PHASE 4: CREDIT PROFIT HARI INI (weekday only)
  //   NO STATUS FILTER — pakai endDate sebagai source of truth
  // ═══════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 4: CREDIT PROFIT HARI INI");
  console.log("═══════════════════════════════════════════════════");

  if (!isTodayWeekday) {
    console.log("⏭️  Weekend (" + ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][todayDow] + ") — profit gak di-credit weekend");
    console.log("   Profit cuma Senin-Jumat. Cron bakal handle weekday berikutnya.");
    console.log("");
  } else {
    // ★ KEY: fetch ALL investments, filter by endDate (bukan status string)
    const allInvestments = await p.investment.findMany({
      include: { package: true, user: { select: { userId: true, name: true } } },
    });
    console.log("📈 Total investments:", allInvestments.length);

    // Filter: contract still active (endDate > now)
    const activeByEndDate = allInvestments.filter(inv => {
      if (!inv.endDate) return true; // no endDate = treat as active
      return new Date(inv.endDate) > wibNow;
    });
    console.log("📈 Active by endDate :", activeByEndDate.length);
    console.log("");

    let credited = 0;
    let skippedAlreadyCredited = 0;
    let skippedBoughtToday = 0;
    let skippedZeroProfit = 0;
    let totalCredited = 0;
    const creditedUsers = [];

    for (const inv of activeByEndDate) {
      // Cek 1: lastProfitDate udah hari ini?
      if (inv.lastProfitDate) {
        const lastWIB = getWibDateString(new Date(inv.lastProfitDate));
        if (lastWIB === todayWIB) {
          skippedAlreadyCredited++;
          continue;
        }
      }

      // Cek 2: BonusLog type=profit hari ini? (anti double untuk manual credit)
      const todayBonus = await p.bonusLog.count({
        where: { userId: inv.userId, type: "profit", createdAt: { gte: startOfDayWIB } },
      });
      if (todayBonus > 0) {
        skippedAlreadyCredited++;
        continue;
      }

      // Cek 3: Beli hari ini → profit mulai besok
      const createdDate = inv.startDate ? new Date(inv.startDate) : new Date(inv.createdAt);
      const createdWIB = getWibDateString(createdDate);
      if (createdWIB === todayWIB) {
        skippedBoughtToday++;
        continue;
      }

      // Hitung dailyProfit
      const dailyProfit = inv.dailyProfit && inv.dailyProfit > 0
        ? inv.dailyProfit
        : Math.floor(inv.amount * ((inv.package?.profitRate || 0) / 100));
      if (dailyProfit <= 0) {
        skippedZeroProfit++;
        continue;
      }

      // ★ CREDIT profit
      await p.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: inv.userId },
          data: { mainBalance: { increment: dailyProfit }, totalProfit: { increment: dailyProfit } },
        });
        await tx.investment.update({
          where: { id: inv.id },
          data: {
            totalProfitEarned: { increment: dailyProfit },
            lastProfitDate: new Date(),
            ...(inv.status !== "active" ? { status: "active" } : {}),
          },
        });
        const pkgName = inv.package?.name || "Investment";
        await tx.bonusLog.create({
          data: {
            userId: inv.userId,
            fromUserId: inv.userId,
            type: "profit",
            level: 0,
            amount: dailyProfit,
            description: "Profit harian " + pkgName + " — " + formatRupiah(inv.amount) + " [V5-CREDIT]",
          },
        });
      });

      credited++;
      totalCredited += dailyProfit;
      creditedUsers.push({
        userId: inv.user?.userId,
        name: inv.user?.name,
        amount: dailyProfit,
      });
      console.log("  💰 " + inv.user?.userId + " (" + inv.user?.name + ") — +" + formatRupiah(dailyProfit));
    }

    console.log("");
    console.log("📊 PHASE 4 SUMMARY:");
    console.log("   💰 Credited now       :", credited + " investasi (" + formatRupiah(totalCredited) + ")");
    console.log("   ⏭️  Already credited   :", skippedAlreadyCredited);
    console.log("   ⏭️  Bought today       :", skippedBoughtToday);
    console.log("   ⚠️  dailyProfit=0      :", skippedZeroProfit);
    console.log("");

    if (credited > 0) {
      console.log("📋 ✅ User yang di-credit profit hari ini:");
      creditedUsers.forEach((u, i) => {
        console.log("  " + (i + 1) + ". " + u.userId + " (" + u.name + ") — +" + formatRupiah(u.amount));
      });
      console.log("");
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 5: SYNC TOTAL PROFIT dari BonusLog (FIX "total profit gk ada")
  //   Untuk user yang sudah di-credit manual via admin path yang bocor
  //   (status='active' filter → investment gak ketemu → totalProfitEarned gak update)
  //   Sync: jumlahkan semua BonusLog type='profit' per user, pastikan
  //   Investment.totalProfitEarned + User.totalProfit match
  // ═══════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 5: SYNC TOTAL PROFIT (fix 'total profit gk ada')");
  console.log("═══════════════════════════════════════════════════");

  // Ambil semua user yang punya BonusLog type='profit'
  const usersWithProfitBonus = await p.bonusLog.findMany({
    where: { type: "profit" },
    select: { userId: true, amount: true, createdAt: true },
  });
  const profitByUser = new Map();
  for (const bl of usersWithProfitBonus) {
    profitByUser.set(bl.userId, (profitByUser.get(bl.userId) || 0) + bl.amount);
  }
  console.log("👥 Users with profit BonusLog:", profitByUser.size);
  console.log("");

  let syncedInvestmentProfit = 0;
  let syncedUserProfit = 0;
  let totalSyncAmount = 0;

  for (const [userId, expectedTotal] of profitByUser) {
    const u = await p.user.findUnique({ where: { id: userId }, select: { userId: true, name: true, totalProfit: true } });
    if (!u) continue;

    // Cari active investment (endDate-based, no status filter)
    const userInvs = await p.investment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    const activeInv = userInvs.find((inv) => {
      if (!inv.endDate) return true;
      return new Date(inv.endDate) > wibNow;
    });

    // Sync Investment.totalProfitEarned
    if (activeInv) {
      const currentEarned = activeInv.totalProfitEarned || 0;
      if (currentEarned < expectedTotal) {
        const diff = expectedTotal - currentEarned;
        await p.investment.update({
          where: { id: activeInv.id },
          data: {
            totalProfitEarned: { increment: diff },
            ...(activeInv.status !== "active" ? { status: "active" } : {}),
          },
        });
        syncedInvestmentProfit++;
        totalSyncAmount += diff;
        console.log("  📈 Investment synced — " + u.userId + " — totalProfitEarned: " + formatRupiah(currentEarned) + " → " + formatRupiah(expectedTotal) + " (+" + formatRupiah(diff) + ")");
      }
    }

    // Sync User.totalProfit
    if (u.totalProfit < expectedTotal) {
      const diff = expectedTotal - u.totalProfit;
      await p.user.update({
        where: { id: userId },
        data: { totalProfit: { increment: diff } },
      });
      syncedUserProfit++;
      console.log("  👤 User.totalProfit synced — " + u.userId + " — " + formatRupiah(u.totalProfit) + " → " + formatRupiah(expectedTotal) + " (+" + formatRupiah(diff) + ")");
    }
  }

  console.log("");
  console.log("📊 PHASE 5 SUMMARY:");
  console.log("   📈 Investment.totalProfitEarned synced:", syncedInvestmentProfit);
  console.log("   👤 User.totalProfit synced            :", syncedUserProfit);
  console.log("   💰 Total amount synced                :", formatRupiah(totalSyncAmount));
  console.log("   (TANPA rubah mainBalance — saldo sudah di-credit manual)");
  console.log("");

  // ═══════════════════════════════════════════════════════════
  // FINAL
  // ═══════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════");
  console.log("🎉 FIX PROFIT v6 SELESAI!");
  console.log("═══════════════════════════════════════════════════");
  console.log("");
  console.log("🔒 KEAMANAN DATA:");
  console.log("   • TIDAK ada user/purchase/investment yang dihapus");
  console.log("   • Backup DB: " + (process.env.BACKUP_FILE || "db/custom.db.backup-v6-*"));
  console.log("");
  console.log("✅ Yang dilakukan:");
  console.log("   • Investment records di-create/reactivate untuk semua purchase");
  console.log("   • BonusLog di-sync (riwayat muncul)");
  console.log("   • Investment.totalProfitEarned di-update (aset total profit)");
  console.log("   • Profit hari ini di-credit (weekday)");
  console.log("   • Anti double-credit (lastProfitDate + BonusLog check)");
  console.log("");
  console.log("🔁 PENTING — Restart cron supaya profit auto-enter besok 00:00 WIB:");
  console.log("   pm2 restart nexvo-cron");
  console.log("");

  await p.$disconnect();
})().catch(e => {
  console.error("❌ FATAL ERROR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
' 2>&1

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  ✅ FIX PROFIT v6 SELESAI                        ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  🔒 TIDAK HAPUS DATA APAPUN                      ║"
echo "║  • Investment records repaired                   ║"
echo "║  • BonusLog synced (riwayat muncul)              ║"
echo "║  • Aset total profit updated                     ║"
echo "║  • Today profit credited (weekday)               ║"
echo "║  • Anti double-credit (lastProfitDate)           ║"
echo "║                                                  ║"
echo "║  🔁 Restart cron:  pm2 restart nexvo-cron        ║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
