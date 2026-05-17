import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateBotRequest } from '@/lib/bot-auth';

// PUT - Reject a pending deposit via bot
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

    // Update deposit status to rejected
    const updatedDeposit = await db.deposit.update({
      where: { id: deposit.id },
      data: {
        status: 'rejected',
        note: note || '',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        depositId: updatedDeposit.depositId,
        status: updatedDeposit.status,
      },
    });
  } catch (error) {
    console.error('Reject deposit error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
