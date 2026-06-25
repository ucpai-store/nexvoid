#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO — Restore Gold Premium Aset 1-6 (Packages + Products)
#  Run this if your products/packages disappeared after deploy
#
#  Yang di-restore:
#    - 6 Investment Packages: Gold Premium Aset 1 s/d 6
#    - 6 Products:            Gold Premium Aset 1 s/d 6
#    - 5 Payment methods (BCA, Mandiri, BNI, BRI, DANA, OVO, GoPay, ShopeePay)
#    - Banners (jika kosong)
#    - Salary config (1%/week PERMANEN)
#    - Matching config (5%,4%,3%,2%,1%)
#    - Default admin (username: admin, password: Admin@2024)
#
#  Spec investasi:
#    - Kontrak 180 hari
#    - Modal TIDAK dikembalikan
#    - User hanya terima profit harian
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

echo -e "\n${C_CYAN}══════ Restore Gold Premium Aset 1-6 ══════${C_NC}"
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
const bcrypt = require("bcryptjs");
const db = new PrismaClient();

const CONTRACT_DAYS = 180;
const QUOTA_HIGH = 9999;
const randBaseline = () => Math.floor(QUOTA_HIGH * (0.35 + Math.random() * 0.40));
const fmt = (n) => n.toLocaleString("id-ID");

