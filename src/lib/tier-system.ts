/**
 * Tier System — Unified Package/Product purchasing with contract-end re-activation.
 *
 * Business rules (per product owner):
 *  - "Paket" dan "Produk" itu sama → both map to the same VIP tier list
 *    (sourced from InvestmentPackage, ordered by `amount` ascending).
 *  - MULTI-ACTIVE: user BOLEH punya banyak paket aktif bersamaan (VIP1+VIP2+VIP3 dst).
 *    Tiap paket generate profit sendiri jam 00:00 WIB. Cron credit SEMUA active
 *    investments — bukan cuma satu.
 *  - Setiap tier hanya bisa dibeli SEKALI per kontrak (180 hari). Tier yang sedang
 *    aktif tidak bisa dibeli lagi sampai kontrak selesai.
 *  - Tier yang kontraknya sudah HABIS (status='completed') BISA dibeli lagi.
 *  - Profit PERTAMA tidak langsung masuk saat beli — tunggu jam 00:00 WIB.
 */

import { db } from '@/lib/db';

export type TierState =
  | 'available' // tier the user can buy right now (never bought, OR contract ended)
  | 'active' // user's currently active tier (most recently purchased, still in contract)
  | 'bought'; // already owned AND contract still running (superseded by a later purchase)

export interface TierInfo {
  id: string;
  name: string;
  amount: number;
  profitRate: number;
  contractDays: number;
  order: number;
  dailyProfit: number;
  totalProfit: number;
  /** index in the ordered tier list (0 = lowest) */
  tierIndex: number;
  state: TierState;
  /** human reason for current state, shown to user */
  reason?: string;
  /** true when user has at least one COMPLETED (expired) investment for this tier */
  hasExpiredPurchase?: boolean;
  /** ★ v17: mirror V16 packages API — isAvailable flag for inactive packages */
  isActive?: boolean;
  isAvailable?: boolean;
  availabilityReason?: 'tidak-tersedia' | null;
}

export interface TierAvailability {
  tiers: TierInfo[];
  /** number of tiers still purchasable right now */
  remainingCount: number;
  /** true when user has bought every tier AND none have expired */
  maxedOut: boolean;
  /** id of the user's currently active tier (null if none) */
  currentTierId: string | null;
  currentTierName: string | null;
  hasActive: boolean;
  /** count of tiers the user has ever bought */
  boughtCount: number;
}

/**
 * Load all tiers ordered ascending by amount (VIP 1 → VIP n).
 *
 * ★★★ v17 FIX: Previously filtered `isActive: true` → paket 4/5/6 that admin
 *   set isActive=false were EXCLUDED from tiers list. When PaketPage merged
 *   tier state into the package list, those packages kept their default
 *   state ('available') and the isAvailable flag from /api/packages was
 *   the only thing showing them as unavailable. BUT if the merge somehow
 *   overwrote isAvailable (e.g., from cache), the badge disappeared.
 *   Now: return ALL packages (mirror V16 /api/packages) + isAvailable flag
 *   so the tier system is consistent with the packages API.
 */
export async function loadOrderedTiers() {
  const packages = await db.investmentPackage.findMany({
    orderBy: [{ amount: 'asc' }, { order: 'asc' }],
  });
  return packages.map((pkg, idx) => ({
    id: pkg.id,
    name: pkg.name,
    amount: pkg.amount,
    profitRate: pkg.profitRate,
    contractDays: pkg.contractDays,
    order: pkg.order,
    dailyProfit: pkg.amount * (pkg.profitRate / 100),
    totalProfit: pkg.amount * (pkg.profitRate / 100) * pkg.contractDays,
    tierIndex: idx,
    isActive: pkg.isActive,
    isAvailable: pkg.isActive,
    availabilityReason: !pkg.isActive ? 'tidak-tersedia' : null,
  }));
}

/**
 * Compute the user's tier availability:
 *  - which tier is currently active (still in contract)
 *  - which tiers are blocked because contract is still running
 *  - which tiers are available to buy (never bought OR contract ended)
 *
 * Re-activation rule: a tier is "available" if the user has NO active
 * investment for it. If all previous investments for that tier have
 * status='completed' (contract ended), the tier becomes available again.
 */
