import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { getUserTierAvailability } from '@/lib/tier-system';

/**
 * GET /api/investments/tiers
 * Returns the unified VIP tier list (paket = produk) with each tier's
 * purchase state for the authenticated user:
 *   - active    → user's currently active tier (most recent purchase)
 *   - available → tier the user has NOT bought yet — purchasable in any order
 *   - bought    → already owned but superseded (cannot buy again)
 *
 * Rule: pembelian TIDAK harus berurutan. Setiap tier hanya bisa dibeli sekali.
 * This drives the "beli hanya 1 macam, tidak boleh beli yg sudah dimiliki" UI
 * on both the Paket page and the Produk page.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Tidak terautentikasi' },
        { status: 401 }
      );
    }

    const availability = await getUserTierAvailability(user.id);

    return NextResponse.json({ success: true, data: availability });
  } catch (error) {
    console.error('Get tier availability error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal memuat data paket' },
      { status: 500 }
    );
  }
}
