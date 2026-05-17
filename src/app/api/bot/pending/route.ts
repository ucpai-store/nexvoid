import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateBotRequest } from '@/lib/bot-auth';

// GET - Returns all pending deposits and withdrawals for the bot to process
export async function GET(request: NextRequest) {
  try {
    // Authenticate (API Key or admin JWT from pairing code)
    const auth = await authenticateBotRequest(request);
    if (!auth.authenticated) return auth.error;

    // Query all pending deposits with user info
    const deposits = await db.deposit.findMany({
      where: { status: 'pending' },
      include: {
        user: {
          select: {
            id: true,
            userId: true,
            name: true,
            whatsapp: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Query all pending withdrawals with user info
    const withdrawals = await db.withdrawal.findMany({
      where: { status: 'pending' },
      include: {
        user: {
          select: {
            id: true,
            userId: true,
            name: true,
            whatsapp: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const pendingCount = deposits.length + withdrawals.length;

    return NextResponse.json({
      success: true,
      data: {
        deposits,
        withdrawals,
        pendingCount,
      },
    });
  } catch (error) {
    console.error('Get pending transactions error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
