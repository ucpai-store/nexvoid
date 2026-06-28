#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO — SYNC PROFIT RECORDS (FIX MANUAL ENTRY YANG GAK ADA RECORD)
# ════════════════════════════════════════════════════════════════
# Untuk user yang SUDAH di-credit profit manual via "Tambah Saldo"
# (lama, sebelum v2.3) — saldo udah masuk tapi:
#   ❌ Riwayat profit gak muncul (BonusLog gak ada)
#   ❌ Aset gak total profit (investment.totalProfitEarned gak update)
#   ❌ Statistik total profit gak update (user.totalProfit gak update)
#   ❌ Cron bakal double-credit (lastProfitDate gak update)
#
# Script ini SYNC records tanpa rubah saldo:
#   ✅ Bikin BonusLog type='profit' (riwayat muncul)
#   ✅ Update investment.totalProfitEarned (aset total profit update)
#   ✅ Update investment.lastProfitDate = now (anti cron double-credit)
#   ✅ Update user.totalProfit (statistik update)
#   ✅ GAK sentuh mainBalance (sudah di-credit manual)
#
# CARA PAKAI:
#   cd /var/www/nexvo && bash sync-profit-records.sh
# ════════════════════════════════════════════════════════════════

set +e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  NEXVO SYNC PROFIT RECORDS                        ║"
echo "║  Fix manual entry yang gak ada riwayat/aset       ║"
echo "║  GAK rubah saldo (sudah di-credit manual)         ║"
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
BACKUP_FILE="db/custom.db.backup-sync-$(date +%Y%m%d-%H%M%S)"
if [ -f "db/custom.db" ]; then
  cp db/custom.db "$BACKUP_FILE" 2>/dev/null && echo "💾 DB backup: $BACKUP_FILE"
  echo ""
fi

