import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { notifyBot } from '@/lib/bot-notification';
import { sendPushToAdmins } from '@/lib/push-notification';

function generateDepositId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `DP-${code}`;
}

async function getUniqueDepositId(): Promise<string> {
  let depositId = generateDepositId();
  let attempts = 0;
  while (attempts < 10) {
    const existing = await db.deposit.findFirst({ where: { depositId } });
    if (!existing) return depositId;
    depositId = generateDepositId();
    attempts++;
  }
  return `DP-${Date.now().toString(36).toUpperCase()}`;
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
      return NextResponse.json({ success: false, error: 'Email not verified yet.' }, { status: 403 });
    }

    const body = await request.json();
    const { amount, proofImage, paymentMethodId, paymentType, paymentName, paymentAccount } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid deposit amount' }, { status: 400 });
    }
    if (amount < 100000) {
      return NextResponse.json({ success: false, error: 'Minimum deposit is Rp100,000' }, { status: 400 });
    }

    const depositId = await getUniqueDepositId();

    // Deposit auto-approved: NO admin fee, NO admin approval needed.
    // Full amount is credited to user balance immediately.
    const fee = 0;
    const netAmount = amount;

    // Create deposit record AND credit balance immediately (auto-approve)
    const deposit = await db.$transaction(async (tx) => {
      const newDeposit = await tx.deposit.create({
        data: {
          depositId,
          userId: user.id,
          amount,
          fee,
          netAmount,
          proofImage: proofImage || '',
          paymentMethodId: paymentMethodId || null,
          paymentType: paymentType || '',
          paymentName: paymentName || '',
          paymentAccount: paymentAccount || '',
          status: 'approved',
          note: 'Auto-approved',
        },
      });

      // Credit full amount to user's depositBalance + totalDeposit
      await tx.user.update({
        where: { id: user.id },
        data: {
          depositBalance: { increment: netAmount },
          totalDeposit: { increment: netAmount },
        },
      });

      return newDeposit;
    });

    // Notify WhatsApp bot (deposit auto-approved)
    await notifyBot('deposit_approved', {
      depositId: deposit.depositId,
      userId: user.id,
      userName: user.name || user.userId,
      whatsapp: user.whatsapp,
      amount,
      fee,
      netAmount,
      paymentMethod: paymentName || paymentType || 'N/A',
      status: 'approved',
    }).catch(() => {});
    // Push notification to admins (informational, no action needed)
    sendPushToAdmins("💸 Deposit Otomatis", `${user.name || user.userId} deposit Rp ${Math.floor(netAmount).toLocaleString("id-ID")} (auto-approved)`, { type: "deposit", depositId: deposit.depositId, userId: user.id }).catch(() => {});

    return NextResponse.json({
      success: true,
      data: deposit,
      message: `Deposit ${depositId} berhasil! Saldo Rp ${Math.floor(netAmount).toLocaleString('id-ID')} telah masuk ke akun Anda.`,
    });
  } catch (error) {
    console.error('Create deposit error:', error);
    return NextResponse.json({ success: false, error: 'Service temporarily unavailable.' }, { status: 503 });
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

    const where = { userId: user.id };
    if (status) where.status = status;

    const [deposits, total] = await Promise.all([
      db.deposit.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      db.deposit.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: deposits,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Get deposits error:', error);
    return NextResponse.json({ success: true, data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
  }
}
