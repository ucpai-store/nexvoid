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

    const [deposits, total] = await Promise.all([
      db.deposit.findMany({
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
      db.deposit.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: deposits,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get admin deposits error:', error);
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

    const deposit = await db.deposit.findUnique({ where: { id } });
    if (!deposit) {
      return NextResponse.json({ success: false, error: 'Deposit tidak ditemukan' }, { status: 404 });
    }

    if (deposit.status !== 'pending') {
      return NextResponse.json({ success: false, error: 'Deposit sudah diproses' }, { status: 400 });
    }

    const updatedDeposit = await db.$transaction(async (tx) => {
      const updated = await tx.deposit.update({
        where: { id },
        data: {
          status,
          note: note || '',
        },
      });

      // If approved, add netAmount to user's depositBalance and totalDeposit
      // depositBalance = only for buying packages, NOT withdrawable
      if (status === 'approved') {
        const netAmount = deposit.netAmount || (deposit.amount - (deposit.fee || 0));
        await tx.user.update({
          where: { id: deposit.userId },
          data: {
            depositBalance: { increment: netAmount },
            totalDeposit: { increment: netAmount },
          },
        });

        // Referral bonuses are NOT credited on deposit approval to avoid double-crediting.
        // They are credited when the user invests or purchases a product.
        // See: /api/investments and /api/products
      }

      return updated;
    });

    return NextResponse.json({ success: true, data: updatedDeposit });
  } catch (error) {
    console.error('Update admin deposit error:', error);
    return NextResponse.json({ success: false, error: 'Database belum tersedia. Silakan hubungi admin.' }, { status: 503 });
  }
}
