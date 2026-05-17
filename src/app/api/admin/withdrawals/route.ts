import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    const where: { status?: string } = {};
    if (status) where.status = status;

    const [withdrawals, total] = await Promise.all([
      db.withdrawal.findMany({
        where,
        include: {
          user: {
            select: {
              id: true, userId: true, name: true, whatsapp: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.withdrawal.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: withdrawals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get admin withdrawals error:', error);
    return NextResponse.json({
      success: true,
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { id, status, note } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, error: 'ID dan status wajib diisi' }, { status: 400 });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ success: false, error: 'Status tidak valid' }, { status: 400 });
    }

    const withdrawal = await db.withdrawal.findUnique({ where: { id } });
    if (!withdrawal) {
      return NextResponse.json({ success: false, error: 'Penarikan tidak ditemukan' }, { status: 404 });
    }

    if (withdrawal.status !== 'pending') {
      return NextResponse.json({ success: false, error: 'Penarikan sudah diproses' }, { status: 400 });
    }

    const updatedWithdrawal = await db.$transaction(async (tx) => {
      const updated = await tx.withdrawal.update({
        where: { id },
        data: {
          status,
          note: note || '',
        },
      });

      // If rejected, return the amount to user's mainBalance
      if (status === 'rejected') {
        await tx.user.update({
          where: { id: withdrawal.userId },
          data: {
            mainBalance: { increment: withdrawal.amount },
          },
        });
      } else {
        // If approved, update totalWithdraw
        await tx.user.update({
          where: { id: withdrawal.userId },
          data: {
            totalWithdraw: { increment: withdrawal.netAmount },
          },
        });
      }

      return updated;
    });

    return NextResponse.json({ success: true, data: updatedWithdrawal });
  } catch (error) {
    console.error('Update admin withdrawal error:', error);
    return NextResponse.json({ success: false, error: 'Database belum tersedia. Silakan hubungi admin.' }, { status: 503 });
  }
}
