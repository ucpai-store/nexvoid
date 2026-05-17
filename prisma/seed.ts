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

  // 3. Create default payment methods if none exist
  const paymentMethodCount = await prisma.paymentMethod.count();
  if (paymentMethodCount === 0) {
    await prisma.paymentMethod.createMany({
      data: [
        {
          type: 'bank',
          name: 'Bank BCA',
          accountNo: '',
          holderName: 'NEXVO',
          qrImage: '',
          iconUrl: '',
          color: '#003D79',
          isActive: true,
          order: 1,
        },
        {
          type: 'bank',
          name: 'Bank Mandiri',
          accountNo: '',
          holderName: 'NEXVO',
          qrImage: '',
          iconUrl: '',
          color: '#003366',
          isActive: true,
          order: 2,
        },
        {
          type: 'ewallet',
          name: 'DANA',
          accountNo: '',
          holderName: 'NEXVO',
          qrImage: '',
          iconUrl: '',
          color: '#108EE9',
          isActive: true,
          order: 3,
        },
        {
          type: 'ewallet',
          name: 'OVO',
          accountNo: '',
          holderName: 'NEXVO',
          qrImage: '',
          iconUrl: '',
          color: '#4C3494',
          isActive: true,
          order: 4,
        },
        {
          type: 'ewallet',
          name: 'GoPay',
          accountNo: '',
          holderName: 'NEXVO',
          qrImage: '',
          iconUrl: '',
          color: '#00AED6',
          isActive: true,
          order: 5,
        },
      ],
    });
    console.log('✅ Payment methods created (Bank BCA, Bank Mandiri, DANA, OVO, GoPay)\n');
  } else {
    console.log('⏭️  Payment methods already exist (skipped)\n');
  }

  // 4. Create default investment packages if none exist
  const packageCount = await prisma.investmentPackage.count();
  if (packageCount === 0) {
    await prisma.investmentPackage.createMany({
      data: [
        { name: 'Paket Starter', amount: 500000, profitRate: 10, contractDays: 90, isActive: true, order: 1 },
        { name: 'Paket Silver', amount: 1000000, profitRate: 10, contractDays: 90, isActive: true, order: 2 },
        { name: 'Paket Gold', amount: 5000000, profitRate: 10, contractDays: 90, isActive: true, order: 3 },
        { name: 'Paket Platinum', amount: 10000000, profitRate: 10, contractDays: 90, isActive: true, order: 4 },
      ],
    });
    console.log('✅ Investment packages created (Starter, Silver, Gold, Platinum)\n');
  } else {
    console.log('⏭️  Investment packages already exist (skipped)\n');
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

  // 7. Create default SalaryConfig if none exists
  const existingSalaryConfig = await prisma.salaryConfig.findFirst();
  if (!existingSalaryConfig) {
    await prisma.salaryConfig.create({
      data: {
        minDirectRefs: 10,
        salaryRate: 2.5,
        maxWeeks: 12,
        requireActiveDeposit: true,
        isActive: true,
      },
    });
    console.log('✅ SalaryConfig created (2.5%/week × 12 weeks)\n');
  } else {
    console.log('⏭️  SalaryConfig already exists (skipped)\n');
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
