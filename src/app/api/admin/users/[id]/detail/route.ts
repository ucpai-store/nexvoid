import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// GET /api/admin/users/[id]/detail — return ALL user data + all transactions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const { id } = await params;

    const user = await db.user.findUnique({
      where: { id },
      include: {
        banks: true,
        deposits: { orderBy: { createdAt: 'desc' }, take: 50 },
        withdrawals: { orderBy: { createdAt: 'desc' }, take: 50 },
        purchases: { orderBy: { createdAt: 'desc' }, take: 50, include: { product: true } },
        investments: { orderBy: { createdAt: 'desc' }, take: 50, include: { package: true } },
        bonusLogs: { orderBy: { createdAt: 'desc' }, take: 100 },
        salaryBonuses: { orderBy: { createdAt: 'desc' }, take: 50 },
        matchingBonuses: { orderBy: { createdAt: 'desc' }, take: 50 },
        referralsFrom: {
          include: { referred: { select: { userId: true, name: true, whatsapp: true, createdAt: true } } },
          orderBy: { createdAt: 'desc' }, take: 50,
        },
      },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User tidak ditemukan' }, { status: 404 });
    }

    // Get referrer info if exists
    let referrer = null;
    if (user.referredBy) {
      referrer = await db.user.findUnique({
        where: { id: user.referredBy },
        select: { userId: true, name: true, whatsapp: true },
      });
    }

    // Get total counts
    const counts = {
      deposits: await db.deposit.count({ where: { userId: id } }),
      withdrawals: await db.withdrawal.count({ where: { userId: id } }),
      purchases: await db.purchase.count({ where: { userId: id } }),
      investments: await db.investment.count({ where: { userId: id } }),
      bonusLogs: await db.bonusLog.count({ where: { userId: id } }),
      salaryBonuses: await db.salaryBonus.count({ where: { userId: id } }),
      matchingBonuses: await db.matchingBonus.count({ where: { userId: id } }),
      referrals: await db.referral.count({ where: { referrerId: id } }),
    };

    return NextResponse.json({
      success: true,
      data: {
        ...user,
        referrer,
        _counts: counts,
      },
    });
  } catch (error) {
    console.error('Get user detail error:', error);
    return NextResponse.json({ success: false, error: 'Gagal memuat detail user' }, { status: 500 });
  }
}
