import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';

/**
 * DELETE /api/admin/payment-methods/cleanup-legacy
 *
 * Permanently deletes all payment methods whose type is NOT qris or usdt.
 * This removes legacy bank / ewallet / crypto methods so the admin page
 * only ever shows QRIS and USDT.
 *
 * Returns the count of deleted records.
 */
export async function DELETE(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Tidak terautentikasi' },
        { status: 401 }
      );
    }

    // Find legacy methods first (for logging)
    const legacyMethods = await db.paymentMethod.findMany({
      where: { type: { notIn: ['qris', 'usdt'] } },
      select: { id: true, name: true, type: true },
    });

    if (legacyMethods.length === 0) {
      return NextResponse.json({
        success: true,
        data: { deletedCount: 0, message: 'Tidak ada metode lama untuk dibersihkan' },
      });
    }

    // Permanently delete legacy methods (bank / ewallet / crypto / any other)
    const result = await db.paymentMethod.deleteMany({
      where: { type: { notIn: ['qris', 'usdt'] } },
    });

    await logAdminAction(
      admin.id,
      'CLEANUP_LEGACY_PAYMENT_METHODS',
      `Deleted ${result.count} legacy payment methods: ${legacyMethods
        .map((m) => `${m.name}(${m.type})`)
        .join(', ')}`
    );

    return NextResponse.json({
      success: true,
      data: {
        deletedCount: result.count,
        deletedMethods: legacyMethods,
        message: `${result.count} metode lama berhasil dihapus permanen`,
      },
    });
  } catch (error) {
    console.error('Cleanup legacy payment methods error:', error);
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan server' },
      { status: 500 }
    );
  }
}
