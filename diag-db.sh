#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO — DIAGNOSTIC DB (PURE READ, NO CHANGES)
# ════════════════════════════════════════════════════════════════
# Script ini CUMA BACA database — gak rubah/hapus apapun.
# Buat lihat persis apa yang ada di VPS DB.
#
# CARA PAKAI: cd /var/www/nexvo && bash diag-db.sh
# ════════════════════════════════════════════════════════════════

set +e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  NEXVO DIAGNOSTIC DB (READ ONLY)                 ║"
echo "║  🔒 Gak rubah/hapus apapun, cuma baca            ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

PROJECT_DIR=""
for candidate in "/var/www/nexvo" "/home/nexvo" "/var/www/html/nexvo" "$(pwd)"; do
  if [ -f "$candidate/package.json" ] && [ -f "$candidate/.env" ]; then
    PROJECT_DIR="$candidate"
    break
  fi
done

if [ -z "$PROJECT_DIR" ]; then
  echo "❌ Project tidak ditemukan!"
  exit 1
fi

cd "$PROJECT_DIR"

bun -e '
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

let DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  for (const ep of [path.join(process.cwd(), ".env"), "/var/www/nexvo/.env"]) {
    if (fs.existsSync(ep)) {
      const c = fs.readFileSync(ep, "utf8");
      const m = c.match(/^DATABASE_URL=(.+)$/m);
      if (m) { DB_URL = m[1].trim().replace(/^["\x27]|["\x27]$/g, ""); break; }
    }
  }
}
if (!DB_URL) { console.error("❌ DATABASE_URL tidak ketemu!"); process.exit(1); }
console.log("📁 DB URL:", DB_URL);
console.log("");

const p = new PrismaClient({ datasources: { db: { url: DB_URL } } });

(async () => {
  console.log("═══════════════════════════════════════════════════");
  console.log("  TABLE COUNTS");
  console.log("═══════════════════════════════════════════════════");
  const [users, purchases, investments, bonusLogs, profitLogs, products, packages] = await Promise.all([
    p.user.count(),
    p.purchase.count(),
    p.investment.count(),
    p.bonusLog.count(),
    p.profitLog.count(),
    p.product.count(),
    p.investmentPackage.count(),
  ]);
  console.log("👥 Users             :", users);
  console.log("🛒 Purchases         :", purchases);
  console.log("📈 Investments       :", investments);
  console.log("📝 BonusLogs         :", bonusLogs);
  console.log("💰 ProfitLogs        :", profitLogs);
  console.log("📦 Products          :", products);
  console.log("🎁 InvestmentPackages:", packages);
  console.log("");

  console.log("═══════════════════════════════════════════════════");
  console.log("  PURCHASE BY STATUS");
  console.log("═══════════════════════════════════════════════════");
  const purByStatus = await p.purchase.groupBy({ by: ["status"], _count: true });
  for (const s of purByStatus) console.log("  status=" + JSON.stringify(s.status) + " → count=" + s._count);
  console.log("");

  console.log("═══════════════════════════════════════════════════");
  console.log("  INVESTMENT BY STATUS");
  console.log("═══════════════════════════════════════════════════");
  const invByStatus = await p.investment.groupBy({ by: ["status"], _count: true });
  for (const s of invByStatus) console.log("  status=" + JSON.stringify(s.status) + " → count=" + s._count);
  console.log("");

  console.log("═══════════════════════════════════════════════════");
  console.log("  ALL PURCHASES (with product + linked investment)");
  console.log("═══════════════════════════════════════════════════");
  const allPurchases = await p.purchase.findMany({
    include: {
      product: { select: { name: true, price: true, profitRate: true, duration: true } },
      user: { select: { userId: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  for (const pur of allPurchases) {
    const linkedInv = await p.investment.findFirst({ where: { purchaseId: pur.id } });
    console.log("  • " + pur.user?.userId + " (" + pur.user?.name + ")");
    console.log("    Product: " + pur.product?.name + " — price=" + pur.product?.price + " — rate=" + pur.product?.profitRate + "%");
    console.log("    Purchase: status=" + JSON.stringify(pur.status) + " — qty=" + pur.quantity + " — totalPrice=" + pur.totalPrice);
    console.log("    Purchase dailyProfit=" + pur.dailyProfit + " — profitEarned=" + pur.profitEarned + " — lastProfitDate=" + (pur.lastProfitDate || "null"));
    if (linkedInv) {
      console.log("    → Linked Investment: id=" + linkedInv.id.slice(-8) + " — status=" + linkedInv.status + " — dailyProfit=" + linkedInv.dailyProfit + " — totalProfitEarned=" + linkedInv.totalProfitEarned + " — lastProfitDate=" + (linkedInv.lastProfitDate || "null") + " — endDate=" + (linkedInv.endDate || "null"));
    } else {
      console.log("    → ❌ NO linked Investment (cron gak bakal credit profit!)");
    }
    console.log("");
  }

  console.log("═══════════════════════════════════════════════════");
  console.log("  BONUSLOG BY TYPE (last 30 days)");
  console.log("═══════════════════════════════════════════════════");
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const bonusByType = await p.bonusLog.groupBy({
    by: ["type"],
    _count: true,
    _sum: { amount: true },
    where: { createdAt: { gte: thirtyDaysAgo } },
  });
  for (const b of bonusByType) console.log("  type=" + JSON.stringify(b.type) + " → count=" + b._count + " — total=" + b._sum.amount);
  console.log("");

  console.log("═══════════════════════════════════════════════════");
  console.log("  PROFITLOG (last 30 days)");
  console.log("═══════════════════════════════════════════════════");
  const recentProfitLogs = await p.profitLog.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  for (const pl of recentProfitLogs) {
    console.log("  • " + new Date(pl.createdAt).toISOString() + " — user=" + pl.userId.slice(-8) + " — amount=" + pl.amount);
  }
  console.log("");

  await p.$disconnect();
  console.log("✅ Diagnostic selesai. Tidak ada data yang diubah.");
})().catch(e => {
  console.error("❌ ERROR:", e.message);
  process.exit(1);
});
' 2>&1

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  ✅ DIAGNOSTIC SELESAI — TIDAK ADA DATA DIUBAH   ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
