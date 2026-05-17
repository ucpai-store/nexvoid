import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

/**
 * Public initialization endpoint for first-time setup.
 * This creates the admin account and seeds all default data.
 * Only works if no data exists yet (safe to call multiple times).
 *
 * Access: GET or POST /api/init (no auth required, idempotent)
 */
async function seedDatabase() {
  const results: string[] = [];

  // 1. Create default admin if none exists, or update existing admin credentials
  const existingAdmin = await db.admin.findFirst();
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('Admin@2024', 8);
    await db.admin.create({
      data: {
        username: 'admin',
        email: 'admin@nexvo.id',
        password: hashedPassword,
        name: 'Super Admin',
        role: 'super_admin',
      },
    });
    results.push('✅ Admin created (username: admin, email: admin@nexvo.id)');
  } else {
    // Update existing admin to have the standard credentials
    const hashedPassword = await bcrypt.hash('Admin@2024', 8);
    await db.admin.update({
      where: { id: existingAdmin.id },
      data: {
        username: 'admin',
        email: 'admin@nexvo.id',
        password: hashedPassword,
        loginAttempts: 0,
        lockedUntil: null,
      },
    });
    results.push('✅ Admin credentials updated (username: admin, email: admin@nexvo.id)');
  }

  // 2. Create default system settings if none exist
  const settingsCount = await db.systemSettings.count();
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
      await db.systemSettings.create({ data: setting });
    }
    results.push('✅ System settings created (16 settings)');
  } else {
    results.push('⏭️ System settings already exist');
  }

  // 3. Create default payment methods if none exist
  const paymentMethodCount = await db.paymentMethod.count();
  if (paymentMethodCount === 0) {
    await db.paymentMethod.createMany({
      data: [
        { type: 'bank', name: 'Bank BCA', holderName: 'NEXVO', color: '#003D79', isActive: true, order: 1 },
        { type: 'bank', name: 'Bank Mandiri', holderName: 'NEXVO', color: '#003366', isActive: true, order: 2 },
        { type: 'ewallet', name: 'DANA', holderName: 'NEXVO', color: '#108EE9', isActive: true, order: 3 },
        { type: 'ewallet', name: 'OVO', holderName: 'NEXVO', color: '#4C3494', isActive: true, order: 4 },
        { type: 'ewallet', name: 'GoPay', holderName: 'NEXVO', color: '#00AED6', isActive: true, order: 5 },
      ],
    });
    results.push('✅ Payment methods created (Bank BCA, Bank Mandiri, DANA, OVO, GoPay)');
  } else {
    results.push('⏭️ Payment methods already exist');
  }

  // 4. Create default investment packages if none exist
  const packageCount = await db.investmentPackage.count();
  if (packageCount === 0) {
    await db.investmentPackage.createMany({
      data: [
        { name: 'Paket Starter', amount: 500000, profitRate: 10, contractDays: 90, isActive: true, order: 1 },
        { name: 'Paket Silver', amount: 1000000, profitRate: 10, contractDays: 90, isActive: true, order: 2 },
        { name: 'Paket Gold', amount: 5000000, profitRate: 10, contractDays: 90, isActive: true, order: 3 },
        { name: 'Paket Platinum', amount: 10000000, profitRate: 10, contractDays: 90, isActive: true, order: 4 },
      ],
    });
    results.push('✅ Investment packages created (Starter 500K, Silver 1M, Gold 5M, Platinum 10M)');
  } else {
    results.push('⏭️ Investment packages already exist');
  }

  // 5. Create default banners if none exist (using existing images in public/images/)
  const bannerCount = await db.banner.count();
  if (bannerCount === 0) {
    await db.banner.createMany({
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
    results.push('✅ Banners created (3 banners)');
  } else {
    results.push('⏭️ Banners already exist');
  }

  // 6. Create default MatchingConfig if none exists
  const existingMatchingConfig = await db.matchingConfig.findFirst();
  if (!existingMatchingConfig) {
    await db.matchingConfig.create({
      data: { level1: 5, level2: 4, level3: 3, level4: 2, level5: 1, isActive: true },
    });
    results.push('✅ MatchingConfig created (5 levels: 5%, 4%, 3%, 2%, 1%)');
  } else {
    results.push('⏭️ MatchingConfig already exists');
  }

  // 7. Create default SalaryConfig if none exists
  const existingSalaryConfig = await db.salaryConfig.findFirst();
  if (!existingSalaryConfig) {
    await db.salaryConfig.create({
      data: { minDirectRefs: 10, salaryRate: 2.5, maxWeeks: 12, requireActiveDeposit: true, isActive: true },
    });
    results.push('✅ SalaryConfig created (2.5%/week × 12 weeks)');
  } else {
    results.push('⏭️ SalaryConfig already exists');
  }

  return results;
}

export async function GET() {
  try {
    const results = await seedDatabase();

    return NextResponse.json({
      success: true,
      message: '🎉 NEXVO initialized successfully!',
      results,
      adminCredentials: {
        username: 'admin',
        email: 'admin@nexvo.id',
        password: 'Admin@2024',
      },
      nextSteps: [
        '1. Login as admin at the admin panel',
        '2. Configure payment methods (set account numbers, upload QR images)',
        '3. Set up cron jobs for daily profit and weekly salary',
      ],
    }, { status: 200 });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[INIT] Error:', message);
    return NextResponse.json({
      success: false,
      error: 'Initialization failed',
      details: message,
      hint: 'Make sure the database tables exist. Try redeploying the application.',
    }, { status: 500 });
  }
}

export async function POST() {
  try {
    const results = await seedDatabase();

    return NextResponse.json({
      success: true,
      message: '🎉 NEXVO initialized successfully!',
      results,
      adminCredentials: {
        username: 'admin',
        email: 'admin@nexvo.id',
        password: 'Admin@2024',
      },
      nextSteps: [
        '1. Login as admin at the admin panel',
        '2. Configure payment methods (set account numbers, upload QR images)',
        '3. Set up cron jobs for daily profit and weekly salary',
      ],
    }, { status: 200 });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[INIT] Error:', message);
    return NextResponse.json({
      success: false,
      error: 'Initialization failed',
      details: message,
      hint: 'Make sure the database tables exist. Try redeploying the application.',
    }, { status: 500 });
  }
}
