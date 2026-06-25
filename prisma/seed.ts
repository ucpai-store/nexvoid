import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding database...\n');

  // 1. Create default admin if none exists
  const existingAdmin = await prisma.admin.findFirst();
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('Admin@2024', 8);
    await prisma.admin.create({
      data: {
        username: 'admin',
        email: 'admin@nexvo.id',
        password: hashedPassword,
        name: 'Super Admin',
        role: 'super_admin',
      },
    });
    console.log('✅ Default admin created');
    console.log('   Username : admin');
    console.log('   Email    : admin@nexvo.id');
    console.log('   Password : Admin@2024');
    console.log('   Role     : super_admin\n');
  } else {
    console.log('⏭️  Admin already exists (skipped)\n');
  }

  // 2. Create default system settings if none exist
  const settingsCount = await prisma.systemSettings.count();
  if (settingsCount === 0) {
    const defaultSettings = [
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

    for (const setting of defaultSettings) {
      await prisma.systemSettings.create({ data: setting });
    }
    console.log('✅ System settings created (16 settings)\n');
  } else {
    console.log('⏭️  System settings already exist (skipped)\n');
  }

  // 3. Create default payment methods — QRIS + USDT (deposit page filter type IN qris/usdt)
  //    Hapus dulu payment lama yang type-nya bank/ewallet (nggak dipakai deposit page),
  //    lalu pastikan qris + usdt ada.
  console.log('Syncing payment methods (QRIS + USDT)...');
  const legacyPms = await prisma.paymentMethod.findMany({
    where: { NOT: { type: { in: ['qris', 'usdt'] } } },
  });
  for (const lp of legacyPms) {
    try { await prisma.paymentMethod.delete({ where: { id: lp.id } }); } catch (_) {}
  }
  if (legacyPms.length > 0) {
    console.log(`   🗑️  Hapus ${legacyPms.length} payment method lama (bank/ewallet)`);
  }

  const existingQris = await prisma.paymentMethod.findFirst({ where: { type: 'qris' } });
  if (!existingQris) {
    await prisma.paymentMethod.create({
      data: {
        type: 'qris',
        name: 'QRIS Universal',
        accountNo: '',
        holderName: 'NEXVO',
        qrImage: '',
        iconUrl: '',
        color: '#E31E24',
        isActive: true,
        order: 1,
      },
    });
    console.log('✅ QRIS payment created (qrImage belum diisi — admin upload via panel)');
  } else {
    console.log('⏭️  QRIS payment already exists');
  }

  const existingUsdt = await prisma.paymentMethod.findFirst({ where: { type: 'usdt' } });
  if (!existingUsdt) {
    await prisma.paymentMethod.create({
      data: {
        type: 'usdt',
        name: 'USDT (BEP20)',
        accountNo: '',
        holderName: 'NEXVO',
        qrImage: '',
        iconUrl: '',
        color: '#26A17B',
        isActive: true,
        order: 2,
      },
    });
    console.log('✅ USDT payment created (accountNo belum diisi — admin isi wallet via panel)');
  } else {
    console.log('⏭️  USDT payment already exists');
  }
  console.log('   💡 Admin wajib upload QR QRIS & isi wallet USDT via panel\n');

  // 4. Create default investment packages if none exist — Gold Premium Aset 1-6
  //    (kontrak 180 hari, modal TIDAK dikembalikan, user hanya terima profit harian)
  //    ★ UPSERT: kalau paket sudah ada tapi datanya salah (rate/modal beda), tetap di-update ★
  console.log('Syncing investment packages (Gold Premium Aset 1-6, kontrak 180 hari)...');
  const packages = [
    { name: 'Gold Premium Aset 1', amount: 160000,    profitRate: 2,   contractDays: 180, isActive: true, order: 1 },
    { name: 'Gold Premium Aset 2', amount: 320000,    profitRate: 2.5, contractDays: 180, isActive: true, order: 2 },
    { name: 'Gold Premium Aset 3', amount: 640000,    profitRate: 3,   contractDays: 180, isActive: true, order: 3 },
    { name: 'Gold Premium Aset 4', amount: 1920000,   profitRate: 3.5, contractDays: 180, isActive: true, order: 4 },
    { name: 'Gold Premium Aset 5', amount: 5760000,   profitRate: 4,   contractDays: 180, isActive: true, order: 5 },
    { name: 'Gold Premium Aset 6', amount: 17280000,  profitRate: 5,   contractDays: 180, isActive: true, order: 6 },
  ];
  for (const pkg of packages) {
    const existing = await prisma.investmentPackage.findFirst({ where: { name: pkg.name } });
    if (existing) {
      // Update kalau ada perubahan (fix VPS user yang rate-nya salah)
      await prisma.investmentPackage.update({
        where: { id: existing.id },
        data: {
          amount: pkg.amount,
          profitRate: pkg.profitRate,
          contractDays: pkg.contractDays,
          isActive: pkg.isActive,
          order: pkg.order,
        },
      });
    } else {
      await prisma.investmentPackage.create({ data: pkg });
    }
  }
  console.log(`✅ Investment packages synced (6 paket, rate 2%/2.5%/3%/3.5%/4%/5%)\n`);

  // 4b. Create default products if none exist — Gold Premium Aset 1-6
  //     (spec sama persis dengan InvestmentPackage di atas)
  //     ★ UPSERT: kalau produk sudah ada tapi datanya salah, tetap di-update ★
  console.log('Syncing products (Gold Premium Aset 1-6)...');
  const CONTRACT_DAYS = 180;
  const QUOTA_HIGH = 9999;
  const products = [
    { name: 'Gold Premium Aset 1', price: 160000,    profitRate: 2.0,   description: `Gold Premium Aset 1 - Rp 160.000. Profit 2%/hari = Rp 3.200/hari × ${CONTRACT_DAYS} hari = Rp 576.000. Modal TIDAK dikembalikan.` },
    { name: 'Gold Premium Aset 2', price: 320000,    profitRate: 2.5,   description: `Gold Premium Aset 2 - Rp 320.000. Profit 2,5%/hari = Rp 8.000/hari × ${CONTRACT_DAYS} hari = Rp 1.440.000. Modal TIDAK dikembalikan.` },
    { name: 'Gold Premium Aset 3', price: 640000,    profitRate: 3.0,   description: `Gold Premium Aset 3 - Rp 640.000. Profit 3%/hari = Rp 19.200/hari × ${CONTRACT_DAYS} hari = Rp 3.456.000. Modal TIDAK dikembalikan.` },
    { name: 'Gold Premium Aset 4', price: 1920000,   profitRate: 3.5,   description: `Gold Premium Aset 4 - Rp 1.920.000. Profit 3,5%/hari = Rp 67.200/hari × ${CONTRACT_DAYS} hari = Rp 12.096.000. Modal TIDAK dikembalikan.` },
    { name: 'Gold Premium Aset 5', price: 5760000,   profitRate: 4.0,   description: `Gold Premium Aset 5 - Rp 5.760.000. Profit 4%/hari = Rp 230.400/hari × ${CONTRACT_DAYS} hari = Rp 41.472.000. Modal TIDAK dikembalikan.` },
    { name: 'Gold Premium Aset 6', price: 17280000,  profitRate: 5.0,   description: `Gold Premium Aset 6 - Rp 17.280.000. Profit 5%/hari = Rp 864.000/hari × ${CONTRACT_DAYS} hari = Rp 155.520.000. Modal TIDAK dikembalikan.` },
  ];
  for (const prod of products) {
    const estimatedProfit = Math.round(prod.price * (prod.profitRate / 100) * CONTRACT_DAYS);
    const existing = await prisma.product.findFirst({ where: { name: prod.name } });
    if (existing) {
      // Update field struktural (TIDAK touch banner, quotaUsed, isStopped — field user-generated)
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          price: prod.price,
          profitRate: prod.profitRate,
          duration: CONTRACT_DAYS,
          estimatedProfit,
          description: prod.description,
          isActive: true,
        },
      });
    } else {
      await prisma.product.create({
        data: {
          name: prod.name,
          price: prod.price,
          duration: CONTRACT_DAYS,
          estimatedProfit,
          quota: QUOTA_HIGH,
          quotaUsed: Math.floor(QUOTA_HIGH * (0.35 + Math.random() * 0.40)),
          description: prod.description,
          banner: '',
          isActive: true,
          isStopped: false,
          profitRate: prod.profitRate,
        },
      });
    }
  }
  console.log(`✅ Products synced (6 produk, rate 2%/2.5%/3%/3.5%/4%/5%)\n`);

  // 4c. ★ FIX EXISTING INVESTMENTS — sync dailyProfit ke rate terbaru ★
  //     Kalau ada investment yang dailyProfit-nya tidak cocok dengan amount × profitRate,
  //     update ke nilai yang benar. Ini fix VPS user yang investment-nya dibuat saat rate masih salah.
  console.log('Fixing existing investments (sync dailyProfit ke rate terbaru)...');
  const allInvestments = await prisma.investment.findMany({ include: { package: true } });
  let fixedCount = 0;
  for (const inv of allInvestments) {
    if (!inv.package) continue;
    const correctDailyProfit = Math.floor(inv.amount * (inv.package.profitRate / 100));
    if (inv.dailyProfit !== correctDailyProfit) {
      await prisma.investment.update({
        where: { id: inv.id },
        data: { dailyProfit: correctDailyProfit },
      });
      fixedCount++;
      console.log(`   🔧 Fixed: ${inv.id} | ${inv.package.name} | old=${inv.dailyProfit} → new=${correctDailyProfit}`);
    }
  }
  if (fixedCount > 0) {
    console.log(`✅ Fixed ${fixedCount} investments dengan dailyProfit yang salah\n`);
  } else {
    console.log(`⏭️  All investments sudah punya dailyProfit yang benar\n`);
  }

  // 5. Create default banners if none exist (using existing images in public/images/)
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
          title: 'Profit Harian 10%',
          subtitle: 'Investasi Cerdas, Hasil Maksimal',
          description: 'Dapatkan profit harian 10% selama 90 hari kontrak. Modal kembali setelah kontrak berakhir.',
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
      ],
    });
    console.log('✅ Banners created (3 banners)\n');
  } else {
    console.log('⏭️  Banners already exist (skipped)\n');
  }

  // 6. Create default MatchingConfig if none exists
  const existingMatchingConfig = await prisma.matchingConfig.findFirst();
  if (!existingMatchingConfig) {
    await prisma.matchingConfig.create({
      data: {
        level1: 5,
        level2: 4,
        level3: 3,
        level4: 2,
        level5: 1,
        isActive: true,
      },
    });
    console.log('✅ MatchingConfig created (5 levels: 5%, 4%, 3%, 2%, 1%)\n');
  } else {
    console.log('⏭️  MatchingConfig already exists (skipped)\n');
  }

  // 7. UPSERT SalaryConfig — 1%/week PERMANEN (maxWeeks=0), min 10 referral aktif deposit
  //    ★ UPSERT: kalau config sudah ada tapi datanya salah (rate 2.5%/maxWeeks 12), tetap di-update ★
  console.log('Syncing SalaryConfig (1%/week PERMANEN, min 10 referral aktif deposit)...');
  const existingSalaryConfig = await prisma.salaryConfig.findFirst();
  const SALARY_DEFAULTS = {
    minDirectRefs: 10,
    salaryRate: 1,
    maxWeeks: 0,
    requireActiveDeposit: true,
    fixedSalaryAmount: 25000,
    isActive: true,
  };
  if (existingSalaryConfig) {
    await prisma.salaryConfig.update({
      where: { id: existingSalaryConfig.id },
      data: SALARY_DEFAULTS,
    });
    console.log('✅ SalaryConfig updated (1%/week PERMANEN — maxWeeks=0)\n');
  } else {
    await prisma.salaryConfig.create({ data: SALARY_DEFAULTS });
    console.log('✅ SalaryConfig created (1%/week PERMANEN — maxWeeks=0)\n');
  }

  console.log('🎉 Seeding complete!');
  console.log('\n📋 Admin login credentials:');
  console.log('   Username : admin');
  console.log('   Password : Admin@2024');
}

seed()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
