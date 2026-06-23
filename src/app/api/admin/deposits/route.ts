import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';
import { sendPushNotification } from '@/lib/push-notification';

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    const where: { status?: string } = {};
    if (status) where.status = status;

    const [deposits, total] = await Promise.all([
      db.deposit.findMany({
        where,
        include: {
          user: {
            select: {
              id: true, userId: true, name: true, whatsapp: true,
            },
          },
        },
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
    console.error('Get admin deposits error:', error);
    return NextResponse.json({
      success: true,
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { id, status, note } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, error: 'ID dan status wajib diisi' }, { status: 400 });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ success: false, error: 'Status tidak valid' }, { status: 400 });
    }

    const deposit = await db.deposit.findUnique({ where: { id } });
    if (!deposit) {
      return NextResponse.json({ success: false, error: 'Deposit tidak ditemukan' }, { status: 404 });
    }

    // Manual approval flow:
    //  - Admin approves a 'pending' deposit → credit balance to user
    //  - Admin rejects a 'pending' deposit → no balance change (was never credited)
    //  - Admin rejects an 'approved' deposit → reverse the credit (fraud handling)
    // Block re-processing of already-processed deposits (rejected or approved twice)
    if (deposit.status === 'rejected') {
      return NextResponse.json({ success: false, error: 'Deposit sudah ditolak, tidak bisa diproses lagi' }, { status: 400 });
    }
    if (deposit.status === 'approved' && status === 'approved') {
      return NextResponse.json({ success: false, error: 'Deposit sudah disetujui' }, { status: 400 });
    }

    const netAmount = deposit.netAmount || (deposit.amount - (deposit.fee || 0));

    const updatedDeposit = await db.$transaction(async (tx) => {
      const updated = await tx.deposit.update({
        where: { id },
        data: {
          status,
          note: note || (status === 'approved' ? 'Disetujui oleh admin' : 'Ditolak oleh admin'),
        },
      });

      // Approving a pending deposit → credit balance to user
      if (status === 'approved' && deposit.status === 'pending') {
        await tx.user.update({
          where: { id: deposit.userId },
          data: {
            depositBalance: { increment: netAmount },
            totalDeposit: { increment: netAmount },
          },
        });
      }

      // Rejecting an already-approved deposit → reverse the credit (fraud handling)
      if (status === 'rejected' && deposit.status === 'approved') {
        await tx.user.update({
          where: { id: deposit.userId },
          data: {
            depositBalance: { decrement: netAmount },
            totalDeposit: { decrement: netAmount },
          },
        });
      }

      return updated;
    });

    // Push notification to user about deposit status change
    if (status === 'approved') {
      sendPushNotification(
        deposit.userId, "user",
        "✅ Deposit Disetujui",
        `Deposit Rp ${Math.floor(deposit.amount).toLocaleString("id-ID")} telah disetujui`,
        { type: "deposit_approved", depositId: deposit.depositId }
      ).catch(() => {});
    } else {
      sendPushNotification(
        deposit.userId, "user",
        "❌ Deposit Ditolak",
        `Deposit Rp ${Math.floor(deposit.amount).toLocaleString("id-ID")} ditolak. ${note || ""}`,
        { type: "deposit_rejected", depositId: deposit.depositId }
      ).catch(() => {});
    }

    return NextResponse.json({ success: true, data: updatedDeposit });
  } catch (error) {
    console.error('Update admin deposit error:', error);
    return NextResponse.json({ success: false, error: 'Database belum tersedia. Silakan hubungi admin.' }, { status: 503 });
  }
}

