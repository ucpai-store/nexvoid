// ============================================================================
//  NEXVO - CLEANUP & RE-SEED (Force delete all old packages/products)
// ----------------------------------------------------------------------------
//  Hapus SEMUA paket dan produk lama, lalu buat ulang 6 paket + 6 produk
//  dengan nama Gold Premium Aset 1 - Gold Premium Aset 6
// ============================================================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🧹 NEXVO - CLEANUP & RE-SEED\n');
  console.log('='.repeat(60));
  
  try {
    // ==========================================================================
    // 1. DELETE ALL EXISTING PACKAGES (force delete)
    // ==========================================================================
    console.log('\n1. HAPUS SEMUA INVESTMENT PACKAGES LAMA...');
    
    // Cek apakah ada investments yang pakai package
    const investmentsUsingPackages = await prisma.investment.count();
    console.log(`   Investments terdaftar: ${investmentsUsingPackages}`);
    
    if (investmentsUsingPackages > 0) {
      console.log('   ⚠ Hapus semua investments lama (data test)...');
      await prisma.investment.deleteMany({});
      console.log('   ✓ Investments dihapus');
    }
    
    const oldPkgCount = await prisma.investmentPackage.count();
    console.log(`   Paket lama ditemukan: ${oldPkgCount}`);
    
    // List semua paket lama sebelum hapus
    const oldPkgs = await prisma.investmentPackage.findMany({ orderBy: { order: 'asc' }});
    console.log('   Paket lama:');
    for (const p of oldPkgs) {
      console.log(`     - [${p.id.substring(0,8)}] ${p.name} - Rp ${p.amount.toLocaleString('id-ID')}`);
    }
    
    // FORCE DELETE ALL
    const deletedPkgs = await prisma.investmentPackage.deleteMany({});
    console.log(`   ✓ ${deletedPkgs.count} paket lama dihapus`);
    
    // ==========================================================================
    // 2. DELETE ALL EXISTING PRODUCTS (force delete)
    // ==========================================================================
    console.log('\n2. HAPUS SEMUA PRODUCTS LAMA...');
    
    // Cek apakah ada purchases yang pakai product
    const purchasesUsingProducts = await prisma.purchase.count();
    console.log(`   Purchases terdaftar: ${purchasesUsingProducts}`);
    
    if (purchasesUsingProducts > 0) {
      console.log('   ⚠ Hapus semua purchases lama (data test)...');
      await prisma.purchase.deleteMany({});
      console.log('   ✓ Purchases dihapus');
    }
    
    const oldProdCount = await prisma.product.count();
    console.log(`   Produk lama ditemukan: ${oldProdCount}`);
    
    // List semua produk lama sebelum hapus
    const oldProds = await prisma.product.findMany({ orderBy: { price: 'asc' }});
    console.log('   Produk lama:');
    for (const p of oldProds) {
      console.log(`     - [${p.id.substring(0,8)}] ${p.name} - Rp ${p.price.toLocaleString('id-ID')}`);
    }
    
    // FORCE DELETE ALL
    const deletedProds = await prisma.product.deleteMany({});
    console.log(`   ✓ ${deletedProds.count} produk lama dihapus`);
    
    // ==========================================================================
    // 3. CREATE NEW PACKAGES (Gold Premium Aset 1-6)
    // ==========================================================================
    console.log('\n3. BUAT 6 PACKAGES BARU (Gold Premium Aset 1-6)...');
    
    const packages = [
      { name: 'Gold Premium Aset 1',  amount: 160000,    profitRate: 2,   contractDays: 90, order: 1 },
      { name: 'Gold Premium Aset 2',  amount: 320000,    profitRate: 2.5, contractDays: 90, order: 2 },
      { name: 'Gold Premium Aset 3',  amount: 640000,    profitRate: 3,   contractDays: 90, order: 3 },
      { name: 'Gold Premium Aset 4',  amount: 1920000,   profitRate: 3.5, contractDays: 90, order: 4 },
      { name: 'Gold Premium Aset 5',  amount: 5760000,   profitRate: 4,   contractDays: 90, order: 5 },
      { name: 'Gold Premium Aset 6',  amount: 17280000,  profitRate: 5,   contractDays: 90, order: 6 },
    ];
    
    for (const pkg of packages) {
      const created = await prisma.investmentPackage.create({ data: pkg });
      const dailyProfit = pkg.amount * (pkg.profitRate / 100);
      console.log(`   ✅ ${created.name} - Rp ${pkg.amount.toLocaleString('id-ID')} - ${pkg.profitRate}%/hari = Rp ${dailyProfit.toLocaleString('id-ID')}/hari`);
    }
    console.log(`   📦 Total: ${packages.length} packages`);
    
    // ==========================================================================
    // 4. CREATE NEW PRODUCTS (Gold Premium Aset 1-6)
    // ==========================================================================
    console.log('\n4. BUAT 6 PRODUCTS BARU (Gold Premium Aset 1-6)...');
    
    const products = [
      {
        name: 'Gold Premium Aset 1',
        price: 160000,
        duration: 90,
        estimatedProfit: 288000,
        quota: 1000,
        description: 'Gold Premium Aset 1 - Rp 160.000. Profit 2%/hari = Rp 3.200/hari selama 90 hari. Total profit Rp 288.000.',
        profitRate: 2,
      },
      {
        name: 'Gold Premium Aset 2',
        price: 320000,
        duration: 90,
        estimatedProfit: 720000,
        quota: 1000,
        description: 'Gold Premium Aset 2 - Rp 320.000. Profit 2,5%/hari = Rp 8.000/hari selama 90 hari. Total profit Rp 720.000.',
        profitRate: 2.5,
      },
      {
        name: 'Gold Premium Aset 3',
        price: 640000,
        duration: 90,
        estimatedProfit: 1728000,
        quota: 1000,
        description: 'Gold Premium Aset 3 - Rp 640.000. Profit 3%/hari = Rp 19.200/hari selama 90 hari. Total profit Rp 1.728.000.',
        profitRate: 3,
      },
      {
        name: 'Gold Premium Aset 4',
        price: 1920000,
        duration: 90,
        estimatedProfit: 6048000,
        quota: 500,
        description: 'Gold Premium Aset 4 - Rp 1.920.000. Profit 3,5%/hari = Rp 67.200/hari selama 90 hari. Total profit Rp 6.048.000.',
        profitRate: 3.5,
      },
      {
        name: 'Gold Premium Aset 5',
        price: 5760000,
        duration: 90,
        estimatedProfit: 20736000,
        quota: 200,
        description: 'Gold Premium Aset 5 - Rp 5.760.000. Profit 4%/hari = Rp 230.400/hari selama 90 hari. Total profit Rp 20.736.000.',
        profitRate: 4,
      },
      {
        name: 'Gold Premium Aset 6',
        price: 17280000,
        duration: 90,
        estimatedProfit: 77760000,
        quota: 100,
        description: 'Gold Premium Aset 6 - Rp 17.280.000. Profit 5%/hari = Rp 864.000/hari selama 90 hari. Total profit Rp 77.760.000.',
        profitRate: 5,
      },
    ];
    
    for (const prod of products) {
      const created = await prisma.product.create({ data: prod });
      console.log(`   ✅ ${created.name} - Rp ${prod.price.toLocaleString('id-ID')} - ${prod.profitRate}%/hari`);
    }
    console.log(`   📦 Total: ${products.length} products`);
    
    // ==========================================================================
    // 5. VERIFY
    // ==========================================================================
    console.log('\n5. VERIFIKASI...');
    const finalPkgs = await prisma.investmentPackage.findMany({ orderBy: { order: 'asc' }});
    const finalProds = await prisma.product.findMany({ orderBy: { price: 'asc' }});
    
    console.log(`\n   📦 Packages di database (${finalPkgs.length}):`);
    for (const p of finalPkgs) {
      const daily = p.amount * (p.profitRate / 100);
      console.log(`      ${p.order}. ${p.name} - Rp ${p.amount.toLocaleString('id-ID')} - ${p.profitRate}% = Rp ${daily.toLocaleString('id-ID')}/hari`);
    }
    
    console.log(`\n   🛒 Products di database (${finalProds.length}):`);
    for (const p of finalProds) {
      const daily = p.price * (p.profitRate / 100);
      console.log(`      - ${p.name} - Rp ${p.price.toLocaleString('id-ID')} - ${p.profitRate}% = Rp ${daily.toLocaleString('id-ID')}/hari`);
    }
    
    if (finalPkgs.length === 6 && finalProds.length === 6) {
      console.log('\n' + '='.repeat(60));
      console.log('✅ CLEANUP & RE-SEED BERHASIL!');
      console.log('='.repeat(60));
      console.log('   6 packages (Gold Premium Aset 1-6) ✓');
      console.log('   6 products  (Gold Premium Aset 1-6) ✓');
      console.log('   Semua data lama (Gold VIP, Bot Trading, dll) sudah dihapus ✓');
    } else {
      console.log('\n⚠ WARNING: Jumlah tidak sesuai!');
      console.log(`   Packages: ${finalPkgs.length} (harusnya 6)`);
      console.log(`   Products: ${finalProds.length} (harusnya 6)`);
    }
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
