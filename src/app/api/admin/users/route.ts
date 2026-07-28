import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest, logAdminAction, generateUserId, generateReferralCode } from '@/lib/auth';
import bcrypt from 'bcryptjs';

// ★ CRITICAL FIX v7: Force dynamic — disable Next.js route cache.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// Helper format rupiah untuk logging
function formatRupiahAdmin(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    const where: {
      OR?: Array<{ userId?: { contains: string }; whatsapp?: { contains: string }; name?: { contains: string } }>;
    } = {};

    if (search) {
      where.OR = [
        { userId: { contains: search } },
        { whatsapp: { contains: search } },
        { name: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true, userId: true, whatsapp: true, name: true, avatar: true, email: true,
          referralCode: true, level: true, mainBalance: true, depositBalance: true, profitBalance: true,
          totalDeposit: true, totalWithdraw: true, totalProfit: true, isSuspended: true, isVerified: true,
          plainPassword: true,
          wdAccountLocked: true, wdPaymentType: true, wdPaymentMethod: true, wdAccountNo: true, wdHolderName: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.user.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get admin users error:', error);
    return NextResponse.json({
      success: true,
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { id, action, mainBalance, depositBalance, profitBalance, amount } = body;

    if (!id || !action) {
      return NextResponse.json({ success: false, error: 'ID dan action wajib diisi' }, { status: 400 });
    }

    // ★ Global action — fix-all-dupes (v18) — tidak butuh single user lookup
    // Source of truth "active asset" = Investment table. Purchase = transaksi.
    // Bersihkan BOTH: Purchase duplikat + Investment multi-active.
    if (action === 'fix-all-dupes') {
      const allUsers = await db.user.findMany({ select: { id: true, userId: true, name: true } });
      const report: {
        userId: string; name: string;
        deletedPurchases: number; markedPurchases: number; markedInvestments: number;
      }[] = [];
      let totalDeletedPurchases = 0;
      let totalMarkedPurchases = 0;
      let totalMarkedInvestments = 0;
      let usersFixed = 0;

      for (const u of allUsers) {
        // ─── STEP 1: same-product Purchase duplikat (hard delete) ───
        const activePurchases = await db.purchase.findMany({
          where: { userId: u.id, status: 'active' },
          orderBy: { createdAt: 'desc' },
        });
        const byProduct = new Map<string, typeof activePurchases>();
        for (const p of activePurchases) {
          const arr = byProduct.get(p.productId) || [];
          arr.push(p);
          byProduct.set(p.productId, arr);
        }
        const deletedPurchaseIds: string[] = [];
        for (const [, arr] of byProduct) {
          if (arr.length > 1) {
            for (const p of arr.slice(1)) deletedPurchaseIds.push(p.id);
          }
        }
        if (deletedPurchaseIds.length > 0) {
          await db.profitLog.deleteMany({ where: { purchaseId: { in: deletedPurchaseIds } } });
          await db.investment.updateMany({
            where: { purchaseId: { in: deletedPurchaseIds } },
            data: { purchaseId: null, status: 'completed' },
          });
          await db.purchase.deleteMany({ where: { id: { in: deletedPurchaseIds } } });
        }

        // ─── STEP 2: multi-active Purchase → mark older 'completed' ───
        const stillActivePurchases = await db.purchase.findMany({
          where: { userId: u.id, status: 'active' },
          orderBy: { createdAt: 'desc' },
        });
        const purchaseMarkedIds: string[] = [];
        if (stillActivePurchases.length > 1) {
          for (const p of stillActivePurchases.slice(1)) purchaseMarkedIds.push(p.id);
        }
        if (purchaseMarkedIds.length > 0) {
          await db.purchase.updateMany({ where: { id: { in: purchaseMarkedIds } }, data: { status: 'completed' } });
          await db.investment.updateMany({
            where: { purchaseId: { in: purchaseMarkedIds } },
            data: { status: 'completed' },
          });
        }

        // ─── STEP 3: ★ CRITICAL — Clean Investment table (source of truth) ───
        // Keep latest active Investment, mark sisanya 'completed'.
        // Handle case Sholeh01: 1 Purchase active tapi 4 active Investments.
        const activeInvestments = await db.investment.findMany({
          where: { userId: u.id, status: 'active' },
          orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        });
        const investmentMarkedIds: string[] = [];
        if (activeInvestments.length > 1) {
          for (const inv of activeInvestments.slice(1)) investmentMarkedIds.push(inv.id);
        }
        if (investmentMarkedIds.length > 0) {
          await db.investment.updateMany({
            where: { id: { in: investmentMarkedIds } },
            data: { status: 'completed' },
          });
          // Sync: Purchase terkait juga 'completed' (kalau masih active)
          const invPurchaseIds = activeInvestments
            .slice(1)
            .map((inv) => inv.purchaseId)
            .filter((pid): pid is string => !!pid);
          if (invPurchaseIds.length > 0) {
            await db.purchase.updateMany({
              where: { id: { in: invPurchaseIds }, status: 'active' },
              data: { status: 'completed' },
            });
          }
        }

        const dp = deletedPurchaseIds.length;
        const mp = purchaseMarkedIds.length;
        const mi = investmentMarkedIds.length;
        if (dp > 0 || mp > 0 || mi > 0) {
          usersFixed++;
          totalDeletedPurchases += dp;
          totalMarkedPurchases += mp;
          totalMarkedInvestments += mi;
          report.push({
            userId: u.userId, name: u.name || '-',
            deletedPurchases: dp, markedPurchases: mp, markedInvestments: mi,
          });
        }
      }
      await logAdminAction(
        admin.id, 'FIX_ALL_DUPES',
        `Fix semua duplikat: ${usersFixed} user diperbaiki. Hapus ${totalDeletedPurchases} Purchase dup, mark ${totalMarkedPurchases} Purchase + ${totalMarkedInvestments} Investment 'completed'`
      );
      return NextResponse.json({
        success: true,
        data: {
          usersFixed,
          totalDeletedPurchases,
          totalMarkedPurchases,
          totalMarkedInvestments,
          report,
          // Backward-compat field names (UI lama pakai totalDeleted/totalMarked)
          totalDeleted: totalDeletedPurchases,
          totalMarked: totalMarkedPurchases + totalMarkedInvestments,
          message: `Fix ${usersFixed} user: hapus ${totalDeletedPurchases} Purchase dup, mark ${totalMarkedPurchases} Purchase + ${totalMarkedInvestments} Investment 'completed'`,
        },
      });
    }

    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ success: false, error: 'User tidak ditemukan' }, { status: 404 });
    }

    let updatedUser;

    switch (action) {
      case 'edit-saldo': {
        const data: { mainBalance?: number; depositBalance?: number; profitBalance?: number } = {};
        if (mainBalance !== undefined) data.mainBalance = parseFloat(String(mainBalance));
        if (depositBalance !== undefined) data.depositBalance = parseFloat(String(depositBalance));
        if (profitBalance !== undefined) data.profitBalance = parseFloat(String(profitBalance));
        updatedUser = await db.user.update({ where: { id }, data });
        break;
      }
      case 'add-saldo': {
        const addAmount = parseFloat(String(amount || 0));
        if (addAmount <= 0) {
          return NextResponse.json({ success: false, error: 'Jumlah harus lebih dari 0' }, { status: 400 });
        }

        // ★★★ v2.3 FIX: Jika isProfit=true, buat full records (BonusLog + investment + totalProfit) ★★★
        // Ini fix bug "riwayat gak muncul" + "aset gak total profit" + "cron double-credit"
        // saat admin input profit manual via tombol "Tambah Profit".
        const isProfit = body.isProfit === true || body.source === 'profit';
        if (isProfit) {
          await db.$transaction(async (tx) => {
            // 1. Update mainBalance + totalProfit
            await tx.user.update({
              where: { id },
              data: {
                mainBalance: { increment: addAmount },
                totalProfit: { increment: addAmount },
              },
            });

            // 2. Cari active investment user — update totalProfitEarned + lastProfitDate
            // ★★★ v2.4 BULLETPROOF: NO status filter — use endDate as source of truth.
            //   v2.3 filtered `status: 'active'` → if VPS had status variation, findFirst
            //   returned null → totalProfitEarned NEVER updated → aset page shows 0.
            const wibNow = new Date();
            const allUserInvestments = await tx.investment.findMany({
              where: { userId: id },
              include: { package: true },
              orderBy: { createdAt: 'desc' },
            });
            const activeInv = allUserInvestments.find((inv) => {
              if (!inv.endDate) return true; // no endDate = treat as active
              return new Date(inv.endDate) > wibNow;
            });

            let invDesc = 'Profit manual oleh admin';
            if (activeInv) {
              await tx.investment.update({
                where: { id: activeInv.id },
                data: {
                  totalProfitEarned: { increment: addAmount },
                  lastProfitDate: new Date(),
                },
              });
              const pkgName = activeInv.package?.name || 'Investment';
              const pkgRate = activeInv.package?.profitRate || (activeInv.amount > 0 ? (addAmount / activeInv.amount) * 100 : 0);
              invDesc = `Profit harian ${pkgName} (manual by admin) — ${formatRupiahAdmin(addAmount)}`;
            }

            // 3. Bikin BonusLog entry — biar muncul di riwayat + anti double-credit cron
            await tx.bonusLog.create({
              data: {
                userId: id,
                fromUserId: id,
                type: 'profit',
                level: 0,
                amount: addAmount,
                description: invDesc + ' [MANUAL]',
              },
            });
          });

          updatedUser = await db.user.findUnique({ where: { id } });
          await logAdminAction(admin.id, 'ADD_PROFIT_MANUAL', `Manual profit ${formatRupiahAdmin(addAmount)} to user ${user.userId} (${user.name || 'no name'})`);
          break;
        }

        // Default: just mainBalance (untuk top-up deposit, kompensasi, dll — BUKAN profit)
        updatedUser = await db.user.update({
          where: { id },
          data: { mainBalance: { increment: addAmount } },
        });
        await logAdminAction(admin.id, 'ADD_SALDO_WD', `Tambah saldo WD ${formatRupiahAdmin(addAmount)} to user ${user.userId} (${user.name || 'no name'})`);
        break;
      }
      case 'reduce-saldo': {
        const reduceAmount = parseFloat(String(amount || 0));
        if (reduceAmount <= 0) {
          return NextResponse.json({ success: false, error: 'Jumlah harus lebih dari 0' }, { status: 400 });
        }
        if (user.mainBalance < reduceAmount) {
          return NextResponse.json({ success: false, error: 'Saldo tidak mencukupi' }, { status: 400 });
        }
        updatedUser = await db.user.update({
          where: { id },
          data: { mainBalance: { decrement: reduceAmount } },
        });
        await logAdminAction(admin.id, 'REDUCE_SALDO_WD', `Kurangi saldo WD ${formatRupiahAdmin(reduceAmount)} from user ${user.userId} (${user.name || 'no name'})`);
        break;
      }
      case 'add-deposit': {
        // ★ Tambah Saldo Deposit (depositBalance) — terpisah dari saldo WD (mainBalance)
        const addAmount = parseFloat(String(amount || 0));
        if (addAmount <= 0) {
          return NextResponse.json({ success: false, error: 'Jumlah harus lebih dari 0' }, { status: 400 });
        }
        updatedUser = await db.user.update({
          where: { id },
          data: { depositBalance: { increment: addAmount } },
        });
        await logAdminAction(admin.id, 'ADD_SALDO_DEPOSIT', `Tambah saldo deposit ${formatRupiahAdmin(addAmount)} to user ${user.userId} (${user.name || 'no name'})`);
        break;
      }
      case 'reduce-deposit': {
        // ★ Kurangi Saldo Deposit (depositBalance)
        const reduceAmount = parseFloat(String(amount || 0));
        if (reduceAmount <= 0) {
          return NextResponse.json({ success: false, error: 'Jumlah harus lebih dari 0' }, { status: 400 });
        }
        if (user.depositBalance < reduceAmount) {
          return NextResponse.json({ success: false, error: 'Saldo deposit tidak mencukupi' }, { status: 400 });
        }
        updatedUser = await db.user.update({
          where: { id },
          data: { depositBalance: { decrement: reduceAmount } },
        });
        await logAdminAction(admin.id, 'REDUCE_SALDO_DEPOSIT', `Kurangi saldo deposit ${formatRupiahAdmin(reduceAmount)} from user ${user.userId} (${user.name || 'no name'})`);
        break;
      }
      case 'suspend': {
        updatedUser = await db.user.update({
          where: { id },
          data: { isSuspended: !user.isSuspended },
        });
        break;
      }
      case 'unlock-wd-account': {
        // ★ Admin unlock akun WD user — user bisa isi data bank baru saat WD berikutnya
        updatedUser = await db.user.update({
          where: { id },
          data: {
            wdAccountLocked: false,
            wdPaymentType: null,
            wdPaymentMethod: null,
            wdAccountNo: null,
            wdHolderName: null,
          },
        });
        await logAdminAction(admin.id, 'UNLOCK_WD_ACCOUNT', `Unlock akun WD untuk user ${user.userId} (${user.name || 'no name'})`);
        break;
      }
      case 'edit-wd-account': {
        // ★ Admin edit langsung data akun WD user (tetap terkunci)
        const wdData: { wdPaymentType?: string; wdPaymentMethod?: string; wdAccountNo?: string; wdHolderName?: string } = {};
        if (body.wdPaymentType !== undefined) wdData.wdPaymentType = body.wdPaymentType;
        if (body.wdPaymentMethod !== undefined) wdData.wdPaymentMethod = body.wdPaymentMethod;
        if (body.wdAccountNo !== undefined) wdData.wdAccountNo = body.wdAccountNo;
        if (body.wdHolderName !== undefined) wdData.wdHolderName = body.wdHolderName;
        updatedUser = await db.user.update({ where: { id }, data: wdData });
        await logAdminAction(admin.id, 'EDIT_WD_ACCOUNT', `Edit data akun WD untuk user ${user.userId} (${user.name || 'no name'})`);
        break;
      }

      /* ════════════════════════════════════════════════════════════════
       *  ★★★ ADMIN FULL CONTROL — Kelola Aset User (hapus per item / hapus semua / set saldo 0 / fix duplikat paket)
       *  Tambahkan sesuai permintaan: "fitur admin kasi full kontrol bisa hapus aset user dll lengkap ya"
       * ════════════════════════════════════════════════════════════════ */

      /* ─── Saldo & Stats ─── */
      case 'set-saldo-zero': {
        // Set SEMUA saldo user ke 0 (mainBalance, depositBalance, profitBalance)
        updatedUser = await db.user.update({
          where: { id },
          data: { mainBalance: 0, depositBalance: 0, profitBalance: 0 },
        });
        await logAdminAction(admin.id, 'SET_SALDO_ZERO', `Set saldo user ${user.userId} (${user.name || 'no name'}) ke 0 (main+deposit+profit)`);
        break;
      }
      case 'reset-stats': {
        // Reset totalDeposit, totalWithdraw, totalProfit ke 0 (saldo utama TIDAK diubah)
        updatedUser = await db.user.update({
          where: { id },
          data: { totalDeposit: 0, totalWithdraw: 0, totalProfit: 0 },
        });
        await logAdminAction(admin.id, 'RESET_STATS', `Reset statistik user ${user.userId} (${user.name || 'no name'}) ke 0`);
        break;
      }

      /* ─── Delete single asset by id ─── */
      case 'delete-purchase': {
        const purchaseId = String(body.purchaseId || '');
        if (!purchaseId) return NextResponse.json({ success: false, error: 'purchaseId wajib diisi' }, { status: 400 });
        const target = await db.purchase.findFirst({ where: { id: purchaseId, userId: id } });
        if (!target) return NextResponse.json({ success: false, error: 'Purchase tidak ditemukan' }, { status: 404 });
        // Cascade: delete profitLogs first, then nullify investment.purchaseId, then delete purchase
        await db.profitLog.deleteMany({ where: { purchaseId } });
        await db.investment.updateMany({ where: { purchaseId }, data: { purchaseId: null } });
        await db.purchase.delete({ where: { id: purchaseId } });
        await logAdminAction(admin.id, 'DELETE_PURCHASE', `Hapus purchase ${purchaseId} (${formatRupiahAdmin(target.totalPrice)}) dari user ${user.userId}`);
        break;
      }
      case 'delete-investment': {
        const investmentId = String(body.investmentId || '');
        if (!investmentId) return NextResponse.json({ success: false, error: 'investmentId wajib diisi' }, { status: 400 });
        const target = await db.investment.findFirst({ where: { id: investmentId, userId: id } });
        if (!target) return NextResponse.json({ success: false, error: 'Investment tidak ditemukan' }, { status: 404 });
        await db.investment.delete({ where: { id: investmentId } });
        await logAdminAction(admin.id, 'DELETE_INVESTMENT', `Hapus investment ${investmentId} (${formatRupiahAdmin(target.amount)}) dari user ${user.userId}`);
        break;
      }
      case 'delete-deposit': {
        const depositId = String(body.depositId || '');
        if (!depositId) return NextResponse.json({ success: false, error: 'depositId wajib diisi' }, { status: 400 });
        const target = await db.deposit.findFirst({ where: { id: depositId, userId: id } });
        if (!target) return NextResponse.json({ success: false, error: 'Deposit tidak ditemukan' }, { status: 404 });
        await db.deposit.delete({ where: { id: depositId } });
        await logAdminAction(admin.id, 'DELETE_DEPOSIT', `Hapus deposit ${depositId} (${formatRupiahAdmin(target.amount)}) dari user ${user.userId}`);
        break;
      }
      case 'delete-withdrawal': {
        const withdrawalId = String(body.withdrawalId || '');
        if (!withdrawalId) return NextResponse.json({ success: false, error: 'withdrawalId wajib diisi' }, { status: 400 });
        const target = await db.withdrawal.findFirst({ where: { id: withdrawalId, userId: id } });
        if (!target) return NextResponse.json({ success: false, error: 'Withdrawal tidak ditemukan' }, { status: 404 });
        await db.withdrawal.delete({ where: { id: withdrawalId } });
        await logAdminAction(admin.id, 'DELETE_WITHDRAWAL', `Hapus withdrawal ${withdrawalId} (${formatRupiahAdmin(target.amount)}) dari user ${user.userId}`);
        break;
      }
      case 'delete-bonus-log': {
        const bonusLogId = String(body.bonusLogId || '');
        if (!bonusLogId) return NextResponse.json({ success: false, error: 'bonusLogId wajib diisi' }, { status: 400 });
        const target = await db.bonusLog.findFirst({ where: { id: bonusLogId, userId: id } });
        if (!target) return NextResponse.json({ success: false, error: 'Bonus log tidak ditemukan' }, { status: 404 });
        await db.bonusLog.delete({ where: { id: bonusLogId } });
        await logAdminAction(admin.id, 'DELETE_BONUS_LOG', `Hapus bonus log ${bonusLogId} (${formatRupiahAdmin(target.amount)}) dari user ${user.userId}`);
        break;
      }
      case 'delete-salary-bonus': {
        const salaryBonusId = String(body.salaryBonusId || '');
        if (!salaryBonusId) return NextResponse.json({ success: false, error: 'salaryBonusId wajib diisi' }, { status: 400 });
        const target = await db.salaryBonus.findFirst({ where: { id: salaryBonusId, userId: id } });
        if (!target) return NextResponse.json({ success: false, error: 'Salary bonus tidak ditemukan' }, { status: 404 });
        await db.salaryBonus.delete({ where: { id: salaryBonusId } });
        await logAdminAction(admin.id, 'DELETE_SALARY_BONUS', `Hapus salary bonus ${salaryBonusId} (${formatRupiahAdmin(target.amount)}) dari user ${user.userId}`);
        break;
      }
      case 'delete-matching-bonus': {
        const matchingBonusId = String(body.matchingBonusId || '');
        if (!matchingBonusId) return NextResponse.json({ success: false, error: 'matchingBonusId wajib diisi' }, { status: 400 });
        const target = await db.matchingBonus.findFirst({ where: { id: matchingBonusId, userId: id } });
        if (!target) return NextResponse.json({ success: false, error: 'Matching bonus tidak ditemukan' }, { status: 404 });
        await db.matchingBonus.delete({ where: { id: matchingBonusId } });
        await logAdminAction(admin.id, 'DELETE_MATCHING_BONUS', `Hapus matching bonus ${matchingBonusId} (${formatRupiahAdmin(target.amount)}) dari user ${user.userId}`);
        break;
      }
      case 'delete-referral': {
        const referralId = String(body.referralId || '');
        if (!referralId) return NextResponse.json({ success: false, error: 'referralId wajib diisi' }, { status: 400 });
        const target = await db.referral.findFirst({ where: { id: referralId, OR: [{ referrerId: id }, { referredId: id }] } });
        if (!target) return NextResponse.json({ success: false, error: 'Referral tidak ditemukan' }, { status: 404 });
        await db.referral.delete({ where: { id: referralId } });
        await logAdminAction(admin.id, 'DELETE_REFERRAL', `Hapus referral ${referralId} dari user ${user.userId}`);
        break;
      }
      case 'delete-bank-account': {
        const bankAccountId = String(body.bankAccountId || '');
        if (!bankAccountId) return NextResponse.json({ success: false, error: 'bankAccountId wajib diisi' }, { status: 400 });
        const target = await db.bankAccount.findFirst({ where: { id: bankAccountId, userId: id } });
        if (!target) return NextResponse.json({ success: false, error: 'Bank account tidak ditemukan' }, { status: 404 });
        await db.bankAccount.delete({ where: { id: bankAccountId } });
        await logAdminAction(admin.id, 'DELETE_BANK_ACCOUNT', `Hapus bank account ${bankAccountId} (${target.bankName} - ${target.accountNo}) dari user ${user.userId}`);
        break;
      }

      /* ─── Clear ALL of one asset type for a user ─── */
      case 'clear-all-purchases': {
        const purchases = await db.purchase.findMany({ where: { userId: id }, select: { id: true } });
        const ids = purchases.map((p) => p.id);
        if (ids.length > 0) {
          await db.profitLog.deleteMany({ where: { purchaseId: { in: ids } } });
          await db.investment.updateMany({ where: { purchaseId: { in: ids } }, data: { purchaseId: null } });
          await db.purchase.deleteMany({ where: { id: { in: ids } } });
        }
        await logAdminAction(admin.id, 'CLEAR_ALL_PURCHASES', `Hapus SEMUA purchases (${ids.length} item) dari user ${user.userId}`);
        break;
      }
      case 'clear-all-investments': {
        const count = await db.investment.count({ where: { userId: id } });
        if (count > 0) await db.investment.deleteMany({ where: { userId: id } });
        await logAdminAction(admin.id, 'CLEAR_ALL_INVESTMENTS', `Hapus SEMUA investments (${count} item) dari user ${user.userId}`);
        break;
      }
      case 'clear-all-deposits': {
        const count = await db.deposit.count({ where: { userId: id } });
        if (count > 0) await db.deposit.deleteMany({ where: { userId: id } });
        await logAdminAction(admin.id, 'CLEAR_ALL_DEPOSITS', `Hapus SEMUA deposits (${count} item) dari user ${user.userId}`);
        break;
      }
      case 'clear-all-withdrawals': {
        const count = await db.withdrawal.count({ where: { userId: id } });
        if (count > 0) await db.withdrawal.deleteMany({ where: { userId: id } });
        await logAdminAction(admin.id, 'CLEAR_ALL_WITHDRAWALS', `Hapus SEMUA withdrawals (${count} item) dari user ${user.userId}`);
        break;
      }
      case 'clear-all-bonus-logs': {
        const count = await db.bonusLog.count({ where: { OR: [{ userId: id }, { fromUserId: id }] } });
        if (count > 0) await db.bonusLog.deleteMany({ where: { OR: [{ userId: id }, { fromUserId: id }] } });
        await logAdminAction(admin.id, 'CLEAR_ALL_BONUS_LOGS', `Hapus SEMUA bonus logs (${count} item) dari user ${user.userId}`);
        break;
      }
      case 'clear-all-salary-bonuses': {
        const count = await db.salaryBonus.count({ where: { userId: id } });
        if (count > 0) await db.salaryBonus.deleteMany({ where: { userId: id } });
        await logAdminAction(admin.id, 'CLEAR_ALL_SALARY_BONUSES', `Hapus SEMUA salary bonuses (${count} item) dari user ${user.userId}`);
        break;
      }
      case 'clear-all-matching-bonuses': {
        const count = await db.matchingBonus.count({ where: { userId: id } });
        if (count > 0) await db.matchingBonus.deleteMany({ where: { userId: id } });
        await logAdminAction(admin.id, 'CLEAR_ALL_MATCHING_BONUSES', `Hapus SEMUA matching bonuses (${count} item) dari user ${user.userId}`);
        break;
      }
      case 'clear-all-referrals': {
        const count = await db.referral.count({ where: { OR: [{ referrerId: id }, { referredId: id }] } });
        if (count > 0) await db.referral.deleteMany({ where: { OR: [{ referrerId: id }, { referredId: id }] } });
        await logAdminAction(admin.id, 'CLEAR_ALL_REFERRALS', `Hapus SEMUA referrals (${count} item) dari user ${user.userId}`);
        break;
      }
      case 'clear-all-bank-accounts': {
        const count = await db.bankAccount.count({ where: { userId: id } });
        if (count > 0) await db.bankAccount.deleteMany({ where: { userId: id } });
        await logAdminAction(admin.id, 'CLEAR_ALL_BANK_ACCOUNTS', `Hapus SEMUA bank accounts (${count} item) dari user ${user.userId}`);
        break;
      }
      case 'clear-all-assets': {
        // Nuclear option: hapus SEMUA aset user (tapi user account tetap ada)
        await db.salaryBonus.deleteMany({ where: { userId: id } });
        await db.matchingBonus.deleteMany({ where: { userId: id } });
        await db.referral.deleteMany({ where: { OR: [{ referrerId: id }, { referredId: id }] } });
        await db.bonusLog.deleteMany({ where: { OR: [{ userId: id }, { fromUserId: id }] } });
        const purchases = await db.purchase.findMany({ where: { userId: id }, select: { id: true } });
        const purchaseIds = purchases.map((p) => p.id);
        if (purchaseIds.length > 0) {
          await db.profitLog.deleteMany({ where: { purchaseId: { in: purchaseIds } } });
          await db.investment.updateMany({ where: { purchaseId: { in: purchaseIds } }, data: { purchaseId: null } });
          await db.purchase.deleteMany({ where: { id: { in: purchaseIds } } });
        }
        await db.investment.deleteMany({ where: { userId: id } });
        await db.deposit.deleteMany({ where: { userId: id } });
        await db.withdrawal.deleteMany({ where: { userId: id } });
        await db.bankAccount.deleteMany({ where: { userId: id } });
        // Reset saldo + stats ke 0
        updatedUser = await db.user.update({
          where: { id },
          data: {
            mainBalance: 0, depositBalance: 0, profitBalance: 0,
            totalDeposit: 0, totalWithdraw: 0, totalProfit: 0,
            wdAccountLocked: false, wdPaymentType: null, wdPaymentMethod: null, wdAccountNo: null, wdHolderName: null,
          },
        });
        await logAdminAction(admin.id, 'CLEAR_ALL_ASSETS', `Nuclear reset: hapus SEMUA aset + reset saldo & stats user ${user.userId}`);
        break;
      }

      /* ─── Fix duplicate active purchases + investments (v18 ONE-ACTIVE-RULE) ─── */
      case 'dedupe-purchases': {
        // v18 ONE-ACTIVE-RULE: user hanya boleh punya 1 paket/produk aktif.
        // Source of truth untuk "active asset" = tabel Investment (status='active').
        // Tabel Purchase = record transaksi. Investment bisa lebih banyak dari Purchase
        // (e.g. user beli produk → 1 Purchase + 1 Investment, atau cron/legacy bikin Investment tanpa Purchase).
        //
        // Strategi fix (urutan):
        //   1. Hapus same-product Purchase duplikat (hard delete, keep latest per productId).
        //   2. Mark multi-active Purchase 'completed' (keep latest, audit trail).
        //   3. ★ CRITICAL: Clean Investment table — keep latest active, mark sisanya 'completed'.
        //      Ini yang sebenarnya menentukan "active asset" di getUserActivePackageInfo.
        //   4. Sync: kalau Investment 'completed', Purchase terkait juga 'completed'.

        // ─── STEP 1: same-product Purchase duplikat (hard delete) ───
        const activePurchases = await db.purchase.findMany({
          where: { userId: id, status: 'active' },
          orderBy: { createdAt: 'desc' },
          include: { product: true },
        });
        const byProduct = new Map<string, typeof activePurchases>();
        for (const p of activePurchases) {
          const arr = byProduct.get(p.productId) || [];
          arr.push(p);
          byProduct.set(p.productId, arr);
        }
        let deletedCount = 0;
        const deletedPurchaseIds: string[] = [];
        for (const [, arr] of byProduct) {
          if (arr.length > 1) {
            for (const p of arr.slice(1)) {
              deletedPurchaseIds.push(p.id);
              deletedCount++;
            }
          }
        }
        if (deletedPurchaseIds.length > 0) {
          await db.profitLog.deleteMany({ where: { purchaseId: { in: deletedPurchaseIds } } });
          await db.investment.updateMany({
            where: { purchaseId: { in: deletedPurchaseIds } },
            data: { purchaseId: null, status: 'completed' },
          });
          await db.purchase.deleteMany({ where: { id: { in: deletedPurchaseIds } } });
        }

        // ─── STEP 2: multi-active Purchase → mark older 'completed' ───
        const stillActivePurchases = await db.purchase.findMany({
          where: { userId: id, status: 'active' },
          orderBy: { createdAt: 'desc' },
        });
        let purchaseMarkedCompleted = 0;
        const purchaseMarkedIds: string[] = [];
        if (stillActivePurchases.length > 1) {
          for (const p of stillActivePurchases.slice(1)) {
            purchaseMarkedIds.push(p.id);
            purchaseMarkedCompleted++;
          }
          if (purchaseMarkedIds.length > 0) {
            await db.purchase.updateMany({
              where: { id: { in: purchaseMarkedIds } },
              data: { status: 'completed' },
            });
            await db.investment.updateMany({
              where: { purchaseId: { in: purchaseMarkedIds } },
              data: { status: 'completed' },
            });
          }
        }

        // ─── STEP 3: ★ CRITICAL — Clean Investment table (source of truth) ───
        // Kalau user masih punya ≥2 active Investments, keep latest, mark sisanya 'completed'.
        // Ini handle case Sholeh01: 2 Purchases (1 active) tapi 4 active Investments.
        const activeInvestments = await db.investment.findMany({
          where: { userId: id, status: 'active' },
          orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        });
        let investmentMarkedCompleted = 0;
        const investmentMarkedIds: string[] = [];
        if (activeInvestments.length > 1) {
          // keep activeInvestments[0] (latest), mark sisanya 'completed'
          for (const inv of activeInvestments.slice(1)) {
            investmentMarkedIds.push(inv.id);
            investmentMarkedCompleted++;
          }
          if (investmentMarkedIds.length > 0) {
            await db.investment.updateMany({
              where: { id: { in: investmentMarkedIds } },
              data: { status: 'completed' },
            });
            // Sync: Purchase terkait juga 'completed' (kalau ada & masih active)
            const invPurchaseIds = activeInvestments
              .slice(1)
              .map((inv) => inv.purchaseId)
              .filter((pid): pid is string => !!pid);
            if (invPurchaseIds.length > 0) {
              await db.purchase.updateMany({
                where: { id: { in: invPurchaseIds }, status: 'active' },
                data: { status: 'completed' },
              });
            }
          }
        }

        const summary = `Fix duplikat user ${user.userId}: hapus ${deletedCount} same-product Purchase, mark ${purchaseMarkedCompleted} Purchase + ${investmentMarkedCompleted} Investment 'completed'`;
        await logAdminAction(admin.id, 'DEDUPE_PURCHASES', summary);
        return NextResponse.json({
          success: true,
          data: {
            deletedCount,
            purchaseMarkedCompleted,
            investmentMarkedCompleted,
            message: `Hapus ${deletedCount} Purchase duplikat, mark ${purchaseMarkedCompleted} Purchase + ${investmentMarkedCompleted} Investment 'completed'`,
          },
        });
      }
      case 'verify': {
        updatedUser = await db.user.update({
          where: { id },
          data: { isVerified: true, emailOtpCode: null, emailOtpExpiry: null, otpCode: null, otpExpiry: null },
        });
        break;
      }
      case 'unverify': {
        updatedUser = await db.user.update({
          where: { id },
          data: { isVerified: false },
        });
        break;
      }
      case 'edit': {
        const editData: { name?: string; whatsapp?: string; email?: string; level?: string } = {};
        if (body.name !== undefined) editData.name = body.name;
        if (body.whatsapp !== undefined) {
          // Check whatsapp uniqueness
          const existingWa = await db.user.findFirst({ where: { whatsapp: body.whatsapp, id: { not: id } } });
          if (existingWa) {
            return NextResponse.json({ success: false, error: 'Nomor WhatsApp sudah digunakan user lain' }, { status: 400 });
          }
          editData.whatsapp = body.whatsapp;
        }
        if (body.email !== undefined) {
          // Check email uniqueness
          const existingEmail = await db.user.findFirst({ where: { email: body.email, id: { not: id } } });
          if (existingEmail) {
            return NextResponse.json({ success: false, error: 'Email sudah digunakan user lain' }, { status: 400 });
          }
          editData.email = body.email;
        }
        if (body.level !== undefined) editData.level = body.level;
        updatedUser = await db.user.update({
          where: { id },
          data: editData,
        });
        break;
      }
      case 'delete': {
      // Delete user and all related data (explicit cascade for safety)
      await db.salaryBonus.deleteMany({ where: { userId: id } });
      await db.matchingBonus.deleteMany({ where: { userId: id } });
      await db.referral.deleteMany({ where: { OR: [{ referrerId: id }, { referredId: id }] } });
      await db.bonusLog.deleteMany({ where: { OR: [{ userId: id }, { fromUserId: id }] } });
      await db.investment.deleteMany({ where: { userId: id } });
      await db.purchase.deleteMany({ where: { userId: id } });
      await db.deposit.deleteMany({ where: { userId: id } });
      await db.withdrawal.deleteMany({ where: { userId: id } });
      await db.bankAccount.deleteMany({ where: { userId: id } });
      await db.profitLog.deleteMany({ where: { userId: id } });
      await db.testimonial.deleteMany({ where: { userId: id } });
      await db.user.delete({ where: { id } });

      await logAdminAction(admin.id, 'DELETE_USER', `Deleted user: ${user.userId} (${user.name || 'no name'})`);

      return NextResponse.json({ success: true, data: { message: 'User berhasil dihapus' } });
    }
      case 'reset-password': {
        const newPassword = body.password;
        if (!newPassword || newPassword.length < 6) {
          return NextResponse.json({ success: false, error: 'Password baru minimal 6 karakter' }, { status: 400 });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        updatedUser = await db.user.update({
          where: { id },
          data: {
            password: hashedPassword,
            plainPassword: newPassword, // ★ Admin full-control: plaintext copy for admin visibility
          },
        });
        await logAdminAction(admin.id, 'RESET_USER_PASSWORD', `Reset password for user ${user.userId} (${user.name || 'no name'})`);
        break;
      }
      default:
        return NextResponse.json({ success: false, error: 'Action tidak valid' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: updatedUser });
  } catch (error) {
    console.error('Update admin user error:', error);
    return NextResponse.json({ success: false, error: 'Database belum tersedia. Silakan hubungi admin.' }, { status: 503 });
  }
}

/* ───────── POST - Create new user ───────── */
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { name, whatsapp, email, password, level } = body;

    if (!whatsapp || !email || !password) {
      return NextResponse.json({ success: false, error: 'WhatsApp, email, dan password wajib diisi' }, { status: 400 });
    }

    // Check if whatsapp already exists
    const existingWa = await db.user.findFirst({ where: { whatsapp } });
    if (existingWa) {
      return NextResponse.json({ success: false, error: 'Nomor WhatsApp sudah terdaftar' }, { status: 400 });
    }

    // Check if email already exists
    const existingEmail = await db.user.findFirst({ where: { email } });
    if (existingEmail) {
      return NextResponse.json({ success: false, error: 'Email sudah terdaftar' }, { status: 400 });
    }

    const userId = generateUserId();
    const referralCode = generateReferralCode();
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await db.user.create({
      data: {
        userId,
        whatsapp,
        email,
        password: hashedPassword,
        plainPassword: password, // ★ Admin full-control: plaintext copy for admin visibility
        referralCode,
        name: name || '',
        avatar: '',
        level: level || 'Bronze',
        isVerified: true, // Admin-created users are auto-verified
        mainBalance: 0,
        profitBalance: 0,
        totalDeposit: 0,
        totalWithdraw: 0,
        totalProfit: 0,
      },
      select: {
        id: true, userId: true, whatsapp: true, name: true, email: true,
        referralCode: true, level: true, mainBalance: true, isSuspended: true,
        isVerified: true, createdAt: true,
      },
    });

    await logAdminAction(admin.id, 'CREATE_USER', `Created user: ${userId} (${name || 'no name'})`);

    return NextResponse.json({ success: true, data: newUser }, { status: 201 });
  } catch (error) {
    console.error('Create admin user error:', error);
    return NextResponse.json({ success: false, error: 'Gagal membuat user baru' }, { status: 500 });
  }
}
