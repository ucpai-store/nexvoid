import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

/**
 * GET /api/products/tiers
 *
 * No-duplicates purchase state for the logged-in user.
 *
 * Rules (per product owner's request):
 *   - Pembelian TIDAK harus berurutan — user boleh beli produk mana saja yang BELUM pernah dibeli.
 *   - Setiap produk hanya bisa dibeli SEKALI.
 *   - Hanya 1 produk aktif saja per user — beli produk baru menggantikan produk aktif lama.
 *
 * Returns per-product state:
 *   - 'available'  → belum pernah dibeli, bisa dibeli sekarang
 *   - 'active'     → sedang aktif (sedang menghasilkan profit harian)
 *   - 'bought'     → sudah pernah dibeli (selesai/superseded), tidak bisa dibeli lagi
 *
 * Also returns aggregate info: currentProductName, remainingCount, boughtCount, maxedOut.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    // All active products
    const products = await db.product.findMany({
      where: { isActive: true, isStopped: false },
      orderBy: { price: 'asc' },
      select: { id: true, name: true },
    });

    // All purchases for this user (any status) — used to compute no-duplicates state
    const purchases = await db.purchase.findMany({
      where: { userId: user.id },
      select: { productId: true, status: true },
    });

    // Build productId → status map (prefer 'active' if any active purchase exists)
    const statusMap = new Map<string, 'active' | 'completed'>();
    for (const p of purchases) {
      const existing = statusMap.get(p.productId);
      if (p.status === 'active') {
        statusMap.set(p.productId, 'active');
      } else if (existing !== 'active') {
        statusMap.set(p.productId, 'completed');
      }
    }

    const tiers = products.map((p) => {
      const s = statusMap.get(p.id);
      let state: 'available' | 'active' | 'bought' = 'available';
      let reason = '';
      if (s === 'active') {
        state = 'active';
        reason = 'Produk aktif Anda hari ini';
      } else if (s === 'completed') {
        state = 'bought';
        reason = 'Sudah pernah dibeli — pilih produk lain yang belum dimiliki';
      } else {
        state = 'available';
        reason = 'Tersedia untuk dibeli';
      }
      return { id: p.id, name: p.name, state, reason };
    });

    const activeTier = tiers.find((t) => t.state === 'active') || null;
    const boughtCount = tiers.filter((t) => t.state === 'bought').length;
    const remainingCount = tiers.filter((t) => t.state === 'available').length;
    const maxedOut = remainingCount === 0;

    return NextResponse.json({
      success: true,
      data: {
        tiers,
        currentProductName: activeTier?.name ?? null,
        remainingCount,
        boughtCount,
        maxedOut,
      },
    });
  } catch (error) {
    console.error('Get product tiers error:', error);
    return NextResponse.json({ success: false, error: 'Gagal memuat state produk' }, { status: 500 });
  }
}
