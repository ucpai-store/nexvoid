/**
 * Tier System — ONE-ACTIVE-RULE (v18):
 *
 * Business rules (per product owner — updated 2025):
 *  - "Paket" dan "Produk" itu sama → both map to the same VIP tier list
 *    (sourced from InvestmentPackage, ordered by `amount` ascending).
 *  - ★ ONE-ACTIVE-RULE: user hanya boleh punya SATU paket aktif pada satu waktu.
 *    Kalau user sudah punya paket aktif (apapun tier-nya), TIDAK BISA beli paket
 *    lain sampai kontrak yang aktif selesai (180 hari).
 *  - Tier yang kontraknya sudah HABIS (status='completed') BISA dibeli lagi.
 *  - Profit PERTAMA tidak langsung masuk saat beli — tunggu jam 00:00 WIB.
 *
 * Before v18: MULTI-ACTIVE (boleh VIP1+VIP2+VIP3 bersamaan). Ini bikin user
 * bisa punya 2 paket aktif — bug. Sekarang: 1 aktif saja.
 */

import { db } from '@/lib/db';

export type TierState =
  | 'available' // tier the user can buy right now (no active package anywhere)
  | 'active' // user's currently active tier (the ONE active package)
  | 'bought' // already owned AND contract still running (superseded by a later purchase)
  | 'locked'; // user has another active tier — must wait until that one completes

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
 *   set isActive=false were EXCLUDED from tiers list. When Paket page merged
 *   tier state into the package list, those packages kept their default
 *   state ('available') and the isAvailable flag from /api/packages was
 *   the only thing showing them as unavailable. BUT if the merge somehow
 *   overwrote isAvailable (e.g., from cache), the badge disappeared.
 *   Now: return ALL packages (mirror V16 /api/packages + isAvailable flag)
 *   so the tier system is consistent with the packages API.
 */
export async function loadOrderedTiers(): Promise<TierInfo[]> {
  const packages = await db.investmentPackage.findMany({
    orderBy: [{ amount: 'asc' }, { order: 'asc' }],
  });
  return packages.map((pkg, idx): TierInfo => ({
    id: pkg.id,
    name: pkg.name,
    amount: pkg.amount,
    profitRate: pkg.profitRate,
    contractDays: pkg.contractDays,
    order: pkg.order,
    dailyProfit: pkg.amount * (pkg.profitRate / 100),
    totalProfit: pkg.amount * (pkg.profitRate / 100) * pkg.contractDays,
    tierIndex: idx,
    state: 'available', // default state — overridden by getUserTierAvailability
    isActive: pkg.isActive,
    isAvailable: pkg.isActive,
    availabilityReason: !pkg.isActive ? 'tidak-tersedia' : null,
  }));
}

/**
 * ★★★ v18 — ONE-ACTIVE-RULE helper ★★★
 * Returns true if user has ANY active Investment (status='active').
 * Used by both /api/products and /api/investments to block buying when
 * user already has an active package.
 *
 * ★ v18.1: Produk & Paket = 1 aset (per user request).
 *   - Kalau Investment di-link ke Purchase (purchaseId != null), itu dari
 *     beli PRODUK → ambil nama dari Purchase.product.
 *   - Kalau Investment gak punya purchaseId, itu dari beli PAKET → ambil
 *     nama dari Investment.package.
 *   - Jadi `activePackageName` selalu meaningful, bukan "_internal_default".
 */
export async function getUserActivePackageInfo(userId: string): Promise<{
  hasActive: boolean;
  activePackageId: string | null;
  activePackageName: string | null;
  /** 'product' kalau dari beli produk, 'package' kalau dari beli paket */
  activeType: 'product' | 'package' | null;
  endDate: Date | null;
  daysRemaining: number | null;
}> {
  const activeInvestment = await db.investment.findFirst({
    where: { userId, status: 'active' },
    orderBy: { createdAt: 'desc' },
    include: {
      package: { select: { name: true } },
      // ★ v18.1: include Purchase + Product untuk detect beli lewat Product page
      purchase: {
        select: {
          product: { select: { name: true } },
        },
      },
    },
  });

  if (!activeInvestment) {
    return {
      hasActive: false,
      activePackageId: null,
      activePackageName: null,
      activeType: null,
      endDate: null,
      daysRemaining: null,
    };
  }

  const now = new Date();
  const endDate = activeInvestment.endDate || new Date(activeInvestment.startDate);
  // Calculate days remaining (rounded up so user sees "1 day" not "0 days" on the last day)
  const msRemaining = endDate.getTime() - now.getTime();
  const daysRemaining = Math.max(
    0,
    Math.ceil(msRemaining / (1000 * 60 * 60 * 24))
  );

  // ★ v18.1: detect source. Kalau ada purchaseId + purchase.product → dari
  // beli PRODUK. Kalau gak, dari beli PAKET (InvestmentPackage).
  const fromProduct = !!activeInvestment.purchaseId && !!activeInvestment.purchase?.product;
  const productName = activeInvestment.purchase?.product?.name || null;
  const packageName = activeInvestment.package?.name || null;

  // Filter out the internal fallback package name — never show "_internal_default" to user.
  const realPackageName =
    packageName && packageName !== '_internal_default' ? packageName : null;

  return {
    hasActive: true,
    activePackageId: activeInvestment.packageId,
    // Prefer product name (real name) over package name (might be fallback).
    activePackageName: fromProduct ? productName : realPackageName,
    activeType: fromProduct ? 'product' : 'package',
    endDate,
    daysRemaining,
  };
}

