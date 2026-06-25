import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    // Require admin authentication for seeding
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Admin authentication required.' },
        { status: 401 }
      );
    }

    // Seed admin with specific credentials
    const existingAdmin = await db.admin.findFirst();
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('nexvo12$', 8);
      await db.admin.create({
        data: {
          username: 'TKA1$NEK',
          email: 'gsnsakti@gmail.com',
          password: hashedPassword,
          name: 'Super Admin',
          role: 'super_admin',
        },
      });
    }

    // Seed system settings
    const settings = [
      { key: 'min_withdraw', value: '100000' },
      { key: 'withdraw_fee', value: '10' },
      { key: 'deposit_fee', value: '500' },
      { key: 'work_start', value: '08:00' },
      { key: 'work_end', value: '17:00' },
      { key: 'referral_bonus', value: '10000' },
      { key: 'cashback', value: '0' },
      { key: 'total_members', value: '15247' },
      { key: 'total_transactions', value: '89432' },
      { key: 'uptime', value: '99.9' },
      { key: 'satisfaction', value: '98' },
      { key: 'qris_image', value: '' },
      { key: 'auto_payment', value: 'false' },
      { key: 'apk_link', value: '' },
      { key: 'apk_version', value: '1.0.0' },
    ];

    for (const setting of settings) {
      const existing = await db.systemSettings.findUnique({ where: { key: setting.key } });
      if (!existing) {
        await db.systemSettings.create({ data: setting });
      }
    }

    // Seed products — Gold Premium Aset 1-6 (kontrak 180 hari, modal TIDAK dikembalikan)
    const existingProducts = await db.product.count();
    if (existingProducts === 0) {
      const CONTRACT_DAYS = 180;
      const QUOTA_HIGH = 9999;
      const randBaseline = () => Math.floor(QUOTA_HIGH * (0.35 + Math.random() * 0.40));
      await db.product.createMany({
        data: [
          { name: 'Gold Premium Aset 1', price: 160000,    duration: CONTRACT_DAYS, estimatedProfit: Math.round(160000   * 0.02  * CONTRACT_DAYS), quota: QUOTA_HIGH, quotaUsed: randBaseline(), description: `Gold Premium Aset 1 - Rp 160.000. Profit 2%/hari = Rp 3.200/hari × ${CONTRACT_DAYS} hari = Rp 576.000. Modal TIDAK dikembalikan, user hanya menerima profit.`, banner: '', isActive: true, isStopped: false, profitRate: 2.0 },
          { name: 'Gold Premium Aset 2', price: 320000,    duration: CONTRACT_DAYS, estimatedProfit: Math.round(320000   * 0.025 * CONTRACT_DAYS), quota: QUOTA_HIGH, quotaUsed: randBaseline(), description: `Gold Premium Aset 2 - Rp 320.000. Profit 2,5%/hari = Rp 8.000/hari × ${CONTRACT_DAYS} hari = Rp 1.440.000. Modal TIDAK dikembalikan.`, banner: '', isActive: true, isStopped: false, profitRate: 2.5 },
          { name: 'Gold Premium Aset 3', price: 640000,    duration: CONTRACT_DAYS, estimatedProfit: Math.round(640000   * 0.03  * CONTRACT_DAYS), quota: QUOTA_HIGH, quotaUsed: randBaseline(), description: `Gold Premium Aset 3 - Rp 640.000. Profit 3%/hari = Rp 19.200/hari × ${CONTRACT_DAYS} hari = Rp 3.456.000. Modal TIDAK dikembalikan.`, banner: '', isActive: true, isStopped: false, profitRate: 3.0 },
          { name: 'Gold Premium Aset 4', price: 1920000,   duration: CONTRACT_DAYS, estimatedProfit: Math.round(1920000  * 0.035 * CONTRACT_DAYS), quota: QUOTA_HIGH, quotaUsed: randBaseline(), description: `Gold Premium Aset 4 - Rp 1.920.000. Profit 3,5%/hari = Rp 67.200/hari × ${CONTRACT_DAYS} hari = Rp 12.096.000. Modal TIDAK dikembalikan.`, banner: '', isActive: true, isStopped: false, profitRate: 3.5 },
          { name: 'Gold Premium Aset 5', price: 5760000,   duration: CONTRACT_DAYS, estimatedProfit: Math.round(5760000  * 0.04  * CONTRACT_DAYS), quota: QUOTA_HIGH, quotaUsed: randBaseline(), description: `Gold Premium Aset 5 - Rp 5.760.000. Profit 4%/hari = Rp 230.400/hari × ${CONTRACT_DAYS} hari = Rp 41.472.000. Modal TIDAK dikembalikan.`, banner: '', isActive: true, isStopped: false, profitRate: 4.0 },
          { name: 'Gold Premium Aset 6', price: 17280000,  duration: CONTRACT_DAYS, estimatedProfit: Math.round(17280000 * 0.05  * CONTRACT_DAYS), quota: QUOTA_HIGH, quotaUsed: randBaseline(), description: `Gold Premium Aset 6 - Rp 17.280.000. Profit 5%/hari = Rp 864.000/hari × ${CONTRACT_DAYS} hari = Rp 155.520.000. Modal TIDAK dikembalikan.`, banner: '', isActive: true, isStopped: false, profitRate: 5.0 },
        ],
      });
    }

    // Seed investment packages — Gold Premium Aset 1-6 (kontrak 180 hari, modal TIDAK dikembalikan)
    const existingPackages = await db.investmentPackage.count();
    if (existingPackages === 0) {
      const CONTRACT_DAYS = 180;
      await db.investmentPackage.createMany({
        data: [
          { name: 'Gold Premium Aset 1', amount: 160000,    profitRate: 2,   contractDays: CONTRACT_DAYS, isActive: true, order: 1 },
          { name: 'Gold Premium Aset 2', amount: 320000,    profitRate: 2.5, contractDays: CONTRACT_DAYS, isActive: true, order: 2 },
          { name: 'Gold Premium Aset 3', amount: 640000,    profitRate: 3,   contractDays: CONTRACT_DAYS, isActive: true, order: 3 },
          { name: 'Gold Premium Aset 4', amount: 1920000,   profitRate: 3.5, contractDays: CONTRACT_DAYS, isActive: true, order: 4 },
          { name: 'Gold Premium Aset 5', amount: 5760000,   profitRate: 4,   contractDays: CONTRACT_DAYS, isActive: true, order: 5 },
          { name: 'Gold Premium Aset 6', amount: 17280000,  profitRate: 5,   contractDays: CONTRACT_DAYS, isActive: true, order: 6 },
        ],
      });
    }

    // Seed banners
    const existingBanners = await db.banner.count();
    if (existingBanners === 0) {
      await db.banner.createMany({
        data: [
          { title: 'Selamat Datang di NEXVO', subtitle: 'Platform Investasi Digital #1', description: 'NEXVO menghadirkan solusi investasi digital berbasis komoditas yang aman, transparan, dan menguntungkan. Mulai perjalanan investasi Anda dengan profit harian terukur dan sistem keamanan berlapis.', ctaText: 'Mulai Sekarang', ctaLink: 'register', image: '/images/banner-1.jpg', order: 1, isActive: true },
          { title: 'Profit Harian Hingga 5%', subtitle: 'Investasi Cerdas, Hasil Maksimal', description: 'Dapatkan profit harian hingga 5% selama 180 hari kontrak. Hanya profit yang dibayarkan — modal awal TIDAK dikembalikan.', ctaText: 'Lihat Paket', ctaLink: 'paket', image: '/images/banner-2.jpg', order: 2, isActive: true },
          { title: 'Bonus Sponsor 5 Level', subtitle: 'Ajak Teman, Raih Bonus', description: 'Dapatkan bonus sponsor hingga 5 level: 5%, 4%, 3%, 2%, 1%. Semakin banyak referral, semakin besar bonus Anda!', ctaText: 'Lihat Jaringan', ctaLink: 'network', image: '/images/banner-3.jpg', order: 3, isActive: true },
        ],
      });
    }

    // Seed testimonials
    const existingTestimonials = await db.testimonial.count();
    if (existingTestimonials === 0) {
      await db.testimonial.createMany({
        data: [
          { name: 'Ahmad Rizky', rating: 5, comment: 'Platform yang sangat profesional! Profit konsisten dan penarikan cepat.', avatar: '', isActive: true },
          { name: 'Siti Nurhaliza', rating: 5, comment: 'Benar-benar legit. Profit masuk tepat waktu dan customer service sangat responsif.', avatar: '', isActive: true },
          { name: 'Budi Santoso', rating: 4, comment: 'Investasi emas disini lebih menguntungkan daripada deposito bank.', avatar: '', isActive: true },
          { name: 'Dewi Lestari', rating: 5, comment: 'Interface modern dan mudah dipahami. Profit juga lebih tinggi dari ekspektasi.', avatar: '', isActive: true },
          { name: 'Fajar Pratama', rating: 5, comment: 'Sudah withdraw beberapa kali dan selalu lancar. Recommended!', avatar: '', isActive: true },
        ],
      });
    }

    // Seed live activities
    const existingActivities = await db.liveActivity.count();
    if (existingActivities === 0) {
      await db.liveActivity.createMany({
        data: [
          { type: 'deposit', userName: 'Ahmad R.', amount: 500000, productName: null, isFake: true },
          { type: 'purchase', userName: 'Siti N.', amount: 160000, productName: 'Gold Premium Aset 1', isFake: true },
          { type: 'withdraw', userName: 'Budi S.', amount: 150000, productName: null, isFake: true },
          { type: 'deposit', userName: 'Dewi L.', amount: 200000, productName: null, isFake: true },
          { type: 'purchase', userName: 'Fajar P.', amount: 17280000, productName: 'Gold Premium Aset 6', isFake: true },
        ],
      });
    }

    // Seed payment methods
    const existingPaymentMethods = await db.paymentMethod.count();
    if (existingPaymentMethods === 0) {
      await db.paymentMethod.createMany({
        data: [
          // QRIS
          { type: 'qris', name: 'QRIS Universal', qrImage: '', color: '#10B981', isActive: true, order: 1 },
          // USDT
          { type: 'usdt', name: 'USDT (BEP20)', accountNo: '', holderName: '', color: '#26A17B', isActive: true, order: 2 },
        ],
      });
    }

    // Seed MatchingConfig
    const existingMatchingConfig = await db.matchingConfig.findFirst({ where: { isActive: true } });
    if (!existingMatchingConfig) {
      await db.matchingConfig.create({
        data: {
          level1: 5,
          level2: 4,
          level3: 3,
          level4: 2,
          level5: 1,
          isActive: true,
        },
      });
    }

    // Seed SalaryConfig — 1%/week PERMANEN (maxWeeks=0)
    const existingSalaryConfig = await db.salaryConfig.findFirst({ where: { isActive: true } });
    if (!existingSalaryConfig) {
      await db.salaryConfig.create({
        data: {
          minDirectRefs: 10,
          salaryRate: 1,
          maxWeeks: 0,
          requireActiveDeposit: true,
          fixedSalaryAmount: 25000,
          isActive: true,
        },
      });
    }

    return NextResponse.json({ success: true, data: { message: 'Database seeded successfully' } });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
