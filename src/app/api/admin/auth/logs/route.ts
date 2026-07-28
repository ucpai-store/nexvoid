import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';

// GET - List recent admin activity logs
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);

    const logs = await db.adminLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        admin: {
          select: { name: true, username: true },
        },
      },
    });

    const data = logs.map((log) => ({
      id: log.id,
      action: log.action,
      detail: log.detail,
      ip: log.ip,
      createdAt: log.createdAt.toISOString(),
      admin: {
        name: log.admin?.name || 'Unknown',
        username: log.admin?.username || 'unknown',
      },
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Admin logs error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