(async () => {
  console.log("\n📋 Current state:");
  const [admins, users, productCount, packageCount, banners, salaryCfg, matchingCfg] = await Promise.all([
    db.admin.count(),
    db.user.count(),
    db.product.count(),
    db.investmentPackage.count(),
    db.banner.count(),
    db.salaryConfig.findFirst(),
    db.matchingConfig.findFirst(),
  ]);
  console.log(`   Admins:   ${admins}`);
  console.log(`   Users:    ${users}`);
  console.log(`   Products: ${productCount}`);
  console.log(`   Packages: ${packageCount}`);
  console.log(`   Banners:  ${banners}`);

  // ════════════════════════════════════════════════════════════
  // 1. INVESTMENT PACKAGES — Gold Premium Aset 1 s/d 6
  // ════════════════════════════════════════════════════════════
  console.log("\n📦 Restoring Investment Packages (Gold Premium Aset 1-6)...");
  const packages = [
    { name: "Gold Premium Aset 1", amount: 160000,    profitRate: 2,   contractDays: CONTRACT_DAYS, order: 1 },
    { name: "Gold Premium Aset 2", amount: 320000,    profitRate: 2.5, contractDays: CONTRACT_DAYS, order: 2 },
    { name: "Gold Premium Aset 3", amount: 640000,    profitRate: 3,   contractDays: CONTRACT_DAYS, order: 3 },
    { name: "Gold Premium Aset 4", amount: 1920000,   profitRate: 3.5, contractDays: CONTRACT_DAYS, order: 4 },
    { name: "Gold Premium Aset 5", amount: 5760000,   profitRate: 4,   contractDays: CONTRACT_DAYS, order: 5 },
    { name: "Gold Premium Aset 6", amount: 17280000,  profitRate: 5,   contractDays: CONTRACT_DAYS, order: 6 },
  ];

  // Cleanup: hapus paket lama yang namanya TIDAK termasuk 6 nama baru
  const validPkgNames = packages.map(p => p.name);
  const oldPkgs = await db.investmentPackage.findMany();
  let deletedPkgs = 0;
  for (const old of oldPkgs) {
    if (!validPkgNames.includes(old.name)) {
      try {
        try { await db.investment.deleteMany({ where: { packageId: old.id } }); } catch (_) {}
        await db.investmentPackage.delete({ where: { id: old.id } });
        console.log(`   🗑️  Hapus paket lama: ${old.name}`);
        deletedPkgs++;
      } catch (e) {
        console.log(`   ⚠️  Gagal hapus paket lama "${old.name}": ${e.message}`);
      }
    }
  }
  if (deletedPkgs > 0) console.log(`   ✓ ${deletedPkgs} paket lama dihapus`);

  for (const pkg of packages) {
    const existing = await db.investmentPackage.findFirst({ where: { name: pkg.name } });
    if (existing) {
      await db.investmentPackage.update({
        where: { id: existing.id },
        data: { amount: pkg.amount, profitRate: pkg.profitRate, contractDays: pkg.contractDays, order: pkg.order, isActive: true }
      });
      console.log(`   ✏️  Update: ${pkg.name} - Rp ${fmt(pkg.amount)} (${pkg.profitRate}% × ${pkg.contractDays} hari)`);
    } else {
      await db.investmentPackage.create({ data: pkg });
      console.log(`   ✅ Buat:   ${pkg.name} - Rp ${fmt(pkg.amount)} (${pkg.profitRate}% × ${pkg.contractDays} hari)`);
    }
  }
  console.log(`   📦 Total packages: ${packages.length}`);

  // ════════════════════════════════════════════════════════════
  // 2. PRODUCTS — Gold Premium Aset 1 s/d 6
  // ════════════════════════════════════════════════════════════
  console.log("\n🛒 Restoring Products (Gold Premium Aset 1-6)...");
  const products = [
    { name: "Gold Premium Aset 1", price: 160000,    duration: CONTRACT_DAYS, estimatedProfit: Math.round(160000   * 0.02  * CONTRACT_DAYS), quota: QUOTA_HIGH, quotaUsed: randBaseline(), profitRate: 2,   description: `Gold Premium Aset 1 - Rp 160.000. Profit 2%/hari = Rp 3.200/hari selama ${CONTRACT_DAYS} hari. Total profit Rp 576.000. Modal awal TIDAK dikembalikan, user hanya menerima profit.` },
    { name: "Gold Premium Aset 2", price: 320000,    duration: CONTRACT_DAYS, estimatedProfit: Math.round(320000   * 0.025 * CONTRACT_DAYS), quota: QUOTA_HIGH, quotaUsed: randBaseline(), profitRate: 2.5, description: `Gold Premium Aset 2 - Rp 320.000. Profit 2,5%/hari = Rp 8.000/hari selama ${CONTRACT_DAYS} hari. Total profit Rp 1.440.000. Modal awal TIDAK dikembalikan, user hanya menerima profit.` },
    { name: "Gold Premium Aset 3", price: 640000,    duration: CONTRACT_DAYS, estimatedProfit: Math.round(640000   * 0.03  * CONTRACT_DAYS), quota: QUOTA_HIGH, quotaUsed: randBaseline(), profitRate: 3,   description: `Gold Premium Aset 3 - Rp 640.000. Profit 3%/hari = Rp 19.200/hari selama ${CONTRACT_DAYS} hari. Total profit Rp 3.456.000. Modal awal TIDAK dikembalikan, user hanya menerima profit.` },
    { name: "Gold Premium Aset 4", price: 1920000,   duration: CONTRACT_DAYS, estimatedProfit: Math.round(1920000  * 0.035 * CONTRACT_DAYS), quota: QUOTA_HIGH, quotaUsed: randBaseline(), profitRate: 3.5, description: `Gold Premium Aset 4 - Rp 1.920.000. Profit 3,5%/hari = Rp 67.200/hari selama ${CONTRACT_DAYS} hari. Total profit Rp 12.096.000. Modal awal TIDAK dikembalikan, user hanya menerima profit.` },
    { name: "Gold Premium Aset 5", price: 5760000,   duration: CONTRACT_DAYS, estimatedProfit: Math.round(5760000  * 0.04  * CONTRACT_DAYS), quota: QUOTA_HIGH, quotaUsed: randBaseline(), profitRate: 4,   description: `Gold Premium Aset 5 - Rp 5.760.000. Profit 4%/hari = Rp 230.400/hari selama ${CONTRACT_DAYS} hari. Total profit Rp 41.472.000. Modal awal TIDAK dikembalikan, user hanya menerima profit.` },
    { name: "Gold Premium Aset 6", price: 17280000,  duration: CONTRACT_DAYS, estimatedProfit: Math.round(17280000 * 0.05  * CONTRACT_DAYS), quota: QUOTA_HIGH, quotaUsed: randBaseline(), profitRate: 5,   description: `Gold Premium Aset 6 - Rp 17.280.000. Profit 5%/hari = Rp 864.000/hari selama ${CONTRACT_DAYS} hari. Total profit Rp 155.520.000. Modal awal TIDAK dikembalikan, user hanya menerima profit.` },
  ];

  // Cleanup: hapus produk lama yang namanya TIDAK termasuk 6 nama baru
  const validProdNames = products.map(p => p.name);
  const oldProds = await db.product.findMany();
  let deletedProds = 0;
  for (const old of oldProds) {
    if (!validProdNames.includes(old.name)) {
      try {
        try { await db.purchase.deleteMany({ where: { productId: old.id } }); } catch (_) {}
        await db.product.delete({ where: { id: old.id } });
        console.log(`   🗑️  Hapus produk lama: ${old.name}`);
        deletedProds++;
      } catch (e) {
        console.log(`   ⚠️  Gagal hapus produk lama "${old.name}": ${e.message}`);
      }
    }
  }
  if (deletedProds > 0) console.log(`   ✓ ${deletedProds} produk lama dihapus`);

  for (const prod of products) {
    const existing = await db.product.findFirst({ where: { name: prod.name } });
    if (existing) {
      await db.product.update({
        where: { id: existing.id },
        data: { ...prod, isActive: true, isStopped: false }
      });
      console.log(`   ✏️  Update: ${prod.name} - Rp ${fmt(prod.price)} → profit ${fmt(prod.estimatedProfit)} (${prod.duration} hari)`);
    } else {
      await db.product.create({ data: prod });
      console.log(`   ✅ Buat:   ${prod.name} - Rp ${fmt(prod.price)} → profit ${fmt(prod.estimatedProfit)} (${prod.duration} hari)`);
    }
  }
  console.log(`   🛒 Total products: ${products.length}`);

  // ════════════════════════════════════════════════════════════
  // 3. SALARY CONFIG — 1%/week PERMANEN (maxWeeks=0)
  // ════════════════════════════════════════════════════════════
  console.log("\n💰 Salary config (1%/week PERMANEN)...");
  if (!salaryCfg) {
    await db.salaryConfig.create({ data: { minDirectRefs: 10, salaryRate: 1, maxWeeks: 0, requireActiveDeposit: true, fixedSalaryAmount: 25000, isActive: true }});
    console.log("   ✅ salary config created (1%/week, PERMANEN)");
  } else {
    await db.salaryConfig.update({
      where: { id: salaryCfg.id },
      data: { salaryRate: 1, maxWeeks: 0, minDirectRefs: 10, requireActiveDeposit: true, fixedSalaryAmount: 25000, isActive: true }
    });
    console.log("   ✏️  salary config updated (1%/week, PERMANEN)");
  }

  // ════════════════════════════════════════════════════════════
  // 4. MATCHING CONFIG — 5%,4%,3%,2%,1%
  // ════════════════════════════════════════════════════════════
  console.log("\n🤝 Matching config (5%,4%,3%,2%,1%)...");
  if (!matchingCfg) {
    await db.matchingConfig.create({ data: { level1: 5, level2: 4, level3: 3, level4: 2, level5: 1, isActive: true }});
    console.log("   ✅ matching config created");
  } else {
    console.log("   ⏭️  matching config already exists");
  }

  // ════════════════════════════════════════════════════════════
  // 5. BANNERS (jika kosong)
  // ════════════════════════════════════════════════════════════
  if (banners === 0) {
    console.log("\n🖼️  Restoring banners...");
    await db.banner.createMany({ data: [
      { title: "Selamat Datang di NEXVO", subtitle: "Platform Investasi Digital #1", description: "NEXVO menghadirkan solusi investasi digital berbasis komoditas yang aman, transparan, dan menguntungkan. Mulai perjalanan investasi Anda dengan profit harian terukur dan sistem keamanan berlapis.", ctaText: "Mulai Sekarang", ctaLink: "register", image: "/images/banner-1.jpg", order: 1, isActive: true },
      { title: "Profit Harian Hingga 5%", subtitle: "Investasi Cerdas, Hasil Maksimal", description: `Dapatkan profit harian hingga 5% selama ${CONTRACT_DAYS} hari kontrak. Hanya profit yang dibayarkan — modal awal TIDAK dikembalikan.`, ctaText: "Lihat Paket", ctaLink: "paket", image: "/images/banner-2.jpg", order: 2, isActive: true },
      { title: "Bonus Sponsor 5 Level", subtitle: "Ajak Teman, Raih Bonus", description: "Dapatkan bonus sponsor hingga 5 level: 5%, 4%, 3%, 2%, 1%. Semakin banyak referral, semakin besar bonus Anda!", ctaText: "Lihat Jaringan", ctaLink: "network", image: "/images/banner-3.jpg", order: 3, isActive: true },
    ]});
    console.log("   ✅ 3 banners restored");
  } else {
    console.log(`\n🖼️  Banners already exist (${banners}) — skipped`);
  }

  // ════════════════════════════════════════════════════════════
  // 6. PAYMENT METHODS — QRIS + USDT (yang dipakai deposit page)
  // ════════════════════════════════════════════════════════════
  // Deposit page filter: WHERE type IN ('qris','usdt')
  // Jadi kita HANYA simpan qris + usdt. Bank/ewallet lama dihapus
  // karena nggak pernah ditampilkan ke user.
  console.log("\n💳 Sync payment methods (QRIS + USDT)...");

  // Cleanup: hapus semua payment method yang typenya BUKAN qris/usdt
  const legacyPms = await db.paymentMethod.findMany({ where: { NOT: { type: { in: ["qris", "usdt"] } } }});
  for (const legacy of legacyPms) {
    try { await db.paymentMethod.delete({ where: { id: legacy.id } }); } catch (_) {}
  }
  if (legacyPms.length > 0) console.log(`   🗑️  Hapus ${legacyPms.length} payment method lama (bank/ewallet)`);

  // Pastikan QRIS ada
  let qrisPm = await db.paymentMethod.findFirst({ where: { type: "qris" }});
  if (!qrisPm) {
    qrisPm = await db.paymentMethod.create({ data: {
      type: "qris", name: "QRIS Universal", accountNo: "", holderName: "NEXVO",
      qrImage: "", iconUrl: "", color: "#E31E24", isActive: true, order: 1,
    }});
    console.log("   ✅ QRIS created (qrImage belum diisi — admin upload via panel)");
  } else {
    // pastikan isActive=true & nama standar
    await db.paymentMethod.update({ where: { id: qrisPm.id }, data: { name: "QRIS Universal", isActive: true, order: 1, color: "#E31E24" }});
    console.log(`   ✏️  QRIS updated (qrImage: ${qrisPm.qrImage ? "sudah ada" : "belum ada"})`);
  }

  // Pastikan USDT ada
  let usdtPm = await db.paymentMethod.findFirst({ where: { type: "usdt" }});
  if (!usdtPm) {
    usdtPm = await db.paymentMethod.create({ data: {
      type: "usdt", name: "USDT (BEP20)", accountNo: "", holderName: "NEXVO",
      qrImage: "", iconUrl: "", color: "#26A17B", isActive: true, order: 2,
    }});
    console.log("   ✅ USDT created (accountNo belum diisi — admin isi wallet via panel)");
  } else {
    await db.paymentMethod.update({ where: { id: usdtPm.id }, data: { name: "USDT (BEP20)", isActive: true, order: 2, color: "#26A17B" }});
    console.log(`   ✏️  USDT updated (accountNo: ${usdtPm.accountNo ? "sudah ada" : "belum ada"})`);
  }
  console.log("   💡 Admin wajib upload QR QRIS & isi wallet USDT via panel Deposit → Payment Methods");

  // ════════════════════════════════════════════════════════════
  // 7. DEFAULT ADMIN (jika belum ada)
  // ════════════════════════════════════════════════════════════
  if (admins === 0) {
    console.log("\n👑 Creating default admin...");
    const hashedPassword = await bcrypt.hash("Admin@2024", 8);
    await db.admin.create({ data: { username: "admin", email: "admin@nexvo.id", password: hashedPassword, name: "Super Admin", role: "super_admin" }});
    console.log("   ✅ admin created (username: admin, password: Admin@2024)");
  } else {
    console.log(`\n👑 Admin already exists (${admins}) — skipped`);
  }

  // ════════════════════════════════════════════════════════════
  // FINAL SUMMARY
  // ════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(60));
  console.log("📋 FINAL STATE:");
  const [fAdmins, fUsers, fProducts, fPackages, fBanners, fQris, fUsdt] = await Promise.all([
    db.admin.count(),
    db.user.count(),
    db.product.count(),
    db.investmentPackage.count(),
    db.banner.count(),
    db.paymentMethod.findFirst({ where: { type: "qris" }}),
    db.paymentMethod.findFirst({ where: { type: "usdt" }}),
  ]);
  console.log(`   Admins:   ${fAdmins}`);
  console.log(`   Users:    ${fUsers}`);
  console.log(`   Products: ${fProducts}`);
  console.log(`   Packages: ${fPackages}`);
  console.log(`   Banners:  ${fBanners}`);
  console.log(`   QRIS:     ${fQris ? "✓ ada" : "✗ MISSING"} (qrImage: ${fQris?.qrImage ? "sudah diupload" : "BELUM — admin upload via panel"})`);
  console.log(`   USDT:     ${fUsdt ? "✓ ada" : "✗ MISSING"} (accountNo: ${fUsdt?.accountNo ? "sudah diisi" : "BELUM — admin isi wallet via panel"})`);

  console.log(`\n📦 Investment Packages (kontrak ${CONTRACT_DAYS} hari, modal TIDAK dikembalikan):`);
  const allPkgs = await db.investmentPackage.findMany({ orderBy: { order: "asc" }});
  for (const p of allPkgs) {
    const daily = Math.round(p.amount * (p.profitRate / 100));
    const total = Math.round(p.amount * (p.profitRate / 100) * p.contractDays);
    console.log(`   ${p.order}. ${p.name}: Rp ${fmt(p.amount)} - ${p.profitRate}%/hari = Rp ${fmt(daily)}/hari × ${p.contractDays} hari = Rp ${fmt(total)} total`);
  }

  console.log(`\n🛒 Products:`);
  const allProds = await db.product.findMany({ orderBy: { price: "asc" }});
  for (const p of allProds) {
    console.log(`   - ${p.name}: Rp ${fmt(p.price)} → profit Rp ${fmt(p.estimatedProfit)} (${p.duration} hari) | Kuota: ${p.quotaUsed}/${p.quota}`);
  }

  await db.$disconnect();
  console.log("\n✅ Restore complete!");
})().catch(e => { console.error("❌ Error:", e.message); console.error(e.stack); process.exit(1); });
' 2>&1

echo ""
ok "Done. Gold Premium Aset 1-6 restored."
echo ""
echo "Next steps:"
echo "  1. Restart nexvo-app:    pm2 restart nexvo-app"
echo "  2. Check admin panel:    https://nexvo.id/#admin-login"
echo "     (username: admin, password: Admin@2024)"
echo ""
