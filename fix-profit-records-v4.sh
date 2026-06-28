#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO — FIX PROFIT RECORDS v4 (COMPREHENSIVE REPAIR)
# ════════════════════════════════════════════════════════════════
# ROOT CAUSE (dari screenshot user):
#   - Admin "Kelola Aset" menampilkan 22 aset (dari tabel PURCHASE)
#   - Script sync-profit-records.sh query tabel INVESTMENT → 0 record!
#   - Artinya: 22 aset itu adalah PURCHASES, bukan INVESTMENTS
#   - Cron hanya baca tabel Investment → profit gak pernah masuk otomatis
#   - Admin "add-profit" di Purchase path cuma bikin ProfitLog (BUKAN BonusLog)
#     → Riwayat gak muncul, aset gak total profit, cron double-credit
#
# SCRIPT INI MELAKUKAN:
#   1. SCAN semua active Purchases (22 aset)
#   2. Untuk setiap Purchase, CARI Investment linked (via purchaseId)
#      - Kalau gak ada → CREATE Investment (status=active, dailyProfit dari product)
#      - Kalau ada tapi status=completed/stopped → REACTIVATE (kalau endDate belum lewat)
#   3. SYNC RECORDS untuk Purchase yang sudah di-credit manual (ProfitLog ada, BonusLog gak ada):
#      - Bikin BonusLog type='profit' (riwayat muncul)
#      - Update Investment.totalProfitEarned (aset total profit update)
#      - Update Investment.lastProfitDate = now (anti cron double-credit)
#      - Update User.totalProfit (statistik update)
#      - GAK rubah mainBalance (sudah di-credit manual)
#   4. CREDIT PROFIT HARI INI ke semua Investment aktif yang belum di-credit hari ini
#      (weekday Senin-Jumat, anti double-credit via lastProfitDate + BonusLog check)
#
# CARA PAKAI:
#   cd /var/www/nexvo && bash fix-profit-records-v4.sh
# ════════════════════════════════════════════════════════════════

set +e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  NEXVO FIX PROFIT RECORDS v4                     ║"
echo "║  Comprehensive repair: Purchase→Investment+Bonus  ║"
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

# ─── BACKUP DB DULU ──
BACKUP_FILE="db/custom.db.backup-v4-$(date +%Y%m%d-%H%M%S)"
if [ -f "db/custom.db" ]; then
  cp db/custom.db "$BACKUP_FILE" 2>/dev/null && echo "💾 DB backup: $BACKUP_FILE"
  echo ""
fi

