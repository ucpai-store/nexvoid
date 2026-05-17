import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { creditInvestmentReferralBonusesTx } from '@/lib/referral-bonus';

const FALLBACK_PRODUCTS = [
  {
    id: '1',
    name: 'Emas Starter Pack',
    price: 100000,
    duration: 30,
    estimatedProfit: 8000,
    quota: 500,
    quotaUsed: 342,
    description: 'Paket investasi emas untuk pemula.',
    banner: '',
    isActive: true,
    isStopped: false,
    profitRate: 5.0,
  },
  {
    id: '2',
    name: 'Silver Mining Portfolio',
    price: 500000,
    duration: 60,
    estimatedProfit: 55000,
    quota: 300,
    quotaUsed: 187,
    description: 'Portfolio penambangan perak.',
    banner: '',
    isActive: true,
    isStopped: false,
    profitRate: 6.0,
  },
  {
    id: '3',
    name: 'Gold Premium Asset',
    price: 1000000,
    duration: 90,
    estimatedProfit: 150000,
    quota: 200,
    quotaUsed: 98,
    description: 'Aset emas premium.',
    banner: '',
    isActive: true,
    isStopped: false,
    profitRate: 7.0,
  },
  {
    id: '4',
    name: 'Platinum Asset',
    price: 2500000,
    duration: 90,
    estimatedProfit: 200000,
    quota: 500,
    quotaUsed: 0,
    description: 'Investasi platinum.',
    banner: '',
    isActive: true,
    isStopped: false,
    profitRate: 8.0,
  },
  {
    id: '5',
    name: 'Diamond Elite Investment',
    price: 5000000,
    duration: 120,
    estimatedProfit: 1000000,
    quota: 100,
    quotaUsed: 43,
    description: 'Investasi berlian elite.',
    banner: '',
    isActive: true,
    isStopped: false,
    profitRate: 9.0,
  },
  {
    id: '6',
    name: 'Diamond VIP Investment',
    price: 10000000,
    duration: 120,
    estimatedProfit: 1000000,
    quota: 5000,
    quotaUsed: 0,
    description: 'Investasi berlian VIP.',
    banner: '',
    isActive: true,
    isStopped: false,
    profitRate: 10.0,
  },
];

