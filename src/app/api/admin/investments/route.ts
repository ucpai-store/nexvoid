import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';
import { creditMatchingBonusOnProfit } from '@/lib/matching-bonus';

/**
 * Admin Investments API
 * Manage user investments (Investment model) — separate from product purchases (Purchase model).
 */

// GET: List all investments with user + package info
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

    const [investments, total] = await Promise.all([
      db.investment.findMany({
        where,
        include: {
          user: {
            select: {
              id: true, userId: true, name: true, whatsapp: true,
            },
          },
          package: {
            select: {
              id: true, name: true, profitRate: true, contractDays: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.investment.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        investments,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Get admin investments error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT: Update investment status (activate, stop, complete, add-profit)
export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { investmentId, profitEarned, action } = body;

    if (!investmentId || !action) {
      return NextResponse.json({ success: false, error: 'investmentId dan action wajib diisi' }, { status: 400 });
    }

    const investment = await db.investment.findUnique({
      where: { id: investmentId },
      include: { user: true },
    });

    if (!investment) {
      return NextResponse.json({ success: false, error: 'Investasi tidak ditemukan' }, { status: 404 });
    }

    // Add profit to investment
    if (action === 'add-profit') {
      const profitAmount = parseFloat(String(profitEarned || 0));
      if (profitAmount <= 0) {
        return NextResponse.json({ success: false, error: 'Jumlah profit harus lebih dari 0' }, { status: 400 });
      }

      const updatedInvestment = await db.$transaction(async (tx) => {
        // Update investment totalProfitEarned
        const updated = await tx.investment.update({
          where: { id: investmentId },
          data: {
            totalProfitEarned: { increment: profitAmount },
          },
        });

        // Add profit to user's mainBalance and totalProfit
        await tx.user.update({
          where: { id: investment.userId },
          data: {
            mainBalance: { increment: profitAmount },
            totalProfit: { increment: profitAmount },
          },
        });

        // Create live activity
        await tx.liveActivity.create({
          data: {
            type: 'profit',
            userName: investment.user.name || investment.user.userId,
            amount: profitAmount,
            productName: (await tx.investmentPackage.findUnique({ where: { id: investment.packageId } }))?.name || '',
            isFake: false,
          },
        });

        // Credit matching bonuses to upline users
        const pkgName = (await tx.investmentPackage.findUnique({ where: { id: investment.packageId } }))?.name || '';
        await creditMatchingBonusOnProfit(tx, investment.userId, profitAmount, 'investment');

        return updated;
      });

      return NextResponse.json({ success: true, data: updatedInvestment });
    }

    // Stop investment
    if (action === 'stop') {
      if (investment.status !== 'active') {
        return NextResponse.json({ success: false, error: 'Hanya investasi aktif yang dapat dihentikan' }, { status: 400 });
      }
      const updated = await db.investment.update({
        where: { id: investmentId },
        data: { status: 'stopped' },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    // Complete investment
    if (action === 'complete') {
      if (investment.status !== 'active') {
        return NextResponse.json({ success: false, error: 'Hanya investasi aktif yang dapat diselesaikan' }, { status: 400 });
      }
      const updated = await db.investment.update({
        where: { id: investmentId },
        data: { status: 'completed' },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    // Activate (reactivate) investment
    if (action === 'activate') {
      if (investment.status !== 'stopped') {
        return NextResponse.json({ success: false, error: 'Hanya investasi yang dihentikan yang dapat diaktifkan kembali' }, { status: 400 });
      }
      const updated = await db.investment.update({
        where: { id: investmentId },
        data: { status: 'active' },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json({ success: false, error: 'Action tidak valid' }, { status: 400 });
  } catch (error) {
    console.error('Update admin investment error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
