// ============================================================================
//  NEXVO - SEED ALL DATA (Packages + Products + Settings)
// ----------------------------------------------------------------------------
//  Jalankan dengan: bun run seed-all.js
//  Membuat: 6 paket investasi (kontrak 180 hari, modal TIDAK dikembalikan),
//  produk, payment methods, banners, system settings, matching config,
//  salary config.
//
//  ATURAN INVESTASI:
//   - Kontrak: 180 hari
//   - Profit harian dikredit tiap hari (cron 00:00 WIB)
//   - Modal awal TIDAK dikembalikan saat kontrak berakhir
//   - User hanya menerima profit harian
// ============================================================================

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Kontrak 180 hari — modal awal TIDAK dikembalikan, user hanya dapat profit
const CONTRACT_DAYS = 180;

async function main() {
  console.log('🌱 NEXVO - SEED ALL DATA (Kontrak 180 Hari • Modal Tidak Dikembalikan)\n');
  console.log('='.repeat(60));

  // ==========================================================================
  // 1. ADMIN
  // ==========================================================================
  console.log('\n1. Cek & buat admin...');
  let admin = await prisma.admin.findFirst();
  if (!admin) {
    const hash = await bcrypt.hash('Admin@2024', 8);
    admin = await prisma.admin.create({
      data: {
        username: 'admin',
        email: 'admin@nexvo.id',
        password: hash,
        name: 'Super Admin',
        role: 'super_admin',
      }
    });
    console.log('   ✅ Admin dibuat: admin / Admin@2024');
  } else {
    // Pastikan password benar & unlocked
    const hash = await bcrypt.hash('Admin@2024', 8);
    admin = await prisma.admin.update({
      where: { id: admin.id },
      data: {
        password: hash,
        role: 'super_admin',
        loginAttempts: 0,
        lockedUntil: null,
      }
    });
    console.log('   ✅ Admin sudah ada, password di-reset: admin / Admin@2024');
  }

  // ==========================================================================
  // 2. SYSTEM SETTINGS
  // ==========================================================================
  console.log('\n2. System settings...');
  const settingsCount = await prisma.systemSettings.count();
  if (settingsCount === 0) {
    const settings = [
      { key: 'deposit_fee', value: '500' },
      { key: 'min_withdraw', value: '50000' },
      { key: 'withdraw_fee', value: '10' },
      { key: 'work_start', value: '08:00' },
      { key: 'work_end', value: '17:00' },
      { key: 'referral_bonus', value: '10000' },
      { key: 'cashback', value: '0' },
      { key: 'total_members', value: '0' },
      { key: 'total_transactions', value: '0' },
      { key: 'uptime', value: '99.9' },
      { key: 'satisfaction', value: '98' },
      { key: 'qris_image', value: '' },
      { key: 'auto_payment', value: 'false' },
      { key: 'apk_link', value: '' },
      { key: 'apk_version', value: '1.0.0' },
      { key: 'site_name', value: 'NEXVO' },
    ];
    for (const s of settings) {
      await prisma.systemSettings.create({ data: s });
    }
    console.log(`   ✅ ${settings.length} system settings dibuat`);
  } else {
    console.log(`   ⏭️  ${settingsCount} settings sudah ada`);
  }

  // ==========================================================================
  // 3. PAYMENT METHODS
  // ==========================================================================
  console.log('\n3. Payment methods...');
  const pmCount = await prisma.paymentMethod.count();
  if (pmCount === 0) {
    await prisma.paymentMethod.createMany({
      data: [
        { type: 'bank', name: 'Bank BCA', accountNo: '', holderName: 'NEXVO', color: '#003D79', isActive: true, order: 1 },
        { type: 'bank', name: 'Bank Mandiri', accountNo: '', holderName: 'NEXVO', color: '#003366', isActive: true, order: 2 },
        { type: 'bank', name: 'Bank BNI', accountNo: '', holderName: 'NEXVO', color: '#F37021', isActive: true, order: 3 },
        { type: 'bank', name: 'Bank BRI', accountNo: '', holderName: 'NEXVO', color: '#00529B', isActive: true, order: 4 },
        { type: 'ewallet', name: 'DANA', accountNo: '', holderName: 'NEXVO', color: '#108EE9', isActive: true, order: 5 },
        { type: 'ewallet', name: 'OVO', accountNo: '', holderName: 'NEXVO', color: '#4C3494', isActive: true, order: 6 },
        { type: 'ewallet', name: 'GoPay', accountNo: '', holderName: 'NEXVO', color: '#00AED6', isActive: true, order: 7 },
        { type: 'ewallet', name: 'ShopeePay', accountNo: '', holderName: 'NEXVO', color: '#EE4D2D', isActive: true, order: 8 },
      ]
    });
    console.log('   ✅ 8 payment methods dibuat (BCA, Mandiri, BNI, BRI, DANA, OVO, GoPay, ShopeePay)');
  } else {
    console.log(`   ⏭️  ${pmCount} payment methods sudah ada`);
  }

  // ==========================================================================
  // 4. INVESTMENT PACKAGES (6 packages, kontrak 180 hari, modal tidak kembali)
  // ==========================================================================
  console.log(`\n4. Investment packages (6 paket, kontrak ${CONTRACT_DAYS} hari, modal TIDAK dikembalikan)...`);

  // 6 packages persis sesuai request user: Gold Premium Aset 1 - Gold Premium Aset 6
  const packages = [
    { name: 'Gold Premium Aset 1',  amount: 160000,    profitRate: 2,   contractDays: CONTRACT_DAYS, order: 1 },
    { name: 'Gold Premium Aset 2',  amount: 320000,    profitRate: 2.5, contractDays: CONTRACT_DAYS, order: 2 },
    { name: 'Gold Premium Aset 3',  amount: 640000,    profitRate: 3,   contractDays: CONTRACT_DAYS, order: 3 },
    { name: 'Gold Premium Aset 4',  amount: 1920000,   profitRate: 3.5, contractDays: CONTRACT_DAYS, order: 4 },
    { name: 'Gold Premium Aset 5',  amount: 5760000,   profitRate: 4,   contractDays: CONTRACT_DAYS, order: 5 },
    { name: 'Gold Premium Aset 6',  amount: 17280000,  profitRate: 5,   contractDays: CONTRACT_DAYS, order: 6 },
  ];

  // Cleanup: hapus semua paket lama yang namanya TIDAK termasuk 6 nama baru
  // (Gold VIP 1-6, Gold Premium Aset VIP 1-6, Bot Trading, Paket Pemula, dll)
  const validPkgNames = packages.map(p => p.name);
  const oldPkgs = await prisma.investmentPackage.findMany();
  let deletedPkgs = 0;
  for (const old of oldPkgs) {
    if (!validPkgNames.includes(old.name)) {
      try {
        // Hapus investments terkait dulu (jika ada) untuk hindari constraint error
        try {
          await prisma.investment.deleteMany({ where: { packageId: old.id } });
        } catch (_) { /* ignore — biarkan cascade */ }
        await prisma.investmentPackage.delete({ where: { id: old.id } });
        console.log(`   🗑️  Hapus paket lama: ${old.name}`);
        deletedPkgs++;
      } catch (e) {
        console.log(`   ⚠️  Gagal hapus paket lama "${old.name}": ${e.message}`);
      }
    }
  }
  if (deletedPkgs > 0) console.log(`   ✓ ${deletedPkgs} paket lama dihapus`);

  for (const pkg of packages) {
    const existing = await prisma.investmentPackage.findFirst({ where: { name: pkg.name } });
    if (existing) {
      await prisma.investmentPackage.update({
        where: { id: existing.id },
        data: { amount: pkg.amount, profitRate: pkg.profitRate, contractDays: pkg.contractDays, order: pkg.order, isActive: true }
      });
      console.log(`   ✏️  Update: ${pkg.name} - Rp ${pkg.amount.toLocaleString('id-ID')} (${pkg.profitRate}% × ${pkg.contractDays} hari)`);
    } else {
      await prisma.investmentPackage.create({ data: pkg });
      console.log(`   ✅ Buat: ${pkg.name} - Rp ${pkg.amount.toLocaleString('id-ID')} (${pkg.profitRate}% × ${pkg.contractDays} hari)`);
    }
  }
  console.log(`   📦 Total: ${packages.length} investment packages`);

  // ==========================================================================
  // 5. PRODUCTS (6 produk investasi, kontrak 180 hari, modal tidak kembali)
  // ==========================================================================
  console.log(`\n5. Products (produk investasi, kontrak ${CONTRACT_DAYS} hari)...`);

  // Hitung estimatedProfit otomatis: price × profitRate% × CONTRACT_DAYS
  // Modal TIDAK dikembalikan — estimatedProfit = total profit selama kontrak
  //
  // QUOTA: Tinggi (9999) supaya "Kuota Terisi" bisa menampilkan ribuan.
  // quotaUsed di-set ke baseline realistis (variasi 35-75% terisi) supaya
  // kelihatan ramai sejak awal. Cron service akan auto-increment quotaUsed
  // tiap ~15 menit dan auto-reset ke ~5-12% saat penuh (batch baru).
  const fmt = (n) => n.toLocaleString('id-ID');
  const QUOTA_HIGH = 9999; // kuota besar supaya bisa tampil ribuan
  const randBaseline = () => Math.floor(QUOTA_HIGH * (0.35 + Math.random() * 0.40)); // 35-75%
  const products = [
    {
      name: 'Gold Premium Aset 1',
      price: 160000,
      duration: CONTRACT_DAYS,
      estimatedProfit: Math.round(160000 * 0.02 * CONTRACT_DAYS),
      quota: QUOTA_HIGH,
      quotaUsed: randBaseline(),
      description: `Gold Premium Aset 1 - Rp 160.000. Profit 2%/hari = Rp 3.200/hari selama ${CONTRACT_DAYS} hari. Total profit Rp 576.000. Modal awal TIDAK dikembalikan, user hanya menerima profit.`,
      profitRate: 2,
    },
    {
      name: 'Gold Premium Aset 2',
      price: 320000,
      duration: CONTRACT_DAYS,
      estimatedProfit: Math.round(320000 * 0.025 * CONTRACT_DAYS),
      quota: QUOTA_HIGH,
      quotaUsed: randBaseline(),
      description: `Gold Premium Aset 2 - Rp 320.000. Profit 2,5%/hari = Rp 8.000/hari selama ${CONTRACT_DAYS} hari. Total profit Rp 1.440.000. Modal awal TIDAK dikembalikan, user hanya menerima profit.`,
      profitRate: 2.5,
    },
    {
      name: 'Gold Premium Aset 3',
      price: 640000,
      duration: CONTRACT_DAYS,
      estimatedProfit: Math.round(640000 * 0.03 * CONTRACT_DAYS),
      quota: QUOTA_HIGH,
      quotaUsed: randBaseline(),
      description: `Gold Premium Aset 3 - Rp 640.000. Profit 3%/hari = Rp 19.200/hari selama ${CONTRACT_DAYS} hari. Total profit Rp 3.456.000. Modal awal TIDAK dikembalikan, user hanya menerima profit.`,
      profitRate: 3,
    },
    {
      name: 'Gold Premium Aset 4',
      price: 1920000,
      duration: CONTRACT_DAYS,
      estimatedProfit: Math.round(1920000 * 0.035 * CONTRACT_DAYS),
      quota: QUOTA_HIGH,
      quotaUsed: randBaseline(),
      description: `Gold Premium Aset 4 - Rp 1.920.000. Profit 3,5%/hari = Rp 67.200/hari selama ${CONTRACT_DAYS} hari. Total profit Rp 12.096.000. Modal awal TIDAK dikembalikan, user hanya menerima profit.`,
      profitRate: 3.5,
    },
    {
      name: 'Gold Premium Aset 5',
      price: 5760000,
      duration: CONTRACT_DAYS,
      estimatedProfit: Math.round(5760000 * 0.04 * CONTRACT_DAYS),
      quota: QUOTA_HIGH,
      quotaUsed: randBaseline(),
      description: `Gold Premium Aset 5 - Rp 5.760.000. Profit 4%/hari = Rp 230.400/hari selama ${CONTRACT_DAYS} hari. Total profit Rp 41.472.000. Modal awal TIDAK dikembalikan, user hanya menerima profit.`,
      profitRate: 4,
    },
    {
      name: 'Gold Premium Aset 6',
      price: 17280000,
      duration: CONTRACT_DAYS,
      estimatedProfit: Math.round(17280000 * 0.05 * CONTRACT_DAYS),
      quota: QUOTA_HIGH,
      quotaUsed: randBaseline(),
      description: `Gold Premium Aset 6 - Rp 17.280.000. Profit 5%/hari = Rp 864.000/hari selama ${CONTRACT_DAYS} hari. Total profit Rp 155.520.000. Modal awal TIDAK dikembalikan, user hanya menerima profit.`,
      profitRate: 5,
    },
  ];

  // Cleanup: hapus semua produk lama yang namanya TIDAK termasuk 6 nama baru
  const validProdNames = products.map(p => p.name);
  const oldProds = await prisma.product.findMany();
  let deletedProds = 0;
  for (const old of oldProds) {
    if (!validProdNames.includes(old.name)) {
      try {
        // Hapus purchases terkait dulu (jika ada) untuk hindari constraint error
        try {
          await prisma.purchase.deleteMany({ where: { productId: old.id } });
        } catch (_) { /* ignore — biarkan cascade */ }
        await prisma.product.delete({ where: { id: old.id } });
        console.log(`   🗑️  Hapus produk lama: ${old.name}`);
        deletedProds++;
      } catch (e) {
        console.log(`   ⚠️  Gagal hapus produk lama "${old.name}": ${e.message}`);
      }
    }
  }
  if (deletedProds > 0) console.log(`   ✓ ${deletedProds} produk lama dihapus`);

  for (const prod of products) {
    const existing = await prisma.product.findFirst({ where: { name: prod.name } });
    if (existing) {
      // Update termasuk quota (9999) + reset quotaUsed ke baseline realistis
      await prisma.product.update({
        where: { id: existing.id },
        data: { ...prod, isActive: true, isStopped: false }
      });
      console.log(`   ✏️  Update: ${prod.name} - Rp ${fmt(prod.price)} → profit ${fmt(prod.estimatedProfit)} (${prod.duration} hari) | Kuota: ${prod.quotaUsed}/${prod.quota}`);
    } else {
      await prisma.product.create({ data: prod });
      console.log(`   ✅ Buat: ${prod.name} - Rp ${fmt(prod.price)} → profit ${fmt(prod.estimatedProfit)} (${prod.duration} hari) | Kuota: ${prod.quotaUsed}/${prod.quota}`);
    }
  }
  console.log(`   📦 Total: ${products.length} products`);

  // ==========================================================================
  // 6. BANNERS
  // ==========================================================================
  console.log('\n6. Banners...');
  const bannerCount = await prisma.banner.count();
  if (bannerCount === 0) {
    await prisma.banner.createMany({
      data: [
        {
          title: 'Selamat Datang di NEXVO',
          subtitle: 'Platform Investasi Digital #1',
          description: 'NEXVO menghadirkan solusi investasi digital berbasis komoditas yang aman, transparan, dan menguntungkan. Mulai perjalanan investasi Anda dengan profit harian terukur dan sistem keamanan berlapis.',
          ctaText: 'Mulai Sekarang',
          ctaLink: 'register',
          image: '/images/banner-1.jpg',
          order: 1,
          isActive: true,
        },
        {
          title: 'Profit Harian Hingga 5%',
          subtitle: 'Investasi Cerdas, Hasil Maksimal',
          description: `Dapatkan profit harian hingga 5% selama ${CONTRACT_DAYS} hari kontrak. Hanya profit yang dibayarkan — modal awal TIDAK dikembalikan.`,
          ctaText: 'Lihat Paket',
          ctaLink: 'paket',
          image: '/images/banner-2.jpg',
          order: 2,
          isActive: true,
        },
        {
          title: 'Bonus Sponsor 5 Level',
          subtitle: 'Ajak Teman, Raih Bonus',
          description: 'Dapatkan bonus sponsor hingga 5 level: 5%, 4%, 3%, 2%, 1%. Semakin banyak referral, semakin besar bonus Anda!',
          ctaText: 'Lihat Jaringan',
          ctaLink: 'network',
          image: '/images/banner-3.jpg',
          order: 3,
          isActive: true,
        },
      ]
    });
    console.log('   ✅ 3 banners dibuat');
  } else {
    console.log(`   ⏭️  ${bannerCount} banners sudah ada`);
  }

  // ==========================================================================
  // 7. MATCHING CONFIG
  // ==========================================================================
  console.log('\n7. Matching config...');
  let matching = await prisma.matchingConfig.findFirst();
  if (!matching) {
    matching = await prisma.matchingConfig.create({
      data: { level1: 5, level2: 4, level3: 3, level4: 2, level5: 1, isActive: true }
    });
    console.log('   ✅ Matching config dibuat (5%, 4%, 3%, 2%, 1%)');
  } else {
    console.log('   ⏭️  Matching config sudah ada');
  }

  // ==========================================================================
  // 8. SALARY CONFIG
  // ==========================================================================
  console.log('\n8. Salary config...');
  let salary = await prisma.salaryConfig.findFirst();
  if (!salary) {
    salary = await prisma.salaryConfig.create({
      data: {
        minDirectRefs: 10,
        salaryRate: 2.5,
        maxWeeks: 12,
        requireActiveDeposit: true,
        fixedSalaryAmount: 25000,
        isActive: true,
      }
    });
    console.log('   ✅ Salary config dibuat (2.5%/week × 12 weeks)');
  } else {
    console.log('   ⏭️  Salary config sudah ada');
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n' + '='.repeat(60));
  console.log('🎉 SEEDING COMPLETE!');
  console.log('='.repeat(60));
  console.log('\n📊 Ringkasan data di database:');
  console.log(`   Admin accounts    : ${await prisma.admin.count()}`);
  console.log(`   System settings   : ${await prisma.systemSettings.count()}`);
  console.log(`   Payment methods   : ${await prisma.paymentMethod.count()}`);
  console.log(`   Investment packages: ${await prisma.investmentPackage.count()}`);
  console.log(`   Products          : ${await prisma.product.count()}`);
  console.log(`   Banners           : ${await prisma.banner.count()}`);
  console.log(`   Matching configs  : ${await prisma.matchingConfig.count()}`);
  console.log(`   Salary configs    : ${await prisma.salaryConfig.count()}`);

  console.log('\n📋 Admin login:');
  console.log('   Username: admin');
  console.log('   Password: Admin@2024');
  console.log('   URL: https://nexvo.id/#admin-login');

  console.log(`\n📦 Investment Packages (6) — Kontrak ${CONTRACT_DAYS} hari • Modal TIDAK dikembalikan:`);
  const allPkgs = await prisma.investmentPackage.findMany({ orderBy: { order: 'asc' } });
  for (const p of allPkgs) {
    const daily = Math.round(p.amount * (p.profitRate / 100));
    const total = Math.round(p.amount * (p.profitRate / 100) * p.contractDays);
    console.log(`   ${p.order}. ${p.name}: Rp ${fmt(p.amount)} - ${p.profitRate}%/hari = Rp ${fmt(daily)}/hari × ${p.contractDays} hari = Rp ${fmt(total)} total profit`);
  }

  console.log(`\n🛒 Products (6) — Kontrak ${CONTRACT_DAYS} hari • Modal TIDAK dikembalikan:`);
  const allProds = await prisma.product.findMany({ orderBy: { price: 'asc' } });
  for (const p of allProds) {
    console.log(`   - ${p.name}: Rp ${fmt(p.price)} → profit Rp ${fmt(p.estimatedProfit)} (${p.duration} hari) | Kuota: ${p.quotaUsed}/${p.quota}`);
  }

  console.log('\nℹ️  Catatan:');
  console.log(`   - Kontrak investasi: ${CONTRACT_DAYS} hari`);
  console.log('   - Modal awal TIDAK dikembalikan saat kontrak berakhir');
  console.log('   - User hanya menerima profit harian (dikredit cron 00:00 WIB)');
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
