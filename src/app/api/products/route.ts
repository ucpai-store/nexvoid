import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { creditInvestmentReferralBonusesTx } from '@/lib/referral-bonus';

// FALLBACK = Gold Premium Aset 1-6 (sama dengan seed-all.js / restore-products.sh / deploy.sh)
// Dipakai HANYA jika DB error. Modal TIDAK dikembalikan, user hanya terima profit harian.
const CONTRACT_DAYS = 180;
const FALLBACK_PRODUCTS = [
  {
    id: 'fb-1',
    name: 'Gold Premium Aset 1',
    price: 160000,
    duration: CONTRACT_DAYS,
    estimatedProfit: 576000,
    quota: 9999,
    quotaUsed: 4321,
    description: 'Gold Premium Aset 1 - Rp 160.000. Profit 2%/hari = Rp 3.200/hari × 180 hari = Rp 576.000. Modal TIDAK dikembalikan, user hanya menerima profit.',
    banner: '',
    isActive: true,
    isStopped: false,
    profitRate: 2.0,
  },
  {
    id: 'fb-2',
    name: 'Gold Premium Aset 2',
    price: 320000,
    duration: CONTRACT_DAYS,
    estimatedProfit: 1440000,
    quota: 9999,
    quotaUsed: 3876,
    description: 'Gold Premium Aset 2 - Rp 320.000. Profit 2,5%/hari = Rp 8.000/hari × 180 hari = Rp 1.440.000. Modal TIDAK dikembalikan.',
    banner: '',
    isActive: true,
    isStopped: false,
    profitRate: 2.5,
  },
  {
    id: 'fb-3',
    name: 'Gold Premium Aset 3',
    price: 640000,
    duration: CONTRACT_DAYS,
    estimatedProfit: 3456000,
    quota: 9999,
    quotaUsed: 5128,
    description: 'Gold Premium Aset 3 - Rp 640.000. Profit 3%/hari = Rp 19.200/hari × 180 hari = Rp 3.456.000. Modal TIDAK dikembalikan.',
    banner: '',
    isActive: true,
    isStopped: false,
    profitRate: 3.0,
  },
  {
    id: 'fb-4',
    name: 'Gold Premium Aset 4',
    price: 1920000,
    duration: CONTRACT_DAYS,
    estimatedProfit: 12096000,
    quota: 9999,
    quotaUsed: 2987,
    description: 'Gold Premium Aset 4 - Rp 1.920.000. Profit 3,5%/hari = Rp 67.200/hari × 180 hari = Rp 12.096.000. Modal TIDAK dikembalikan.',
    banner: '',
    isActive: true,
    isStopped: false,
    profitRate: 3.5,
  },
  {
    id: 'fb-5',
    name: 'Gold Premium Aset 5',
    price: 5760000,
    duration: CONTRACT_DAYS,
    estimatedProfit: 41472000,
    quota: 9999,
    quotaUsed: 1542,
    description: 'Gold Premium Aset 5 - Rp 5.760.000. Profit 4%/hari = Rp 230.400/hari × 180 hari = Rp 41.472.000. Modal TIDAK dikembalikan.',
    banner: '',
    isActive: true,
    isStopped: false,
    profitRate: 4.0,
  },
  {
    id: 'fb-6',
    name: 'Gold Premium Aset 6',
    price: 17280000,
    duration: CONTRACT_DAYS,
    estimatedProfit: 155520000,
    quota: 9999,
    quotaUsed: 876,
    description: 'Gold Premium Aset 6 - Rp 17.280.000. Profit 5%/hari = Rp 864.000/hari × 180 hari = Rp 155.520.000. Modal TIDAK dikembalikan.',
    banner: '',
    isActive: true,
    isStopped: false,
    profitRate: 5.0,
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

    // NOTE: Product purchase is ALLOWED on weekends (only profit + WD are libur on Sat/Sun).
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

    // ★ Re-activation rule: reject ONLY if user has an ACTIVE purchase for this SAME product.
    // User BOLEH punya banyak produk aktif bersamaan (VIP1+VIP2+VIP3 dst).
    // Tiap produk hanya bisa dibeli SEKALI per kontrak (180 hari).
    // Kalau kontrak sudah habis (status='completed'), bisa di-aktivasi lagi.
    const activePurchase = await db.purchase.findFirst({
      where: { userId: user.id, productId, status: 'active' },
      select: { id: true, status: true },
    });
    if (activePurchase) {
      return NextResponse.json(
        {
          success: false,
          error: `Produk '${product.name}' sedang aktif. Tidak bisa dibeli lagi sampai kontrak selesai (180 hari).`,
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
    // ★ MULTI-ACTIVE: user boleh punya banyak produk aktif bersamaan (VIP1+VIP2+VIP3 dst) ★
    //   JANGAN supersede previous active purchases/investments — biarkan semua aktif.
    //   Cron akan credit SEMUA active investments jam 00:00 WIB.
    const purchase = await db.$transaction(async (tx) => {
      const currentUser = await tx.user.findUnique({ where: { id: user.id } });
      if (!currentUser) {
        throw new Error('User tidak ditemukan');
      }

      const totalAvailable = currentUser.depositBalance + currentUser.mainBalance;
      if (totalAvailable < totalPrice) {
        throw new Error('Saldo tidak mencukupi');
      }

      // ★ MULTI-ACTIVE: do NOT mark previous purchases/investments as completed.
      // User boleh punya VIP1+VIP2+VIP3 semua aktif bersamaan.

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
