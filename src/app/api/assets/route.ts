import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

/**
 * User Assets API
 * Returns all user assets (investments + purchases) with full contract details.
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
    const status = searchParams.get('status'); // active, completed, stopped
    const type = searchParams.get('type'); // investment, product

    const allAssets: Array<{
      id: string;
      type: string;
      name: string;
      amount: number;
      dailyProfit: number;
      totalProfitEarned: number;
      profitRate: number;
      contractDays: number;
      status: string;
      startDate: string;
      endDate: string | null;
      lastProfitDate: string | null;
      quantity: number;
      createdAt: string;
    }> = [];

    // Fetch investments
    if (!type || type === 'investment') {
      const investWhere: { userId: string; status?: string } = { userId: user.id };
      if (status) investWhere.status = status;

      const investments = await db.investment.findMany({
        where: investWhere,
        include: {
          package: { select: { name: true, profitRate: true, contractDays: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const inv of investments) {
        allAssets.push({
          id: inv.id,
          type: 'investment',
          name: inv.package?.name || 'Paket Investasi',
          amount: inv.amount,
          dailyProfit: inv.dailyProfit,
          totalProfitEarned: inv.totalProfitEarned,
          profitRate: inv.package?.profitRate || 0,
          contractDays: inv.package?.contractDays || 0,
          status: inv.status,
          startDate: inv.startDate instanceof Date ? inv.startDate.toISOString() : String(inv.startDate),
          endDate: inv.endDate ? (inv.endDate instanceof Date ? inv.endDate.toISOString() : String(inv.endDate)) : null,
          lastProfitDate: inv.lastProfitDate ? (inv.lastProfitDate instanceof Date ? inv.lastProfitDate.toISOString() : String(inv.lastProfitDate)) : null,
          quantity: 1,
          createdAt: inv.createdAt instanceof Date ? inv.createdAt.toISOString() : String(inv.createdAt),
        });
      }
    }

    // Fetch purchases (product assets)
    if (!type || type === 'product') {
      const purchaseWhere: { userId: string; status?: string } = { userId: user.id };
      if (status) purchaseWhere.status = status;

      const purchases = await db.purchase.findMany({
        where: purchaseWhere,
        include: {
          product: { select: { name: true, price: true, duration: true, profitRate: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const p of purchases) {
        // Calculate daily profit for purchases
        const productProfitRate = p.product?.profitRate || 0;
        const purchaseDailyProfit = p.dailyProfit || Math.floor(p.totalPrice * (productProfitRate / 100));
        
        allAssets.push({
          id: p.id,
          type: 'product',
          name: p.product?.name || 'Produk',
          amount: p.totalPrice,
          dailyProfit: purchaseDailyProfit,
          totalProfitEarned: p.profitEarned,
          profitRate: productProfitRate,
          contractDays: p.product?.duration || 0,
          status: p.status,
          startDate: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
          endDate: null,
          lastProfitDate: p.lastProfitDate ? (p.lastProfitDate instanceof Date ? p.lastProfitDate.toISOString() : String(p.lastProfitDate)) : null,
          quantity: p.quantity,
          createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
        });
      }
    }

    // Sort: active first, then by date desc
    allAssets.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Summary
    const activeAssets = allAssets.filter((a) => a.status === 'active');
    const totalActiveAmount = activeAssets.reduce((sum, a) => sum + a.amount, 0);
    const totalDailyProfit = activeAssets.reduce((sum, a) => sum + a.dailyProfit, 0);
    const totalProfitEarned = allAssets.reduce((sum, a) => sum + a.totalProfitEarned, 0);

    return NextResponse.json({
      success: true,
      data: allAssets,
      summary: {
        totalAssets: allAssets.length,
        activeCount: activeAssets.length,
        totalActiveAmount,
        totalDailyProfit,
        totalProfitEarned,
      },
    });
  } catch (error) {
    console.error('Get assets error:', error);
    // Return fallback data when database is not available
    return NextResponse.json({
      success: true,
      data: [],
      summary: {
        totalAssets: 0,
        activeCount: 0,
        totalActiveAmount: 0,
        totalDailyProfit: 0,
        totalProfitEarned: 0,
      },
    });
  }
}
