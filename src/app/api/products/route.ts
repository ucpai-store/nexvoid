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

/**
 * Auto-reset quota when full.
 * If quotaUsed >= quota, reset quotaUsed to a random small number (3-12% of quota)
 * so it looks like a fresh batch just opened with some early buyers.
 */
async function autoResetQuotaIfFull() {
  try {
    const products = await db.product.findMany({
      where: { isActive: true, isStopped: false },
    });

    for (const product of products) {
      if (product.quotaUsed >= product.quota) {
        // Reset to random 3-12% of quota to look natural
        const minUsed = Math.floor(product.quota * 0.03);
        const maxUsed = Math.floor(product.quota * 0.12);
        const newQuotaUsed = Math.floor(Math.random() * (maxUsed - minUsed + 1)) + minUsed;

        await db.product.update({
          where: { id: product.id },
          data: { quotaUsed: newQuotaUsed },
        });

        console.log(`[QUOTA RESET] ${product.name}: ${product.quotaUsed}/${product.quota} → ${newQuotaUsed}/${product.quota} (batch baru)`);
      }
    }
  } catch (error) {
    console.error('[QUOTA RESET] Error:', error);
  }
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

      // Auto-reset if quota full
      if (product.quotaUsed >= product.quota) {
        const minUsed = Math.floor(product.quota * 0.03);
        const maxUsed = Math.floor(product.quota * 0.12);
        const newQuotaUsed = Math.floor(Math.random() * (maxUsed - minUsed + 1)) + minUsed;
        await db.product.update({
          where: { id: product.id },
          data: { quotaUsed: newQuotaUsed },
        });
        product.quotaUsed = newQuotaUsed;
      }

      return NextResponse.json({ success: true, data: product });
    }

    // Auto-reset any full quotas before returning list
    await autoResetQuotaIfFull();

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

    if (!productId) {
      return NextResponse.json({ success: false, error: 'Product ID wajib diisi' }, { status: 400 });
    }

    // ★ No-duplicates rule: each product can only be bought ONCE per user.
    // Quantity is forced to 1 — buying the same product again is rejected below.
    const qty = 1;

    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive || product.isStopped) {
      return NextResponse.json({ success: false, error: 'Produk tidak tersedia' }, { status: 404 });
    }

    // ★ No-duplicates: reject if user already owns this product (any status).
    const existingPurchase = await db.purchase.findFirst({
      where: { userId: user.id, productId },
      select: { id: true, status: true },
    });
    if (existingPurchase) {
      const verb = existingPurchase.status === 'active' ? 'sedang aktif' : 'sudah pernah dibeli';
      return NextResponse.json(
        {
          success: false,
          error: `Produk '${product.name}' ${verb}. Wajib pilih produk lain yang belum dimiliki.`,
        },
        { status: 400 }
      );
    }

    // Auto-reset quota if full before checking
    if (product.quotaUsed >= product.quota) {
      const minUsed = Math.floor(product.quota * 0.03);
      const maxUsed = Math.floor(product.quota * 0.12);
      const newQuotaUsed = Math.floor(Math.random() * (maxUsed - minUsed + 1)) + minUsed;
      await db.product.update({
        where: { id: product.id },
        data: { quotaUsed: newQuotaUsed },
      });
      product.quotaUsed = newQuotaUsed;
    }

    const remainingQuota = product.quota - product.quotaUsed;
    if (qty > remainingQuota) {
      return NextResponse.json({ success: false, error: 'Kuota produk tidak mencukupi' }, { status: 400 });
    }

    const totalPrice = product.price * qty;

    // ★ Purchase — NO immediate profit. Profit ONLY at 00:00 WIB via cron ★
    // ★ No-duplicates + 1-active-only: supersede any previous active purchase/investment
    //   so that ONLY ONE product is active per user at any time.
    const purchase = await db.$transaction(async (tx) => {
      const currentUser = await tx.user.findUnique({ where: { id: user.id } });
      if (!currentUser) {
        throw new Error('User tidak ditemukan');
      }

      const totalAvailable = currentUser.depositBalance + currentUser.mainBalance;
      if (totalAvailable < totalPrice) {
        throw new Error('Saldo tidak mencukupi');
      }

      // ★ 1-active-only: mark all previous active Purchases of this user as 'completed'
      await tx.purchase.updateMany({
        where: { userId: user.id, status: 'active' },
        data: { status: 'completed' },
      });

      // ★ 1-active-only: mark all previous active Investments of this user as 'completed'
      //   so cron stops crediting daily profit for the old product.
      await tx.investment.updateMany({
        where: { userId: user.id, status: 'active' },
        data: { status: 'completed', endDate: new Date() },
      });

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
        data: { quotaUsed: { increment: qty } },
      });

      // Create purchase record
      const newPurchase = await tx.purchase.create({
        data: {
          userId: user.id,
          productId,
          quantity: qty,
          totalPrice,
          status: 'active',
          profitEarned: 0,
          dailyProfit: 0,
        },
      });

      // ★ Use Product's own profitRate & duration directly — do NOT auto-create InvestmentPackage.
      // This keeps InvestmentPackage table clean (VIP tiers only) while Product purchases
      // still create Investment records that the cron can credit daily.
      // Cron reads `inv.dailyProfit` (stored) so it doesn't depend on the linked package.
      const dailyProfit = Math.floor(product.price * ((product.profitRate || 0) / 100));
      const contractDays = product.duration || 90;
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + contractDays);

      // Find an existing InvestmentPackage to link (any active one as fallback for FK),
      // but DO NOT create a new one — we don't want Product purchases polluting the
      // InvestmentPackage table (which is for VIP tiers shown on the Paket page).
      let packageIdForInvestment = await tx.investmentPackage.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      if (!packageIdForInvestment) {
        // Edge case: no InvestmentPackage exists yet — create a single hidden default
        packageIdForInvestment = await tx.investmentPackage.create({
          data: {
            name: '_internal_default',
            amount: 0,
            profitRate: 0,
            contractDays: 0,
            isActive: false, // hidden from Paket page (which filters isActive=true)
            order: -1,
          },
        });
      }

      // Create investment WITHOUT profit — profit will come at 00:00 WIB
      await tx.investment.create({
        data: {
          userId: user.id,
          packageId: packageIdForInvestment.id,
          purchaseId: newPurchase.id, // Link to purchase to avoid double-counting in assets/transactions
          amount: product.price,
          dailyProfit,
          totalProfitEarned: 0, // No profit yet
          status: 'active',
          startDate,
          endDate,
          lastProfitDate: null, // No profit yet — cron will handle first credit
        },
      });

      // Update purchase tracking
      await tx.purchase.update({
        where: { id: newPurchase.id },
        data: {
          dailyProfit: dailyProfit * qty,
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

      return { purchase: newPurchase, dailyProfitTotal: dailyProfit * qty };
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
