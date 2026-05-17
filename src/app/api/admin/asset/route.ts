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
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status');

    const where: { status?: string } = {};
    if (status) where.status = status;

    const [purchases, total] = await Promise.all([
      db.purchase.findMany({
        where,
        include: {
          user: {
            select: {
              id: true, userId: true, name: true, whatsapp: true,
            },
          },
          product: {
            select: {
              id: true, name: true, price: true, duration: true, estimatedProfit: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.purchase.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        purchases,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Get admin asset error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { purchaseId, profitEarned, action } = body;

    if (!purchaseId || !action) {
      return NextResponse.json({ success: false, error: 'purchaseId dan action wajib diisi' }, { status: 400 });
    }

    const purchase = await db.purchase.findUnique({
      where: { id: purchaseId },
      include: { user: true },
    });

    if (!purchase) {
      return NextResponse.json({ success: false, error: 'Pembelian tidak ditemukan' }, { status: 404 });
    }

    if (action === 'add-profit') {
      const profitAmount = parseFloat(String(profitEarned || 0));
      if (profitAmount <= 0) {
        return NextResponse.json({ success: false, error: 'Jumlah profit harus lebih dari 0' }, { status: 400 });
      }

      const updatedPurchase = await db.$transaction(async (tx) => {
        // Update purchase profitEarned
        const updated = await tx.purchase.update({
          where: { id: purchaseId },
          data: {
            profitEarned: { increment: profitAmount },
          },
        });

        // Add profit to user's mainBalance and totalProfit
        await tx.user.update({
          where: { id: purchase.userId },
          data: {
            mainBalance: { increment: profitAmount },
            totalProfit: { increment: profitAmount },
          },
        });

        // Create profit log
        await tx.profitLog.create({
          data: {
            purchaseId,
            userId: purchase.userId,
            amount: profitAmount,
          },
        });

        // Create live activity
        await tx.liveActivity.create({
          data: {
            type: 'profit',
            userName: purchase.user.name || purchase.user.userId,
            amount: profitAmount,
            productName: (await tx.product.findUnique({ where: { id: purchase.productId } }))?.name || '',
            isFake: false,
          },
        });

        return updated;
      });

      return NextResponse.json({ success: true, data: updatedPurchase });
    }

    if (action === 'stop') {
      if (purchase.status !== 'active') {
        return NextResponse.json({ success: false, error: 'Hanya aset aktif yang dapat dihentikan' }, { status: 400 });
      }
      const updated = await db.purchase.update({
        where: { id: purchaseId },
        data: { status: 'stopped' },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    if (action === 'complete') {
      if (purchase.status !== 'active') {
        return NextResponse.json({ success: false, error: 'Hanya aset aktif yang dapat diselesaikan' }, { status: 400 });
      }
      const updated = await db.purchase.update({
        where: { id: purchaseId },
        data: { status: 'completed' },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json({ success: false, error: 'Action tidak valid' }, { status: 400 });
  } catch (error) {
    console.error('Update admin asset error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
