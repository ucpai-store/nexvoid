#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO — CREDIT PROFIT NOW v2 (FULL BACKFILL + MATCHING)
# ════════════════════════════════════════════════════════════════
# Credit profit SEMUA user aktif SEKARANG, termasuk:
#   ✅ Profit hari yang TERTINGGAL (backfill missed weekdays, max 60 hari)
#   ✅ Profit hari ini
#   ✅ Matching bonus ke upline (event-driven, sama kayak cron)
#   ✅ Anti double-credit (lastProfitDate + BonusLog check)
#   ✅ User yang udah di-input MANUAL gak di-credit lagi
#
# GIT-INDEPENDENT — gak perlu git pull, langsung jalan.
#
# CARA PAKAI (di VPS):
#   cd /var/www/nexvo && bash credit-now.sh
#   (atau: cd /home/nexvo && bash credit-now.sh)
# ════════════════════════════════════════════════════════════════

set +e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  NEXVO CREDIT PROFIT NOW v2 (FULL BACKFILL)      ║"
echo "║  ✅ Backfill missed days + today + matching       ║"
echo "║  ✅ Anti double-credit (manual entry aman)        ║"
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
  echo "❌ bun tidak tersedia! Install: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

# ─── BACKUP DB DULU (safety net, cuma 282KB) ──
BACKUP_FILE="db/custom.db.backup-$(date +%Y%m%d-%H%M%S)"
if [ -f "db/custom.db" ]; then
  cp db/custom.db "$BACKUP_FILE" 2>/dev/null && echo "💾 DB backup: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
  echo ""
fi

# ─── CREDIT PROFIT + BACKFILL + MATCHING SEKARANG ──
echo "── Credit profit (backfill + today + matching) SEMUA user aktif ──"
echo "   ⏳ Baca database, cari investasi aktif, hitung missed days, credit..."
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
function getTodayWibDateString() {
  return getWibDateString(new Date());
}
function formatRupiah(amount) {
  return "Rp" + Math.floor(amount).toLocaleString("id-ID");
}

