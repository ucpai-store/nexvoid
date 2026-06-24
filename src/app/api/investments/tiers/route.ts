import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { getUserTierAvailability } from '@/lib/tier-system';

/**
 * GET /api/investments/tiers
 * Returns the unified VIP tier list (paket = produk) with each tier's
 * purchase state for the authenticated user:
 *   - active   → user's currently active tier
 *   - available → the next tier the user is allowed to buy (berurutan)
 *   - bought   → already owned but superseded
 *   - locked   → above the next available; must buy lower tiers first
 *
 * This drives the "beli hanya 1 macam, wajib berurutan" UI on both the
 * Paket page and the Produk page.
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
