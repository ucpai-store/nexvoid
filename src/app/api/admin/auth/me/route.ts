import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    // Get full admin data including list of admins (if super_admin)
    let admins: { id: string; username: string; email: string; name: string; role: string; lastLogin: Date | null; loginAttempts: number; lockedUntil: Date | null; createdAt: Date }[] = [];
    if (admin.role === 'super_admin') {
      admins = await db.admin.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          lastLogin: true,
          loginAttempts: true,
          lockedUntil: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        currentAdmin: admin,
        admins,
      },
    });
  } catch (error) {
    console.error('Admin me error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