# ─── SYNC RECORDS ──
echo "── Sync profit records (tanpa rubah saldo) ──"
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

  console.log("🕐 WIB Time:", wibNow.toISOString());
  console.log("📅 Today WIB:", todayWIB);
  console.log("");

  // Cari SEMUA investasi aktif
  const investments = await p.investment.findMany({
    where: { status: "active" },
    include: { package: true, user: true },
  });

  console.log("📊 Total investasi aktif:", investments.length);
  console.log("");

  if (investments.length === 0) {
    console.log("⚠️  TIDAK ADA investasi aktif!");
    await p.$disconnect();
    return;
  }

  let synced = 0;
  let skippedAlreadyCredited = 0;
  let skippedBoughtToday = 0;
  let errors = 0;
  let totalProfitSynced = 0;
  const syncedUsers = [];

  console.log("🔍 Cari investasi yang perlu di-sync records nya...");
  console.log("   (investasi yg lastProfitDate BUKAN hari ini — cron bakal double-credit kalo gak di-sync)");
  console.log("");

  for (const inv of investments) {
    try {
      // Cek 1: Kalau lastProfitDate udah hari ini → skip (sudah credited properly)
      if (inv.lastProfitDate) {
        const lastWIB = getWibDateString(new Date(inv.lastProfitDate));
        if (lastWIB === todayWIB) {
          skippedAlreadyCredited++;
          continue;
        }
      }

      // Cek 2: Kalau beli hari ini → skip (profit mulai besok)
      const createdDate = inv.startDate ? new Date(inv.startDate) : new Date(inv.createdAt);
      const createdWIB = getWibDateString(createdDate);
      if (createdWIB === todayWIB) {
        skippedBoughtToday++;
        continue;
      }

      // Cek 3: Cek BonusLog type=profit hari ini — kalau ada, skip (anti double)
      const todayProfitLogs = await p.bonusLog.count({
        where: { userId: inv.userId, type: "profit", createdAt: { gte: startOfDayWIB } },
      });
      if (todayProfitLogs > 0) {
        // BonusLog ada tapi lastProfitDate gak update → update lastProfitDate aja
        await p.investment.update({
          where: { id: inv.id },
          data: { lastProfitDate: new Date() },
        });
        console.log("  🔧 " + inv.user?.userId + " — BonusLog ada, lastProfitDate di-update (anti cron double)");
        synced++;
        continue;
      }

      // ★ Hitung daily profit
      const dailyProfit = inv.dailyProfit && inv.dailyProfit > 0
        ? inv.dailyProfit
        : Math.floor(inv.amount * ((inv.package?.profitRate || 0) / 100));

      if (dailyProfit <= 0) {
        console.log("  ⚠️  Skip " + inv.user?.userId + " — dailyProfit=0");
        continue;
      }

      // ★ Credit amount = 1 hari profit (hari ini saja — backfill biar cron handle)
      const creditAmount = dailyProfit;

      // ★ SYNC RECORDS (TANPA rubah mainBalance — sudah di-credit manual)
      await p.$transaction(async (tx) => {
        // 1. Update totalProfit (statistik) — GAK sentuh mainBalance
        await tx.user.update({
          where: { id: inv.userId },
          data: { totalProfit: { increment: creditAmount } },
        });

        // 2. Update investment.totalProfitEarned + lastProfitDate
        await tx.investment.update({
          where: { id: inv.id },
          data: {
            totalProfitEarned: { increment: creditAmount },
            lastProfitDate: new Date(),
          },
        });

        // 3. Bikin BonusLog entry (riwayat profit muncul)
        const pkgName = inv.package?.name || "Investment";
        await tx.bonusLog.create({
          data: {
            userId: inv.userId,
            fromUserId: inv.userId,
            type: "profit",
            level: 0,
            amount: creditAmount,
            description: "Profit harian " + pkgName + " — " + formatRupiah(inv.amount) + " [SYNC-MANUAL] (saldo sudah di-credit manual, records di-sync)",
          },
        });
      });

      synced++;
      totalProfitSynced += creditAmount;
      syncedUsers.push({
        userId: inv.user?.userId,
        name: inv.user?.name,
        packageName: inv.package?.name,
        amount: creditAmount,
      });

      console.log("  ✅ " + inv.user?.userId + " (" + inv.user?.name + ") — " + inv.package?.name + " — SYNCED records: BonusLog +" + formatRupiah(creditAmount) + ", totalProfitEarned +" + formatRupiah(creditAmount) + ", lastProfitDate=now");
    } catch (err) {
      errors++;
      console.error("  ❌ " + inv.id + " ERROR:", err.message);
    }
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("🎉 SYNC PROFIT RECORDS SELESAI!");
  console.log("   ✅ Synced           : " + synced + " investasi");
  console.log("   ⏭️  Already credited : " + skippedAlreadyCredited + " (lastProfitDate udah today)");
  console.log("   ⏭️  Bought today     : " + skippedBoughtToday + " (profit mulai besok)");
  console.log("   ❌ Errors           : " + errors);
  console.log("   💰 Total profit     : " + formatRupiah(totalProfitSynced) + " (di-sync ke records, BUKAN ke saldo)");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");

  if (synced > 0) {
    console.log("📋 ✅ User yang RECORDS-nya di-sync:");
    syncedUsers.forEach((u, i) => {
      console.log("  " + (i + 1) + ". " + u.userId + " (" + u.name + ") — " + u.packageName + " — records +" + formatRupiah(u.amount));
    });
    console.log("");
    console.log("✅ Sekarang user bisa cek:");
    console.log("   → Halaman Riwayat: profit muncul (BonusLog created)");
    console.log("   → Halaman Aset: total profit update (investment.totalProfitEarned)");
    console.log("   → Dashboard: total profit update (user.totalProfit)");
    console.log("   → Cron GAK bakal double-credit (lastProfitDate = today)");
  } else {
    console.log("ℹ️  Semua investasi sudah credited properly (lastProfitDate = today).");
    console.log("   → Gak ada yang perlu di-sync.");
  }

  await p.$disconnect();
})().catch(e => {
  console.error("❌ FATAL ERROR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
' 2>&1

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  ✅ SYNC PROFIT RECORDS SELESAI                   ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  Records di-sync   : ✅ BonusLog + aset + stat   ║"
echo "║  Saldo user        : 🔒 GAK dirubah              ║"
echo "║  Cron double-credit : 🛡️ DICEGAH (lastProfitDate) ║"
echo "║                                                  ║"
echo "║  User cek sekarang:                              ║"
echo "║  → Riwayat profit muncul                         ║"
echo "║  → Aset total profit update                      ║"
echo "║  → Dashboard total profit update                 ║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
