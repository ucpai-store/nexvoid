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

// Matching rates for M.Profit (event-driven, credited when downline earns profit)
const MATCHING_RATES: Record<number, number> = { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 };

function formatRupiahSimple(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}

/**
 * Credit matching bonus to upline when a downline earns profit.
 * Called immediately after crediting the first day's profit on purchase.
 */
async function creditMatchingOnPurchaseProfit(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  earningUserId: string,
  profitAmount: number,
): Promise<number> {
  let totalMatching = 0;

  if (profitAmount <= 0) return 0;

  const uplineRefs = await tx.referral.findMany({
    where: { referredId: earningUserId },
    orderBy: { level: 'asc' },
  });

  if (uplineRefs.length === 0) return 0;

  const earningUser = await tx.user.findUnique({
    where: { id: earningUserId },
    select: { name: true, userId: true },
  });
  const earningUserName = earningUser?.name || earningUser?.userId || 'User';

  // Get matching config
  let rates = MATCHING_RATES;
  const config = await tx.matchingConfig.findFirst({ where: { isActive: true } });
  if (config) {
    rates = {
      1: config.level1,
      2: config.level2,
      3: config.level3,
      4: config.level4,
      5: config.level5,
    };
  }

  for (const ref of uplineRefs) {
    const level = ref.level;
    if (level > 5) continue; // Level 6+ = auto disconnect

    const rate = rates[level] || 0;
    if (rate <= 0) continue;

    const matchAmount = Math.floor(profitAmount * (rate / 100));
    if (matchAmount <= 0) continue;

    await tx.user.update({
      where: { id: ref.referrerId },
      data: {
        mainBalance: { increment: matchAmount },
        totalProfit: { increment: matchAmount },
      },
    });

    await tx.matchingBonus.create({
      data: {
        userId: ref.referrerId,
        leftOmzet: 0,
        rightOmzet: 0,
        matchedOmzet: profitAmount,
        level,
        rate,
        amount: matchAmount,
        status: 'paid',
      },
    });

    await tx.bonusLog.create({
      data: {
        userId: ref.referrerId,
        fromUserId: earningUserId,
        type: 'matching',
        level,
        amount: matchAmount,
        description: `M.Profit Level ${level} (${rate}%) dari profit ${earningUserName} — ${formatRupiahSimple(profitAmount)} × ${rate}% = ${formatRupiahSimple(matchAmount)}`,
      },
    });

    totalMatching += matchAmount;
  }

  return totalMatching;
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

    // ★ Purchase with IMMEDIATE first-day profit credit ★
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

      // Create ONE investment per quantity with FIRST DAY PROFIT CREDITED IMMEDIATELY
      const dailyProfit = Math.floor(product.price * (investmentPackage.profitRate / 100));
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + investmentPackage.contractDays);

      let totalFirstDayProfit = 0;

      for (let i = 0; i < quantity; i++) {
        // Create investment with first day profit already credited
        await tx.investment.create({
          data: {
            userId: user.id,
            packageId: investmentPackage.id,
            amount: product.price,
            dailyProfit,
            totalProfitEarned: dailyProfit, // First day profit earned
            status: 'active',
            startDate,
            endDate,
            lastProfitDate: new Date(), // Mark as credited for today
          },
        });

        // Credit first day's profit to user balance
        await tx.user.update({
          where: { id: user.id },
          data: {
            mainBalance: { increment: dailyProfit },
            totalProfit: { increment: dailyProfit },
          },
        });

        // Create BonusLog for first day's profit
        await tx.bonusLog.create({
          data: {
            userId: user.id,
            fromUserId: user.id,
            type: 'profit',
            level: 0,
            amount: dailyProfit,
            description: `Profit harian ${product.name} — ${formatRupiahSimple(product.price)} × ${investmentPackage.profitRate}% = ${formatRupiahSimple(dailyProfit)}`,
          },
        });

        // Credit matching bonus for this profit
        await creditMatchingOnPurchaseProfit(tx, user.id, dailyProfit);

        totalFirstDayProfit += dailyProfit;
      }

      // Update purchase tracking with first day profit
      await tx.purchase.update({
        where: { id: newPurchase.id },
        data: {
          profitEarned: totalFirstDayProfit,
          dailyProfit: dailyProfit * quantity,
          lastProfitDate: new Date(),
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

      // Credit referral bonuses to upline users
      try {
        await creditInvestmentReferralBonusesTx(tx, user.id, totalPrice);
      } catch (referralError) {
        console.error(`[PRODUCT BUY] ❌ Failed to credit referral bonuses for user ${user.id}:`, referralError);
      }

      return { purchase: newPurchase, totalFirstDayProfit };
    });

    const updatedUser = await db.user.findUnique({
      where: { id: user.id },
      select: { mainBalance: true, profitBalance: true },
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
        firstDayProfit: purchase.totalFirstDayProfit,
        remainingBalance: updatedUser?.mainBalance || 0,
      },
      message: `Pembelian ${product.name} berhasil! Profit hari pertama: ${formatRupiahSimple(purchase.totalFirstDayProfit)} sudah dikreditkan`,
    });
  } catch (error: unknown) {
    console.error('Buy product error:', error);
    const message = error instanceof Error ? error.message : 'Database belum tersedia. Silakan hubungi admin.';
    const status = message === 'Saldo tidak mencukupi' ? 400 : 503;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

