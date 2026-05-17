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
      { key: 'min_withdraw', value: '50000' },
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

    // Seed products
    const existingProducts = await db.product.count();
    if (existingProducts === 0) {
      await db.product.createMany({
        data: [
          { name: 'Emas Starter Pack', price: 100000, duration: 30, estimatedProfit: 8000, quota: 500, quotaUsed: 342, description: 'Paket investasi emas untuk pemula. Dapatkan keuntungan stabil dari pergerakan harga emas dengan modal minimal.', banner: '', isActive: true, isStopped: false, profitRate: 8.0 },
          { name: 'Silver Mining Portfolio', price: 500000, duration: 60, estimatedProfit: 55000, quota: 300, quotaUsed: 187, description: 'Portfolio penambangan perak dengan diversifikasi aset. Keuntungan lebih tinggi dari paket starter.', banner: '', isActive: true, isStopped: false, profitRate: 11.0 },
          { name: 'Gold Premium Asset', price: 1000000, duration: 90, estimatedProfit: 150000, quota: 200, quotaUsed: 98, description: 'Aset emas premium dengan estimasi profit tinggi. Kelola portofolio emas Anda secara profesional.', banner: '', isActive: true, isStopped: false, profitRate: 15.0 },
          { name: 'Diamond Elite Investment', price: 5000000, duration: 120, estimatedProfit: 1000000, quota: 100, quotaUsed: 43, description: 'Investasi berlian elite untuk investor serius. Akses eksklusif ke portfolio berlian dan mineral langka.', banner: '', isActive: true, isStopped: false, profitRate: 20.0 },
        ],
      });
    }

    // Seed banners
    const existingBanners = await db.banner.count();
    if (existingBanners === 0) {
      await db.banner.createMany({
        data: [
          { title: 'Mulai Investasi Aset Digital', subtitle: 'Build Value, Grow Future', description: 'Platform manajemen aset digital berbasis komoditas terpercaya.', ctaText: 'Daftar Sekarang', ctaLink: 'register', image: '', order: 1, isActive: true },
          { title: 'Profit Hingga 20%', subtitle: 'Gold Premium Asset', description: 'Dapatkan keuntungan hingga 20% dari investasi aset emas premium.', ctaText: 'Lihat Produk', ctaLink: 'products', image: '', order: 2, isActive: true },
          { title: 'Bonus Referral Besar', subtitle: 'Ajak Teman, Raih Bonus', description: 'Dapatkan bonus referral untuk setiap teman yang bergabung.', ctaText: 'Pelajari Lebih', ctaLink: 'register', image: '', order: 3, isActive: true },
          { title: 'Penarikan Cepat & Aman', subtitle: 'Proses 1x24 Jam', description: 'Withdraw profit Anda dengan cepat dan aman.', ctaText: 'Mulai Sekarang', ctaLink: 'register', image: '', order: 4, isActive: true },
          { title: 'Aset Digital Terdiversifikasi', subtitle: 'Emas, Perak, Mineral', description: 'Diversifikasi portofolio aset digital Anda dengan berbagai komoditas premium.', ctaText: 'Jelajahi', ctaLink: 'products', image: '', order: 5, isActive: true },
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
          { type: 'purchase', userName: 'Siti N.', amount: 1000000, productName: 'Gold Premium Asset', isFake: true },
          { type: 'withdraw', userName: 'Budi S.', amount: 150000, productName: null, isFake: true },
          { type: 'deposit', userName: 'Dewi L.', amount: 200000, productName: null, isFake: true },
          { type: 'purchase', userName: 'Fajar P.', amount: 5000000, productName: 'Diamond Elite Investment', isFake: true },
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

    // Seed SalaryConfig
    const existingSalaryConfig = await db.salaryConfig.findFirst({ where: { isActive: true } });
    if (!existingSalaryConfig) {
      await db.salaryConfig.create({
        data: {
          minDirectRefs: 10,
          salaryRate: 2.5,
          maxWeeks: 12,
          requireActiveDeposit: true,
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
