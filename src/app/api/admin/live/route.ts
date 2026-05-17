import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const activities = await db.liveActivity.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ success: true, data: activities });
  } catch (error) {
    console.error('Get admin live activities error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { type, userName, amount, productName } = body;

    if (!type || !userName) {
      return NextResponse.json({ success: false, error: 'Type dan userName wajib diisi' }, { status: 400 });
    }

    const activity = await db.liveActivity.create({
      data: {
        type,
        userName,
        amount: parseFloat(String(amount || 0)),
        productName: productName || null,
        isFake: true,
      },
    });

    return NextResponse.json({ success: true, data: activity });
  } catch (error) {
    console.error('Create fake live activity error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    // Read id from JSON body first, then fall back to query param
    let id: string | null = null;
    try {
      const body = await request.json();
      id = body.id || null;
    } catch {
      // Body is not JSON, try searchParams as fallback
    }
    if (!id) {
      const { searchParams } = new URL(request.url);
      id = searchParams.get('id');
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID live activity wajib diisi' }, { status: 400 });
    }

    const existingActivity = await db.liveActivity.findUnique({ where: { id } });
    if (!existingActivity) {
      return NextResponse.json({ success: false, error: 'Live activity tidak ditemukan' }, { status: 404 });
    }

    await db.liveActivity.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { message: 'Live activity berhasil dihapus' } });
  } catch (error) {
    console.error('Delete live activity error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
