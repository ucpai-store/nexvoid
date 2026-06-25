#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO — Restore Default Products & Packages
#  Run this if your products/packages disappeared after deploy
#
#  Usage:
#    curl -fsSL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/restore-products.sh | bash
#    bash restore-products.sh
# ═══════════════════════════════════════════════════════════════
set -eo pipefail

C_GREEN='\033[0;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[0;31m'; C_CYAN='\033[1;36m'; C_NC='\033[0m'
ok()   { echo -e "${C_GREEN}✓${C_NC} $*"; }
warn() { echo -e "${C_YELLOW}⚠${C_NC} $*"; }
err()  { echo -e "${C_RED}✗${C_NC} $*" >&2; }

# Detect app dir
if [ -n "$APP_DIR" ]; then :; elif [ -f "$0" ] && [ "$(dirname "$0")" != "." ]; then APP_DIR="$(cd "$(dirname "$0")" && pwd)"; else APP_DIR="${HOME}/nexvo"; fi

ABS_DB_PATH="$APP_DIR/db/custom.db"

if [ ! -d "$APP_DIR" ]; then
  err "App directory not found: $APP_DIR"
  err "Set APP_DIR env var or run from the nexvo project root"
  exit 1
fi

cd "$APP_DIR"

if [ ! -f "package.json" ]; then
  err "package.json not found in $APP_DIR"
  exit 1
fi

if [ ! -f "$ABS_DB_PATH" ]; then
  warn "DB file not found at $ABS_DB_PATH — creating fresh..."
  mkdir -p "$APP_DIR/db"
  export DATABASE_URL="file:$ABS_DB_PATH"
  bun run db:generate 2>&1 | tail -3
  bun run db:push 2>&1 | tail -3
fi

export DATABASE_URL="file:$ABS_DB_PATH"

echo -e "\n${C_CYAN}══════ Restoring Default Products & Packages ══════${C_NC}"
echo "App dir: $APP_DIR"
echo "DB:      $ABS_DB_PATH"
echo ""

# Backup current DB first
if [ -f "$ABS_DB_PATH" ]; then
  BACKUP="$ABS_DB_PATH.backup-restore-$(date +%Y%m%d-%H%M%S)"
  cp "$ABS_DB_PATH" "$BACKUP" 2>/dev/null && ok "DB backed up → $BACKUP" || warn "backup failed"
fi

# Run the restore via bun
bun -e '
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