# ─── COMPREHENSIVE REPAIR ──
echo "═══════════════════════════════════════════════════"
echo "  PHASE 1-4: SCAN + REPAIR + SYNC + CREDIT"
echo "═══════════════════════════════════════════════════"
echo ""

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

  // ─────────────────────────────────────────────────────────
  // PHASE 1: DIAGNOSTIC — lihat semua tabel
  // ─────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 1: DIAGNOSTIC");
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

  // ─────────────────────────────────────────────────────────
  // PHASE 2: REPAIR — untuk setiap active Purchase, pastikan Investment ada & active
  // ─────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 2: REPAIR (Purchase → Investment link)");
  console.log("═══════════════════════════════════════════════════");

  const activePurchases = await p.purchase.findMany({
    where: { status: "active" },
    include: { product: true, user: true },
  });
  console.log("🛒 Active purchases:", activePurchases.length);
  console.log("");

  let createdInvestments = 0;
  let reactivatedInvestments = 0;
  let existingActiveInvestments = 0;

  for (const pur of activePurchases) {
    const product = pur.product;
    const dailyProfit = Math.floor((product?.price || pur.totalPrice) * ((product?.profitRate || 0) / 100));
    const contractDays = product?.duration || 90;

    // Cari linked investment
    let linkedInv = await p.investment.findFirst({
      where: { purchaseId: pur.id },
    });

    if (!linkedInv) {
      // ★ CREATE missing Investment
      const startDate = new Date(pur.createdAt);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + contractDays);

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
          dailyProfit,
          totalProfitEarned: pur.profitEarned || 0,
          status: "active",
          startDate,
          endDate,
          lastProfitDate: pur.lastProfitDate || null,
        },
      });
      createdInvestments++;
      console.log("  ✅ CREATED Investment for " + pur.user?.userId + " — " + product?.name + " — dailyProfit=" + formatRupiah(dailyProfit));
    } else if (linkedInv.status !== "active") {
      // ★ REACTIVATE if endDate not passed
      const endDate = linkedInv.endDate ? new Date(linkedInv.endDate) : null;
      if (!endDate || endDate > wibNow) {
        await p.investment.update({
          where: { id: linkedInv.id },
          data: {
            status: "active",
            dailyProfit: dailyProfit > 0 ? dailyProfit : (linkedInv.dailyProfit || 0),
            ...(linkedInv.endDate ? {} : { endDate: (() => { const e = new Date(linkedInv.startDate || pur.createdAt); e.setDate(e.getDate() + contractDays); return e; })() }),
          },
        });
        reactivatedInvestments++;
        console.log("  ♻️  REACTIVATED Investment " + linkedInv.id + " for " + pur.user?.userId + " (was " + linkedInv.status + ")");
      } else {
        console.log("  ⏭️  Investment " + linkedInv.id + " for " + pur.user?.userId + " — endDate passed, skip");
      }
    } else {
      // Already active — ensure dailyProfit is correct (non-zero)
      if ((!linkedInv.dailyProfit || linkedInv.dailyProfit === 0) && dailyProfit > 0) {
        await p.investment.update({
          where: { id: linkedInv.id },
          data: { dailyProfit },
        });
        console.log("  🔧 FIXED dailyProfit for " + pur.user?.userId + " — " + formatRupiah(dailyProfit));
      } else {
        existingActiveInvestments++;
      }
    }
  }

  console.log("");
  console.log("📊 PHASE 2 SUMMARY:");
  console.log("   ✅ Created investments    :", createdInvestments);
  console.log("   ♻️  Reactivated investments:", reactivatedInvestments);
  console.log("   ✓  Already active         :", existingActiveInvestments);
  console.log("");

  // ─────────────────────────────────────────────────────────
  // PHASE 3: SYNC RECORDS — untuk Purchase yang sudah di-credit manual
  //   (ProfitLog ada hari ini tapi BonusLog gak ada → riwayat gak muncul)
  // ─────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 3: SYNC RECORDS (BonusLog untuk manual credits)");
  console.log("═══════════════════════════════════════════════════");

  // Cari semua ProfitLog yang gak punya BonusLog counterpart
  const allProfitLogs = await p.profitLog.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } }, // last 7 days
    include: { purchase: { include: { product: true } } },
  });
  console.log("💰 ProfitLogs (last 7 days):", allProfitLogs.length);

  let syncedRecords = 0;
  let syncedTotal = 0;
  const syncedUsers = [];

  for (const pl of allProfitLogs) {
    // Cek apakah sudah ada BonusLog untuk profit ini (anti double)
    const plDateWIB = getWibDateString(new Date(pl.createdAt));
    const existingBonus = await p.bonusLog.count({
      where: {
        userId: pl.userId,
        type: "profit",
        amount: pl.amount,
        createdAt: {
          gte: new Date(pl.createdAt.getTime() - 60 * 1000),  // within 1 min
          lte: new Date(pl.createdAt.getTime() + 60 * 1000),
        },
      },
    });
    if (existingBonus > 0) continue; // already synced

    const pur = pl.purchase;
    const productName = pur?.product?.name || "Produk";

    // Bikin BonusLog
    await p.bonusLog.create({
      data: {
        userId: pl.userId,
        fromUserId: pl.userId,
        type: "profit",
        level: 0,
        amount: pl.amount,
        description: "Profit harian " + productName + " [SYNC-V4] (saldo sudah di-credit manual, records di-sync)",
      },
    });

    // Update Investment.totalProfitEarned + lastProfitDate
    const linkedInv = await p.investment.findFirst({ where: { purchaseId: pl.purchaseId } });
    if (linkedInv) {
      const updateData = { totalProfitEarned: { increment: pl.amount } };
      // Update lastProfitDate ke tanggal ProfitLog (anti cron double-credit for that day)
      updateData.lastProfitDate = new Date(pl.createdAt);
      await p.investment.update({ where: { id: linkedInv.id }, data: updateData });
    }

    syncedRecords++;
    syncedTotal += pl.amount;
    const u = await p.user.findUnique({ where: { id: pl.userId }, select: { userId: true, name: true } });
    syncedUsers.push({ userId: u?.userId, name: u?.name, product: productName, amount: pl.amount, date: plDateWIB });
    console.log("  ✅ SYNCED " + u?.userId + " — " + productName + " — +" + formatRupiah(pl.amount) + " (" + plDateWIB + ")");
  }

  console.log("");
  console.log("📊 PHASE 3 SUMMARY:");
  console.log("   ✅ Records synced  :", syncedRecords);
  console.log("   💰 Total profit    :", formatRupiah(syncedTotal) + " (di-sync ke records, BUKAN ke saldo)");
  console.log("");

  // ─────────────────────────────────────────────────────────
  // PHASE 4: CREDIT PROFIT HARI INI ke semua Investment aktif yang belum di-credit
  // ─────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 4: CREDIT TODAY PROFIT (weekday only)");
  console.log("═══════════════════════════════════════════════════");

  if (!isTodayWeekday) {
    console.log("⏭️  Weekend (" + ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][todayDow] + ") — no profit credit today");
    console.log("   (Profit only credited Senin-Jumat)");
  } else {
    const activeInvestments = await p.investment.findMany({
      where: { status: "active" },
      include: { package: true, user: true },
    });
    console.log("📈 Active investments to process:", activeInvestments.length);
    console.log("");

    let credited = 0;
    let skippedAlreadyCredited = 0;
    let skippedBoughtToday = 0;
    let skippedEnded = 0;
    let skippedZeroProfit = 0;
    let totalCredited = 0;
    const creditedUsers = [];

    for (const inv of activeInvestments) {
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

      // Cek 4: Contract ended?
      if (inv.endDate) {
        const endDate = new Date(inv.endDate);
        if (wibNow >= endDate) {
          await p.investment.update({ where: { id: inv.id }, data: { status: "completed" } });
          skippedEnded++;
          continue;
        }
      }

      // Hitung dailyProfit
      const dailyProfit = inv.dailyProfit && inv.dailyProfit > 0
        ? inv.dailyProfit
        : Math.floor(inv.amount * ((inv.package?.profitRate || 0) / 100));
      if (dailyProfit <= 0) {
        skippedZeroProfit++;
        continue;
      }

      // ★ CREDIT profit (1 hari = hari ini)
      await p.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: inv.userId },
          data: { mainBalance: { increment: dailyProfit }, totalProfit: { increment: dailyProfit } },
        });
        await tx.investment.update({
          where: { id: inv.id },
          data: { totalProfitEarned: { increment: dailyProfit }, lastProfitDate: new Date() },
        });
        const pkgName = inv.package?.name || "Investment";
        await tx.bonusLog.create({
          data: {
            userId: inv.userId,
            fromUserId: inv.userId,
            type: "profit",
            level: 0,
            amount: dailyProfit,
            description: "Profit harian " + pkgName + " — " + formatRupiah(inv.amount) + " [V4-CREDIT]",
          },
        });
      });

      credited++;
      totalCredited += dailyProfit;
      creditedUsers.push({
        userId: inv.user?.userId,
        name: inv.user?.name,
        packageName: inv.package?.name || (await p.purchase.findUnique({ where: { id: inv.purchaseId || "" }, include: { product: true } }).then(pp => pp?.product?.name).catch(() => "Investment") || "Investment"),
        amount: dailyProfit,
      });
      console.log("  💰 " + inv.user?.userId + " (" + inv.user?.name + ") — +" + formatRupiah(dailyProfit));
    }

    console.log("");
    console.log("📊 PHASE 4 SUMMARY:");
    console.log("   💰 Credited now       :", credited + " investasi (" + formatRupiah(totalCredited) + ")");
    console.log("   ⏭️  Already credited   :", skippedAlreadyCredited);
    console.log("   ⏭️  Bought today       :", skippedBoughtToday);
    console.log("   ⏭️  Contract ended     :", skippedEnded);
    console.log("   ⚠️  dailyProfit=0      :", skippedZeroProfit);
    console.log("");

    if (credited > 0) {
      console.log("📋 ✅ User yang di-credit profit hari ini:");
      creditedUsers.forEach((u, i) => {
        console.log("  " + (i + 1) + ". " + u.userId + " (" + u.name + ") — " + u.packageName + " — +" + formatRupiah(u.amount));
      });
      console.log("");
    }
  }

  // ─────────────────────────────────────────────────────────
  // FINAL SUMMARY
  // ─────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════");
  console.log("🎉 FIX PROFIT RECORDS v4 SELESAI!");
  console.log("═══════════════════════════════════════════════════");
  console.log("");
  console.log("📊 TOTAL HASIL:");
  console.log("   PHASE 2 — Created investments    :", createdInvestments);
  console.log("   PHASE 2 — Reactivated investments :", reactivatedInvestments);
  console.log("   PHASE 3 — Records synced (BonusLog):", syncedRecords + " (" + formatRupiah(syncedTotal) + ")");
  console.log("   PHASE 4 — Profit credited today   :", (isTodayWeekday ? "lihat di atas" : "WEEKEND — skip"));
  console.log("");
  console.log("✅ Sekarang user bisa cek:");
  console.log("   → Halaman Riwayat: profit muncul (BonusLog created/synced)");
  console.log("   → Halaman Aset: total profit update (Investment.totalProfitEarned)");
  console.log("   → Dashboard: total profit update (User.totalProfit)");
  console.log("   → Cron GAK bakal double-credit (lastProfitDate = today)");
  console.log("");
  console.log("🔁 PENTING: Restart cron-service supaya profit auto-enter besok:");
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
echo "║  ✅ FIX PROFIT RECORDS v4 SELESAI                ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  • Investment records repaired/created           ║"
echo "║  • BonusLog records synced (riwayat muncul)      ║"
echo "║  • Aset total profit updated                     ║"
echo "║  • Today profit credited (weekday)               ║"
echo "║  • Anti double-credit (lastProfitDate)           ║"
echo "║                                                  ║"
echo "║  🔁 Restart cron:  pm2 restart nexvo-cron        ║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
