/**
 * Tier System — Unified Package/Product purchasing (no-duplicates rule).
 *
 * Business rules (per product owner):
 *  - "Paket" dan "Produk" itu sama → both map to the same VIP tier list
 *    (sourced from InvestmentPackage, ordered by `amount` ascending).
 *  - Beli hanya 1 macam: a user may hold ONLY ONE active tier at a time.
 *  - Pembelian TIDAK harus berurutan. User boleh beli tier mana saja yang
 *    BELUM pernah dibeli, dalam urutan apapun (VIP 1, lalu VIP 5, misalnya).
 *  - Setiap tier hanya bisa dibeli SEKALI. Tier yang sudah dibeli tidak bisa
 *    dibeli lagi — user wajib pilih tier lain yang belum dimiliki.
 *  - Sistem berjalan sesuai paket/produk aktif hari ini → daily profit at 00:00
 *    WIB is credited by the cron based on the single active investment.
 */

import { db } from '@/lib/db';

export type TierState =
  | 'available' // tier the user has NOT bought yet — purchasable now
  | 'active' // user's currently active tier (most recently purchased)
  | 'bought'; // already owned but superseded by a later purchase

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
  /** number of tiers still purchasable (not yet bought) */
  remainingCount: number;
  /** true when user has bought every tier */
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
 *  - which tier is currently active
 *  - which tiers are already bought (cannot buy again)
 *  - which tiers are still available to buy (any order)
 *
 * No-duplicates rule: any tier the user has NEVER bought is "available".
 * Already-bought tiers are either "active" (the latest purchase) or
 * "bought" (superseded by a later purchase).
 */
export async function getUserTierAvailability(
  userId: string
): Promise<TierAvailability> {
  const tiers = await loadOrderedTiers();

  // Every tier the user has ever bought (active or completed/superseded),
  // ordered by creation time so we can identify the most recent purchase.
  const userInvestments = await db.investment.findMany({
    where: { userId },
    select: { packageId: true, status: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const boughtTierIds = new Set(userInvestments.map((i) => i.packageId));
  const activeInvestment = userInvestments.find((i) => i.status === 'active');

  const currentTier = activeInvestment
    ? tiers.find((t) => t.id === activeInvestment.packageId) || null
    : null;

  const remainingCount = tiers.filter((t) => !boughtTierIds.has(t.id)).length;
  const maxedOut = tiers.length > 0 && remainingCount === 0;

  const result: TierAvailability = {
    tiers: tiers.map((tier) => {
      let state: TierState;
      let reason: string | undefined;

      if (currentTier && tier.id === currentTier.id) {
        state = 'active';
        reason = 'Paket aktif Anda hari ini';
      } else if (boughtTierIds.has(tier.id)) {
        state = 'bought';
        reason = 'Sudah pernah dibeli — pilih paket lain yang belum dimiliki';
      } else {
        state = 'available';
        reason = currentTier
          ? `Beli paket lain yang belum dimiliki`
          : 'Belum dimiliki — silakan beli';
      }

      return { ...tier, state, reason };
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
 * Validate that a purchase request targets a tier the user has NOT bought yet.
 * Order does NOT matter — any unbought tier is allowed.
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
      error: `Paket "${tier.name}" sedang aktif. Tidak bisa dibeli lagi — silakan pilih paket lain yang belum dimiliki.`,
    };
  }

  if (tier.state === 'bought') {
    return {
      ok: false,
      error: `Paket "${tier.name}" sudah pernah dibeli. Wajib pilih paket lain yang belum dimiliki.`,
    };
  }

  if (availability.maxedOut) {
    return {
      ok: false,
      error: 'Anda sudah memiliki semua paket. Tidak ada paket baru untuk dibeli.',
    };
  }

  return { ok: true };
}

/**
 * Backward-compatible alias. Older code imported `validateSequentialPurchase`;
 * the rule is no longer sequential but the function still validates a purchase.
 */
export const validateSequentialPurchase = validateTierPurchase;
