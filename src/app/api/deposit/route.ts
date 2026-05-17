import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { notifyBot } from '@/lib/bot-notification';

/**
 * Generate a unique 6-character alphanumeric deposit ID like DP-A3F8K2
 */
function generateDepositId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude confusing chars like O,0,I,1
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
  // Fallback with timestamp suffix
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
      return NextResponse.json({ success: false, error: 'Email belum diverifikasi. Silakan verifikasi email terlebih dahulu.' }, { status: 403 });
    }

    const body = await request.json();
    const { amount, proofImage, paymentMethodId, paymentType, paymentName, paymentAccount } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid deposit amount' }, { status: 400 });
    }

    if (amount < 100000) {
      return NextResponse.json({ success: false, error: 'Minimum deposit is Rp100,000' }, { status: 400 });
    }

    // Generate unique deposit ID
    const depositId = await getUniqueDepositId();

    // No admin fee for deposit — full amount credited
    const fee = 0;
    const netAmount = amount;

    const deposit = await db.deposit.create({
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
        status: 'pending',
        note: '',
      },
    });

    // Notify WhatsApp bot about new deposit for admin approval
    await notifyBot('deposit_pending', {
      depositId: deposit.depositId,
      userId: user.id,
      userName: user.name || user.userId,
      whatsapp: user.whatsapp,
      amount,
      paymentMethod: paymentName || paymentType || 'N/A',
      status: 'pending',
    });

    return NextResponse.json({ success: true, data: deposit });
  } catch (error) {
    console.error('Create deposit error:', error);
    return NextResponse.json({ success: false, error: 'Database belum tersedia. Silakan hubungi admin.' }, { status: 503 });
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

    const [deposits, total] = await Promise.all([
      db.deposit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.deposit.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: deposits,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get deposits error:', error);
    // Return fallback data when database is not available
    return NextResponse.json({
      success: true,
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
  }
}
