import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { getUserMatchingInfo, creditMatchingBonus } from '@/lib/matching-bonus';

// GET: Return user's matching profit info + history
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

    // Get matching profit info (includes potential bonus, downline details)
    const matchingInfo = await getUserMatchingInfo(user.id);

    // Get matching bonus history with pagination
    const [history, total] = await Promise.all([
      db.matchingBonus.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.matchingBonus.count({ where: { userId: user.id } }),
    ]);

    // Get matching config
    const config = await db.matchingConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    // Calculate totals from history
    const totals = await db.matchingBonus.aggregate({
      where: { userId: user.id },
      _sum: { amount: true, matchedOmzet: true },
      _count: true,
    });

    return NextResponse.json({
      success: true,
      data: {
        matchingInfo: {
          totalDownlineProfit: matchingInfo.totalDownlineProfit,
          totalDownlineMembers: matchingInfo.totalDownlineMembers,
          potentialBonus: matchingInfo.potentialBonus,
          totalMatchingEarned: matchingInfo.totalMatchingEarned,
          maxMatchingLevel: matchingInfo.maxMatchingLevel,
          levels: matchingInfo.levels
            .filter((lvl) => !lvl.isDisconnected)
            .map((lvl) => ({
              level: lvl.level,
              rate: lvl.rate,
              profitOmzet: lvl.profitOmzet,
              memberCount: lvl.memberCount,
              amount: lvl.amount,
            })),
          levelMembers: matchingInfo.levelMembers,
        },
        config: config
          ? {
              level1: config.level1,
              level2: config.level2,
              level3: config.level3,
              level4: config.level4,
              level5: config.level5,
              isActive: config.isActive,
            }
          : {
              level1: 5,
              level2: 4,
              level3: 3,
              level4: 2,
              level5: 1,
              isActive: true,
            },
        history: history.map((h) => ({
          id: h.id,
          profitOmzet: h.matchedOmzet,
          level: h.level,
          rate: h.rate,
          amount: h.amount,
          status: h.status,
          createdAt: h.createdAt,
        })),
        totals: {
          totalAmount: totals._sum.amount || 0,
          totalProfitOmzet: totals._sum.matchedOmzet || 0,
          totalRecords: totals._count,
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
    console.error('Get matching bonus error:', error);
    // Return fallback data when database is not available
    return NextResponse.json({
      success: true,
      data: {
        matchingInfo: {
          totalDownlineProfit: 0,
          totalDownlineMembers: 0,
          potentialBonus: 0,
          totalMatchingEarned: 0,
          maxMatchingLevel: 5,
          levels: [],
          levelMembers: [],
        },
        config: {
          level1: 5,
          level2: 4,
          level3: 3,
          level4: 2,
          level5: 1,
          isActive: true,
        },
        history: [],
        totals: { totalAmount: 0, totalProfitOmzet: 0, totalRecords: 0 },
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      },
    });
  }
}

// POST: Claim/calculate matching profit bonus for current period (manual claim)
// Note: Matching bonus is now event-driven (auto-credited with daily profit),
// but this endpoint allows manual claim for any unmatched profit.
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Tidak terautentikasi' },
        { status: 401 }
      );
    }

    // Check if user is suspended
    const fullUser = await db.user.findUnique({
      where: { id: user.id },
      select: { isSuspended: true },
    });

    if (fullUser?.isSuspended) {
      return NextResponse.json(
        { success: false, error: 'Akun Anda ditangguhkan' },
        { status: 403 }
      );
    }

    // Check if matching config is active
    const config = await db.matchingConfig.findFirst({
      where: { isActive: true },
    });

    if (!config) {
      return NextResponse.json(
        { success: false, error: 'Matching bonus sedang tidak aktif' },
        { status: 400 }
      );
    }

    // Calculate and credit any unmatched matching profit bonus
    const result = await creditMatchingBonus(user.id);

    if (result.totalBonus <= 0) {
      return NextResponse.json({
        success: true,
        message: 'Tidak ada matching profit baru yang bisa diklaim. Matching bonus otomatis dikreditkan saat downline mendapat profit harian.',
        data: {
          totalBonus: 0,
          levels: result.levels
            .filter((lvl) => !lvl.isDisconnected)
            .map((lvl) => ({
              level: lvl.level,
              rate: lvl.rate,
              profitOmzet: lvl.profitOmzet,
              memberCount: lvl.memberCount,
              amount: lvl.amount,
            })),
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Matching profit sebesar Rp${result.totalBonus.toLocaleString('id-ID')} berhasil diklaim!`,
      data: {
        totalBonus: result.totalBonus,
        levels: result.levels
          .filter((lvl) => !lvl.isDisconnected)
          .map((lvl) => ({
            level: lvl.level,
            rate: lvl.rate,
            profitOmzet: lvl.profitOmzet,
            memberCount: lvl.memberCount,
            amount: lvl.amount,
          })),
      },
    });
  } catch (error) {
    console.error('Claim matching bonus error:', error);
    return NextResponse.json(
      { success: false, error: 'Database belum tersedia. Silakan hubungi admin.' },
      { status: 503 }
    );
  }
}
