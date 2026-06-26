import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { getAllSettings, isWithinWorkingHours, isWeekendWIB } from '@/lib/settings';
import { notifyBot } from '@/lib/bot-notification';
import { sendPushToAdmins } from '@/lib/push-notification';

// Generate unique withdrawal ID like WD-XXXXXX
function generateWithdrawalId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `WD-${code}`;
}

async function getUniqueWithdrawalId(): Promise<string> {
  let withdrawalId = generateWithdrawalId();
  let attempts = 0;
  while (attempts < 10) {
    const existing = await db.withdrawal.findFirst({ where: { withdrawalId } });
    if (!existing) return withdrawalId;
    withdrawalId = generateWithdrawalId();
    attempts++;
  }
  return `WD-${Date.now().toString(36).toUpperCase()}`;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (user.isSuspended) {
      return NextResponse.json({ success: false, error: 'Account suspended' }, { status: 403 });
    }

    if (!user.isVerified) {
      return NextResponse.json({ success: false, error: 'Email not verified. Please verify your email first.' }, { status: 403 });
    }

    const body = await request.json();
    const { paymentType, paymentMethod, accountNo, holderName, amount } = body;

    if (!paymentType || !paymentMethod || !accountNo || !holderName || !amount || amount <= 0) {
      return NextResponse.json({ success: false, error: 'All fields are required (payment method, account number, holder name, amount)' }, { status: 400 });
    }

    const settings = await getAllSettings();

    // ─── WEEKEND BLOCK: Withdrawal (WD) & Profit libur on Saturday & Sunday ───
    // NOTE: Only WD + profit are libur on weekends. Deposit & salary tetap jalan.
    if (isWeekendWIB()) {
      return NextResponse.json({
        success: false,
        error: 'Withdrawal (WD) diblokir pada hari Sabtu & Minggu. Profit & WD libur di akhir pekan. Deposit tetap bisa dilakukan. Silakan kembali pada hari kerja (Senin-Jumat).'
      }, { status: 400 });
    }

    // Check working hours (weekday hours: Mon-Fri, 09:00-16:00 WIB)
    if (!isWithinWorkingHours(settings)) {
      return NextResponse.json({ success: false, error: `Withdrawals can only be made during working hours (Mon-Fri, 09:00-16:00 WIB)` }, { status: 400 });
    }

    // ─── RULE 1: Minimum withdrawal = 100,000 ───────────────────────
    const MIN_WITHDRAW = 100000;
    if (amount < MIN_WITHDRAW) {
      return NextResponse.json({
        success: false,
        error: `Minimal withdrawal adalah Rp ${MIN_WITHDRAW.toLocaleString('id-ID')}`
      }, { status: 400 });
    }

    // ─── RULE 2: Block if user has a PENDING withdrawal ─────────────
    // User must wait until previous withdrawal is approved/rejected before making new one
    const pendingWithdrawal = await db.withdrawal.findFirst({
      where: { userId: user.id, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    if (pendingWithdrawal) {
      return NextResponse.json({
        success: false,
        error: `Anda masih memiliki withdrawal pending (${pendingWithdrawal.withdrawalId}). Tunggu admin menyetujui withdrawal sebelumnya sebelum membuat withdrawal baru.`
      }, { status: 400 });
    }

    // ─── RULE 3: Maximum withdrawal = last purchased package/product amount ─
    // Find user's most recent purchase (product or package)
    // Try Purchase table first
    const lastPurchase = await db.purchase.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { product: true },
    });

    // Also check Investment table (packages)
    const lastInvestment = await db.investment.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);

    // Determine the last purchase amount (pick the most recent between purchase and investment)
    let lastPackageAmount = 0;
    let lastPackageLabel = '';

    if (lastPurchase && lastInvestment) {
      // Compare dates and pick the more recent
      if (lastPurchase.createdAt > lastInvestment.createdAt) {
        lastPackageAmount = lastPurchase.totalPrice || (lastPurchase.product?.price || 0) * lastPurchase.quantity;
        lastPackageLabel = lastPurchase.product?.name || 'produk';
      } else {
        lastPackageAmount = lastInvestment.amount || 0;
        lastPackageLabel = 'paket investasi';
      }
    } else if (lastPurchase) {
      lastPackageAmount = lastPurchase.totalPrice || (lastPurchase.product?.price || 0) * lastPurchase.quantity;
      lastPackageLabel = lastPurchase.product?.name || 'produk';
    } else if (lastInvestment) {
      lastPackageAmount = lastInvestment.amount || 0;
      lastPackageLabel = 'paket investasi';
    }

    // If user has never purchased any package/product, max withdrawal = 0 (cannot withdraw)
    if (lastPackageAmount <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Anda belum membeli paket/produk apapun. Maksimal withdrawal ditentukan oleh paket/produk terakhir yang Anda beli. Silakan beli paket/produk terlebih dahulu.'
      }, { status: 400 });
    }

    const MAX_WITHDRAW = lastPackageAmount;
    if (amount > MAX_WITHDRAW) {
      return NextResponse.json({
        success: false,
        error: `Maksimal withdrawal adalah Rp ${MAX_WITHDRAW.toLocaleString('id-ID')} (sesuai ${lastPackageLabel} terakhir yang Anda beli).`
      }, { status: 400 });
    }

    // ─── RULE 4: Admin fee = 10% (force, ignore setting) ────────────
    const FEE_PERCENT = 10;
    const fee = Math.round(amount * (FEE_PERCENT / 100));
    const netAmount = amount - fee;

    // Generate unique withdrawal ID
    const withdrawalId = await getUniqueWithdrawalId();

    // Create withdrawal and deduct balance (balance check INSIDE transaction to prevent race condition)
    let withdrawal;
    let fullUser: { whatsapp: string } | null = null;
    try {
      withdrawal = await db.$transaction(async (tx) => {
        // Check balance inside transaction to prevent race condition
        const txUser = await tx.user.findUnique({ where: { id: user.id } });
        if (!txUser || txUser.mainBalance < amount) {
          throw new Error('INSUFFICIENT_BALANCE');
        }

        // Re-check pending withdrawal inside transaction (race condition safety)
        const pendingCheck = await tx.withdrawal.findFirst({
          where: { userId: user.id, status: 'pending' },
        });
        if (pendingCheck) {
          throw new Error('PENDING_WITHDRAWAL_EXISTS');
        }

        await tx.user.update({
          where: { id: user.id },
          data: { mainBalance: { decrement: amount } },
        });

        const newWithdrawal = await tx.withdrawal.create({
          data: {
            withdrawalId,
            userId: user.id,
            bankId: 'direct',
            bankName: paymentMethod,
            accountNo,
            holderName,
            paymentType,
            amount,
            fee,
            netAmount,
            status: 'pending',
            note: 'Menunggu persetujuan admin',
          },
        });

        fullUser = { whatsapp: txUser.whatsapp };
        return newWithdrawal;
      });
    } catch (txError: unknown) {
      if (txError instanceof Error && txError.message === 'INSUFFICIENT_BALANCE') {
        return NextResponse.json({ success: false, error: 'Insufficient balance' }, { status: 400 });
      }
      if (txError instanceof Error && txError.message === 'PENDING_WITHDRAWAL_EXISTS') {
        return NextResponse.json({
          success: false,
          error: 'Anda masih memiliki withdrawal pending. Tunggu admin menyetujui withdrawal sebelumnya.'
        }, { status: 400 });
      }
      throw txError;
    }

    // Notify WhatsApp bot about new withdrawal for admin approval
    await notifyBot('withdraw_pending', {
      withdrawalId: withdrawal.withdrawalId,
      userId: user.id,
      userName: user.name || user.userId,
      whatsapp: fullUser?.whatsapp || '',
      amount,
      fee,
      netAmount,
      bankName: paymentMethod,
      accountNo,
      holderName,
      paymentType,
      status: 'pending',
    }).catch(() => {});

    // Push notification to admins about new withdrawal
    sendPushToAdmins(
      "🏦 Withdrawal Baru",
      `${user.name || user.userId} request withdraw Rp ${Math.floor(amount).toLocaleString("id-ID")} (${withdrawal.withdrawalId})`,
      { type: "withdrawal", withdrawalId: withdrawal.withdrawalId, userId: user.id }
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      data: withdrawal,
      message: `Withdrawal ${withdrawal.withdrawalId} berhasil dibuat! Menunggu persetujuan admin. Anda tidak bisa membuat withdrawal baru sampai withdrawal ini diproses.`,
    });
  } catch (error) {
    console.error('Create withdrawal error:', error);
    return NextResponse.json({ success: false, error: 'Service temporarily unavailable. Please contact admin.' }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    const where: { userId: string; status?: string } = { userId: user.id };
    if (status) where.status = status;

    const [withdrawals, total] = await Promise.all([
      db.withdrawal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.withdrawal.count({ where }),
    ]);

    // Also return user's last package amount (for max withdrawal info) and pending withdrawal status
    const lastPurchase = await db.purchase.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { product: true },
    }).catch(() => null);

    const lastInvestment = await db.investment.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);

    let lastPackageAmount = 0;
    if (lastPurchase && lastInvestment) {
      lastPackageAmount = lastPurchase.createdAt > lastInvestment.createdAt
        ? (lastPurchase.totalPrice || (lastPurchase.product?.price || 0) * lastPurchase.quantity)
        : (lastInvestment.amount || 0);
    } else if (lastPurchase) {
      lastPackageAmount = lastPurchase.totalPrice || (lastPurchase.product?.price || 0) * lastPurchase.quantity;
    } else if (lastInvestment) {
      lastPackageAmount = lastInvestment.amount || 0;
    }

    const pendingWithdrawal = withdrawals.find(w => w.status === 'pending');

    return NextResponse.json({
      success: true,
      data: withdrawals,
      meta: {
        lastPackageAmount,
        hasPendingWithdrawal: !!pendingWithdrawal,
        pendingWithdrawalId: pendingWithdrawal?.withdrawalId || null,
        minWithdraw: 100000,
        maxWithdraw: lastPackageAmount,
        feePercent: 10,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get withdrawals error:', error);
    return NextResponse.json({
      success: true,
      data: [],
      meta: {
        lastPackageAmount: 0,
        hasPendingWithdrawal: false,
        minWithdraw: 100000,
        maxWithdraw: 0,
        feePercent: 10,
      },
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
  }
}
