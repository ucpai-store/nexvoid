import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { getUserSalaryEligibility } from '@/lib/salary-bonus';

// GET: Get user's salary bonus info, history, and current eligibility
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Get current eligibility
    const eligibility = await getUserSalaryEligibility(user.id);

    // Get salary bonus history
    const [salaryBonuses, total] = await Promise.all([
      db.salaryBonus.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.salaryBonus.count({ where: { userId: user.id } }),
    ]);

    // Get total salary bonus earned
    const totalSalaryAgg = await db.salaryBonus.aggregate({
      where: { userId: user.id, status: 'paid' },
      _sum: { amount: true },
      _count: true,
    });

    // Get salary bonus from BonusLog
    const salaryBonusLogAgg = await db.bonusLog.aggregate({
      where: { userId: user.id, type: 'salary' },
      _sum: { amount: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        eligibility,
        history: salaryBonuses.map((sb) => ({
          id: sb.id,
          weekNumber: sb.weekNumber,
          year: sb.year,
          directReferrals: sb.directRefs,
          omzet: sb.groupOmzet,
          amount: sb.amount,
          status: sb.status,
          note: '',
          paidAt: sb.createdAt?.toISOString() || null,
          createdAt: sb.createdAt.toISOString(),
        })),
        stats: {
          totalSalaryEarned: totalSalaryAgg._sum.amount || 0,
          totalSalaryCount: totalSalaryAgg._count,
          totalSalaryFromLog: salaryBonusLogAgg._sum.amount || 0,
        },
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Get salary bonus info error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
