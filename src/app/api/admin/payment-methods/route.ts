import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const paymentMethods = await db.paymentMethod.findMany({
      orderBy: { order: 'asc' },
    });

    return NextResponse.json({ success: true, data: paymentMethods });
  } catch (error) {
    console.error('Get admin payment methods error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { type, name, accountNo, holderName, qrImage, iconUrl, color, isActive, order } = body;

    if (!type || !name) {
      return NextResponse.json({ success: false, error: 'Tipe dan nama metode pembayaran wajib diisi' }, { status: 400 });
    }

    if (!['bank', 'ewallet', 'qris', 'usdt', 'crypto'].includes(type)) {
      return NextResponse.json({ success: false, error: 'Tipe metode pembayaran tidak valid (bank/ewallet/qris/usdt)' }, { status: 400 });
    }

    const paymentMethod = await db.paymentMethod.create({
      data: {
        type,
        name,
        accountNo: accountNo || '',
        holderName: holderName || '',
        qrImage: qrImage || '',
        iconUrl: iconUrl || '',
        color: color || '',
        isActive: isActive !== undefined ? isActive : true,
        order: order || 0,
      },
    });

    await logAdminAction(admin.id, 'CREATE_PAYMENT_METHOD', `Created payment method: ${name} (${type})`);

    return NextResponse.json({ success: true, data: paymentMethod });
  } catch (error) {
    console.error('Create payment method error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
