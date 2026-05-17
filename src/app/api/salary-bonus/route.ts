import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { checkAndCreditSalaryBonus, getUserSalaryEligibility } from '@/lib/salary-bonus';

// GET: Return user's salary bonus history + eligibility status
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Tidak terautentikasi' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Get eligibility info
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

    // Get total salary earned
    const totalSalaryResult = await db.salaryBonus.aggregate({
      where: { userId: user.id },
      _sum: { amount: true },
    });

    // Check if already claimed this week
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const currentWeek = Math.ceil(dayOfYear / 7);
    const currentYear = now.getFullYear();

    const alreadyClaimedThisWeek = await db.salaryBonus.findUnique({
      where: { userId_weekNumber_year: { userId: user.id, weekNumber: currentWeek, year: currentYear } },
    });

    return NextResponse.json({
      success: true,
      data: {
        eligibility,
        salaryBonuses: salaryBonuses.map((b) => ({
          id: b.id,
          weekNumber: b.weekNumber,
          year: b.year,
          weekOfTotal: b.weekOfTotal,
          amount: b.amount,
          baseOmzet: b.baseOmzet,
          salaryRate: b.salaryRate,
          activeRefDeposits: b.activeRefDeposits,
          directRefs: b.directRefs,
          groupOmzet: b.groupOmzet,
          status: b.status,
          createdAt: b.createdAt.toISOString(),
        })),
        totalSalaryEarned: totalSalaryResult._sum.amount || 0,
        canClaim: eligibility.isEligible && !alreadyClaimedThisWeek,
        alreadyClaimedThisWeek: !!alreadyClaimedThisWeek,
        currentWeek,
        currentYear,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Get salary bonus error:', error);
    // Return fallback data when database is not available
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const currentWeek = Math.ceil(dayOfYear / 7);
    return NextResponse.json({
      success: true,
      data: {
        eligibility: { isEligible: false, reason: 'Database tidak tersedia' },
        salaryBonuses: [],
        totalSalaryEarned: 0,
        canClaim: false,
        alreadyClaimedThisWeek: false,
        currentWeek,
        currentYear: now.getFullYear(),
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      },
    });
  }
}

// POST: Check and credit salary bonus for the current week (user triggered or cron)
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Tidak terautentikasi' },
        { status: 401 }
      );
    }

    if (user.isSuspended) {
      return NextResponse.json(
        { success: false, error: 'Akun Anda ditangguhkan' },
        { status: 403 }
      );
    }

    const result = await checkAndCreditSalaryBonus(user.id);

    return NextResponse.json({
      success: result.success,
      message: result.message,
      data: result.success ? {
        amount: result.amount,
        weekOfTotal: result.weekOfTotal,
        maxWeeks: result.maxWeeks,
        weeksRemaining: result.weeksRemaining,
      } : undefined,
    }, result.success ? { status: 200 } : { status: 400 });
  } catch (error) {
    console.error('Credit salary bonus error:', error);
    return NextResponse.json(
      { success: false, error: 'Database belum tersedia. Silakan hubungi admin.' },
      { status: 503 }
    );
  }
}
