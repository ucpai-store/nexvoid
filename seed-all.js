// ============================================================================
//  NEXVO - SEED ALL DATA (Packages + Products + Settings)
// ----------------------------------------------------------------------------
//  Jalankan dengan: bun run seed-all.js
//  Membuat: 6 paket investasi (min 100k), produk, payment methods, banners,
//  system settings, matching config, salary config
// ============================================================================

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 NEXVO - SEED ALL DATA\n');
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
  // 4. INVESTMENT PACKAGES (6 packages, minimum 160k)
  // ==========================================================================
  console.log('\n4. Investment packages (6 paket, min 160k)...');
  const pkgCount = await prisma.investmentPackage.count();
  
  // 6 packages persis sesuai request user: Gold Premium Aset VIP 1 - Gold Premium Aset VIP 6
  const packages = [
    { name: 'Gold Premium Aset VIP 1',  amount: 160000,    profitRate: 2,   contractDays: 90, order: 1 },
    { name: 'Gold Premium Aset VIP 2',  amount: 320000,    profitRate: 2.5, contractDays: 90, order: 2 },
    { name: 'Gold Premium Aset VIP 3',  amount: 640000,    profitRate: 3,   contractDays: 90, order: 3 },
    { name: 'Gold Premium Aset VIP 4',  amount: 1920000,   profitRate: 3.5, contractDays: 90, order: 4 },
    { name: 'Gold Premium Aset VIP 5',  amount: 5760000,   profitRate: 4,   contractDays: 90, order: 5 },
    { name: 'Gold Premium Aset VIP 6',  amount: 17280000,  profitRate: 5,   contractDays: 90, order: 6 },
  ];
  
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
  // 5. PRODUCTS (6 produk investasi)
  // ==========================================================================
  console.log('\n5. Products (produk investasi)...');
  
  // 6 products dengan nama SAMA dengan packages: Gold Premium Aset VIP 1 - Gold Premium Aset VIP 6
  const products = [
    {
      name: 'Gold Premium Aset VIP 1',
      price: 160000,
      duration: 90,
      estimatedProfit: 288000,
      quota: 1000,
      description: 'Gold Premium Aset VIP 1 - Rp 160.000. Profit 2%/hari = Rp 3.200/hari selama 90 hari. Total profit Rp 288.000.',
      profitRate: 2,
    },
    {
      name: 'Gold Premium Aset VIP 2',
      price: 320000,
      duration: 90,
      estimatedProfit: 720000,
      quota: 1000,
      description: 'Gold Premium Aset VIP 2 - Rp 320.000. Profit 2,5%/hari = Rp 8.000/hari selama 90 hari. Total profit Rp 720.000.',
      profitRate: 2.5,
    },
    {
      name: 'Gold Premium Aset VIP 3',
      price: 640000,
      duration: 90,
      estimatedProfit: 1728000,
      quota: 1000,
      description: 'Gold Premium Aset VIP 3 - Rp 640.000. Profit 3%/hari = Rp 19.200/hari selama 90 hari. Total profit Rp 1.728.000.',
      profitRate: 3,
    },
    {
      name: 'Gold Premium Aset VIP 4',
      price: 1920000,
      duration: 90,
      estimatedProfit: 6048000,
      quota: 500,
      description: 'Gold Premium Aset VIP 4 - Rp 1.920.000. Profit 3,5%/hari = Rp 67.200/hari selama 90 hari. Total profit Rp 6.048.000.',
      profitRate: 3.5,
    },
    {
      name: 'Gold Premium Aset VIP 5',
      price: 5760000,
      duration: 90,
      estimatedProfit: 20736000,
      quota: 200,
      description: 'Gold Premium Aset VIP 5 - Rp 5.760.000. Profit 4%/hari = Rp 230.400/hari selama 90 hari. Total profit Rp 20.736.000.',
      profitRate: 4,
    },
    {
      name: 'Gold Premium Aset VIP 6',
      price: 17280000,
      duration: 90,
      estimatedProfit: 77760000,
      quota: 100,
      description: 'Gold Premium Aset VIP 6 - Rp 17.280.000. Profit 5%/hari = Rp 864.000/hari selama 90 hari. Total profit Rp 77.760.000.',
      profitRate: 5,
    },
  ];
  
  for (const prod of products) {
    const existing = await prisma.product.findFirst({ where: { name: prod.name } });
    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: { ...prod, isActive: true, isStopped: false }
      });
      console.log(`   ✏️  Update: ${prod.name} - Rp ${prod.price.toLocaleString('id-ID')}`);
    } else {
      await prisma.product.create({ data: prod });
      console.log(`   ✅ Buat: ${prod.name} - Rp ${prod.price.toLocaleString('id-ID')}`);
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
          title: 'Profit Harian Hingga 18%',
          subtitle: 'Investasi Cerdas, Hasil Maksimal',
          description: 'Dapatkan profit harian hingga 18% selama 90 hari kontrak. Modal kembali setelah kontrak berakhir.',
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
  
  console.log('\n📦 Investment Packages (6):');
  const allPkgs = await prisma.investmentPackage.findMany({ orderBy: { order: 'asc' } });
  for (const p of allPkgs) {
    console.log(`   ${p.order}. ${p.name}: Rp ${p.amount.toLocaleString('id-ID')} - ${p.profitRate}% × ${p.contractDays} hari`);
  }
  
  console.log('\n🛒 Products (6):');
  const allProds = await prisma.product.findMany({ orderBy: { price: 'asc' } });
  for (const p of allProds) {
    console.log(`   - ${p.name}: Rp ${p.price.toLocaleString('id-ID')} → ${p.estimatedProfit.toLocaleString('id-ID')} (${p.duration} hari)`);
  }
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
