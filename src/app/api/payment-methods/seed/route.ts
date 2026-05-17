import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';

/**
 * POST /api/payment-methods/seed
 * Seeds default payment methods for deposit (QRIS + USDT BEP20) if they don't already exist.
 * Requires admin authentication.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const results: { action: string; method: Record<string, unknown> }[] = [];

    const defaultMethods = [
      // QRIS
      { type: 'qris', name: 'QRIS', accountNo: '', holderName: 'NEXVO', color: '#E31E24', order: 1 },
      // USDT BEP20
      { type: 'usdt', name: 'USDT (BEP20)', accountNo: '', holderName: 'NEXVO', color: '#26A17B', order: 2 },
      // Crypto (alternative USDT)
      { type: 'crypto', name: 'USDT (BEP20)', accountNo: '', holderName: 'NEXVO', color: '#26A17B', order: 3 },
    ];

    for (const method of defaultMethods) {
      const existing = await db.paymentMethod.findFirst({ where: { type: method.type } });
      if (!existing) {
        const created = await db.paymentMethod.create({
          data: {
            type: method.type,
            name: method.name,
            accountNo: method.accountNo,
            holderName: method.holderName,
            qrImage: '',
            iconUrl: '',
            color: method.color,
            isActive: true,
            order: method.order,
          },
        });
        results.push({ action: 'created', method: created });
      } else {
        // Update name if it still says BEP20
        if (existing.name.includes('BEP20')) {
          const updated = await db.paymentMethod.update({
            where: { id: existing.id },
            data: { name: existing.name.replace('BEP20', 'BEP20') },
          });
          results.push({ action: 'updated', method: updated });
        } else {
          results.push({ action: 'exists', method: existing });
        }
      }
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error('Seed payment methods error:', error);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
