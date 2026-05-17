import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateBotRequest } from '@/lib/bot-auth';

/**
 * Generate a unique 6-character alphanumeric deposit ID like DP-A3F8K2
 */
function generateDepositId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `DP-${code}`;
}

/**
 * Generate a truly unique deposit ID (retry if collision)
 */
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

// POST - Bot deposit (requires API key)
export async function POST(request: NextRequest) {
  try {
    // Authenticate (API Key or admin JWT from pairing code)
    const auth = await authenticateBotRequest(request);
    if (!auth.authenticated) return auth.error;

    const body = await request.json();
    const { whatsapp, amount } = body;

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

    // Generate unique deposit ID
    const depositId = await getUniqueDepositId();

    // Create deposit record with status "pending"
    const deposit = await db.deposit.create({
      data: {
        depositId,
        userId: user.id,
        amount,
        proofImage: '',
        status: 'pending',
        note: 'Created via bot API',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: deposit.id,
        depositId: deposit.depositId,
        amount: deposit.amount,
        status: deposit.status,
      },
    });
  } catch (error) {
    console.error('Bot deposit error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