export async function getUserTierAvailability(
  userId: string
): Promise<TierAvailability> {
  const tiers = await loadOrderedTiers();

  // Every tier the user has ever bought, with status + endDate for re-activation check.
  const userInvestments = await db.investment.findMany({
    where: { userId },
    select: { packageId: true, status: true, endDate: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  // Set of tier IDs the user has EVER bought (any status).
  const boughtTierIds = new Set(userInvestments.map((i) => i.packageId));

  // Map: tierId -> does user have an ACTIVE investment for it right now?
  const activeTierIds = new Set(
    userInvestments
      .filter((i) => i.status === 'active')
      .map((i) => i.packageId)
  );

  // Map: tierId -> does user have at least one COMPLETED (expired) investment?
  const expiredTierIds = new Set(
    userInvestments
      .filter((i) => i.status === 'completed')
      .map((i) => i.packageId)
  );

  // ★ MULTI-ACTIVE: user boleh punya banyak paket aktif bersamaan (VIP1+VIP2+VIP3 dst).
  //   currentTier = first active investment (for backwards-compat display), tapi SEMUA
  //   tier yang active harus dapat state='active' (bukan 'bought').
  const activeInvestment = userInvestments.find((i) => i.status === 'active');
  const currentTier = activeInvestment
    ? tiers.find((t) => t.id === activeInvestment.packageId) || null
    : null;
  const hasAnyActive = !!activeInvestment;

  // A tier is "available" if user has NO active investment for it
  // (either never bought, or all previous purchases are completed/expired).
  const remainingCount = tiers.filter((t) => !activeTierIds.has(t.id)).length;
  // "Maxed out" only if user has bought every tier AND none have expired (no re-activation possible).
  const maxedOut =
    tiers.length > 0 &&
    remainingCount === 0 &&
    [...boughtTierIds].every((id) => !expiredTierIds.has(id));

  const result: TierAvailability = {
    tiers: tiers.map((tier) => {
      let state: TierState;
      let reason: string | undefined;

      if (activeTierIds.has(tier.id)) {
        // ★ MULTI-ACTIVE: SEMUA tier yang sedang active dapat state='active' (bukan 'bought').
        //   User boleh lihat badge AKTIF di semua paket yang sedang berjalan.
        state = 'active';
        reason = 'Paket aktif — kontrak masih berjalan. Profit masuk jam 00:00 WIB setiap hari.';
      } else if (boughtTierIds.has(tier.id) && expiredTierIds.has(tier.id)) {
        // Contract ended → can re-activate!
        state = 'available';
        reason = 'Kontrak sebelumnya sudah berakhir — bisa diaktifkan lagi';
      } else if (boughtTierIds.has(tier.id)) {
        // Bought but not active and not expired (shouldn't happen, but defensive).
        state = 'bought';
        reason = 'Sudah pernah dibeli — pilih paket lain yang belum dimiliki';
      } else {
        state = 'available';
        reason = hasAnyActive
          ? 'Beli paket lain — boleh punya banyak paket aktif bersamaan'
          : 'Belum dimiliki — silakan beli';
      }

      return {
        ...tier,
        state,
        reason,
        hasExpiredPurchase: expiredTierIds.has(tier.id),
      };
    }),
    remainingCount,
    maxedOut,
    currentTierId: currentTier?.id ?? null,
    currentTierName: currentTier?.name ?? null,
    hasActive: !!activeInvestment,
    boughtCount: boughtTierIds.size,
  };

  return result;
}

/**
 * Validate that a purchase request targets a tier the user can buy right now.
 * A tier is purchasable if the user has NO active investment for it.
 * (Never bought → OK. Previously bought but contract ended → OK. Currently active → REJECT.)
 * Returns { ok: true } or { ok: false, error }.
 */
export async function validateTierPurchase(
  userId: string,
  packageId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const availability = await getUserTierAvailability(userId);

  const tier = availability.tiers.find((t) => t.id === packageId);
  if (!tier) {
    return {
      ok: false,
      error: 'Paket tidak ditemukan atau tidak aktif.',
    };
  }

  if (tier.state === 'active') {
    return {
      ok: false,
      error: `Paket "${tier.name}" sedang aktif. Tidak bisa dibeli lagi sampai kontrak selesai (180 hari).`,
    };
  }

  if (tier.state === 'bought') {
    return {
      ok: false,
      error: `Paket "${tier.name}" sedang aktif. Tidak bisa dibeli lagi sampai kontrak selesai.`,
    };
  }

  // state === 'available' → allow purchase (including re-activation after contract end)
  return { ok: true };
}

/**
 * Backward-compatible alias. Older code imported `validateSequentialPurchase`;
 * the rule is no longer sequential but the function still validates a purchase.
 */
export const validateSequentialPurchase = validateTierPurchase;
