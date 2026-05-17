import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateBotRequest } from '@/lib/bot-auth';

// PUT - Approve a pending deposit via bot
export async function PUT(request: NextRequest) {
  try {
    // Authenticate (API Key or admin JWT from pairing code)
    const auth = await authenticateBotRequest(request);
    if (!auth.authenticated) return auth.error;

    const body = await request.json();
    const { depositId, note } = body;

    if (!depositId) {
      return NextResponse.json(
        { success: false, error: 'depositId is required' },
        { status: 400 }
      );
    }

    // Find the deposit - support both cuid and DP-XXXXXX format
    const deposit = depositId.startsWith('DP-')
      ? await db.deposit.findFirst({ where: { depositId } })
      : await db.deposit.findUnique({ where: { id: depositId } });
    if (!deposit) {
      return NextResponse.json(
        { success: false, error: 'Deposit not found' },
        { status: 404 }
      );
    }

    if (deposit.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: 'Deposit is not pending' },
        { status: 400 }
      );
    }

    // Approve deposit in a transaction
    const result = await db.$transaction(async (tx) => {
      // Update deposit status to approved
      const updatedDeposit = await tx.deposit.update({
        where: { id: deposit.id },
        data: {
          status: 'approved',
          note: note || '',
        },
      });

      // Credit to depositBalance (only for buying packages, NOT withdrawable)
      // and totalDeposit tracking
      const netAmount = deposit.netAmount || (deposit.amount - (deposit.fee || 0));
      const updatedUser = await tx.user.update({
        where: { id: deposit.userId },
        data: {
          depositBalance: { increment: netAmount },
          totalDeposit: { increment: netAmount },
        },
      });

      // Referral bonuses are NOT credited on deposit approval to avoid double-crediting.
      // They are credited when the user invests or purchases a product.
      // See: /api/investments and /api/products

      return { deposit: updatedDeposit, userNewBalance: updatedUser.mainBalance };
    });

    return NextResponse.json({
      success: true,
      data: {
        depositId: result.deposit.depositId,
        amount: result.deposit.amount,
        status: result.deposit.status,
        userNewBalance: result.userNewBalance,
      },
    });
  } catch (error) {
    console.error('Approve deposit error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
