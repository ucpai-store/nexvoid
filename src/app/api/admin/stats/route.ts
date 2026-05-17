import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const [
      totalUsers,
      totalDeposits,
      totalWithdrawals,
      totalProducts,
      activePurchases,
      pendingDeposits,
      pendingWithdrawals,
      depositStats,
      withdrawalStats,
    ] = await Promise.all([
      db.user.count(),
      db.deposit.count(),
      db.withdrawal.count(),
      db.product.count({ where: { isActive: true } }),
      db.purchase.count({ where: { status: 'active' } }),
      db.deposit.count({ where: { status: 'pending' } }),
      db.withdrawal.count({ where: { status: 'pending' } }),
      db.deposit.aggregate({ where: { status: 'approved' }, _sum: { amount: true } }),
      db.withdrawal.aggregate({ where: { status: 'approved' }, _sum: { amount: true } }),
    ]);

    const totalDepositAmount = depositStats._sum.amount || 0;
    const totalWithdrawalAmount = withdrawalStats._sum.amount || 0;

    // User balance stats
    const balanceStats = await db.user.aggregate({
      _sum: { mainBalance: true, profitBalance: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        totalUsers,
        totalDeposits,
        totalWithdrawals,
        totalProducts,
        activePurchases,
        pendingDeposits,
        pendingWithdrawals,
        totalDepositAmount,
        totalWithdrawalAmount,
        totalMainBalance: balanceStats._sum.mainBalance || 0,
        totalProfitBalance: balanceStats._sum.profitBalance || 0,
      },
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return NextResponse.json({
      success: true,
      data: {
        totalUsers: 0,
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalProducts: 0,
        activePurchases: 0,
        pendingDeposits: 0,
        pendingWithdrawals: 0,
        totalDepositAmount: 0,
        totalWithdrawalAmount: 0,
        totalMainBalance: 0,
        totalProfitBalance: 0,
      },
    });
  }
}
