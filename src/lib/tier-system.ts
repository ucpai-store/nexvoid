/**
 * Tier System — Unified Package/Product sequential purchasing.
 *
 * Business rules (per product owner):
 *  - "Paket" dan "Produk" itu sama → both map to the same VIP tier list
 *    (sourced from InvestmentPackage, ordered by `amount` ascending).
 *  - Beli hanya 1 macam: a user may hold ONLY ONE active tier at a time.
 *  - Beli berurutan: must buy the next tier ABOVE the current one.
 *    If you own VIP 1 you are locked to it; to get another you must buy VIP 2,
 *    then VIP 3, etc. You cannot skip a tier.
 *  - Sistem berjalan sesuai paket/produk aktif hari ini → daily profit at 00:00
 *    WIB is credited by the cron based on the single active investment.
 */

import { db } from '@/lib/db';

export type TierState =
  | 'available' // next tier the user is allowed to buy right now
  | 'active' // user's currently active tier
  | 'bought' // already owned but superseded (below current)
  | 'locked' // above the next available — must buy lower tiers first
  | 'maxed'; // user already owns the highest tier (only set on next-tier sentinel)

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
}

export interface TierAvailability {
  tiers: TierInfo[];
  /** id of the tier the user is allowed to buy next (null if maxed/none) */
  nextTierId: string | null;
  nextTierName: string | null;
  /** id of the user's currently active tier (null if none) */
  currentTierId: string | null;
  currentTierName: string | null;
  hasActive: boolean;
  /** true when user already owns the highest tier */
  maxedOut: boolean;
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
 *  - which tier is active
 *  - which tier is the next purchasable one
 *  - which tiers are locked / already bought
 *
 * Sequential rule: the only purchasable tier is the one immediately above
 * the user's highest-ever bought tier. If the user has bought nothing yet,
 * the lowest tier (index 0) is available.
 */
export async function getUserTierAvailability(
  userId: string
): Promise<TierAvailability> {
  const tiers = await loadOrderedTiers();

  // Every tier the user has ever bought (active or completed/superseded).
  const userInvestments = await db.investment.findMany({
    where: { userId },
    select: { packageId: true, status: true },
  });

  const boughtTierIds = new Set(userInvestments.map((i) => i.packageId));
  const activeInvestment = userInvestments.find((i) => i.status === 'active');

  // Highest tier index the user has ever bought.
  let highestBoughtIndex = -1;
  for (const tier of tiers) {
    if (boughtTierIds.has(tier.id) && tier.tierIndex > highestBoughtIndex) {
      highestBoughtIndex = tier.tierIndex;
    }
  }

  // Next purchasable tier = immediately above highest bought (or 0 if none).
  const nextTierIndex = highestBoughtIndex + 1;
  const nextTier = nextTierIndex < tiers.length ? tiers[nextTierIndex] : null;
  const maxedOut = nextTierIndex >= tiers.length && tiers.length > 0;

  const currentTier = activeInvestment
    ? tiers.find((t) => t.id === activeInvestment.packageId) || null
    : null;

  const result: TierAvailability = {
    tiers: tiers.map((tier) => {
      let state: TierState;
      let reason: string | undefined;

      if (currentTier && tier.id === currentTier.id) {
        state = 'active';
        reason = 'Paket aktif Anda hari ini';
      } else if (boughtTierIds.has(tier.id)) {
        state = 'bought';
        reason = 'Sudah pernah dibeli';
      } else if (nextTier && tier.id === nextTier.id) {
        state = 'available';
        reason = currentTier
          ? `Naik ke level berikutnya dari ${currentTier.name}`
          : 'Paket pertama — silakan beli';
      } else {
        state = 'locked';
        reason = currentTier
          ? `Selesaikan ${currentTier.name} dulu, lalu naik berurutan`
          : 'Beli mulai dari paket terendah';
      }

      return { ...tier, state, reason };
    }),
    nextTierId: nextTier?.id ?? null,
    nextTierName: nextTier?.name ?? null,
    currentTierId: currentTier?.id ?? null,
    currentTierName: currentTier?.name ?? null,
    hasActive: !!activeInvestment,
    maxedOut,
  };

  return result;
}

/**
 * Validate that a purchase request targets the next allowed tier.
 * Returns { ok: true } or { ok: false, error }.
 */
export async function validateSequentialPurchase(
  userId: string,
  packageId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const availability = await getUserTierAvailability(userId);

  if (availability.maxedOut) {
    return {
      ok: false,
      error:
        'Anda sudah memiliki paket tertinggi. Tidak ada paket berikutnya untuk dibeli.',
    };
  }

  if (!availability.nextTierId) {
    return {
      ok: false,
      error: 'Tidak ada paket yang tersedia untuk dibeli saat ini.',
    };
  }

  if (packageId !== availability.nextTierId) {
    const nextName = availability.nextTierName || 'paket berikutnya';
    return {
      ok: false,
      error: `Pembelian harus berurutan. Paket yang bisa Anda beli sekarang adalah "${nextName}". Selesaikan dulu paket di bawahnya sebelum naik ke level lebih tinggi.`,
    };
  }

  return { ok: true };
}
