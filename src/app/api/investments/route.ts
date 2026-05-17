import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { creditInvestmentReferralBonusesTx } from '@/lib/referral-bonus';

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

        // ★ REFERRAL BONUS: Credit on FIRST investment (one-time) ★
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

