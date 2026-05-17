import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateBotRequest } from '@/lib/bot-auth';

// PUT - Reject a pending withdrawal via bot
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

    // Reject withdrawal in a transaction - return amount to user's mainBalance
    const result = await db.$transaction(async (tx) => {
      // Update withdrawal status to rejected
      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: 'rejected',
          note: note || '',
        },
      });

      // Return the amount to user's mainBalance
      await tx.user.update({
        where: { id: withdrawal.userId },
        data: {
          mainBalance: { increment: withdrawal.amount },
        },
      });

      return updatedWithdrawal;
    });

    return NextResponse.json({
      success: true,
      data: {
        withdrawalId: result.id,
        status: result.status,
        returnedAmount: withdrawal.amount,
      },
    });
  } catch (error) {
    console.error('Reject withdrawal error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