function formatRupiahSimple(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const product = await db.product.findUnique({ where: { id } });
      if (!product || !product.isActive) {
        return NextResponse.json({ success: false, error: 'Produk tidak ditemukan' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: product });
    }

    const products = await db.product.findMany({
      where: { isActive: true, isStopped: false },
      orderBy: { price: 'asc' },
    });

    return NextResponse.json({ success: true, data: products });
  } catch (error) {
    console.error('Get products error:', error);
    return NextResponse.json({ success: true, data: FALLBACK_PRODUCTS });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    if (user.isSuspended) {
      return NextResponse.json({ success: false, error: 'Akun ditangguhkan' }, { status: 403 });
    }

    if (!user.isVerified) {
      return NextResponse.json({ success: false, error: 'Akun belum diverifikasi. Silakan verifikasi terlebih dahulu.' }, { status: 403 });
    }

    const body = await request.json();
    const { action, productId, quantity } = body;

    if (action !== 'buy') {
      return NextResponse.json({ success: false, error: 'Action tidak valid' }, { status: 400 });
    }

    if (!productId || !quantity || quantity < 1) {
      return NextResponse.json({ success: false, error: 'Product ID dan jumlah wajib diisi' }, { status: 400 });
    }

    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive || product.isStopped) {
      return NextResponse.json({ success: false, error: 'Produk tidak tersedia' }, { status: 404 });
    }

    const remainingQuota = product.quota - product.quotaUsed;
    if (quantity > remainingQuota) {
      return NextResponse.json({ success: false, error: 'Kuota produk tidak mencukupi' }, { status: 400 });
    }

    const totalPrice = product.price * quantity;

    // ★ Purchase — NO immediate profit. Profit ONLY at 00:00 WIB via cron ★
    const purchase = await db.$transaction(async (tx) => {
      const currentUser = await tx.user.findUnique({ where: { id: user.id } });
      if (!currentUser) {
        throw new Error('User tidak ditemukan');
      }

      const totalAvailable = currentUser.depositBalance + currentUser.mainBalance;
      if (totalAvailable < totalPrice) {
        throw new Error('Saldo tidak mencukupi');
      }

      // Deduct from depositBalance first, then mainBalance
      let remaining = totalPrice;
      const depositDeduct = Math.min(currentUser.depositBalance, remaining);
      remaining -= depositDeduct;
      const mainDeduct = remaining;

      const updateData: Record<string, any> = {};
      if (depositDeduct > 0) updateData.depositBalance = { decrement: depositDeduct };
      if (mainDeduct > 0) updateData.mainBalance = { decrement: mainDeduct };

      await tx.user.update({
        where: { id: user.id },
        data: updateData,
      });

      // Update product quota
      await tx.product.update({
        where: { id: productId },
        data: { quotaUsed: { increment: quantity } },
      });

      // Create purchase record
      const newPurchase = await tx.purchase.create({
        data: {
          userId: user.id,
          productId,
          quantity,
          totalPrice,
          status: 'active',
          profitEarned: 0,
          dailyProfit: 0,
        },
      });

      // Find or create matching InvestmentPackage
      let investmentPackage = await tx.investmentPackage.findFirst({
        where: { amount: product.price, isActive: true },
      });

      if (!investmentPackage) {
        investmentPackage = await tx.investmentPackage.create({
          data: {
            name: product.name,
            amount: product.price,
            profitRate: product.profitRate || 5,
            contractDays: product.duration || 90,
            isActive: true,
            order: 0,
          },
        });
      }

      // Create ONE investment per quantity — NO immediate profit credit
      const dailyProfit = Math.floor(product.price * (investmentPackage.profitRate / 100));
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + investmentPackage.contractDays);

      for (let i = 0; i < quantity; i++) {
        // Create investment WITHOUT profit — profit will come at 00:00 WIB
        await tx.investment.create({
          data: {
            userId: user.id,
            packageId: investmentPackage.id,
            amount: product.price,
            dailyProfit,
            totalProfitEarned: 0, // No profit yet
            status: 'active',
            startDate,
            endDate,
            lastProfitDate: null, // No profit yet — cron will handle first credit
          },
        });
      }

      // Update purchase tracking
      await tx.purchase.update({
        where: { id: newPurchase.id },
        data: {
          dailyProfit: dailyProfit * quantity,
        },
      });

      // Create live activity
      await tx.liveActivity.create({
        data: {
          type: 'purchase',
          userName: user.name || user.userId,
          amount: totalPrice,
          productName: product.name,
          isFake: false,
        },
      });

      // Credit referral bonuses to upline users (per investment)
      try {
        await creditInvestmentReferralBonusesTx(tx, user.id, totalPrice);
      } catch (referralError) {
        console.error(`[PRODUCT BUY] ❌ Failed to credit referral bonuses for user ${user.id}:`, referralError);
      }

      return { purchase: newPurchase, dailyProfitTotal: dailyProfit * quantity };
    });

    const updatedUser = await db.user.findUnique({
      where: { id: user.id },
      select: { mainBalance: true, depositBalance: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        purchase: {
          id: purchase.purchase.id,
          productId: purchase.purchase.productId,
          quantity: purchase.purchase.quantity,
          totalPrice: purchase.purchase.totalPrice,
          status: purchase.purchase.status,
          createdAt: purchase.purchase.createdAt,
        },
        dailyProfitTotal: purchase.dailyProfitTotal,
        remainingBalance: updatedUser?.mainBalance || 0,
      },
      message: `Pembelian ${product.name} berhasil! Profit harian ${formatRupiahSimple(purchase.dailyProfitTotal)} akan masuk setiap hari jam 00:00 WIB`,
    });
  } catch (error: unknown) {
    console.error('Buy product error:', error);
    const message = error instanceof Error ? error.message : 'Database belum tersedia. Silakan hubungi admin.';
    const status = message === 'Saldo tidak mencukupi' ? 400 : 503;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

