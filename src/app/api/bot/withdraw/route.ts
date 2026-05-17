import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateBotRequest } from '@/lib/bot-auth';

// POST - Bot withdraw (requires API key)
export async function POST(request: NextRequest) {
  try {
    // Authenticate (API Key or admin JWT from pairing code)
    const auth = await authenticateBotRequest(request);
    if (!auth.authenticated) return auth.error;

    const body = await request.json();
    const { whatsapp, amount, bankName, accountNo, holderName, paymentType } = body;

    if (!whatsapp || typeof whatsapp !== 'string' || whatsapp.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'whatsapp number is required' },
        { status: 400 }
      );
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Valid amount is required' },
        { status: 400 }
      );
    }

    if (!bankName || typeof bankName !== 'string' || bankName.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'bankName/paymentMethod is required' },
        { status: 400 }
      );
    }

    if (!accountNo || typeof accountNo !== 'string' || accountNo.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'accountNo is required' },
        { status: 400 }
      );
    }

    if (!holderName || typeof holderName !== 'string' || holderName.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'holderName is required' },
        { status: 400 }
      );
    }

    // Find user by whatsapp
    const user = await db.user.findUnique({ where: { whatsapp: whatsapp.trim() } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    if (user.isSuspended) {
      return NextResponse.json(
        { success: false, error: 'User account is suspended' },
        { status: 403 }
      );
    }

    // Get minimum withdraw from system settings
    let minWithdraw = 50000;
    try {
      const minSetting = await db.systemSettings.findUnique({ where: { key: 'min_withdraw' } });
      if (minSetting) {
        const parsed = parseFloat(minSetting.value);
        if (!isNaN(parsed) && parsed > 0) minWithdraw = parsed;
      }
    } catch { /* use default */ }

    if (amount < minWithdraw) {
      return NextResponse.json(
        { success: false, error: `Minimum withdraw is ${minWithdraw}` },
        { status: 400 }
      );
    }

    // Validate balance (use mainBalance)
    if (user.mainBalance < amount) {
      return NextResponse.json(
        { success: false, error: 'Insufficient balance' },
        { status: 400 }
      );
    }

    // Calculate fee from system settings (default 10%)
    let feeRate = 0.1;
    try {
      const feeSetting = await db.systemSettings.findUnique({ where: { key: 'withdraw_fee' } });
      if (feeSetting) {
        const parsed = parseFloat(feeSetting.value);
        if (!isNaN(parsed) && parsed >= 0) {
          feeRate = parsed / 100; // convert percentage to rate
        }
      }
    } catch { /* use default */ }

    const fee = Math.round(amount * feeRate);
    const netAmount = amount - fee;

    if (netAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Net amount after fee must be greater than 0' },
        { status: 400 }
      );
    }

    // Create withdrawal and deduct balance in a transaction
    const withdrawal = await db.$transaction(async (tx) => {
      // Re-read user within transaction to ensure balance hasn't changed
      const currentUser = await tx.user.findUnique({ where: { id: user.id } });
      if (!currentUser || currentUser.mainBalance < amount) {
        throw new Error('Insufficient balance');
      }

      // Deduct from mainBalance
      await tx.user.update({
        where: { id: user.id },
        data: {
          mainBalance: { decrement: amount },
        },
      });

      // Create withdrawal record
      return tx.withdrawal.create({
        data: {
          userId: user.id,
          bankId: 'bot-api',
          bankName: bankName.trim(),
          accountNo: accountNo.trim(),
          holderName: holderName.trim(),
          paymentType: paymentType || 'bank',
          amount,
          fee,
          netAmount,
          status: 'pending',
          note: 'Created via bot API',
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: {
        withdrawalId: withdrawal.id,
        amount: withdrawal.amount,
        fee: withdrawal.fee,
        netAmount: withdrawal.netAmount,
        status: withdrawal.status,
      },
    });
  } catch (error) {
    console.error('Bot withdraw error:', error);
    if (error instanceof Error && error.message === 'Insufficient balance') {
      return NextResponse.json(
        { success: false, error: 'Insufficient balance' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
