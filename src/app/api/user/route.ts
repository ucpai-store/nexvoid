import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';

// ★ CRITICAL FIX v7: Force dynamic — disable Next.js route cache.
//   Tanpa ini, saldo utama & total profit di user dashboard bisa lihat data LAMA.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