(async () => {
  console.log("\n📋 Current state:");
  const [users, products, packages, banners, salaryCfg] = await Promise.all([
    db.user.count(),
    db.product.count(),
    db.investmentPackage.count(),
    db.banner.count(),
    db.salaryConfig.findFirst(),
  ]);
  console.log(`   Users:    ${users}`);
  console.log(`   Products: ${products}`);
  console.log(`   Packages: ${packages}`);
  console.log(`   Banners:  ${banners}`);
  console.log(`   Salary:   rate=${salaryCfg?.salaryRate}%, maxWeeks=${salaryCfg?.maxWeeks}`);

  // 1. Restore products if missing
  if (products === 0) {
    console.log("\n🌱 Restoring default products...");
    await db.product.createMany({ data: [
      { name: "Emas Starter Pack", price: 100000, duration: 30, estimatedProfit: 8000, quota: 500, quotaUsed: 342, description: "Paket investasi emas untuk pemula. Dapatkan keuntungan stabil dari pergerakan harga emas dengan modal minimal.", banner: "", isActive: true, isStopped: false, profitRate: 8.0 },
      { name: "Silver Mining Portfolio", price: 500000, duration: 60, estimatedProfit: 55000, quota: 300, quotaUsed: 187, description: "Portfolio penambangan perak dengan diversifikasi aset. Keuntungan lebih tinggi dari paket starter.", banner: "", isActive: true, isStopped: false, profitRate: 11.0 },
      { name: "Gold Premium Asset", price: 1000000, duration: 90, estimatedProfit: 150000, quota: 200, quotaUsed: 98, description: "Aset emas premium dengan estimasi profit tinggi. Kelola portofolio emas Anda secara profesional.", banner: "", isActive: true, isStopped: false, profitRate: 15.0 },
      { name: "Diamond Elite Investment", price: 5000000, duration: 120, estimatedProfit: 1000000, quota: 100, quotaUsed: 43, description: "Investasi berlian elite untuk investor serius. Akses eksklusif ke portfolio berlian dan mineral langka.", banner: "", isActive: true, isStopped: false, profitRate: 20.0 },
    ]});
    console.log("   ✓ 4 products restored");
  } else {
    console.log(`   ⏭️  Products already exist (${products}) — skipped`);
  }

  // 2. Restore investment packages if missing
  if (packages === 0) {
    console.log("\n🌱 Restoring default investment packages...");
    await db.investmentPackage.createMany({ data: [
      { name: "Paket Starter", amount: 500000, profitRate: 10, contractDays: 90, isActive: true, order: 1 },
      { name: "Paket Silver", amount: 1000000, profitRate: 10, contractDays: 90, isActive: true, order: 2 },
      { name: "Paket Gold", amount: 5000000, profitRate: 10, contractDays: 90, isActive: true, order: 3 },
      { name: "Paket Platinum", amount: 10000000, profitRate: 10, contractDays: 90, isActive: true, order: 4 },
    ]});
    console.log("   ✓ 4 packages restored");
  } else {
    console.log(`   ⏭️  Packages already exist (${packages}) — skipped`);
  }

  // 3. Restore banners if missing
  if (banners === 0) {
    console.log("\n🌱 Restoring default banners...");
    await db.banner.createMany({ data: [
      { title: "Mulai Investasi Aset Digital", subtitle: "Build Value, Grow Future", description: "Platform manajemen aset digital berbasis komoditas terpercaya.", ctaText: "Daftar Sekarang", ctaLink: "register", image: "", order: 1, isActive: true },
      { title: "Profit Hingga 20%", subtitle: "Gold Premium Asset", description: "Dapatkan keuntungan hingga 20% dari investasi aset emas premium.", ctaText: "Lihat Produk", ctaLink: "products", image: "", order: 2, isActive: true },
      { title: "Bonus Referral Besar", subtitle: "Ajak Teman, Raih Bonus", description: "Dapatkan bonus referral untuk setiap teman yang bergabung.", ctaText: "Pelajari Lebih", ctaLink: "register", image: "", order: 3, isActive: true },
      { title: "Penarikan Cepat & Aman", subtitle: "Proses 1x24 Jam", description: "Withdraw profit Anda dengan cepat dan aman.", ctaText: "Mulai Sekarang", ctaLink: "register", image: "", order: 4, isActive: true },
      { title: "Aset Digital Terdiversifikasi", subtitle: "Emas, Perak, Mineral", description: "Diversifikasi portofolio aset digital Anda dengan berbagai komoditas premium.", ctaText: "Jelajahi", ctaLink: "products", image: "", order: 5, isActive: true },
    ]});
    console.log("   ✓ 5 banners restored");
  } else {
    console.log(`   ⏭️  Banners already exist (${banners}) — skipped`);
  }

  // 4. Fix salary config (1%/week permanent)
  if (!salaryCfg) {
    console.log("\n🌱 Creating salary config...");
    await db.salaryConfig.create({ data: { minDirectRefs: 10, salaryRate: 1, maxWeeks: 0, requireActiveDeposit: true, fixedSalaryAmount: 25000, isActive: true }});
    console.log("   ✓ salary config created (1%/week, permanent)");
  } else if (salaryCfg.maxWeeks !== 0 || salaryCfg.salaryRate !== 1) {
    console.log("\n🔧 Fixing salary config...");
    await db.salaryConfig.update({ where: { id: salaryCfg.id }, data: { salaryRate: 1, maxWeeks: 0, minDirectRefs: 10, requireActiveDeposit: true, isActive: true }});
    console.log("   ✓ salary config fixed (1%/week, permanent)");
  } else {
    console.log("   ⏭️  Salary config already correct (1%/week, permanent)");
  }

  // 5. Create default admin if none
  if (users === 0) {
    console.log("\n🌱 Creating default admin...");
    const bcrypt = require("bcryptjs");
    const hashedPassword = await bcrypt.hash("Admin@2024", 8);
    await db.admin.create({ data: { username: "admin", email: "admin@nexvo.id", password: hashedPassword, name: "Super Admin", role: "super_admin" }});
    console.log("   ✓ admin created (username: admin, password: Admin@2024)");
  }

  // 6. Ensure matching config exists
  const matching = await db.matchingConfig.findFirst();
  if (!matching) {
    console.log("\n🌱 Creating matching config...");
    await db.matchingConfig.create({ data: { level1: 5, level2: 4, level3: 3, level4: 2, level5: 1, isActive: true }});
    console.log("   ✓ matching config created (5%, 4%, 3%, 2%, 1%)");
  }

  // Final summary
  console.log("\n📋 Final state:");
  const [finalUsers, finalProducts, finalPackages, finalBanners] = await Promise.all([
    db.user.count(),
    db.product.count(),
    db.investmentPackage.count(),
    db.banner.count(),
  ]);
  console.log(`   Users:    ${finalUsers}`);
  console.log(`   Products: ${finalProducts}`);
  console.log(`   Packages: ${finalPackages}`);
  console.log(`   Banners:  ${finalBanners}`);

  await db.$disconnect();
  console.log("\n✅ Restore complete!");
})().catch(e => { console.error("❌ Error:", e.message); process.exit(1); });
' 2>&1

echo ""
ok "Done. Products & packages restored."
echo ""
echo "Next steps:"
echo "  1. Restart nexvo-app:    pm2 restart nexvo-app"
echo "  2. Check admin panel:    http://localhost:3000/#admin-login"
echo "     (username: admin, password: Admin@2024)"
echo ""
