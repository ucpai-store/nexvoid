import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateBotRequest } from '@/lib/bot-auth';

// PUT - Approve a pending withdrawal via bot
export async function PUT(request: NextRequest) {
  try {
    // Authenticate (API Key or admin JWT from pairing code)
    const auth = await authenticateBotRequest(request);
    if (!auth.authenticated) return auth.error;

    const body = await request.json();
    const { withdrawalId, note } = body;

    if (!withdrawalId) {
      return NextResponse.json(
        { success: false, error: 'withdrawalId is required' },
        { status: 400 }
      );
    }

    // Find the withdrawal
    const withdrawal = await db.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!withdrawal) {
      return NextResponse.json(
        { success: false, error: 'Withdrawal not found' },
        { status: 404 }
      );
    }

    if (withdrawal.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: 'Withdrawal is not pending' },
        { status: 400 }
      );
    }

    // Approve withdrawal in a transaction
    const result = await db.$transaction(async (tx) => {
      // Update withdrawal status to approved
      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: 'approved',
          note: note || '',
        },
      });

      // Increment user's totalWithdraw by netAmount
      await tx.user.update({
        where: { id: withdrawal.userId },
        data: {
          totalWithdraw: { increment: withdrawal.netAmount },
        },
      });

      return updatedWithdrawal;
    });

    return NextResponse.json({
      success: true,
      data: {
        withdrawalId: result.id,
        amount: result.amount,
        fee: result.fee,
        netAmount: result.netAmount,
        status: result.status,
      },
    });
  } catch (error) {
    console.error('Approve withdrawal error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
