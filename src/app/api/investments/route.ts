import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { creditInvestmentReferralBonusesTx } from '@/lib/referral-bonus';
import {
  validateSequentialPurchase,
  validateTierPurchase,
  getPackageAssetIndex,
  getUserActiveAssets,
  getUserActiveAssetInfo,
} from '@/lib/tier-system';

// ★ CRITICAL FIX v7: Force dynamic — disable Next.js route cache.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// GET: List user's investments
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
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    const where: { userId: string; status?: string } = { userId: user.id };
    if (status) where.status = status;

    const [investments, total] = await Promise.all([
      db.investment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          package: {
            select: {
              name: true,
              profitRate: true,
              contractDays: true,
            },
          },
        },
      }),
      db.investment.count({ where }),
    ]);

    const activeInvestments = await db.investment.findMany({
      where: { userId: user.id, status: 'active' },
    });

    const totalActiveAmount = activeInvestments.reduce((sum, inv) => sum + inv.amount, 0);
    const totalDailyProfit = activeInvestments.reduce((sum, inv) => sum + inv.dailyProfit, 0);
    const totalProfitEarned = await db.investment.aggregate({
      where: { userId: user.id },
      _sum: { totalProfitEarned: true },
    });

    return NextResponse.json({
      success: true,
      data: investments.map((inv) => ({
        id: inv.id,
        amount: inv.amount,
        dailyProfit: inv.dailyProfit,
        totalProfitEarned: inv.totalProfitEarned,
        status: inv.status,
        startDate: inv.startDate,
        endDate: inv.endDate,
        lastProfitDate: inv.lastProfitDate,
        package: inv.package,
        createdAt: inv.createdAt,
      })),
      summary: {
        totalActiveAmount,
        totalDailyProfit,
        totalProfitEarned: totalProfitEarned._sum.totalProfitEarned || 0,
        activeCount: activeInvestments.length,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get investments error:', error);
    return NextResponse.json({
      success: true,
      data: [],
      summary: {
        totalActiveAmount: 0,
        totalDailyProfit: 0,
        totalProfitEarned: 0,
        activeCount: 0,
      },
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
  }
}

// POST: Create new investment — NO immediate profit. Profit ONLY at 00:00 WIB via cron
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Tidak terautentikasi' },
        { status: 401 }
      );
    }

    if (user.isSuspended) {
      return NextResponse.json(
        { success: false, error: 'Akun ditangguhkan' },
        { status: 403 }
      );
    }

    if (!user.isVerified) {
      return NextResponse.json(
        { success: false, error: 'Email belum diverifikasi. Silakan verifikasi email terlebih dahulu.' },
        { status: 403 }
      );
    }

    // NOTE: Investment purchase is ALLOWED on weekends (only profit + WD are libur on Sat/Sun).
    const body = await request.json();
    const { packageId } = body;

    if (!packageId) {
      return NextResponse.json(
        { success: false, error: 'Paket investasi wajib dipilih' },
        { status: 400 }
      );
    }

    const pkg = await db.investmentPackage.findUnique({
      where: { id: packageId },
    });

    if (!pkg || !pkg.isActive) {
      return NextResponse.json(
        { success: false, error: 'Paket investasi tidak valid atau tidak aktif' },
        { status: 400 }
      );
    }

    // ★ v19 PER-ASSET-UNIQUE-RULE: user boleh punya BANYAK aset aktif bersamaan
    //   (VIP1 + VIP2 + VIP3 — semua boleh aktif). YANG DILARANG: beli aset yang
    //   SAMA (same tier index) saat masih aktif.
    //
    //   Matching: produk[i] (by price asc) ≡ paket[i] (by amount asc) = same asset i.
    //   Jadi kalau user beli paket VIP1, lalu beli produk yg rank-1 (cheapest) =
    //   same asset → DITOLAK. Tapi beli produk rank-2 = BOLEH (beda aset).
    //
    //   Cek: asset index of this package vs user's active assets.
    const packageAssetIdx = await getPackageAssetIndex(pkg.id);
    if (!packageAssetIdx) {
      return NextResponse.json(
        { success: false, error: 'Paket tidak ditemukan dalam daftar aset' },
        { status: 400 }
      );
    }

    const activeAssets = await getUserActiveAssets(user.id);
    if (activeAssets.has(packageAssetIdx)) {
      // Same asset already active → BLOCK. Get info for meaningful error message.
      const activeInfo = await getUserActiveAssetInfo(user.id, packageAssetIdx);
      const days = activeInfo.daysRemaining ?? 0;
      const name = activeInfo.activeAssetName || pkg.name;
      return NextResponse.json(
        {
          success: false,
          error:
            days > 0
              ? `Aset "${name}" sedang aktif (sama dengan paket/produk ini). Tunggu ${days} hari sampai kontrak selesai sebelum beli aset yang sama.`
              : `Aset "${name}" sedang aktif. Tunggu sampai kontrak selesai sebelum beli aset yang sama.`,
        },
        { status: 400 }
      );
    }

    // ★ v19 backward-compat: validateTierPurchase juga boleh dipakai buat
    //   double-check (cek apakah tier ini active untuk user). Tapi karena kita
    //   udah cek di atas via getUserActiveAssets (lebih akurat — handle beli via
    //   produk juga), ini cuma safety net.
    const tierCheck = await validateSequentialPurchase(user.id, packageId);
    if (!tierCheck.ok) {
      return NextResponse.json(
        { success: false, error: tierCheck.error },
        { status: 400 }
      );
    }

    const dailyProfit = pkg.amount * (pkg.profitRate / 100);
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + pkg.contractDays);

    let result;
    try {
      result = await db.$transaction(async (tx) => {
        const txUser = await tx.user.findUnique({
          where: { id: user.id },
          select: {
            id: true,
            userId: true,
            name: true,
            mainBalance: true,
            depositBalance: true,
            profitBalance: true,
            referredBy: true,
          },
        });

        if (!txUser) {
          throw new Error('USER_NOT_FOUND');
        }

        const totalAvailable = txUser.depositBalance + txUser.mainBalance;
        if (totalAvailable < pkg.amount) {
          throw new Error('INSUFFICIENT_BALANCE');
        }

        // ★★★ v20 ANTI-RACE-CONDITION: re-check duplicate DI DALAM transaction ★★★
        //   Cek di luar tx (getPackageAssetIndex + getUserActiveAssets) bisa lewat
        //   kalau user double-click. Re-check ini di DALAM tx pastikan atomic.
        //   Request ke-2 akan lihat Investment dari request ke-1 → throw error.
        const existingActiveInvestment = await tx.investment.findFirst({
          where: { userId: user.id, status: 'active' },
          include: {
            purchase: { select: { product: { select: { id: true } } } },
            package: { select: { id: true, amount: true, isActive: true } },
          },
        });
        if (existingActiveInvestment) {
          // Compute asset index for existing active investment
          let existingAssetIdx: number | null = null;
          if (
            existingActiveInvestment.purchaseId &&
            existingActiveInvestment.purchase?.product?.id
          ) {
            const allProducts = await tx.product.findMany({
              orderBy: [{ price: 'asc' }, { createdAt: 'asc' }],
              select: { id: true },
            });
            const idx = allProducts.findIndex(
              (p) => p.id === existingActiveInvestment.purchase!.product!.id
            );
            if (idx >= 0) existingAssetIdx = idx + 1;
          } else if (existingActiveInvestment.package) {
            const allPkgs = await tx.investmentPackage.findMany({
              where: { amount: { gt: 0 }, isActive: true },
              orderBy: [{ amount: 'asc' }, { order: 'asc' }],
              select: { id: true },
            });
            const idx = allPkgs.findIndex(
              (p) => p.id === existingActiveInvestment.package!.id
            );
            if (idx >= 0) existingAssetIdx = idx + 1;
          }
          // Compute asset index for THIS package
          const allPkgsNow = await tx.investmentPackage.findMany({
            where: { amount: { gt: 0 }, isActive: true },
            orderBy: [{ amount: 'asc' }, { order: 'asc' }],
            select: { id: true },
          });
          const thisIdx = allPkgsNow.findIndex((p) => p.id === pkg.id);
          const thisAssetIdx = thisIdx >= 0 ? thisIdx + 1 : null;
          if (
            existingAssetIdx !== null &&
            thisAssetIdx !== null &&
            existingAssetIdx === thisAssetIdx
          ) {
            throw new Error(
              `ASET_SAMA_AKTIF: Aset "${pkg.name}" sedang aktif (sama dengan paket/produk ini). Tunggu sampai kontrak selesai sebelum beli aset yang sama.`
            );
          }
        }

        let remaining = pkg.amount;
        const depositDeduct = Math.min(txUser.depositBalance, remaining);
        remaining -= depositDeduct;
        const mainDeduct = remaining;

        const updateData: Record<string, any> = {};
        if (depositDeduct > 0) updateData.depositBalance = { decrement: depositDeduct };
        if (mainDeduct > 0) updateData.mainBalance = { decrement: mainDeduct };

        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: updateData,
        });

        // ★ v19 PER-ASSET-UNIQUE-RULE: block beli di atas sudah pastikan user
        //   belum punya aset yang sama (same tier index) aktif. Boleh punya banyak
        //   aset aktif (beda tier). Cron credit SEMUA active investments jam 00:00 WIB.
        //   Profit PERTAMA tunggu jam 00:00 WIB (lastProfitDate: null di bawah).

        // Create investment WITHOUT immediate profit — cron will credit at 00:00 WIB
        const investment = await tx.investment.create({
          data: {
            userId: user.id,
            packageId: pkg.id,
            amount: pkg.amount,
            dailyProfit,
            totalProfitEarned: 0, // No profit yet — will be credited by cron at 00:00 WIB
            status: 'active',
            startDate,
            endDate,
            lastProfitDate: null, // No profit yet — cron will handle first credit
          },
          include: {
            package: {
              select: {
                name: true,
                profitRate: true,
                contractDays: true,
              },
            },
          },
        });

        // ★ REFERRAL BONUS: Credit PER INVESTMENT (every time downline invests) ★
        try {
          await creditInvestmentReferralBonusesTx(tx, user.id, pkg.amount);
        } catch (referralError) {
          console.error(`[INVESTMENT] ❌ Failed to credit referral bonuses for user ${user.id}:`, referralError);
        }

        return { investment, updatedUser };
      });
    } catch (txError: unknown) {
      if (txError instanceof Error && txError.message === 'INSUFFICIENT_BALANCE') {
        const currentUser = await db.user.findUnique({ where: { id: user.id } });
        const totalBalance = (currentUser?.depositBalance || 0) + (currentUser?.mainBalance || 0);
        return NextResponse.json(
          {
            success: false,
            error: `Saldo tidak mencukupi. Total saldo Anda: Rp ${Math.floor(totalBalance).toLocaleString('id-ID')}, dibutuhkan: Rp ${Math.floor(pkg.amount).toLocaleString('id-ID')}`,
          },
          { status: 400 }
        );
      }
      if (txError instanceof Error && txError.message === 'USER_NOT_FOUND') {
        return NextResponse.json(
          { success: false, error: 'User tidak ditemukan' },
          { status: 404 }
        );
      }
      // ★ v20 anti-race-condition: duplicate caught inside tx
      if (
        txError instanceof Error &&
        txError.message.startsWith('ASET_SAMA_AKTIF')
      ) {
        return NextResponse.json(
          {
            success: false,
            error: txError.message.replace('ASET_SAMA_AKTIF: ', ''),
          },
          { status: 400 }
        );
      }
      throw txError;
    }

    return NextResponse.json({
      success: true,
      data: {
        id: result.investment.id,
        amount: result.investment.amount,
        dailyProfit: result.investment.dailyProfit,
        totalProfitEarned: result.investment.totalProfitEarned,
        status: result.investment.status,
        startDate: result.investment.startDate,
        endDate: result.investment.endDate,
        package: result.investment.package,
        remainingBalance: result.updatedUser.mainBalance,
      },
      message: `Investasi ${pkg.name} berhasil! Profit harian Rp ${Math.floor(dailyProfit).toLocaleString('id-ID')} akan masuk setiap hari jam 00:00 WIB`,
    }, { status: 201 });
  } catch (error) {
    console.error('Create investment error:', error);
    return NextResponse.json(
      { success: false, error: 'Database belum tersedia. Silakan hubungi admin.' },
      { status: 503 }
    );
  }
}

