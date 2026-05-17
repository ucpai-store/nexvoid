import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status');

    const where: { status?: string } = {};
    if (status) where.status = status;

    // Fetch both Purchases AND Investments for a complete asset view
    const [purchases, investments, purchaseTotal, investmentTotal] = await Promise.all([
      db.purchase.findMany({
        where,
        include: {
          user: { select: { id: true, userId: true, name: true, whatsapp: true } },
          product: { select: { id: true, name: true, price: true, duration: true, profitRate: true, estimatedProfit: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.investment.findMany({
        where,
        include: {
          user: { select: { id: true, userId: true, name: true, whatsapp: true } },
          package: { select: { id: true, name: true, profitRate: true, contractDays: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.purchase.count({ where }),
      db.investment.count({ where }),
    ]);

    // Get all purchase user+amount combos to identify investments that are already covered by purchases
    const purchaseKeys = new Set(
      purchases.map((p) => `${p.userId}-${p.totalPrice}`)
    );

    // Merge: include all purchases + investments NOT already covered by a purchase
    const allAssets: Array<{
      id: string;
      type: 'purchase' | 'investment';
      userId: string;
      userName: string;
      userNxvId: string;
      productName: string;
      quantity: number;
      totalPrice: number;
      dailyProfit: number;
      profitEarned: number;
      profitRate: number;
      contractDays: number;
      status: string;
      createdAt: string;
    }> = [];

    // Add all purchase records
    for (const p of purchases) {
      allAssets.push({
        id: p.id,
        type: 'purchase',
        userId: p.userId,
        userName: p.user?.name || p.user?.userId || 'Unknown',
        userNxvId: p.user?.userId || '',
        productName: p.product?.name || 'Produk',
        quantity: p.quantity,
        totalPrice: p.totalPrice,
        dailyProfit: p.dailyProfit || Math.floor(p.totalPrice * ((p.product?.profitRate || 0) / 100)),
        profitEarned: p.profitEarned,
        profitRate: p.product?.profitRate || 0,
        contractDays: p.product?.duration || 0,
        status: p.status,
        createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
      });
    }

    // Add investment records that are NOT covered by a purchase
    for (const inv of investments) {
      const key = `${inv.userId}-${inv.amount}`;
      // Skip if this investment is already represented by a purchase with same user+amount
      if (purchaseKeys.has(key)) continue;

      allAssets.push({
        id: inv.id,
        type: 'investment',
        userId: inv.userId,
        userName: inv.user?.name || inv.user?.userId || 'Unknown',
        userNxvId: inv.user?.userId || '',
        productName: inv.package?.name || 'Paket Investasi',
        quantity: 1,
        totalPrice: inv.amount,
        dailyProfit: inv.dailyProfit,
        profitEarned: inv.totalProfitEarned,
        profitRate: inv.package?.profitRate || 0,
        contractDays: inv.package?.contractDays || 0,
        status: inv.status,
        createdAt: inv.createdAt instanceof Date ? inv.createdAt.toISOString() : String(inv.createdAt),
      });
    }

    // Sort: active first, then by date desc
    allAssets.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const total = allAssets.length;

    return NextResponse.json({
      success: true,
      data: {
        purchases: allAssets,
        pagination: {
          page: 1,
          limit: total,
          total,
          totalPages: 1,
        },
      },
    });
  } catch (error) {
    console.error('Get admin asset error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { purchaseId, assetType, profitEarned, action } = body;

    if (!purchaseId || !action) {
      return NextResponse.json({ success: false, error: 'purchaseId dan action wajib diisi' }, { status: 400 });
    }

    const isInvestment = assetType === 'investment';

    if (isInvestment) {
      // Handle Investment-based actions
      const investment = await db.investment.findUnique({
        where: { id: purchaseId },
        include: { user: true },
      });

      if (!investment) {
        return NextResponse.json({ success: false, error: 'Investasi tidak ditemukan' }, { status: 404 });
      }

      if (action === 'add-profit') {
        const profitAmount = parseFloat(String(profitEarned || 0));
        if (profitAmount <= 0) {
          return NextResponse.json({ success: false, error: 'Jumlah profit harus lebih dari 0' }, { status: 400 });
        }

        const updated = await db.$transaction(async (tx) => {
          const upd = await tx.investment.update({
            where: { id: purchaseId },
            data: { totalProfitEarned: { increment: profitAmount } },
          });

          await tx.user.update({
            where: { id: investment.userId },
            data: {
              mainBalance: { increment: profitAmount },
              totalProfit: { increment: profitAmount },
            },
          });

          await tx.bonusLog.create({
            data: {
              userId: investment.userId,
              fromUserId: investment.userId,
              type: 'profit',
              level: 0,
              amount: profitAmount,
              description: `Profit manual dari admin untuk investasi ${investment.package?.name || ''}`,
            },
          });

          return upd;
        });

        return NextResponse.json({ success: true, data: updated });
      }

      if (action === 'stop') {
        if (investment.status !== 'active') {
          return NextResponse.json({ success: false, error: 'Hanya aset aktif yang dapat dihentikan' }, { status: 400 });
        }
        const updated = await db.investment.update({
          where: { id: purchaseId },
          data: { status: 'stopped' },
        });
        return NextResponse.json({ success: true, data: updated });
      }

      if (action === 'complete') {
        if (investment.status !== 'active') {
          return NextResponse.json({ success: false, error: 'Hanya aset aktif yang dapat diselesaikan' }, { status: 400 });
        }
        const updated = await db.investment.update({
          where: { id: purchaseId },
          data: { status: 'completed' },
        });
        return NextResponse.json({ success: true, data: updated });
      }
    } else {
      // Handle Purchase-based actions (original logic)
      const purchase = await db.purchase.findUnique({
        where: { id: purchaseId },
        include: { user: true },
      });

      if (!purchase) {
        return NextResponse.json({ success: false, error: 'Pembelian tidak ditemukan' }, { status: 404 });
      }

      if (action === 'add-profit') {
        const profitAmount = parseFloat(String(profitEarned || 0));
        if (profitAmount <= 0) {
          return NextResponse.json({ success: false, error: 'Jumlah profit harus lebih dari 0' }, { status: 400 });
        }

        const updatedPurchase = await db.$transaction(async (tx) => {
          const updated = await tx.purchase.update({
            where: { id: purchaseId },
            data: { profitEarned: { increment: profitAmount } },
          });

          await tx.user.update({
            where: { id: purchase.userId },
            data: {
              mainBalance: { increment: profitAmount },
              totalProfit: { increment: profitAmount },
            },
          });

          await tx.profitLog.create({
            data: {
              purchaseId,
              userId: purchase.userId,
              amount: profitAmount,
            },
          });

          await tx.liveActivity.create({
            data: {
              type: 'profit',
              userName: purchase.user.name || purchase.user.userId,
              amount: profitAmount,
              productName: (await tx.product.findUnique({ where: { id: purchase.productId } }))?.name || '',
              isFake: false,
            },
          });

          return updated;
        });

        return NextResponse.json({ success: true, data: updatedPurchase });
      }

      if (action === 'stop') {
        if (purchase.status !== 'active') {
          return NextResponse.json({ success: false, error: 'Hanya aset aktif yang dapat dihentikan' }, { status: 400 });
        }
        const updated = await db.purchase.update({
          where: { id: purchaseId },
          data: { status: 'stopped' },
        });
        return NextResponse.json({ success: true, data: updated });
      }

      if (action === 'complete') {
        if (purchase.status !== 'active') {
          return NextResponse.json({ success: false, error: 'Hanya aset aktif yang dapat diselesaikan' }, { status: 400 });
        }
        const updated = await db.purchase.update({
          where: { id: purchaseId },
          data: { status: 'completed' },
        });
        return NextResponse.json({ success: true, data: updated });
      }
    }

    return NextResponse.json({ success: false, error: 'Action tidak valid' }, { status: 400 });
  } catch (error) {
    console.error('Update admin asset error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
