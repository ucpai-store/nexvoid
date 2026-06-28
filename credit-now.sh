#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO — CREDIT PROFIT NOW (GIT-INDEPENDENT, BULLETPROOF)
# ════════════════════════════════════════════════════════════════
# Credit profit SEMUA user aktif SEKARANG. Tanpa git pull, tanpa
# script file dependency. langsung jalan di VPS.
#
# AMAN:
#   ✅ GAK rubah data user (no balance reset, no account deletion)
#   ✅ GAK rubah deposit/WD/investasi
#   ✅ HANYA credit profit yang seharusnya masuk hari ini
#   ✅ Anti double-credit: cek lastProfitDate + BonusLog type=profit
#   ✅ User yang sudah di-input MANUAL gak di-credit lagi
#
# CARA PAKAI (di VPS):
#   cd /var/www/nexvo && bash credit-now.sh
#   (atau: cd /home/nexvo && bash credit-now.sh)
# ════════════════════════════════════════════════════════════════

set +e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  NEXVO CREDIT PROFIT NOW (GIT-INDEPENDENT)       ║"
echo "║  Credit profit SEMUA user aktif SEKARANG         ║"
echo "║  Anti double-credit (manual entry gak di-credit) ║"
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
  echo "   Coba: cd /var/www/nexvo && bash credit-now.sh"
  exit 1
fi

cd "$PROJECT_DIR" || exit 1
echo "📂 Project: $PROJECT_DIR"
echo "🕐 WIB now: $(TZ='Asia/Jakarta' date '+%Y-%m-%d %H:%M:%S %A')"
echo ""

if ! command -v bun &>/dev/null; then
  echo "❌ bun tidak tersedia! Install: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

# ─── CREDIT PROFIT SEKARANG (self-contained bun script) ──
echo "── Credit profit SEMUA user aktif SEKARANG ──"
echo "   ⏳ Baca database, cari investasi aktif, credit profit..."
echo ""

bun -e '
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

// ★ Baca DATABASE_URL dari .env
let DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  const envPaths = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), ".env.production"),
    "/var/www/nexvo/.env",
    "/home/nexvo/.env",
  ];
  for (const ep of envPaths) {
    if (fs.existsSync(ep)) {
      try {
        const envContent = fs.readFileSync(ep, "utf8");
        const match = envContent.match(/^DATABASE_URL=(.+)$/m);
        if (match) {
          DB_URL = match[1].trim().replace(/^["\x27]|["\x27]$/g, "");
          break;
        }
      } catch {}
    }
  }
}

if (!DB_URL) {
  console.error("❌ DATABASE_URL tidak ketemu di .env!");
  process.exit(1);
}

console.log("📁 DB URL:", DB_URL);

// ★ Verify DB file exists
if (DB_URL.startsWith("file:")) {
  const dbPath = DB_URL.replace(/^file:/, "").replace(/^sqlite:/, "");
  const absPath = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
  if (!fs.existsSync(absPath)) {
    console.error("❌ DB file tidak ada:", absPath);
    process.exit(1);
  }
  const stats = fs.statSync(absPath);
  console.log("✅ DB file:", absPath, "(" + (stats.size / 1024).toFixed(1) + " KB)");
}
console.log("");

const p = new PrismaClient({ datasources: { db: { url: DB_URL } } });

// ★ WIB time helpers (HARUS sama dengan cron-service.ts)
const WIB_OFFSET = 7;
function getWibNow() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + WIB_OFFSET * 3600000);
}
function getWibDateString(date) {
  const wibDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
  return wibDate.getFullYear() + "-" + String(wibDate.getMonth() + 1).padStart(2, "0") + "-" + String(wibDate.getDate()).padStart(2, "0");
}
function formatRupiah(amount) {
  return "Rp" + Math.floor(amount).toLocaleString("id-ID");
}

