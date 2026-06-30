import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

/**
 * GET /api/products/tiers
 *
 * Purchase state for the logged-in user (with contract-end re-activation).
 *
 * Rules (per product owner's request):
 *   - Pembelian TIDAK harus berurutan — user boleh beli produk mana saja yang BELUM pernah dibeli.
 *   - Setiap produk hanya bisa dibeli SEKALI per kontrak (180 hari).
 *   - Hanya 1 produk aktif saja per user — beli produk baru menggantikan produk aktif lama.
 *   - Produk yang kontraknya sudah HABIS (status='completed') BISA dibeli lagi.
 *
 * Returns per-product state:
 *   - 'available'  → belum pernah dibeli ATAU kontrak sudah habis, bisa dibeli sekarang
 *   - 'active'     → sedang aktif (sedang menghasilkan profit harian, kontrak masih berjalan)
 *   - 'bought'     → sudah pernah dibeli TAPI kontrak masih berjalan (superseded) — tidak bisa dibeli lagi
 *
 * Also returns aggregate info: currentProductName, remainingCount, boughtCount, maxedOut.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    // ★ v13: SEMUA produk tampil di web user (termasuk yang isActive=false / isStopped=true).
    //   Tiers route tetap return semua produk supaya UI bisa tampilkan badge "Tidak Tersedia"
    //   untuk produk yang admin nonaktifkan. Pembelian tetap divalidasi di POST /api/products.
    const products = await db.product.findMany({
      orderBy: { price: 'asc' },
      select: { id: true, name: true, isActive: true, isStopped: true, quota: true, quotaUsed: true },
    });

    // All purchases for this user (any status)
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
        reason = 'Produk aktif Anda hari ini — kontrak masih berjalan';
      } else if (s === 'completed') {
        // Contract ended → can re-activate!
        state = 'available';
        reason = 'Kontrak sebelumnya sudah berakhir — bisa diaktifkan lagi';
      } else {
        state = 'available';
        reason = 'Tersedia untuk dibeli';
      }
      // ★ v13: Tambah isAvailable flag untuk UI
      const isAvailable = p.isActive && !p.isStopped && p.quotaUsed < p.quota;
      return {
        id: p.id,
        name: p.name,
        state: state as 'available' | 'active' | 'bought',
        reason,
        isAvailable,
        availabilityReason: !p.isActive
          ? 'tidak-tersedia'
          : p.isStopped
            ? 'dihentikan'
            : p.quotaUsed >= p.quota
              ? 'quota-penuh'
              : null,
      };
    });

    const activeTier = tiers.find((t) => t.state === 'active') || null;
    // 'bought' (superseded but still in contract) is now rare since we auto-complete
    // old purchases when buying a new one. Counted for backward compatibility.
    const boughtCount = tiers.filter((t) => t.state === 'bought').length;
    const remainingCount = tiers.filter((t) => t.state === 'available').length;
    // Maxed out only if NO tier is available (every tier is currently active or bought-but-in-contract).
    const maxedOut = remainingCount === 0 && products.length > 0;

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
