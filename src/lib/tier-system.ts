/**
 * Tier System — PER-ASSET-UNIQUE-RULE (v19, corrected):
 *
 * Business rules (per product owner — corrected 2025):
 *  - "Paket" dan "Produk" itu sama → both map to the same VIP tier list
 *    (sourced from InvestmentPackage, ordered by `amount` ascending).
 *  - ★ PER-ASSET-UNIQUE-RULE: user boleh punya BANYAK aset aktif bersamaan
 *    (VIP 1 + VIP 2 + VIP 3 — semua boleh aktif). YANG DILARANG:
 *    beli aset yang sama (same tier) saat aset itu masih aktif.
 *    Contoh: produk VIP 1 aktif → beli paket VIP 1 = DITOLAK.
 *            produk VIP 1 aktif → beli paket VIP 2 = BOLEH (aset beda).
 *  - Tier yang kontraknya sudah HABIS (status='completed') BISA dibeli lagi.
 *  - Profit PERTAMA tidak langsung masuk saat beli — tunggu jam 00:00 WIB.
 *
 * ★★ Matching produk ↔ paket (per user clarification 2025-01):
 *   "produk ada 3, paket ada 3, total = 3 aset (bukan 6)"
 *   - produk diurutkan by price asc → posisi 1 = aset 1, dst.
 *   - paket diurutkan by amount asc → posisi 1 = aset 1, dst.
 *   - produk[i] ≡ paket[i] = SAME aset i.
 *
 * Before v19: ONE-ACTIVE-RULE (only 1 active total per user) — over-corrected.
 * v19 fix: per-asset unique (multi-active across tiers allowed).
 */

import { db } from '@/lib/db';

export type TierState =
  | 'available' // tier the user can buy right now (no active investment for THIS tier)
  | 'active' // user's currently active tier (this specific tier is active)
  | 'bought' // already owned AND contract still running (superseded by a later purchase)
  | 'locked'; // same-tier already active — must wait until that one completes

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
  /** number of tiers still purchasable right now (not currently active) */
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
 * ★★★ v19 — PER-ASSET-UNIQUE-RULE helper ★★★
 *
 * Get the "asset index" (1-based tier rank) for a given package.
 * Ordering: amount ascending, then order ascending (matches loadOrderedTiers).
 *
 * ★ Filter: exclude the "_internal_default" fallback package (Rp 0, isActive=false)
 *   — this is just an FK placeholder for product purchases, NOT a real asset.
 *   Including it would shift all real package indices by 1.
 *
 * Returns null if package not found.
 */
export async function getPackageAssetIndex(packageId: string): Promise<number | null> {
  const pkgs = await db.investmentPackage.findMany({
    where: { amount: { gt: 0 }, isActive: true },
    orderBy: [{ amount: 'asc' }, { order: 'asc' }],
    select: { id: true },
  });
  const idx = pkgs.findIndex((p) => p.id === packageId);
  return idx >= 0 ? idx + 1 : null; // 1-based
}

/**
 * ★★★ v19 — PER-ASSET-UNIQUE-RULE helper ★★★
 *
 * Get the "asset index" (1-based tier rank) for a given product.
 * Ordering: price ascending (mirrors package amount ordering).
 *
 * Returns null if product not found.
 *
 * Matching convention (per user clarification):
 *   - 1st cheapest product = asset 1 = matches 1st cheapest package
 *   - 2nd cheapest product = asset 2 = matches 2nd cheapest package
 *   - dst.
 *   So produk[i] ≡ paket[i] = same asset.
 */
