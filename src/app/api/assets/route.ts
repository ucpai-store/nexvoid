import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

/**
 * User Assets API
 * Returns all user assets.
 * - Direct investments (no purchaseId): shown as individual investment cards
 * - Product purchases (with purchaseId): grouped by purchaseId into a single card
 *   with quantity from the Purchase record, to match what the user actually bought.
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

    const investWhere: { userId: string; status?: string } = { userId: user.id };
    if (status) investWhere.status = status;

    const investments = await db.investment.findMany({
      where: investWhere,
      include: {
        package: { select: { name: true, profitRate: true, contractDays: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Separate: direct investments vs product-purchase investments
    const directInvestments = investments.filter((inv) => !inv.purchaseId);
    const productInvestments = investments.filter((inv) => inv.purchaseId);

    // 1) Add direct investments (from PaketPage) - each as its own card
    for (const inv of directInvestments) {
      if (type && type !== 'investment') continue;

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

    // 2) Group product-purchase investments by purchaseId - each group = 1 card
    if (productInvestments.length > 0) {
      // Fetch the Purchase records for grouping
      const purchaseIds = [...new Set(productInvestments.map((inv) => inv.purchaseId!))];
      const purchases = await db.purchase.findMany({
        where: { id: { in: purchaseIds } },
        include: {
          product: { select: { name: true, price: true, duration: true, profitRate: true } },
        },
      });
      const purchaseMap = new Map(purchases.map((p) => [p.id, p]));

      // Group by purchaseId
      const groupMap = new Map<string, typeof productInvestments>();
      for (const inv of productInvestments) {
        const key = inv.purchaseId!;
        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key)!.push(inv);
      }

      for (const [purchaseId, group] of groupMap) {
        const purchase = purchaseMap.get(purchaseId);
        const firstInv = group[0];
        const assetType = 'product';

        if (type && type !== assetType) continue;

        // Aggregate the group
        const totalAmount = group.reduce((sum, inv) => sum + inv.amount, 0);
        const totalDailyProfit = group.reduce((sum, inv) => sum + inv.dailyProfit, 0);
        const totalProfitEarned = group.reduce((sum, inv) => sum + inv.totalProfitEarned, 0);
        const quantity = purchase?.quantity || group.length;

        allAssets.push({
          id: purchaseId, // Use purchaseId as the asset id for grouped items
          type: assetType,
          name: purchase?.product?.name || firstInv.package?.name || 'Produk',
          amount: totalAmount,
          dailyProfit: totalDailyProfit,
          totalProfitEarned: totalProfitEarned,
          profitRate: firstInv.package?.profitRate || 0,
          contractDays: firstInv.package?.contractDays || purchase?.product?.duration || 0,
          status: firstInv.status,
          startDate: firstInv.startDate instanceof Date ? firstInv.startDate.toISOString() : String(firstInv.startDate),
          endDate: firstInv.endDate ? (firstInv.endDate instanceof Date ? firstInv.endDate.toISOString() : String(firstInv.endDate)) : null,
          lastProfitDate: firstInv.lastProfitDate ? (firstInv.lastProfitDate instanceof Date ? firstInv.lastProfitDate.toISOString() : String(firstInv.lastProfitDate)) : null,
          quantity,
          createdAt: firstInv.createdAt instanceof Date ? firstInv.createdAt.toISOString() : String(firstInv.createdAt),
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