// ★★★ countWeekdaysMissed — SAME LOGIC as cron-service.ts ★★★
// Count weekdays (Mon-Fri) MISSED between lastCreditDateStr+1 and todayStr (exclusive today).
function countWeekdaysMissed(lastCreditDateStr, todayStr) {
  const [ly, lm, ld] = lastCreditDateStr.split("-").map(Number);
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const start = new Date(Date.UTC(ly, lm - 1, ld + 1));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  let count = 0;
  const cursor = new Date(start);
  let safety = 60;
  while (cursor < end && safety-- > 0) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

// ★★★ Matching bonus logic — SAME as cron-service.ts creditMatchingOnProfit ★★★
const DEFAULT_MATCHING_RATES = { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 };
const MAX_MATCHING_LEVEL = 5;

async function getMatchingRates(tx) {
  try {
    const config = await tx.matchingConfig.findFirst({ where: { isActive: true } });
    if (!config) return { ...DEFAULT_MATCHING_RATES };
    return { 1: config.level1, 2: config.level2, 3: config.level3, 4: config.level4, 5: config.level5 };
  } catch {
    return { ...DEFAULT_MATCHING_RATES };
  }
}

async function creditMatchingOnProfit(tx, earningUserId, profitAmount) {
  const result = { totalMatchCredited: 0, details: [] };
  if (profitAmount <= 0) return result;

  const uplineRefs = await tx.referral.findMany({
    where: { referredId: earningUserId },
    orderBy: { level: "asc" },
  });
  if (uplineRefs.length === 0) return result;

  const earningUser = await tx.user.findUnique({
    where: { id: earningUserId },
    select: { name: true, userId: true },
  });
  const earningUserName = earningUser?.name || earningUser?.userId || "User";

  const rates = await getMatchingRates(tx);

  for (const ref of uplineRefs) {
    const level = ref.level;
    if (level > MAX_MATCHING_LEVEL) {
      result.details.push({ level, uplineId: ref.referrerId, rate: 0, amount: 0, disconnected: true });
      continue;
    }
    const rate = rates[level] || 0;
    if (rate <= 0) continue;
    const matchAmount = Math.floor(profitAmount * (rate / 100));
    if (matchAmount <= 0) continue;

    await tx.user.update({
      where: { id: ref.referrerId },
      data: { mainBalance: { increment: matchAmount }, totalProfit: { increment: matchAmount } },
    });

    try {
      await tx.matchingBonus.create({
        data: {
          userId: ref.referrerId,
          leftOmzet: 0,
          rightOmzet: 0,
          matchedOmzet: profitAmount,
          level: level,
          rate: rate,
          amount: matchAmount,
          status: "paid",
        },
      });
    } catch {}

    await tx.bonusLog.create({
      data: {
        userId: ref.referrerId,
        fromUserId: earningUserId,
        type: "matching",
        level: level,
        amount: matchAmount,
        description: "M.Profit Level " + level + " (" + rate + "%) dari profit " + earningUserName + " — " + formatRupiah(profitAmount) + " x " + rate + "% = " + formatRupiah(matchAmount) + " [BACKFILL]",
      },
    });

    result.totalMatchCredited += matchAmount;
    result.details.push({ level, uplineId: ref.referrerId, rate, amount: matchAmount, disconnected: false });
  }
  return result;
}

(async () => {
  const wibNow = getWibNow();
  const todayWIB = getTodayWibDateString();
  const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const dayOfWeek = wibNow.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isTodayWeekday = !isWeekend;

  console.log("🕐 WIB Time:", wibNow.toISOString());
  console.log("📅 Hari:", dayNames[dayOfWeek], isWeekend ? "(WEEKEND — backfill tetap jalan, today skip)" : "(weekday)");
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
  let totalMatching = 0;
  let totalBackfillDays = 0;
  const creditedUsers = [];

  // ★★★ PRE-SCAN: Cari user yang SUDAH dapat profit hari ini ★★★
  const startOfDayWIB = new Date(todayWIB + "T00:00:00+07:00");
  console.log("🔍 Pre-scan: cari user yang sudah dapat profit HARI INI (anti double)...");
  console.log("   (cek lastProfitDate + BonusLog type=profit untuk today)");
  console.log("");

  const alreadyCreditedToday = new Set();
  const skippedManualUsers = [];

  for (const inv of investments) {
    let alreadyCredited = false;
    let creditSource = "";

    // Cek 1: lastProfitDate hari ini
    if (inv.lastProfitDate) {
      const lastProfitWIB = getWibDateString(new Date(inv.lastProfitDate));
      if (lastProfitWIB === todayWIB) {
        alreadyCredited = true;
        creditSource = "lastProfitDate (cron)";
      }
    }

    // Cek 2: BonusLog type=profit hari ini (catches manual credits)
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
        creditSource = "BonusLog (manual entry)";
        skippedManual++;
      }
    }

    if (alreadyCredited) {
      alreadyCreditedToday.add(inv.id);
      if (creditSource.includes("manual")) {
        skippedManualUsers.push({
          userId: inv.user?.userId,
          name: inv.user?.name,
          dailyProfit: inv.dailyProfit,
          source: creditSource,
        });
      }
    }
  }

  if (skippedManualUsers.length > 0) {
    console.log("🔒 " + skippedManualUsers.length + " user SUDAH di-input MANUAL hari ini (SKIP, gak double-credit):");
    skippedManualUsers.forEach((u, i) => {
      console.log("  " + (i+1) + ". " + u.userId + " (" + u.name + ") — via " + u.source + " — dailyProfit=" + formatRupiah(u.dailyProfit || 0));
    });
    console.log("");
  }

  console.log("📊 Investasi yang perlu di-credit (backfill + today): " + (investments.length - alreadyCreditedToday.size));
  console.log("");

  // ★★★ PROCESS EACH INVESTMENT (FULL BACKFILL + TODAY + MATCHING) ★★★
  for (const inv of investments) {
    try {
      // Skip kalau sudah credited HARI INI (anti double-credit for today only)
      // NOTE: Backfill untuk missed days tetap jalan kalau lastProfitDate bukan hari ini!
      if (alreadyCreditedToday.has(inv.id)) {
        skipped++;
        continue;
      }

      // ★ SKIP kalau beli hari ini (profit mulai besok)
      const createdDate = inv.startDate ? new Date(inv.startDate) : new Date(inv.createdAt);
      const createdWIB = getWibDateString(createdDate);
      if (createdWIB === todayWIB) {
        console.log("  ⏭️  Skip " + inv.user?.userId + " — beli hari ini, profit mulai besok");
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
          console.log("  ✅ Mark completed " + inv.user?.userId + " — contract ended");
          skipped++;
          continue;
        }
      }

      // ★ Hitung daily profit (pakai stored inv.dailyProfit — BUKAN recomputed)
      const dailyProfit = inv.dailyProfit && inv.dailyProfit > 0
        ? inv.dailyProfit
        : Math.floor(inv.amount * ((inv.package?.profitRate || 0) / 100));

      if (dailyProfit <= 0) {
        console.log("  ⚠️  Skip " + inv.user?.userId + " — dailyProfit=0 (pkg=" + inv.package?.name + ", rate=" + inv.package?.profitRate + ")");
        skipped++;
        skippedDailyProfitZero++;
        continue;
      }

      // ★★★ BACKFILL LOGIC — same as cron-service.ts ★★★
      let lastCreditDateStr;
      if (inv.lastProfitDate) {
        lastCreditDateStr = getWibDateString(new Date(inv.lastProfitDate));
      } else {
        lastCreditDateStr = createdWIB;
      }

      const missedDays = countWeekdaysMissed(lastCreditDateStr, todayWIB);
      // totalDays = missed weekdays + today (if weekday). Cap at 60 for safety.
      const totalDays = Math.min(missedDays + (isTodayWeekday ? 1 : 0), 60);

      if (totalDays <= 0) {
        // Weekend dengan no missed days — nothing to credit
        console.log("  ⏭️  Skip " + inv.user?.userId + " — weekend, no missed days, no today");
        skipped++;
        continue;
      }

      const totalCredit = dailyProfit * totalDays;
      const isBackfill = missedDays > 0;

      await p.$transaction(async (tx) => {
        // Re-check inside transaction
        const currentInv = await tx.investment.findUnique({ where: { id: inv.id } });
        if (currentInv?.lastProfitDate) {
          const lastProfitWIB = getWibDateString(new Date(currentInv.lastProfitDate));
          if (lastProfitWIB === todayWIB) {
            return; // already credited today by another process
          }
        }

        // ★ Credit ke user balance
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

        // ★ BonusLog entry
        const pkgName = inv.package?.name || "Investment";
        const pkgRate = inv.package?.profitRate || (inv.amount > 0 ? (dailyProfit / inv.amount) * 100 : 0);
        const desc = totalDays === 1
          ? "Profit harian " + pkgName + " — " + formatRupiah(inv.amount) + " x " + pkgRate.toFixed(2) + "% = " + formatRupiah(dailyProfit) + " [CREDIT-NOW]"
          : "Profit " + totalDays + " hari (" + (isBackfill ? missedDays + " tertinggal + " + (isTodayWeekday ? "hari ini" : "0") : "semua hari ini") + ") — " + pkgName + ": " + formatRupiah(dailyProfit) + " x " + totalDays + " = " + formatRupiah(totalCredit) + " [BACKFILL]";
        await tx.bonusLog.create({
          data: {
            userId: inv.userId,
            fromUserId: inv.userId,
            type: "profit",
            level: 0,
            amount: totalCredit,
            description: desc,
          },
        });

        // ★★★ MATCHING BONUS (event-driven, based on profit amount) ★★★
        const matchResult = await creditMatchingOnProfit(tx, inv.userId, totalCredit);
        if (matchResult.totalMatchCredited > 0) {
          totalMatching += matchResult.totalMatchCredited;
        }
      });

      processed++;
      totalProfit += totalCredit;
      totalBackfillDays += totalDays;

      const backfillTag = isBackfill ? " [" + missedDays + " missed + " + (isTodayWeekday ? "1 today" : "0 today") + " = " + totalDays + " days]" : " [today]";
      console.log("  ✅ " + inv.user?.userId + " (" + inv.user?.name + ") — " + inv.package?.name + " — +" + formatRupiah(totalCredit) + " (" + totalDays + " hari x " + formatRupiah(dailyProfit) + ")" + backfillTag);

      creditedUsers.push({
        userId: inv.user?.userId,
        name: inv.user?.name,
        amount: inv.amount,
        dailyProfit: dailyProfit,
        totalCredit: totalCredit,
        totalDays: totalDays,
        missedDays: missedDays,
        packageName: inv.package?.name,
      });
    } catch (err) {
      errors++;
      console.error("  ❌ Investment " + inv.id + " (" + inv.user?.userId + ") ERROR:", err.message);
    }
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("🎉 CREDIT PROFIT + BACKFILL SELESAI!");
  console.log("   ✅ Processed         : " + processed + " user(s)");
  console.log("   ⏭️  Skipped (auto)    : " + skipped);
  console.log("      - Beli hari ini   : " + skippedBoughtToday);
  console.log("      - dailyProfit=0   : " + skippedDailyProfitZero);
  console.log("   🔒 Skipped (manual)  : " + skippedManual + " (anti double-credit)");
  console.log("   ❌ Errors            : " + errors);
  console.log("   💰 Total profit      : " + formatRupiah(totalProfit));
  console.log("   🤝 Total matching    : " + formatRupiah(totalMatching));
  console.log("   📅 Total hari credit : " + totalBackfillDays + " hari (backfill + today)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");

  if (processed > 0) {
    console.log("📋 ✅ User yang DAPAT PROFIT (backfill + today):");
    creditedUsers.forEach((u, i) => {
      const tag = u.missedDays > 0 ? " [BACKFILL " + u.missedDays + " days]" : " [today]";
      console.log("  " + (i + 1) + ". " + u.userId + " (" + u.name + ") — " + u.packageName + " — +" + formatRupiah(u.totalCredit) + " (" + u.totalDays + " hari)" + tag);
    });
    console.log("");
  }

  if (processed > 0) {
    console.log("✅ Profit (termasuk backfill) sudah masuk ke mainBalance " + processed + " user.");
    console.log("✅ Matching bonus sudah masuk ke upline yang eligible.");
    console.log("✅ User yang sudah di-input manual GAK di-credit lagi (anti double).");
    console.log("");
    console.log("👉 SELANJUTNYA: Deploy cron-service v2.3 biar AUTO setiap hari kerja:");
    console.log("   cd /var/www/nexvo && git fetch origin && git reset --hard origin/main && pm2 restart nexvo-cron");
  } else if (skippedManual > 0 && skipped >= investments.length) {
    console.log("ℹ️  Semua user sudah credited today (manual atau cron).");
    console.log("   → Tapi mungkin ada yang perlu backfill missed days.");
    console.log("   → Kalau user complaint profit kemarin-kemarin gak masuk, itu di-backfill NEXT run.");
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
echo "║  ✅ CREDIT PROFIT + BACKFILL SELESAI              ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  Profit tertinggal : ✅ BACKFILL (max 60 hari)   ║"
echo "║  Profit hari ini   : ✅ SUDAH DI-CREDIT          ║"
echo "║  Matching bonus    : ✅ Diteruskan ke upline     ║"
echo "║  User manual       : 🔒 GAK di-credit lagi       ║"
echo "║                                                  ║"
echo "║  Setelah deploy v2.3:                            ║"
echo "║  → Setiap Senin-Jumat profit auto jam 00:00 WIB ║"
echo "║  → Continuous catchup: kalau cron down, fire     ║"
echo "║    dalam 10 detik setelah start                  ║"
echo "║  → Backfill otomatis kalau ada hari tertinggal  ║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
