import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { getAllSettings, isWithinWorkingHours } from '@/lib/settings';
import { notifyBot } from '@/lib/bot-notification';

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    if (user.isSuspended) {
      return NextResponse.json({ success: false, error: 'Akun ditangguhkan' }, { status: 403 });
    }

    if (!user.isVerified) {
      return NextResponse.json({ success: false, error: 'Email belum diverifikasi. Silakan verifikasi email terlebih dahulu.' }, { status: 403 });
    }

    const body = await request.json();
    const { paymentType, paymentMethod, accountNo, holderName, amount } = body;

    if (!paymentType || !paymentMethod || !accountNo || !holderName || !amount || amount <= 0) {
      return NextResponse.json({ success: false, error: 'Semua field wajib diisi (metode pembayaran, nomor akun, nama pemilik, jumlah)' }, { status: 400 });
    }

    const settings = await getAllSettings();

    // Check working hours
    if (!isWithinWorkingHours(settings)) {
      return NextResponse.json({ success: false, error: 'Penarikan hanya bisa dilakukan pada jam kerja (Senin-Jumat, 08:00-17:00)' }, { status: 400 });
    }

    // Check minimum withdrawal
    const minWithdraw = parseFloat(settings.min_withdraw || '50000');
    if (amount < minWithdraw) {
      return NextResponse.json({ success: false, error: `Minimum penarikan Rp ${minWithdraw.toLocaleString('id-ID')}` }, { status: 400 });
    }

    // Calculate fee
    const feePercent = parseFloat(settings.withdraw_fee || '10');
    const fee = Math.round(amount * (feePercent / 100));
    const netAmount = amount - fee;

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

        await tx.user.update({
          where: { id: user.id },
          data: { mainBalance: { decrement: amount } },
        });

        const newWithdrawal = await tx.withdrawal.create({
          data: {
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
            note: '',
          },
        });

        fullUser = { whatsapp: txUser.whatsapp };
        return newWithdrawal;
      });
    } catch (txError: unknown) {
      if (txError instanceof Error && txError.message === 'INSUFFICIENT_BALANCE') {
        return NextResponse.json({ success: false, error: 'Saldo tidak mencukupi' }, { status: 400 });
      }
      throw txError;
    }

    // Notify WhatsApp bot about new withdrawal for admin approval
    await notifyBot('withdraw_pending', {
      withdrawalId: withdrawal.id,
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
    });

    return NextResponse.json({ success: true, data: withdrawal });
  } catch (error) {
    console.error('Create withdrawal error:', error);
    return NextResponse.json({ success: false, error: 'Database belum tersedia. Silakan hubungi admin.' }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
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

    return NextResponse.json({
      success: true,
      data: withdrawals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get withdrawals error:', error);
    // Return fallback data when database is not available
    return NextResponse.json({
      success: true,
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
  }
}
