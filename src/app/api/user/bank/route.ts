import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const banks = await db.bankAccount.findMany({
      where: { userId: user.id },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ success: true, data: banks });
  } catch (error) {
    console.error('Get bank accounts error:', error);
    return NextResponse.json({ success: true, data: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { bankName, accountNo, holderName } = body;

    if (!bankName || !accountNo || !holderName) {
      return NextResponse.json({ success: false, error: 'Semua field wajib diisi' }, { status: 400 });
    }

    // Check if this is the first bank account - make it primary
    const existingBanks = await db.bankAccount.count({ where: { userId: user.id } });

    const bank = await db.bankAccount.create({
      data: {
        userId: user.id,
        bankName,
        accountNo,
        holderName,
        isPrimary: existingBanks === 0,
      },
    });

    return NextResponse.json({ success: true, data: bank });
  } catch (error) {
    console.error('Add bank account error:', error);
    return NextResponse.json({ success: false, error: 'Database belum tersedia. Silakan hubungi admin.' }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { id, bankName, accountNo, holderName } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID rekening wajib diisi' }, { status: 400 });
    }

    // Verify ownership
    const existingBank = await db.bankAccount.findUnique({ where: { id } });
    if (!existingBank || existingBank.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Rekening tidak ditemukan' }, { status: 404 });
    }

    const updateData: { bankName?: string; accountNo?: string; holderName?: string } = {};
    if (bankName !== undefined) updateData.bankName = bankName;
    if (accountNo !== undefined) updateData.accountNo = accountNo;
    if (holderName !== undefined) updateData.holderName = holderName;

    const updatedBank = await db.bankAccount.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: updatedBank });
  } catch (error) {
    console.error('Update bank account error:', error);
    return NextResponse.json({ success: false, error: 'Database belum tersedia. Silakan hubungi admin.' }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    // Try to get ID from body first, then from searchParams
    let id: string | null = null;
    try {
      const body = await request.json();
      id = body.id || null;
    } catch {
      // Body is not JSON, try searchParams
    }
    if (!id) {
      const { searchParams } = new URL(request.url);
      id = searchParams.get('id');
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID rekening wajib diisi' }, { status: 400 });
    }

    // Verify ownership
    const existingBank = await db.bankAccount.findUnique({ where: { id } });
    if (!existingBank || existingBank.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Rekening tidak ditemukan' }, { status: 404 });
    }

    await db.bankAccount.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { message: 'Rekening berhasil dihapus' } });
  } catch (error) {
    console.error('Delete bank account error:', error);
    return NextResponse.json({ success: false, error: 'Database belum tersedia. Silakan hubungi admin.' }, { status: 503 });
  }
}
