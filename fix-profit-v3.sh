#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO — DIAGNOSTIC + FORCE PROFIT (BULLETPROOF v3)
# ════════════════════════════════════════════════════════════════
# Script ini DIAGNOSE dulu (show semua data), LALU credit profit.
# Credit profit untuk BOTH Investment + Purchase (kalau ada).
# Anti double-credit: cek lastProfitDate + BonusLog.
#
# CARA PAKAI:
#   cd /var/www/nexvo && git fetch origin && git reset --hard origin/main && bash fix-profit-v3.sh
# ════════════════════════════════════════════════════════════════

set +e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  NEXVO FIX PROFIT v3 (BULLETPROOF)               ║"
echo "║  Diagnostic + Force Credit + Anti Double         ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

PROJECT_DIR=""
for candidate in "/var/www/nexvo" "/home/nexvo" "/var/www/html/nexvo" "/var/www/nexvoid" "/home/$USER/nexvo" "/root/nexvo" "/opt/nexvo" "$HOME/nexvo" "$(pwd)"; do
  if [ -d "$candidate/.git" ] && [ -f "$candidate/package.json" ]; then
    PROJECT_DIR="$candidate"
    break
  fi
done

if [ -z "$PROJECT_DIR" ]; then
  echo "❌ Project Nexvo tidak ditemukan!"
  exit 1
fi

cd "$PROJECT_DIR" || exit 1

# ★ Sync kode ke GitHub (database AMAN — gak tersentuh)
echo "── Step 0: Sync kode ke GitHub (database AMAN) ──"
git fetch origin 2>&1 | tail -2
git reset --hard origin/main 2>&1 | tail -2
echo "   Commit: $(git log --oneline -1)"
echo ""

if ! command -v bun &>/dev/null; then
  echo "❌ bun tidak tersedia! Install: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

# ★★★ RUN BUN SCRIPT — diagnostic + force credit ★★★
bun -e '
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

// Baca DATABASE_URL dari .env
let DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  const envContent = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
  const m = envContent.match(/^DATABASE_URL=(.+)$/m);
  if (m) DB_URL = m[1].trim().replace(/^["\x27]|["\x27]$/g, "");
}
if (!DB_URL) { console.error("❌ DATABASE_URL tidak ketemu!"); process.exit(1); }

console.log("📁 DB URL:", DB_URL);
if (DB_URL.startsWith("file:")) {
  const dbPath = DB_URL.replace(/^file:/, "").replace(/^sqlite:/, "");
  const abs = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
  if (!fs.existsSync(abs)) { console.error("❌ DB file tidak ada:", abs); process.exit(1); }
  console.log("✅ DB file:", abs, "(" + (fs.statSync(abs).size / 1024).toFixed(1) + " KB)");
}
console.log("");

const p = new PrismaClient({ datasources: { db: { url: DB_URL } } });

