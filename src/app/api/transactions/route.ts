import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

/**
 * Unified transaction history API
 * Returns all transaction types for the authenticated user, sorted by date.
 * Supports filtering by type: deposit, withdraw, purchase, investment, bonus, profit
 * 
 * IMPORTANT: Profit entries come ONLY from BonusLog (type='profit').
 * ProfitLog is NOT used for display to avoid double-counting.
 */
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
    const type = searchParams.get('type') || 'all';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const allTransactions: Array<{
      id: string;
      type: string;
      amount: number;
      status: string;
      description: string;
      meta: Record<string, unknown>;
      createdAt: Date;
    }> = [];

    // Fetch deposits
    if (type === 'all' || type === 'deposit') {
      const deposits = await db.deposit.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      for (const d of deposits) {
        allTransactions.push({
          id: d.id,
          type: 'deposit',
          amount: d.amount,
          status: d.status,
          description: `Deposit via ${d.paymentName || d.paymentType || 'Transfer'}`,
          meta: {
            paymentType: d.paymentType,
            paymentName: d.paymentName,
            proofImage: d.proofImage,
            note: d.note,
          },
          createdAt: d.createdAt,
        });
      }
    }

    // Fetch withdrawals
    if (type === 'all' || type === 'withdraw') {
      const withdrawals = await db.withdrawal.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      for (const w of withdrawals) {
        allTransactions.push({
          id: w.id,
          type: 'withdraw',
          amount: w.amount,
          status: w.status,
          description: `Withdraw ke ${w.bankName} ${w.accountNo}`,
          meta: {
            fee: w.fee,
            netAmount: w.netAmount,
            bankName: w.bankName,
            accountNo: w.accountNo,
            holderName: w.holderName,
            note: w.note,
          },
          createdAt: w.createdAt,
        });
      }
    }

    // Fetch purchases (products/aset)
    if (type === 'all' || type === 'purchase') {
      const purchases = await db.purchase.findMany({
        where: { userId: user.id },
        include: {
          product: { select: { name: true, price: true, duration: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      for (const p of purchases) {
        allTransactions.push({
          id: p.id,
          type: 'purchase',
          amount: p.totalPrice,
          status: p.status,
          description: `Beli ${p.product?.name || 'Produk'} x${p.quantity}`,
          meta: {
            productName: p.product?.name,
            quantity: p.quantity,
            profitEarned: p.profitEarned,
            productPrice: p.product?.price,
            productDuration: p.product?.duration,
          },
          createdAt: p.createdAt,
        });
      }
    }

    // Fetch investments (paket)
    if (type === 'all' || type === 'investment') {
      const investments = await db.investment.findMany({
        where: { userId: user.id },
        include: {
          package: { select: { name: true, profitRate: true, contractDays: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      for (const inv of investments) {
        allTransactions.push({
          id: inv.id,
          type: 'investment',
          amount: inv.amount,
          status: inv.status,
          description: `Investasi ${inv.package?.name || 'Paket'}`,
          meta: {
            packageName: inv.package?.name,
            dailyProfit: inv.dailyProfit,
            totalProfitEarned: inv.totalProfitEarned,
            contractDays: inv.package?.contractDays,
            profitRate: inv.package?.profitRate,
            startDate: inv.startDate,
            endDate: inv.endDate,
          },
          createdAt: inv.createdAt,
        });
      }
    }

    // Fetch bonuses (ONLY actual bonuses: referral, matching, salary — NOT daily profit)
    if (type === 'all' || type === 'bonus') {
      const bonuses = await db.bonusLog.findMany({
        where: { userId: user.id, type: { notIn: ['profit', 'reward'] } },
        orderBy: { createdAt: 'desc' },
      });

      // Batch fetch fromUsers
      const fromUserIds = [...new Set(bonuses.map((b) => b.fromUserId))];
      const fromUserMap: Record<string, { name: string; userId: string }> = {};
      if (fromUserIds.length > 0) {
        const fromUsers = await db.user.findMany({
          where: { id: { in: fromUserIds } },
          select: { id: true, name: true, userId: true },
        });
        for (const u of fromUsers) {
          fromUserMap[u.id] = u;
        }
      }

      for (const b of bonuses) {
        const fromUser = fromUserMap[b.fromUserId];
        allTransactions.push({
          id: b.id,
          type: 'bonus',
          amount: b.amount,
          status: 'approved',
          description: b.description || `Bonus ${b.type} Level ${b.level}`,
          meta: {
            bonusType: b.type,
            level: b.level,
            fromUserName: fromUser?.name || fromUser?.userId || 'User',
          },
          createdAt: b.createdAt,
        });
      }
    }

    // Fetch daily investment profit ONLY from BonusLog (type: 'profit' or 'reward')
    // NOT from ProfitLog to avoid double-counting
    if (type === 'all' || type === 'profit') {
      const profitBonuses = await db.bonusLog.findMany({
        where: { userId: user.id, type: { in: ['profit', 'reward'] } },
        orderBy: { createdAt: 'desc' },
      });

      for (const b of profitBonuses) {
        allTransactions.push({
          id: `bl-${b.id}`,
          type: 'profit',
          amount: b.amount,
          status: 'approved',
          description: b.description || 'Profit harian investasi',
          meta: {
            bonusType: b.type,
            level: b.level,
            fromUserName: 'Investasi',
          },
          createdAt: b.createdAt,
        });
      }
    }

    // Sort all by createdAt desc
    allTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Serialize dates to strings for JSON
    const serialized = allTransactions.map((tx) => ({
      ...tx,
      createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : String(tx.createdAt),
    }));

    // Calculate summary stats - use BonusLog for profit total (NOT ProfitLog)
    const [depositAgg, withdrawAgg, purchaseAgg, investmentAgg, bonusAgg, profitAgg] = await Promise.all([
      db.deposit.aggregate({ where: { userId: user.id, status: 'approved' }, _sum: { amount: true } }),
      db.withdrawal.aggregate({ where: { userId: user.id, status: 'approved' }, _sum: { amount: true } }),
      db.purchase.aggregate({ where: { userId: user.id }, _sum: { totalPrice: true } }),
      db.investment.aggregate({ where: { userId: user.id, status: 'active' }, _sum: { amount: true } }),
      db.bonusLog.aggregate({ where: { userId: user.id, type: { notIn: ['profit', 'reward'] } }, _sum: { amount: true } }),
      db.bonusLog.aggregate({ where: { userId: user.id, type: { in: ['profit', 'reward'] } }, _sum: { amount: true } }),
    ]);

    // Paginate
    const total = serialized.length;
    const start = (page - 1) * limit;
    const paginatedTransactions = serialized.slice(start, start + limit);

    return NextResponse.json({
      success: true,
      data: paginatedTransactions,
      summary: {
        totalDeposit: depositAgg._sum.amount || 0,
        totalWithdraw: withdrawAgg._sum.amount || 0,
        totalPurchase: purchaseAgg._sum.totalPrice || 0,
        totalInvestment: investmentAgg._sum.amount || 0,
        totalBonus: bonusAgg._sum.amount || 0,
        totalProfit: profitAgg._sum.amount || 0,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    return NextResponse.json({
      success: true,
      data: [],
      summary: {
        totalDeposit: 0,
        totalWithdraw: 0,
        totalPurchase: 0,
        totalInvestment: 0,
        totalBonus: 0,
        totalProfit: 0,
      },
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    });
  }
}

