import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';
import { processAllSalaryBonuses, checkAndCreditSalaryBonus, getUserSalaryEligibility } from '@/lib/salary-bonus';

// GET: List salary bonuses with filters
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all';
    const year = searchParams.get('year');
    const week = searchParams.get('week');
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Build where clause
    const where: Record<string, unknown> = {};
    if (status !== 'all') where.status = status;
    if (year) where.year = parseInt(year);
    if (week) where.weekNumber = parseInt(week);

    // Search by user name or userId
    if (search) {
      const users = await db.user.findMany({
        where: {
          OR: [
            { name: { contains: search } },
            { userId: { contains: search } },
            { whatsapp: { contains: search } },
          ],
        },
        select: { id: true },
      });
      where.userId = { in: users.map((u) => u.id) };
    }

    const [salaryBonuses, total] = await Promise.all([
      db.salaryBonus.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              userId: true,
              name: true,
              whatsapp: true,
              referralCode: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.salaryBonus.count({ where }),
    ]);

    // Get stats
    const [totalPaid, totalCancelled, totalEligible] = await Promise.all([
      db.salaryBonus.aggregate({ where: { status: 'paid' }, _sum: { amount: true }, _count: true }),
      db.salaryBonus.aggregate({ where: { status: 'cancelled' }, _sum: { amount: true }, _count: true }),
      db.salaryBonus.aggregate({ where: { status: 'pending' }, _count: true }),
    ]);

    return NextResponse.json({
      success: true,
      data: salaryBonuses.map((sb) => ({
        id: sb.id,
        userId: sb.userId,
        weekNumber: sb.weekNumber,
        year: sb.year,
        directReferrals: sb.directRefs,
        omzet: sb.groupOmzet,
        amount: sb.amount,
        status: sb.status,
        note: '',
        paidAt: sb.createdAt?.toISOString() || null,
        createdAt: sb.createdAt.toISOString(),
        user: sb.user,
      })),
      stats: {
        totalPaidAmount: totalPaid._sum.amount || 0,
        totalPaidCount: totalPaid._count,
        totalCancelledAmount: totalCancelled._sum.amount || 0,
        totalCancelledCount: totalCancelled._count,
        totalPendingCount: totalEligible._count,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get salary bonuses error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST: Process weekly salary bonus / Manual credit
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { action, userId } = body;

    if (action === 'process') {
      // Process weekly salary bonus for all eligible users
      const result = await processAllSalaryBonuses();
      return NextResponse.json({
        success: true,
        data: result,
        message: `Berhasil memproses bonus gaji: ${result.eligible} eligible, ${result.skipped} tidak eligible`,
      });
    }

    if (action === 'manual') {
      // Manual credit salary bonus to a specific user
      if (!userId) {
        return NextResponse.json({ success: false, error: 'userId wajib diisi' }, { status: 400 });
      }

      const result = await checkAndCreditSalaryBonus(userId);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.message }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: 'Bonus gaji berhasil dikreditkan',
        data: { amount: result.amount, message: result.message },
      });
    }

    return NextResponse.json({ success: false, error: 'Action tidak valid' }, { status: 400 });
  } catch (error) {
    console.error('Process salary bonus error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE: Delete a salary bonus record
export async function DELETE(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'id wajib diisi' }, { status: 400 });
    }

    const salaryBonus = await db.salaryBonus.findUnique({ where: { id } });
    if (!salaryBonus) {
      return NextResponse.json({ success: false, error: 'Bonus gaji tidak ditemukan' }, { status: 404 });
    }

    // If it was paid, reverse the payment first
    if (salaryBonus.status === 'paid') {
      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: salaryBonus.userId },
          data: {
            mainBalance: { decrement: salaryBonus.amount },
            totalProfit: { decrement: salaryBonus.amount },
          },
        });

        // Delete related BonusLog
        await tx.bonusLog.deleteMany({
          where: {
            userId: salaryBonus.userId,
            type: 'salary',
            amount: salaryBonus.amount,
            createdAt: {
              gte: new Date(salaryBonus.createdAt.getTime() - 1000),
              lte: new Date(salaryBonus.createdAt.getTime() + 1000),
            },
          },
        });

        await tx.salaryBonus.delete({ where: { id } });
      });
    } else {
      await db.salaryBonus.delete({ where: { id } });
    }

    return NextResponse.json({ success: true, message: 'Bonus gaji berhasil dihapus' });
  } catch (error) {
    console.error('Delete salary bonus error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
