/**
 * Tier System — Unified Package/Product purchasing with contract-end re-activation.
 *
 * Business rules (per product owner):
 *  - "Paket" dan "Produk" itu sama → both map to the same VIP tier list
 *    (sourced from InvestmentPackage, ordered by `amount` ascending).
 *  - Beli hanya 1 macam: a user may hold ONLY ONE active tier at a time.
 *  - Pembelian TIDAK harus berurutan. User boleh beli tier mana saja yang
 *    BELUM pernah dibeli ATAU yang kontraknya sudah habis, dalam urutan apapun.
 *  - Setiap tier hanya bisa dibeli SEKALI per kontrak. Tier yang sedang aktif
 *    tidak bisa dibeli lagi. Tier yang kontraknya sudah HABIS (status='completed')
 *    BISA dibeli lagi.
 *  - Sistem berjalan sesuai paket/produk aktif hari ini → daily profit at 00:00
 *    WIB is credited by the cron based on the single active investment.
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
 * Load all active tiers ordered ascending by amount (VIP 1 → VIP n).
 */
export async function loadOrderedTiers() {
  const packages = await db.investmentPackage.findMany({
    where: { isActive: true },
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

  // Find the user's currently active investment (the latest 'active' one).
  const activeInvestment = userInvestments.find((i) => i.status === 'active');
  const currentTier = activeInvestment
    ? tiers.find((t) => t.id === activeInvestment.packageId) || null
    : null;

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

      if (currentTier && tier.id === currentTier.id) {
        state = 'active';
        reason = 'Paket aktif Anda hari ini — kontrak masih berjalan';
      } else if (activeTierIds.has(tier.id)) {
        // Shouldn't normally happen because we supersede old actives, but guard anyway.
        state = 'bought';
        reason = 'Paket ini sedang aktif — tidak bisa dibeli lagi sampai kontrak selesai';
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
        reason = currentTier
          ? 'Beli paket lain yang belum dimiliki atau yang kontraknya sudah habis'
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
