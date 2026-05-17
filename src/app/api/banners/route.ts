import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const FALLBACK_BANNERS = [
  {
    id: '1',
    title: 'Selamat Datang di NEXVO',
    subtitle: 'Platform Investasi Digital #1',
    description: 'NEXVO menghadirkan solusi investasi digital berbasis komoditas yang aman, transparan, dan menguntungkan.',
    ctaText: 'Mulai Sekarang',
    ctaLink: 'register',
    image: '/images/banner-1.jpg',
    order: 1,
    isActive: true,
  },
  {
    id: '2',
    title: 'Profit Harian 10%',
    subtitle: 'Investasi Cerdas, Hasil Maksimal',
    description: 'Dapatkan profit harian 10% selama 90 hari kontrak.',
    ctaText: 'Lihat Paket',
    ctaLink: 'paket',
    image: '/images/banner-2.jpg',
    order: 2,
    isActive: true,
  },
  {
    id: '3',
    title: 'Bonus Referral Menarik',
    subtitle: 'Ajak Teman, Raih Bonus',
    description: 'Dapatkan bonus sponsorship dan level dari setiap referral yang bergabung.',
    ctaText: 'Daftar Sekarang',
    ctaLink: 'register',
    image: '/images/banner-3.jpg',
    order: 3,
    isActive: true,
  },
  {
    id: '4',
    title: 'Aman & Terpercaya',
    subtitle: 'Investasi Tanpa Khawatir',
    description: 'Platform investasi digital yang terjamin keamanan dan transparansi dana.',
    ctaText: 'Pelajari Lebih',
    ctaLink: 'about',
    image: '/images/banner-4.jpg',
    order: 4,
    isActive: true,
  },
];

export async function GET() {
  try {
    const banners = await db.banner.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });

    return NextResponse.json({ success: true, data: banners });
  } catch (error) {
    console.error('Get banners error:', error);
    // Return fallback data when database is not available
    return NextResponse.json({ success: true, data: FALLBACK_BANNERS });
  }
}
