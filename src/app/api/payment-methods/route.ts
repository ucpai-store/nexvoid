import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// FALLBACK hanya muncul kalau DB error. Data sama dengan seed (QRIS + USDT).
// Admin wajib upload QR QRIS & isi wallet USDT via panel — di sini qrImage & accountNo kosong.
const FALLBACK_PAYMENT_METHODS = [
  {
    id: 'fb-qris',
    type: 'qris',
    name: 'QRIS Universal',
    accountNo: '',
    holderName: 'NEXVO',
    qrImage: '',
    iconUrl: '',
    color: '#E31E24',
    isActive: true,
    order: 1,
  },
  {
    id: 'fb-usdt',
    type: 'usdt',
    name: 'USDT (BEP20)',
    accountNo: '',
    holderName: 'NEXVO',
    qrImage: '',
    iconUrl: '',
    color: '#26A17B',
    isActive: true,
    order: 2,
  },
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // qris, usdt

    // Only QRIS and USDT are exposed for deposit payments.
    // bank/ewallet/crypto legacy types are hidden from users.
    const where: { isActive: boolean; type?: string | { in: string[] } } = { isActive: true };
    if (type && ['qris', 'usdt'].includes(type)) {
      where.type = type;
    } else {
      // Default: only return qris + usdt (filter out legacy types)
      where.type = { in: ['qris', 'usdt'] };
    }

    const paymentMethods = await db.paymentMethod.findMany({
      where,
      orderBy: { order: 'asc' },
    });

    return NextResponse.json({ success: true, data: paymentMethods });
  } catch (error) {
    console.error('Get payment methods error:', error);
    // Return fallback data when database is not available
    return NextResponse.json({ success: true, data: FALLBACK_PAYMENT_METHODS });
  }
}
