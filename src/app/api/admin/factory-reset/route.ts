import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';

/**
 * FACTORY RESET — Wipe ALL user-generated data, keep system config.
 *
 * DELETED (transactional/user data):
 *   User, BankAccount, Deposit, Withdrawal, Purchase, Referral,
 *   LiveActivity, ProfitLog, Investment, BonusLog, MatchingBonus,
 *   SalaryBonus, PushSubscription
 *
 * KEPT (system config):
 *   Admin, AdminLog, SystemSettings, InvestmentPackage, Product, Banner,
 *   Testimonial, PaymentMethod, ApkFile, ApiKey, MatchingConfig,
 *   SalaryConfig, WhatsAppAdmin
 *
 * Requires Super Admin role. Confirm payload must equal "RESET ALL USER DATA".
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Tidak terautentikasi' },
        { status: 401 }
      );
    }

    if (admin.role !== 'super_admin') {
      return NextResponse.json(
        { success: false, error: 'Hanya Super Admin yang dapat melakukan factory reset' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const confirm = (body?.confirm || '').toString().trim();
    if (confirm !== 'RESET ALL USER DATA') {
      return NextResponse.json(
        {
          success: false,
          error: 'Konfirmasi tidak valid. Harap ketik: RESET ALL USER DATA',
        },
        { status: 400 }
      );
    }

    // Capture counts before wipe for logging
    const counts = {
      users: await db.user.count(),
      deposits: await db.deposit.count(),
      withdrawals: await db.withdrawal.count(),
      investments: await db.investment.count(),
      referrals: await db.referral.count(),
      bonusLogs: await db.bonusLog.count(),
      salaryBonuses: await db.salaryBonus.count(),
      matchingBonuses: await db.matchingBonus.count(),
      purchases: await db.purchase.count(),
      bankAccounts: await db.bankAccount.count(),
      profitLogs: await db.profitLog.count(),
      liveActivities: await db.liveActivity.count(),
      pushSubscriptions: await db.pushSubscription.count(),
    };

    // Execute wipe in a transaction, in dependency-safe order
    await db.$transaction(async (tx) => {
      // Wipe dependent transactional tables first
      await tx.profitLog.deleteMany();
      await tx.bonusLog.deleteMany();
      await tx.salaryBonus.deleteMany();
      await tx.matchingBonus.deleteMany();
      await tx.pushSubscription.deleteMany();

      await tx.investment.deleteMany();
      await tx.purchase.deleteMany();
      await tx.deposit.deleteMany();
      await tx.withdrawal.deleteMany();
      await tx.liveActivity.deleteMany();

      await tx.referral.deleteMany();
      await tx.bankAccount.deleteMany();

      // Finally delete users
      await tx.user.deleteMany();
    });

    await logAdminAction(
      admin.id,
      'FACTORY_RESET',
      `Wiped all user data: ${JSON.stringify(counts)}`,
      request.headers.get('x-forwarded-for') || ''
    );

    return NextResponse.json({
      success: true,
      message: 'Factory reset berhasil. Semua data user telah dihapus. Konfigurasi sistem (paket, payment, admin, dll) tetap utuh.',
      wiped: counts,
    });
  } catch (error) {
    console.error('Factory reset error:', error);
    return NextResponse.json(
      {
        success: false,
        error: `Gagal melakukan factory reset: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      { status: 500 }
    );
  }
}

/**
 * GET — preview what will be wiped (dry run). No data changes.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Tidak terautentikasi' },
        { status: 401 }
      );
    }

    if (admin.role !== 'super_admin') {
      return NextResponse.json(
        { success: false, error: 'Hanya Super Admin' },
        { status: 403 }
      );
    }

    const [users, deposits, withdrawals, investments, referrals] = await Promise.all([
      db.user.count(),
      db.deposit.count(),
      db.withdrawal.count(),
      db.investment.count(),
      db.referral.count(),
    ]);

    const [bonusLogs, salaryBonuses, matchingBonuses, purchases, bankAccounts] = await Promise.all([
      db.bonusLog.count(),
      db.salaryBonus.count(),
      db.matchingBonus.count(),
      db.purchase.count(),
      db.bankAccount.count(),
    ]);

    const [profitLogs, liveActivities, pushSubs] = await Promise.all([
      db.profitLog.count(),
      db.liveActivity.count(),
      db.pushSubscription.count(),
    ]);

    // System config that will be PRESERVED
    const [packages, products, paymentMethods, settings, admins, banners, testimonials] = await Promise.all([
      db.investmentPackage.count(),
      db.product.count(),
      db.paymentMethod.count(),
      db.systemSettings.count(),
      db.admin.count(),
      db.banner.count(),
      db.testimonial.count(),
    ]);

    return NextResponse.json({
      success: true,
      willDelete: {
        users, deposits, withdrawals, investments, referrals,
        bonusLogs, salaryBonuses, matchingBonuses, purchases, bankAccounts,
        profitLogs, liveActivities, pushSubs,
      },
      willKeep: {
        packages, products, paymentMethods, settings, admins, banners, testimonials,
      },
    });
  } catch (error) {
    console.error('Factory reset preview error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mengambil preview' },
      { status: 500 }
    );
  }
}
