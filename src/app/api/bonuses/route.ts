import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// GET: List user's bonus logs with type filter and pagination
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
    const type = searchParams.get('type'); // sponsor, level, reward, profit, salary, matching, referral
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Validate type filter
    if (type && !['sponsor', 'level', 'reward', 'profit', 'salary', 'matching', 'referral'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Tipe bonus tidak valid. Gunakan: sponsor, level, reward, salary, matching, atau referral' },
        { status: 400 }
      );
    }

    const where: { userId: string; type?: string | { in: string[] } } = { userId: user.id };
    if (type) {
      if (type === 'profit') {
        where.type = { in: ['profit', 'reward'] };
      } else {
        where.type = type;
      }
    }

    // Get paginated bonus logs
    const [logs, total] = await Promise.all([
      db.bonusLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.bonusLog.count({ where }),
    ]);

    // Get totals per type for this user
    const [sponsorTotal, levelTotal, rewardTotal, profitTotal, salaryTotal, matchingTotal, referralTotal, allTotal] = await Promise.all([
      db.bonusLog.aggregate({
        where: { userId: user.id, type: 'sponsor' },
        _sum: { amount: true },
        _count: true,
      }),
      db.bonusLog.aggregate({
        where: { userId: user.id, type: 'level' },
        _sum: { amount: true },
        _count: true,
      }),
      db.bonusLog.aggregate({
        where: { userId: user.id, type: 'reward' },
        _sum: { amount: true },
        _count: true,
      }),
      db.bonusLog.aggregate({
        where: { userId: user.id, type: 'profit' },
        _sum: { amount: true },
        _count: true,
      }),
      db.bonusLog.aggregate({
        where: { userId: user.id, type: 'salary' },
        _sum: { amount: true },
        _count: true,
      }),
      db.bonusLog.aggregate({
        where: { userId: user.id, type: 'matching' },
        _sum: { amount: true },
        _count: true,
      }),
      db.bonusLog.aggregate({
        where: { userId: user.id, type: 'referral' },
        _sum: { amount: true },
        _count: true,
      }),
      db.bonusLog.aggregate({
        where: { userId: user.id },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    // Enrich logs with from user info
    const fromUserIds = [...new Set(logs.map((log) => log.fromUserId))];
    const fromUsers = await db.user.findMany({
      where: { id: { in: fromUserIds } },
      select: { id: true, userId: true, name: true },
    });
    const fromUserMap = Object.fromEntries(fromUsers.map((u) => [u.id, u]));

    return NextResponse.json({
      success: true,
      data: logs.map((log) => ({
        id: log.id,
        type: log.type,
        level: log.level,
        amount: log.amount,
        description: log.description,
        createdAt: log.createdAt,
        fromUser: fromUserMap[log.fromUserId]
          ? {
              userId: fromUserMap[log.fromUserId].userId,
              name: fromUserMap[log.fromUserId].name || fromUserMap[log.fromUserId].userId,
            }
          : null,
      })),
      totals: {
        sponsor: {
          amount: sponsorTotal._sum.amount || 0,
          count: sponsorTotal._count,
        },
        level: {
          amount: levelTotal._sum.amount || 0,
          count: levelTotal._count,
        },
        reward: {
          amount: (rewardTotal._sum.amount || 0) + (profitTotal._sum.amount || 0),
          count: rewardTotal._count + profitTotal._count,
        },
        profit: {
          amount: (rewardTotal._sum.amount || 0) + (profitTotal._sum.amount || 0),
          count: rewardTotal._count + profitTotal._count,
        },
        salary: {
          amount: salaryTotal._sum.amount || 0,
          count: salaryTotal._count,
        },
        matching: {
          amount: matchingTotal._sum.amount || 0,
          count: matchingTotal._count,
        },
        referral: {
          amount: referralTotal._sum.amount || 0,
          count: referralTotal._count,
        },
        all: {
          amount: allTotal._sum.amount || 0,
          count: allTotal._count,
        },
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get bonuses error:', error);
    // Return fallback data when database is not available
    return NextResponse.json({
      success: true,
      data: [],
      totals: {
        sponsor: { amount: 0, count: 0 },
        level: { amount: 0, count: 0 },
        reward: { amount: 0, count: 0 },
        profit: { amount: 0, count: 0 },
        salary: { amount: 0, count: 0 },
        matching: { amount: 0, count: 0 },
        referral: { amount: 0, count: 0 },
        all: { amount: 0, count: 0 },
      },
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  }
}