/**
 * Compute the user's tier availability under the ONE-ACTIVE-RULE:
 *  - which tier is currently active (the ONE active package)
 *  - all OTHER tiers are 'locked' (must wait until active contract ends)
 *  - if NO active tier, ALL tiers are 'available' (subject to package isActive)
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
  // ★ v18.1: include purchase+product so we can show real name when active
  // investment came from beli PRODUK (not PAKET).
  const userInvestments = await db.investment.findMany({
    where: { userId },
    select: {
      packageId: true,
      status: true,
      endDate: true,
      createdAt: true,
      purchaseId: true,
      purchase: { select: { product: { select: { name: true } } } },
      package: { select: { name: true } },
    },
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

  // ★ v18 ONE-ACTIVE-RULE: only ONE active investment allowed per user.
  //   If user has any active investment, ALL OTHER tiers are 'locked'.
  const activeInvestment = userInvestments.find((i) => i.status === 'active');
  const currentTier = activeInvestment
    ? tiers.find((t) => t.id === activeInvestment.packageId) || null
    : null;
  const hasAnyActive = !!activeInvestment;

  // ★ v18.1: Get real display name for the active package.
  //   Kalau dari beli PRODUK → use Purchase.product.name (real name).
  //   Kalau dari beli PAKET → use Investment.package.name (skip "_internal_default").
  let activeDisplayName: string | null = null;
  if (activeInvestment) {
    const productName = activeInvestment.purchase?.product?.name || null;
    const packageName = activeInvestment.package?.name || null;
    const realPackageName =
      packageName && packageName !== '_internal_default' ? packageName : null;
    activeDisplayName = productName || realPackageName;
  }

  // Calculate days remaining on active contract (for UI display)
  let daysRemaining = 0;
  if (activeInvestment?.endDate) {
    const msRemaining = activeInvestment.endDate.getTime() - Date.now();
    daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
  }

  // A tier is "available" only if user has NO active investment ANYWHERE
  // (not just for this tier). Under ONE-ACTIVE-RULE, having any active tier
  // locks ALL other tiers until the active contract ends.
  const remainingCount = hasAnyActive
    ? 0 // locked — nothing available while one is active
    : tiers.filter((t) => !activeTierIds.has(t.id)).length;
  // "Maxed out" only if user has bought every tier AND none have expired,
  // no re-activation possible. Under ONE-ACTIVE-RULE, this is essentially
  // "user has an active tier and it's the highest tier".
  const maxedOut =
    tiers.length > 0 &&
    hasAnyActive &&
    remainingCount === 0 &&
    [...boughtTierIds].every((id) => !expiredTierIds.has(id));

  const result: TierAvailability = {
    tiers: tiers.map((tier): TierInfo => {
      let state: TierState;
      let reason: string | undefined;

      if (activeTierIds.has(tier.id)) {
        // ★ This is the ONE active tier (could be PAKET, or fallback for PRODUK).
        state = 'active';
        reason = daysRemaining > 0
          ? `Paket aktif — kontrak tersisa ${daysRemaining} hari. Profit masuk jam 00:00 WIB setiap hari.`
          : 'Paket aktif — kontrak hampir selesai.';
      } else if (hasAnyActive) {
        // ★ v18: user has another active tier → this tier is LOCKED.
        //   Use real display name (productName if from PRODUK, packageName if PAKET).
        const displayName = activeDisplayName || 'paket aktif';
        state = 'locked';
        reason = daysRemaining > 0
          ? `Anda sudah punya paket aktif ("${displayName}"). Tunggu ${daysRemaining} hari sampai kontrak selesai sebelum beli paket lain.`
          : `Anda sudah punya paket aktif ("${displayName}"). Tunggu sampai kontrak selesai.`;
      } else if (boughtTierIds.has(tier.id) && expiredTierIds.has(tier.id)) {
        // Contract ended → can re-activate!
        state = 'available';
        reason = 'Kontrak sebelumnya sudah berakhir — bisa diaktifkan lagi';
      } else if (boughtTierIds.has(tier.id)) {
        // Bought but not active and not expired (shouldn't happen under v18, but defensive).
        state = 'bought';
        reason = 'Sudah pernah dibeli — pilih paket lain yang belum dimiliki';
      } else {
        state = 'available';
        reason = 'Belum dimiliki — silakan beli';
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
    // ★ v18.1: prefer real display name over tier.name (which might be "_internal_default")
    currentTierName: activeDisplayName ?? currentTier?.name ?? null,
    hasActive: !!activeInvestment,
    boughtCount: boughtTierIds.size,
  };

  return result;
}

/**
 * Validate that a purchase request targets a tier the user can buy right now.
 *
 * ★ v18 ONE-ACTIVE-RULE: reject if user has ANY active investment (not just
 *   same tier). User must wait until their current active contract ends before
 *   buying another tier.
 *
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
      error: `Paket "${tier.name}" sedang aktif. Tidak bisa dibeli lagi sampai kontrak selesai.`,
    };
  }

  if (tier.state === 'bought') {
    return {
      ok: false,
      error: `Paket "${tier.name}" sedang aktif. Tidak bisa dibeli lagi sampai kontrak selesai.`,
    };
  }

  // ★ v18: locked = user has ANOTHER active tier
  if (tier.state === 'locked') {
    const activeInfo = await getUserActivePackageInfo(userId);
    const days = activeInfo.daysRemaining ?? 0;
    const name = activeInfo.activePackageName ?? 'paket aktif';
    return {
      ok: false,
      error:
        days > 0
          ? `Anda sudah memiliki paket aktif ("${name}"). Tunggu ${days} hari sampai kontrak selesai sebelum beli paket lain.`
          : `Anda sudah memiliki paket aktif ("${name}"). Tunggu sampai kontrak selesai sebelum beli paket lain.`,
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
