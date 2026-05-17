import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { type, name, accountNo, holderName, qrImage, iconUrl, color, isActive, order } = body;

    const existing = await db.paymentMethod.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Metode pembayaran tidak ditemukan' }, { status: 404 });
    }

    if (type && !['bank', 'ewallet', 'qris', 'usdt', 'crypto'].includes(type)) {
      return NextResponse.json({ success: false, error: 'Tipe metode pembayaran tidak valid (bank/ewallet/qris/usdt)' }, { status: 400 });
    }

    const data: {
      type?: string; name?: string; accountNo?: string; holderName?: string;
      qrImage?: string; iconUrl?: string; color?: string;
      isActive?: boolean; order?: number;
    } = {};

    if (type !== undefined) data.type = type;
    if (name !== undefined) data.name = name;
    if (accountNo !== undefined) data.accountNo = accountNo;
    if (holderName !== undefined) data.holderName = holderName;
    if (qrImage !== undefined) data.qrImage = qrImage;
    if (iconUrl !== undefined) data.iconUrl = iconUrl;
    if (color !== undefined) data.color = color;
    if (isActive !== undefined) data.isActive = isActive;
    if (order !== undefined) data.order = parseInt(String(order));

    const updatedPaymentMethod = await db.paymentMethod.update({
      where: { id },
      data,
    });

    await logAdminAction(admin.id, 'UPDATE_PAYMENT_METHOD', `Updated payment method: ${updatedPaymentMethod.name} (${updatedPaymentMethod.type})`);

    return NextResponse.json({ success: true, data: updatedPaymentMethod });
  } catch (error) {
    console.error('Update payment method error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const { id } = await params;

    const existing = await db.paymentMethod.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Metode pembayaran tidak ditemukan' }, { status: 404 });
    }

    // Soft delete: set isActive to false
    await db.paymentMethod.update({
      where: { id },
      data: { isActive: false },
    });

    await logAdminAction(admin.id, 'DELETE_PAYMENT_METHOD', `Soft-deleted payment method: ${existing.name} (${existing.type})`);

    return NextResponse.json({ success: true, data: { message: 'Metode pembayaran berhasil dihapus' } });
  } catch (error) {
    console.error('Delete payment method error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
