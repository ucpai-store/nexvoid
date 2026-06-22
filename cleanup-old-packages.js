// ============================================================================
//  NEXVO - CLEANUP OLD PACKAGES & PRODUCTS
// ----------------------------------------------------------------------------
//  Hapus SEMUA paket & produk yang namanya BUKAN "Gold Premium Aset 1..6".
//  Aman terhadap foreign key: hapus investments/purchases terkait dulu.
//
//  Jalankan dengan: bun run cleanup-old-packages.js
// ============================================================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const VALID_NAMES = [
  'Gold Premium Aset 1',
  'Gold Premium Aset 2',
  'Gold Premium Aset 3',
  'Gold Premium Aset 4',
  'Gold Premium Aset 5',
  'Gold Premium Aset 6',
];

const fmt = (n) => n.toLocaleString('id-ID');

async function main() {
  console.log('🧹 NEXVO - CLEANUP OLD PACKAGES & PRODUCTS\n');
  console.log('='.repeat(60));
  console.log(`Valid names (akan dipertahankan): ${VALID_NAMES.join(', ')}\n`);

  // ==========================================================================
  // CLEANUP PACKAGES
  // ==========================================================================
  console.log('▸ Membersihkan InvestmentPackage...');
  const allPkgs = await prisma.investmentPackage.findMany({ orderBy: { order: 'asc' } });
  console.log(`   Ditemukan ${allPkgs.length} paket di database:`);
  for (const p of allPkgs) {
    const keep = VALID_NAMES.includes(p.name);
    console.log(`   ${keep ? '✅ KEEP  ' : '🗑️  DEL   '} ${p.name} (Rp ${fmt(p.amount)}, ${p.profitRate}% × ${p.contractDays} hari)`);
  }

  let deletedPkgCount = 0;
  let deletedInvCount = 0;
  for (const p of allPkgs) {
    if (VALID_NAMES.includes(p.name)) continue;
    try {
      // Hapus investments terkait dulu
      const invDel = await prisma.investment.deleteMany({ where: { packageId: p.id } });
      deletedInvCount += invDel.count;
      // Hapus package
      await prisma.investmentPackage.delete({ where: { id: p.id } });
      deletedPkgCount++;
      console.log(`   ✓ Dihapus paket: ${p.name} (+${invDel.count} investments)`);
    } catch (e) {
      console.log(`   ⚠️  Gagal hapus paket "${p.name}": ${e.message}`);
    }
  }
  console.log(`   → ${deletedPkgCount} paket lama dihapus, ${deletedInvCount} investments ikut terhapus\n`);

  // ==========================================================================
  // CLEANUP PRODUCTS
  // ==========================================================================
  console.log('▸ Membersihkan Product...');
  const allProds = await prisma.product.findMany({ orderBy: { price: 'asc' } });
  console.log(`   Ditemukan ${allProds.length} produk di database:`);
  for (const p of allProds) {
    const keep = VALID_NAMES.includes(p.name);
    console.log(`   ${keep ? '✅ KEEP  ' : '🗑️  DEL   '} ${p.name} (Rp ${fmt(p.price)})`);
  }

  let deletedProdCount = 0;
  let deletedPurCount = 0;
  for (const p of allProds) {
    if (VALID_NAMES.includes(p.name)) continue;
    try {
      // Hapus purchases terkait dulu
      try {
        const purDel = await prisma.purchase.deleteMany({ where: { productId: p.id } });
        deletedPurCount += purDel.count;
      } catch (_) { /* model mungkin beda nama relasi */ }
      // Hapus product
      await prisma.product.delete({ where: { id: p.id } });
      deletedProdCount++;
      console.log(`   ✓ Dihapus produk: ${p.name} (+purchases)`);
    } catch (e) {
      console.log(`   ⚠️  Gagal hapus produk "${p.name}": ${e.message}`);
    }
  }
  console.log(`   → ${deletedProdCount} produk lama dihapus, ${deletedPurCount} purchases ikut terhapus\n`);

  // ==========================================================================
  // FINAL STATE
  // ==========================================================================
  console.log('='.repeat(60));
  console.log('📊 State akhir database:');
  const finalPkgs = await prisma.investmentPackage.findMany({ orderBy: { order: 'asc' } });
  const finalProds = await prisma.product.findMany({ orderBy: { price: 'asc' } });
  console.log(`\n📦 InvestmentPackage (${finalPkgs.length}):`);
  for (const p of finalPkgs) {
    console.log(`   ${p.order}. ${p.name} - Rp ${fmt(p.amount)} - ${p.profitRate}% × ${p.contractDays} hari`);
  }
  console.log(`\n🛒 Product (${finalProds.length}):`);
  for (const p of finalProds) {
    console.log(`   - ${p.name} - Rp ${fmt(p.price)} → profit Rp ${fmt(p.estimatedProfit)} (${p.duration} hari)`);
  }
  console.log('\n✅ Cleanup selesai.');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e.message);
    console.error(e.stack);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