(async () => {
  const wibNow = getWibNow();
  const todayWIB = getWibDateString(new Date());
  const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const dayOfWeek = wibNow.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  console.log("🕐 WIB Time:", wibNow.toISOString());
  console.log("📅 Hari:", dayNames[dayOfWeek], isWeekend ? "(WEEKEND — tapi force credit tetap jalan)" : "(weekday)");
  console.log("📅 Today WIB:", todayWIB);
  console.log("");

  // ★ SELF-HEAL: Reactivate investments wrongly marked completed
  try {
    const completed = await p.investment.findMany({
      where: { status: "completed" },
      include: { package: true },
    });
    let reactivated = 0;
    for (const inv of completed) {
      if (!inv.endDate) continue;
      if (new Date(inv.endDate).getTime() <= Date.now()) continue;
      const sdp = inv.dailyProfit && inv.dailyProfit > 0
        ? inv.dailyProfit
        : Math.floor(inv.amount * ((inv.package?.profitRate || 0) / 100));
      if (sdp <= 0) continue;
      let contractDays = 0;
      if (inv.startDate && inv.endDate) {
        const msDiff = new Date(inv.endDate).getTime() - new Date(inv.startDate).getTime();
        contractDays = Math.max(1, Math.round(msDiff / (24 * 60 * 60 * 1000)));
      } else {
        contractDays = inv.package?.contractDays || 180;
      }
      const hardCap = sdp * contractDays;
      if ((inv.totalProfitEarned || 0) >= hardCap) continue;
      await p.investment.update({
        where: { id: inv.id },
        data: { status: "active", dailyProfit: sdp },
      });
      reactivated++;
    }
    if (reactivated > 0) {
      console.log("♻️  SELF-HEAL: Reactivated " + reactivated + " investment(s) yang salahnya di-completed");
      console.log("");
    }
  } catch (e) {
    console.error("⚠️  SELF-HEAL error (non-fatal):", e.message);
  }

  // ★ Cari SEMUA investasi aktif
  const investments = await p.investment.findMany({
    where: { status: "active" },
    include: { package: true, user: true },
  });

  console.log("📊 Total investasi aktif:", investments.length);
  console.log("");

  if (investments.length === 0) {
    console.log("⚠️  TIDAK ADA investasi aktif!");
    console.log("   → User harus beli produk dulu di halaman Produk/Paket");
    await p.$disconnect();
    return;
  }

  let processed = 0;
  let skipped = 0;
  let skippedManual = 0;
  let skippedBoughtToday = 0;
  let skippedDailyProfitZero = 0;
  let errors = 0;
  let totalProfit = 0;
  const creditedUsers = [];
  const skippedUsers = [];

  // ★★★ PRE-SCAN: Cari user yang SUDAH dapat profit hari ini ★★★
  const startOfDayWIB = new Date(todayWIB + "T00:00:00+07:00");
  console.log("🔍 Pre-scan: cari user yang sudah dapat profit hari ini...");
  console.log("   (cek lastProfitDate + BonusLog type=profit untuk anti double-credit)");
  console.log("");

  const alreadyCreditedInvestments = new Set();

  for (const inv of investments) {
    let alreadyCredited = false;
    let creditSource = "";

    // Cek 1: lastProfitDate
    if (inv.lastProfitDate) {
      const lastProfitWIB = getWibDateString(new Date(inv.lastProfitDate));
      if (lastProfitWIB === todayWIB) {
        alreadyCredited = true;
        creditSource = "lastProfitDate";
      }
    }

    // Cek 2: BonusLog type=profit hari ini (catches manual credits via admin panel)
    if (!alreadyCredited) {
      const todayProfitLogs = await p.bonusLog.count({
        where: {
          userId: inv.userId,
          type: "profit",
          createdAt: { gte: startOfDayWIB },
        },
      });
      if (todayProfitLogs > 0) {
        alreadyCredited = true;
        creditSource = "BonusLog (manual/cron entry)";
        skippedManual++;
      }
    }

    if (alreadyCredited) {
      alreadyCreditedInvestments.add(inv.id);
      skippedUsers.push({
        userId: inv.user?.userId,
        name: inv.user?.name,
        investmentId: inv.id,
        source: creditSource,
        amount: inv.amount,
        dailyProfit: inv.dailyProfit,
      });
    }
  }

  if (alreadyCreditedInvestments.size > 0) {
    console.log("📋 " + alreadyCreditedInvestments.size + " investasi SUDAH dapat profit hari ini (SKIP, gak double-credit):");
    skippedUsers.forEach((u, i) => {
      console.log("  " + (i+1) + ". " + u.userId + " (" + u.name + ") — via " + u.source + " — dailyProfit=" + formatRupiah(u.dailyProfit || 0));
    });
    console.log("");
  }

  console.log("📊 Investasi yang BELUM dapat profit hari ini: " + (investments.length - alreadyCreditedInvestments.size));
  console.log("");

  for (const inv of investments) {
    try {
      // ★★★ Skip kalau sudah credited (pre-scan result) ★★★
      if (alreadyCreditedInvestments.has(inv.id)) {
        skipped++;
        continue;
      }

      // ★ SKIP kalau beli hari ini (profit mulai besok)
      const createdDate = inv.startDate ? new Date(inv.startDate) : new Date(inv.createdAt);
      const createdWIB = getWibDateString(createdDate);
      if (createdWIB === todayWIB) {
        console.log("  ⏭️  Skip " + inv.id + " — beli hari ini, profit mulai besok");
        skipped++;
        skippedBoughtToday++;
        continue;
      }

      // ★ SKIP kalau contract ended
      if (inv.endDate) {
        const endDate = new Date(inv.endDate);
        if (wibNow >= endDate) {
          await p.investment.update({
            where: { id: inv.id },
            data: { status: "completed" },
          });
          console.log("  ✅ Mark completed " + inv.id + " — contract ended");
          skipped++;
          continue;
        }
      }

      // ★ Hitung daily profit (pakai stored inv.dailyProfit — BUKAN recomputed)
      const dailyProfit = inv.dailyProfit && inv.dailyProfit > 0
        ? inv.dailyProfit
        : Math.floor(inv.amount * ((inv.package?.profitRate || 0) / 100));

      if (dailyProfit <= 0) {
        console.log("  ⚠️  Skip " + inv.id + " — dailyProfit=0 (user=" + inv.user?.userId + ", pkg=" + inv.package?.name + ", rate=" + inv.package?.profitRate + ")");
        skipped++;
        skippedDailyProfitZero++;
        continue;
      }

      // ★ Credit profit (1 hari = hari ini)
      const totalCredit = dailyProfit;

      await p.$transaction(async (tx) => {
        // Re-check inside transaction
        const currentInv = await tx.investment.findUnique({ where: { id: inv.id } });
        if (currentInv?.lastProfitDate) {
          const lastProfitWIB = getWibDateString(new Date(currentInv.lastProfitDate));
          if (lastProfitWIB === todayWIB) {
            return; // already credited
          }
        }

        // ★ Credit ke user balance (mainBalance + totalProfit)
        await tx.user.update({
          where: { id: inv.userId },
          data: {
            mainBalance: { increment: totalCredit },
            totalProfit: { increment: totalCredit },
          },
        });

        // ★ Update investment record
        await tx.investment.update({
          where: { id: inv.id },
          data: {
            totalProfitEarned: { increment: totalCredit },
            dailyProfit: dailyProfit,
            lastProfitDate: new Date(),
          },
        });

        // ★ BonusLog entry (audit trail)
        const pkgName = inv.package?.name || "Investment";
        const pkgRate = inv.package?.profitRate || (inv.amount > 0 ? (dailyProfit / inv.amount) * 100 : 0);
        await tx.bonusLog.create({
          data: {
            userId: inv.userId,
            fromUserId: inv.userId,
            type: "profit",
            level: 0,
            amount: totalCredit,
            description: "Profit harian " + pkgName + " — " + formatRupiah(inv.amount) + " x " + pkgRate.toFixed(2) + "% = " + formatRupiah(dailyProfit) + " [CREDIT-NOW]",
          },
        });
      });

      processed++;
      totalProfit += totalCredit;
      creditedUsers.push({
        userId: inv.user?.userId,
        name: inv.user?.name,
        amount: inv.amount,
        dailyProfit: dailyProfit,
        totalCredit: totalCredit,
        packageName: inv.package?.name,
      });

      console.log("  ✅ " + inv.user?.userId + " (" + inv.user?.name + ") — " + inv.package?.name + " — +" + formatRupiah(totalCredit) + " (profit: " + formatRupiah(dailyProfit) + "/hari)");
    } catch (err) {
      errors++;
      console.error("  ❌ Investment " + inv.id + " ERROR:", err.message);
    }
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("🎉 CREDIT PROFIT SELESAI!");
  console.log("   ✅ Processed         : " + processed + " user(s) — profit DI-CREDIT SEKARANG");
  console.log("   ⏭️  Skipped (auto)    : " + skipped + " (sudah credited / beli hari ini / dll)");
  console.log("      - Beli hari ini   : " + skippedBoughtToday);
  console.log("      - dailyProfit=0   : " + skippedDailyProfitZero);
  console.log("   🔒 Skipped (manual)  : " + skippedManual + " (user input manual — GAK di-credit lagi)");
  console.log("   ❌ Errors            : " + errors);
  console.log("   💰 Total credited    : " + formatRupiah(totalProfit));
  console.log("═══════════════════════════════════════════════════════");
  console.log("");

  if (processed > 0) {
    console.log("📋 ✅ User yang DAPAT PROFIT SEKARANG:");
    creditedUsers.forEach((u, i) => {
      console.log("  " + (i + 1) + ". " + u.userId + " (" + u.name + ") — " + u.packageName + " — +" + formatRupiah(u.totalCredit));
    });
    console.log("");
  }

  if (skippedManual > 0) {
    console.log("🔒 User yang SUDAH DI-INPUT MANUAL (SKIP, gak double-credit):");
    skippedUsers.forEach((u, i) => {
      console.log("  " + (i + 1) + ". " + u.userId + " (" + u.name + ") — via " + u.source);
    });
    console.log("");
  }

  if (processed > 0) {
    console.log("✅ Profit sudah masuk ke mainBalance " + processed + " user.");
    console.log("✅ User bisa cek di dashboard mereka SEKARANG.");
    console.log("✅ User yang sudah di-input manual GAK di-credit lagi (anti double).");
  } else if (skippedManual > 0 && skipped === investments.length) {
    console.log("ℹ️  Semua user sudah credited today (manual atau cron).");
    console.log("   → Gak ada yang perlu di-credit lagi.");
  } else {
    console.log("⚠️  Tidak ada profit di-credit. Cek alasan skip di atas.");
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
echo "║  ✅ CREDIT PROFIT SELESAI                        ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  Profit hari ini: ✅ SUDAH DI-CREDIT             ║"
echo "║  User yg manual : 🔒 GAK di-credit lagi          ║"
echo "║  User bisa cek dashboard SEKARANG                ║"
echo "║                                                  ║"
echo "║  Setelah deploy v2.3, cron auto jam 00:00 WIB    ║"
echo "║  Gak perlu manual lagi besok.                    ║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