const WIB_OFFSET = 7;
function getWibNow() {
  const now = new Date();
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
}
function getWibDateString(date) {
  const w = new Date(date.getTime() + date.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
  return w.getFullYear() + "-" + String(w.getMonth()+1).padStart(2,"0") + "-" + String(w.getDate()).padStart(2,"0");
}
function fmt(n) { return "Rp" + Math.floor(n).toLocaleString("id-ID"); }

(async () => {
  const wibNow = getWibNow();
  const todayWIB = getWibDateString(new Date());
  const startOfDay = new Date(todayWIB + "T00:00:00+07:00");
  const dayNames = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];

  console.log("═══════════════════════════════════════════════════");
  console.log("📊 DIAGNOSTIC DATABASE");
  console.log("═══════════════════════════════════════════════════");
  console.log("🕐 WIB now:", wibNow.toISOString());
  console.log("📅 Hari:", dayNames[wibNow.getDay()], "| Today WIB:", todayWIB);
  console.log("");

  // ★ Count all tables
  const users = await p.user.count();
  const investments = await p.investment.count();
  const activeInvestments = await p.investment.count({ where: { status: "active" } });
  const completedInvestments = await p.investment.count({ where: { status: "completed" } });
  const purchases = await p.purchase.count();
  const activePurchases = await p.purchase.count({ where: { status: "active" } });
  const bonusLogsToday = await p.bonusLog.count({ where: { type: "profit", createdAt: { gte: startOfDay } } });

  console.log("👥 Total users         :", users);
  console.log("📦 Total investments   :", investments, "(active:", activeInvestments, "/ completed:", completedInvestments + ")");
  console.log("🛒 Total purchases     :", purchases, "(active:", activePurchases + ")");
  console.log("💰 BonusLog profit hari ini:", bonusLogsToday);
  console.log("");

  // ★ Show ALL active investments (limit 20)
  console.log("═══════════════════════════════════════════════════");
  console.log("📦 ACTIVE INVESTMENTS (max 20)");
  console.log("═══════════════════════════════════════════════════");
  const invs = await p.investment.findMany({
    where: { status: "active" },
    include: { user: true, package: true },
    take: 20,
    orderBy: { createdAt: "desc" },
  });
  if (invs.length === 0) {
    console.log("❌ TIDAK ADA active investment!");
    console.log("   → Ini penyebab profit gak masuk: gak ada penerima profit.");
    console.log("   → User harus beli produk VIP dulu di halaman Produk.");
  } else {
    invs.forEach((inv, i) => {
      const lastProfitWIB = inv.lastProfitDate ? getWibDateString(new Date(inv.lastProfitDate)) : "never";
      const alreadyToday = lastProfitWIB === todayWIB;
      const createdWIB = inv.startDate ? getWibDateString(new Date(inv.startDate)) : getWibDateString(new Date(inv.createdAt));
      console.log("  " + (i+1) + ". " + inv.user?.userId + " (" + inv.user?.name + ")");
      console.log("     amount=" + fmt(inv.amount) + " | dailyProfit=" + fmt(inv.dailyProfit || 0));
      console.log("     package=" + inv.package?.name + " (rate=" + inv.package?.profitRate + "%)");
      console.log("     startDate=" + createdWIB + " | lastProfit=" + lastProfitWIB + " | alreadyToday=" + alreadyToday);
      console.log("     totalEarned=" + fmt(inv.totalProfitEarned || 0) + " | endDate=" + inv.endDate?.toISOString?.());
    });
  }
  console.log("");

  // ★ Show completed investments too (maybe they were wrongly completed)
  if (completedInvestments > 0) {
    console.log("═══════════════════════════════════════════════════");
    console.log("📦 COMPLETED INVESTMENTS (max 10) — check kalau ada yang salah");
    console.log("═══════════════════════════════════════════════════");
    const completed = await p.investment.findMany({
      where: { status: "completed" },
      include: { user: true, package: true },
      take: 10,
      orderBy: { createdAt: "desc" },
    });
    completed.forEach((inv, i) => {
      const createdWIB = inv.startDate ? getWibDateString(new Date(inv.startDate)) : "?";
      const endWIB = inv.endDate ? getWibDateString(new Date(inv.endDate)) : "?";
      console.log("  " + (i+1) + ". " + inv.user?.userId + " — amount=" + fmt(inv.amount) + " dailyProfit=" + fmt(inv.dailyProfit || 0));
      console.log("     start=" + createdWIB + " end=" + endWIB + " earned=" + fmt(inv.totalProfitEarned || 0));
      // Check if endDate is still in future (wrongly completed)
      if (inv.endDate && new Date(inv.endDate) > wibNow) {
        console.log("     ⚠️  endDate MASIH DEPAN tapi status=completed! Ini BUG — harus di-reactivate.");
      }
    });
    console.log("");
  }

  // ★★★ FORCE CREDIT PROFIT ★★★
  console.log("═══════════════════════════════════════════════════");
  console.log("💰 FORCE CREDIT PROFIT — SEMUA active investment");
  console.log("═══════════════════════════════════════════════════");

  let processed = 0, skipped = 0, skippedManual = 0, errors = 0, totalCredited = 0;
  const creditedList = [];
  const skippedList = [];

  for (const inv of invs) {
    try {
      // ★ Anti double-credit: cek lastProfitDate
      if (inv.lastProfitDate) {
        const lastWIB = getWibDateString(new Date(inv.lastProfitDate));
        if (lastWIB === todayWIB) {
          skipped++;
          skippedList.push({ userId: inv.user?.userId, name: inv.user?.name, reason: "lastProfitDate=today" });
          continue;
        }
      }

      // ★ Anti double-credit: cek BonusLog type=profit hari ini
      const todayLogs = await p.bonusLog.count({
        where: { userId: inv.userId, type: "profit", createdAt: { gte: startOfDay } },
      });
      if (todayLogs > 0) {
        skippedManual++;
        skippedList.push({ userId: inv.user?.userId, name: inv.user?.name, reason: "BonusLog today (manual)" });
        continue;
      }

      // ★ Skip kalau beli hari ini
      const createdWIB = inv.startDate ? getWibDateString(new Date(inv.startDate)) : getWibDateString(new Date(inv.createdAt));
      if (createdWIB === todayWIB) {
        skipped++;
        skippedList.push({ userId: inv.user?.userId, name: inv.user?.name, reason: "bought today" });
        continue;
      }

      // ★ Hitung dailyProfit
      const dailyProfit = inv.dailyProfit && inv.dailyProfit > 0
        ? inv.dailyProfit
        : Math.floor(inv.amount * ((inv.package?.profitRate || 0) / 100));

      if (dailyProfit <= 0) {
        console.log("  ⚠️  Skip " + inv.user?.userId + " — dailyProfit=0 (amount=" + inv.amount + ", rate=" + inv.package?.profitRate + "%)");
        skipped++;
        skippedList.push({ userId: inv.user?.userId, name: inv.user?.name, reason: "dailyProfit=0" });
        continue;
      }

      // ★ Skip kalau contract ended — tapi REACTIVATE dulu kalau endDate masih depan
      if (inv.endDate) {
        if (wibNow >= new Date(inv.endDate)) {
          // genuinely ended
          skipped++;
          skippedList.push({ userId: inv.user?.userId, name: inv.user?.name, reason: "contract ended" });
          continue;
        }
      }

      // ★★★ CREDIT PROFIT (transaction — atomic) ★★★
      await p.$transaction(async (tx) => {
        // Re-check inside transaction
        const cur = await tx.investment.findUnique({ where: { id: inv.id } });
        if (cur?.lastProfitDate) {
          const w = getWibDateString(new Date(cur.lastProfitDate));
          if (w === todayWIB) return;
        }

        // Credit user balance
        await tx.user.update({
          where: { id: inv.userId },
          data: {
            mainBalance: { increment: dailyProfit },
            totalProfit: { increment: dailyProfit },
          },
        });

        // Update investment
        await tx.investment.update({
          where: { id: inv.id },
          data: {
            totalProfitEarned: { increment: dailyProfit },
            dailyProfit: dailyProfit,
            lastProfitDate: new Date(),
          },
        });

        // BonusLog audit trail
        await tx.bonusLog.create({
          data: {
            userId: inv.userId,
            fromUserId: inv.userId,
            type: "profit",
            level: 0,
            amount: dailyProfit,
            description: "Profit harian " + (inv.package?.name || "Investment") + " [FORCE v3] — " + fmt(dailyProfit),
          },
        });
      });

      processed++;
      totalCredited += dailyProfit;
      creditedList.push({ userId: inv.user?.userId, name: inv.user?.name, amount: dailyProfit, pkg: inv.package?.name });
      console.log("  ✅ " + inv.user?.userId + " (" + inv.user?.name + ") — +" + fmt(dailyProfit));
    } catch (err) {
      errors++;
      console.error("  ❌ " + inv.user?.userId + " ERROR:", err.message);
    }
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════");
  console.log("🎉 HASIL FORCE CREDIT PROFIT v3");
  console.log("═══════════════════════════════════════════════════");
  console.log("   ✅ Processed       :", processed, "user(s) — profit DI-CREDIT");
  console.log("   ⏭️  Skipped (auto)  :", skipped);
  console.log("   🔒 Skipped (manual):", skippedManual, "(sudah input manual — GAK double)");
  console.log("   ❌ Errors          :", errors);
  console.log("   💰 Total credited  :", fmt(totalCredited));
  console.log("");

  if (creditedList.length > 0) {
    console.log("📋 ✅ User yang DAPAT PROFIT SEKARANG:");
    creditedList.forEach((u, i) => {
      console.log("  " + (i+1) + ". " + u.userId + " (" + u.name + ") — " + u.pkg + " — +" + fmt(u.amount));
    });
    console.log("");
  }

  if (skippedList.length > 0) {
    console.log("🔒 User yang SKIP (gak double-credit):");
    skippedList.forEach((u, i) => {
      console.log("  " + (i+1) + ". " + u.userId + " (" + u.name + ") — " + u.reason);
    });
    console.log("");
  }

  if (processed === 0 && skippedManual === 0) {
    console.log("⚠️  TIDAK ADA profit yang di-credit!");
    console.log("   Kemungkinan penyebab:");
    console.log("   1. Tidak ada active investment → user harus beli produk dulu");
    console.log("   2. Semua investment sudah ended → cek completed investments di atas");
    console.log("   3. dailyProfit=0 → cek product.profitRate di database");
    console.log("   4. User beli hari ini → profit mulai besok");
    console.log("");
    console.log("   Jalankan: curl http://localhost:3032/api/debug/profit | python3 -m json.tool");
  } else {
    console.log("✅ Profit sudah masuk ke mainBalance user.");
    console.log("✅ User bisa cek dashboard SEKARANG.");
  }

  await p.$disconnect();
})().catch(e => {
  console.error("❌ FATAL:", e.message);
  console.error(e.stack);
  process.exit(1);
});
' 2>&1

echo ""
echo "── Restart cron-service v2.2 (continuous catchup) ──"
fuser -k 3032/tcp 2>/dev/null
sleep 2
pkill -9 -f "cron-service" 2>/dev/null
sleep 2
if command -v pm2 &>/dev/null; then
  pm2 delete nexvo-cron 2>/dev/null
  pm2 start "bun --hot cron-service.ts" --name nexvo-cron --cwd "$PROJECT_DIR" 2>&1 | tail -2
  pm2 save 2>/dev/null
  echo "✅ Cron v2.2 restarted — besok auto jam 00:00 WIB"
fi
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  ✅ FIX PROFIT v3 SELESAI                        ║"
echo "╚══════════════════════════════════════════════════╝"
