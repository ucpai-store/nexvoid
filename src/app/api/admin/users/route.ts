import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest, logAdminAction, generateUserId, generateReferralCode } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    const where: {
      OR?: Array<{ userId?: { contains: string }; whatsapp?: { contains: string }; name?: { contains: string } }>;
    } = {};

    if (search) {
      where.OR = [
        { userId: { contains: search } },
        { whatsapp: { contains: search } },
        { name: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true, userId: true, whatsapp: true, name: true, avatar: true, email: true,
          referralCode: true, level: true, mainBalance: true, depositBalance: true, profitBalance: true,
          totalDeposit: true, totalWithdraw: true, totalProfit: true, isSuspended: true, isVerified: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.user.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get admin users error:', error);
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
    const { id, action, mainBalance, depositBalance, amount } = body;

    if (!id || !action) {
      return NextResponse.json({ success: false, error: 'ID dan action wajib diisi' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ success: false, error: 'User tidak ditemukan' }, { status: 404 });
    }

    let updatedUser;

    switch (action) {
      case 'edit-saldo': {
        const data: { mainBalance?: number; depositBalance?: number; profitBalance?: number } = {};
        if (mainBalance !== undefined) data.mainBalance = parseFloat(String(mainBalance));
        if (depositBalance !== undefined) data.depositBalance = parseFloat(String(depositBalance));
        if (profitBalance !== undefined) data.profitBalance = parseFloat(String(profitBalance));
        updatedUser = await db.user.update({ where: { id }, data });
        break;
      }
      case 'add-saldo': {
        const addAmount = parseFloat(String(amount || 0));
        if (addAmount <= 0) {
          return NextResponse.json({ success: false, error: 'Jumlah harus lebih dari 0' }, { status: 400 });
        }
        updatedUser = await db.user.update({
          where: { id },
          data: { mainBalance: { increment: addAmount } },
        });
        break;
      }
      case 'reduce-saldo': {
        const reduceAmount = parseFloat(String(amount || 0));
        if (reduceAmount <= 0) {
          return NextResponse.json({ success: false, error: 'Jumlah harus lebih dari 0' }, { status: 400 });
        }
        if (user.mainBalance < reduceAmount) {
          return NextResponse.json({ success: false, error: 'Saldo tidak mencukupi' }, { status: 400 });
        }
        updatedUser = await db.user.update({
          where: { id },
          data: { mainBalance: { decrement: reduceAmount } },
        });
        break;
      }
      case 'suspend': {
        updatedUser = await db.user.update({
          where: { id },
          data: { isSuspended: !user.isSuspended },
        });
        break;
      }
      case 'verify': {
        updatedUser = await db.user.update({
          where: { id },
          data: { isVerified: true, emailOtpCode: null, emailOtpExpiry: null, otpCode: null, otpExpiry: null },
        });
        break;
      }
      case 'unverify': {
        updatedUser = await db.user.update({
          where: { id },
          data: { isVerified: false },
        });
        break;
      }
      case 'edit': {
        const editData: { name?: string; whatsapp?: string; email?: string; level?: string } = {};
        if (body.name !== undefined) editData.name = body.name;
        if (body.whatsapp !== undefined) {
          // Check whatsapp uniqueness
          const existingWa = await db.user.findFirst({ where: { whatsapp: body.whatsapp, id: { not: id } } });
          if (existingWa) {
            return NextResponse.json({ success: false, error: 'Nomor WhatsApp sudah digunakan user lain' }, { status: 400 });
          }
          editData.whatsapp = body.whatsapp;
        }
        if (body.email !== undefined) {
          // Check email uniqueness
          const existingEmail = await db.user.findFirst({ where: { email: body.email, id: { not: id } } });
          if (existingEmail) {
            return NextResponse.json({ success: false, error: 'Email sudah digunakan user lain' }, { status: 400 });
          }
          editData.email = body.email;
        }
        if (body.level !== undefined) editData.level = body.level;
        updatedUser = await db.user.update({
          where: { id },
          data: editData,
        });
        break;
      }
      case 'delete': {
      // Delete user and all related data (explicit cascade for safety)
      await db.salaryBonus.deleteMany({ where: { userId: id } });
      await db.matchingBonus.deleteMany({ where: { userId: id } });
      await db.referral.deleteMany({ where: { OR: [{ referrerId: id }, { referredId: id }] } });
      await db.bonusLog.deleteMany({ where: { OR: [{ userId: id }, { fromUserId: id }] } });
      await db.investment.deleteMany({ where: { userId: id } });
      await db.purchase.deleteMany({ where: { userId: id } });
      await db.deposit.deleteMany({ where: { userId: id } });
      await db.withdrawal.deleteMany({ where: { userId: id } });
      await db.bankAccount.deleteMany({ where: { userId: id } });
      await db.profitLog.deleteMany({ where: { userId: id } });
      await db.testimonial.deleteMany({ where: { userId: id } });
      await db.user.delete({ where: { id } });

      await logAdminAction(admin.id, 'DELETE_USER', `Deleted user: ${user.userId} (${user.name || 'no name'})`);

      return NextResponse.json({ success: true, data: { message: 'User berhasil dihapus' } });
    }
    default:
        return NextResponse.json({ success: false, error: 'Action tidak valid' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: updatedUser });
  } catch (error) {
    console.error('Update admin user error:', error);
    return NextResponse.json({ success: false, error: 'Database belum tersedia. Silakan hubungi admin.' }, { status: 503 });
  }
}

/* ───────── POST - Create new user ───────── */
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { name, whatsapp, email, password, level } = body;

    if (!whatsapp || !email || !password) {
      return NextResponse.json({ success: false, error: 'WhatsApp, email, dan password wajib diisi' }, { status: 400 });
    }

    // Check if whatsapp already exists
    const existingWa = await db.user.findFirst({ where: { whatsapp } });
    if (existingWa) {
      return NextResponse.json({ success: false, error: 'Nomor WhatsApp sudah terdaftar' }, { status: 400 });
    }

    // Check if email already exists
    const existingEmail = await db.user.findFirst({ where: { email } });
    if (existingEmail) {
      return NextResponse.json({ success: false, error: 'Email sudah terdaftar' }, { status: 400 });
    }

    const userId = generateUserId();
    const referralCode = generateReferralCode();
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await db.user.create({
      data: {
        userId,
        whatsapp,
        email,
        password: hashedPassword,
        referralCode,
        name: name || '',
        avatar: '',
        level: level || 'Bronze',
        isVerified: true, // Admin-created users are auto-verified
        mainBalance: 0,
        profitBalance: 0,
        totalDeposit: 0,
        totalWithdraw: 0,
        totalProfit: 0,
      },
      select: {
        id: true, userId: true, whatsapp: true, name: true, email: true,
        referralCode: true, level: true, mainBalance: true, isSuspended: true,
        isVerified: true, createdAt: true,
      },
    });

    await logAdminAction(admin.id, 'CREATE_USER', `Created user: ${userId} (${name || 'no name'})`);

    return NextResponse.json({ success: true, data: newUser }, { status: 201 });
  } catch (error) {
    console.error('Create admin user error:', error);
    return NextResponse.json({ success: false, error: 'Gagal membuat user baru' }, { status: 500 });
  }
}