export async function getProductAssetIndex(productId: string): Promise<number | null> {
  const products = await db.product.findMany({
    orderBy: [{ price: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  const idx = products.findIndex((p) => p.id === productId);
  return idx >= 0 ? idx + 1 : null; // 1-based
}

/**
 * ★★★ v19 — PER-ASSET-UNIQUE-RULE helper ★★★
 *
 * Returns the set of asset indices (1-based) currently active for the user.
 * Each active Investment contributes one asset index:
 *   - If investment has purchaseId + purchase.product → asset index from product rank
 *   - If investment has no purchaseId → asset index from package rank
 *
 * Used by /api/products and /api/investments to block buying the SAME asset
 * (same tier) while it's still active. Different tiers remain allowed.
 */
export async function getUserActiveAssets(userId: string): Promise<Set<number>> {
  const activeInvestments = await db.investment.findMany({
    where: { userId, status: 'active' },
    include: {
      package: { select: { id: true, name: true } },
      purchase: { select: { product: { select: { id: true, name: true } } } },
    },
  });

  if (activeInvestments.length === 0) {
    return new Set<number>();
  }

  // Preload all products ordered by price (for product asset index lookup).
  const allProducts = await db.product.findMany({
    orderBy: [{ price: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  const productIndexMap = new Map<string, number>();
  allProducts.forEach((p, i) => productIndexMap.set(p.id, i + 1));

  // Preload all packages ordered by amount (for package asset index lookup).
  // ★ Exclude "Internal Default" / "_internal_default" — FK placeholder, not a real asset.
  //   Filter: amount > 0 AND isActive (real packages only).
  const allPkgs = await db.investmentPackage.findMany({
    where: { amount: { gt: 0 }, isActive: true },
    orderBy: [{ amount: 'asc' }, { order: 'asc' }],
    select: { id: true },
  });
  const pkgIndexMap = new Map<string, number>();
  allPkgs.forEach((p, i) => pkgIndexMap.set(p.id, i + 1));

  const assets = new Set<number>();
  for (const inv of activeInvestments) {
    if (inv.purchaseId && inv.purchase?.product) {
      // From beli PRODUK → asset index = product's rank
      const idx = productIndexMap.get(inv.purchase.product.id);
      if (idx) assets.add(idx);
    } else if (inv.package) {
      // From beli PAKET → asset index = package's rank
      const idx = pkgIndexMap.get(inv.package.id);
      if (idx) assets.add(idx);
    }
  }

  return assets;
}

/**
 * ★★★ v19 — PER-ASSET-UNIQUE-RULE helper ★★★
 *
 * Get info about a specific active asset for the user.
 * Returns null if the user has no active investment for that asset index.
 *
 * Used by /api/products and /api/investments to give meaningful error
 * messages ("Aset VIP 1 masih aktif, tunggu N hari...").
 */
export async function getUserActiveAssetInfo(
  userId: string,
  assetIndex: number
): Promise<{
  hasActive: boolean;
  activeAssetName: string | null;
  /** 'product' kalau dari beli PRODUK, 'package' kalau dari beli PAKET */
  activeType: 'product' | 'package' | null;
  endDate: Date | null;
  daysRemaining: number | null;
}> {
  const activeInvestments = await db.investment.findMany({
    where: { userId, status: 'active' },
    include: {
      package: { select: { id: true, name: true } },
      purchase: { select: { product: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (activeInvestments.length === 0) {
    return {
      hasActive: false,
      activeAssetName: null,
      activeType: null,
      endDate: null,
      daysRemaining: null,
    };
  }

  // Preload asset index maps.
  const allProducts = await db.product.findMany({
    orderBy: [{ price: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true },
  });
  const productIndexMap = new Map<string, number>();
  const productNameMap = new Map<string, string>();
  allProducts.forEach((p, i) => {
    productIndexMap.set(p.id, i + 1);
    productNameMap.set(p.id, p.name);
  });

  // ★ Exclude "Internal Default" / "_internal_default" — FK placeholder, not a real asset.
  //   Filter: amount > 0 AND isActive (real packages only).
  const allPkgs = await db.investmentPackage.findMany({
    where: { amount: { gt: 0 }, isActive: true },
    orderBy: [{ amount: 'asc' }, { order: 'asc' }],
    select: { id: true, name: true },
  });
  const pkgIndexMap = new Map<string, number>();
  const pkgNameMap = new Map<string, string>();
  allPkgs.forEach((p, i) => {
    pkgIndexMap.set(p.id, i + 1);
    pkgNameMap.set(p.id, p.name);
  });

  // Find the active investment matching the requested asset index.
  for (const inv of activeInvestments) {
    let invAssetIndex: number | null = null;
    let invName: string | null = null;
    let invType: 'product' | 'package' | null = null;

    if (inv.purchaseId && inv.purchase?.product) {
      const idx = productIndexMap.get(inv.purchase.product.id);
      if (idx) {
        invAssetIndex = idx;
        invName = productNameMap.get(inv.purchase.product.id) || inv.purchase.product.name;
        invType = 'product';
      }
    } else if (inv.package) {
      const idx = pkgIndexMap.get(inv.package.id);
      if (idx) {
        invAssetIndex = idx;
        // Filter out internal fallback package name.
        invName = inv.package.name && inv.package.name !== '_internal_default' ? inv.package.name : null;
        invType = 'package';
      }
    }

    if (invAssetIndex === assetIndex) {
      const now = new Date();
      const endDate = inv.endDate || new Date(inv.startDate);
      const msRemaining = endDate.getTime() - now.getTime();
      const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
      return {
        hasActive: true,
        activeAssetName: invName,
        activeType: invType,
        endDate,
        daysRemaining,
      };
    }
  }

  return {
    hasActive: false,
    activeAssetName: null,
    activeType: null,
    endDate: null,
    daysRemaining: null,
  };
}

/**
 * ★ Backward-compat: getUserActivePackageInfo (v18) — kept for callers
 *   that need "any active?" info. Returns the FIRST active investment
 *   (most recent), regardless of asset index.
 *
 * ★ v19: This is still useful for "user has any active investment"
 *   checks (e.g., dashboard display). Per-asset blocking now uses
 *   getUserActiveAssets + getUserActiveAssetInfo.
 */
export async function getUserActivePackageInfo(userId: string): Promise<{
  hasActive: boolean;
  activePackageId: string | null;
  activePackageName: string | null;
  /** 'product' kalau dari beli PRODUK, 'package' kalau dari beli PAKET */
  activeType: 'product' | 'package' | null;
  endDate: Date | null;
  daysRemaining: number | null;
}> {
  const activeInvestment = await db.investment.findFirst({
    where: { userId, status: 'active' },
    orderBy: { createdAt: 'desc' },
    include: {
      package: { select: { name: true } },
      // ★ v18.1: include Purchase + Product for detect beli lewat Product page
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
  const msRemaining = endDate.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

  const fromProduct = !!activeInvestment.purchaseId && !!activeInvestment.purchase?.product;
  const productName = activeInvestment.purchase?.product?.name || null;
  const packageName = activeInvestment.package?.name || null;
  const realPackageName =
    packageName && packageName !== '_internal_default' ? packageName : null;

  return {
    hasActive: true,
    activePackageId: activeInvestment.packageId,
    activePackageName: fromProduct ? productName : realPackageName,
    activeType: fromProduct ? 'product' : 'package',
    endDate,
    daysRemaining,
  };
}

/**
 * Compute the user's tier availability under the PER-ASSET-UNIQUE-RULE:
 *  - which tiers are currently active (user can have MULTIPLE active tiers)
 *  - tiers that are active for this user → state='active'
 *  - tiers the user has NOT bought → state='available'
 *  - tiers the user has bought but contract ended → state='available' (re-activation)
 *  - NO global lock — different tiers remain available even when one is active
 *
 * Re-activation rule: a tier is "available" if the user has NO active
 * investment for THIS specific tier. If they have an active investment
 * for this tier, state='active'. Other tiers are unaffected.
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

  // ★ v19 PER-ASSET-UNIQUE-RULE: user can have MULTIPLE active investments.
  //   A tier is "active" if user has an active investment for IT SPECIFICALLY.
  //   Other tiers remain "available" (not globally locked).
  const hasAnyActive = activeTierIds.size > 0;

  // For UI display: pick the first active investment for currentTierId/Name.
  const firstActive = userInvestments.find((i) => i.status === 'active') || null;
  const currentTier = firstActive
    ? tiers.find((t) => t.id === firstActive.packageId) || null
    : null;

  // ★ v19: Get real display name for the active package.
  let activeDisplayName: string | null = null;
  if (firstActive) {
    const productName = firstActive.purchase?.product?.name || null;
    const packageName = firstActive.package?.name || null;
    const realPackageName =
      packageName && packageName !== '_internal_default' ? packageName : null;
    activeDisplayName = productName || realPackageName;
  }

  // Calculate days remaining on first active contract (for UI display)
  let daysRemaining = 0;
  if (firstActive?.endDate) {
    const msRemaining = firstActive.endDate.getTime() - Date.now();
    daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
  }

  // ★ v19 PER-ASSET-UNIQUE-RULE: a tier is "available" if user has NO active
  //   investment for THIS tier (regardless of other tiers' state).
  //   remainingCount = tiers without an active investment.
  const remainingCount = tiers.filter((t) => !activeTierIds.has(t.id)).length;

  // "Maxed out" = user has bought every tier AND none have expired AND all currently active.
  // Under PER-ASSET-UNIQUE-RULE, this is essentially "all tiers are active".
  const maxedOut =
    tiers.length > 0 &&
    activeTierIds.size === tiers.length &&
    [...boughtTierIds].every((id) => !expiredTierIds.has(id));

  const result: TierAvailability = {
    tiers: tiers.map((tier): TierInfo => {
      let state: TierState;
      let reason: string | undefined;

      if (activeTierIds.has(tier.id)) {
        // ★ v19: This specific tier is active (others may also be active).
        state = 'active';
        reason = daysRemaining > 0
          ? `Aset aktif — kontrak tersisa ${daysRemaining} hari. Profit masuk jam 00:00 WIB setiap hari.`
          : 'Aset aktif — kontrak hampir selesai.';
      } else if (boughtTierIds.has(tier.id) && expiredTierIds.has(tier.id)) {
        // Contract ended → can re-activate!
        state = 'available';
        reason = 'Kontrak sebelumnya sudah berakhir — bisa diaktifkan lagi';
      } else if (boughtTierIds.has(tier.id)) {
        // Bought but not active and not expired (shouldn't happen under v19, but defensive).
        state = 'bought';
        reason = 'Sudah dibeli — pilih aset lain atau tunggu kontrak selesai';
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
    hasActive: hasAnyActive,
    boughtCount: boughtTierIds.size,
  };

  return result;
}

/**
 * Validate that a package purchase is allowed under the PER-ASSET-UNIQUE-RULE.
 *
 * ★ v19 PER-ASSET-UNIQUE-RULE: reject ONLY if user has an active investment
 *   for THIS SAME tier (same package). Different tiers remain allowed.
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
      error: `Aset "${tier.name}" sedang aktif. Tidak bisa dibeli lagi sampai kontrak selesai.`,
    };
  }

  if (tier.state === 'bought') {
    return {
      ok: false,
      error: `Aset "${tier.name}" sedang aktif. Tidak bisa dibeli lagi sampai kontrak selesai.`,
    };
  }

  // ★ v19: NO global 'locked' state. Other tiers being active does NOT block this one.
  // state === 'available' → allow purchase (including re-activation after contract end)
  return { ok: true };
}

/**
 * ★★★ v19 — PER-ASSET-UNIQUE-RULE helper ★★★
 *
 * Validate that a product purchase is allowed.
 * Blocks ONLY if the user has an active investment for the SAME asset
 * (same tier index). Different tiers remain allowed.
 *
 * Returns { ok: true } or { ok: false, error }.
 */
export async function validateProductPurchase(
  userId: string,
  productId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true },
  });
  if (!product) {
    return { ok: false, error: 'Produk tidak ditemukan' };
  }

  const productAssetIdx = await getProductAssetIndex(productId);
  if (!productAssetIdx) {
    return { ok: false, error: 'Produk tidak ditemukan dalam daftar aset' };
  }

  const activeAssets = await getUserActiveAssets(userId);
  if (activeAssets.has(productAssetIdx)) {
    // Get info for the active same-asset investment to show meaningful error.
    const activeInfo = await getUserActiveAssetInfo(userId, productAssetIdx);
    const days = activeInfo.daysRemaining ?? 0;
    const name = activeInfo.activeAssetName || product.name;
    return {
      ok: false,
      error:
        days > 0
          ? `Aset "${name}" sedang aktif (sama dengan produk ini). Tunggu ${days} hari sampai kontrak selesai sebelum beli aset yang sama.`
          : `Aset "${name}" sedang aktif. Tunggu sampai kontrak selesai sebelum beli aset yang sama.`,
    };
  }

  return { ok: true };
}

/**
 * Backward-compatible alias. Older code imported `validateSequentialPurchase`;
 * the rule is no longer sequential but the function still validates a purchase.
 */
export const validateSequentialPurchase = validateTierPurchase;
