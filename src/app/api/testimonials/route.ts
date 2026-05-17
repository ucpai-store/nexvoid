import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const FALLBACK_TESTIMONIALS = [
  { id: '1', name: 'Ahmad Rizky', rating: 5, comment: 'Platform yang sangat profesional! Profit konsisten dan penarikan cepat.', avatar: '', isActive: true },
  { id: '2', name: 'Siti Nurhaliza', rating: 5, comment: 'Benar-benar legit. Profit masuk tepat waktu.', avatar: '', isActive: true },
  { id: '3', name: 'Budi Santoso', rating: 4, comment: 'Investasi emas disini lebih menguntungkan daripada deposito bank.', avatar: '', isActive: true },
  { id: '4', name: 'Dewi Lestari', rating: 5, comment: 'Interface modern dan mudah dipahami.', avatar: '', isActive: true },
  { id: '5', name: 'Fajar Pratama', rating: 5, comment: 'Sudah withdraw beberapa kali dan selalu lancar. Recommended!', avatar: '', isActive: true },
];

export async function GET() {
  try {
    const testimonials = await db.testimonial.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({ success: true, data: testimonials });
  } catch (error) {
    console.error('Get testimonials error:', error);
    // Return fallback data when database is not available
    return NextResponse.json({ success: true, data: FALLBACK_TESTIMONIALS });
  }
}
