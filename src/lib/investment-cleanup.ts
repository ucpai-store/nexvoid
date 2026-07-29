/**
 * ════════════════════════════════════════════════════════════════
 *  NEXVO — Investment Cleanup (v20 ANTI-DOUBLE-PROFIT) ★★★
 * ════════════════════════════════════════════════════════════════
 *
 *  THE DEFINITIVE FIX for "profit dobel, klik Fix mulu gak bersih-bersih":
 *
 *  Problem:
 *    - User beli aset yg sama 2x (race condition di buy endpoint)
 *    - Cron kredit profit ke SEMUA active Investment (termasuk yg dobel)
 *    - User balance jadi dobel (atau lebih)
 *    - Fix script lama cuma mark 'completed', TIDAK refund profit yg
 *      sudah masuk → user tetep punya profit dobel walau fix udah jalan
 *
 *  Solution (v20):
 *    1. detectDuplicateActiveInvestments(userId):
 *       Group active Investments by asset index. Return groups with ≥2.
 *    2. cleanupDuplicateInvestmentsForUser(userId):
 *       For each duplicate group:
 *         - Keep the LATEST (max createdAt) as the "active" one
 *         - For each older duplicate:
 *           ★ REFUND totalProfitEarned dari User.mainBalance + totalProfit
 *           ★ Create BonusLog(type='refund', amount=-X) — audit trail
 *           ★ Mark Investment status='completed'
 *           ★ Sync linked Purchase status='completed'
 *    3. cleanupAllUsersDuplicateInvestments():
 *       Loop SEMUA user, apply #2. Return summary report.
 *
 *  Anti-Race-Condition (di buy endpoint, bukan di sini):
 *    Buy endpoint harus re-check duplikat DI DALAM transaction sebelum
 *    insert Investment. Helper ini cuma buat cleanup (cron + fix script).
 *
 *  Asset index computation (v19 PER-ASSET-UNIQUE-RULE):
 *    - produk[i] (by price asc) = asset i
 *    - paket[i] (by amount asc, isActive=true, amount>0) = asset i
 *    - produk[i] ≡ paket[i] = same asset i
 *    - Investment dengan purchaseId+product → rank by product
 *    - Investment tanpa purchaseId → rank by package
 *
 *  Safety:
 *    - Refund tidak akan bikin User.mainBalance < 0 (clamped)
 *    - Refund tidak akan bikin User.totalProfit < 0 (clamped)
 *    - BonusLog 'refund' entry dibuat buat audit trail
 *    - Investment.totalProfitEarned TIDAK direset (keep historical record)
 *    - Idempotent: kalo run 2x, run ke-2 gak ada efek (duplicate sudah 'completed')
 * ════════════════════════════════════════════════════════════════
 */

import { db } from './db';

/**
 * Build asset index maps:
 *   - productIndexMap: productId → 1-based asset index (by price asc)
 *   - pkgIndexMap: packageId → 1-based asset index (by amount asc, active, amount>0)
 *
 * produk[i] (price asc) ≡ paket[i] (amount asc) = same asset i.
 */
export async function buildAssetIndexMaps() {
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

  // ★ Exclude "Internal Default" / "_internal_default" — FK placeholder, NOT a real asset.
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

  return { productIndexMap, productNameMap, pkgIndexMap, pkgNameMap };
}

export interface DuplicateGroup {
  assetIndex: number;
  assetName: string;
  /** The investment to KEEP (latest by createdAt) */
  keep: {
    id: string;
    createdAt: Date;
    totalProfitEarned: number;
  };
  /** Older duplicates to refund + mark 'completed' */
  toRefund: Array<{
    id: string;
    createdAt: Date;
    totalProfitEarned: number;
    purchaseId: string | null;
  }>;
}

/**
 * Detect duplicate active Investments for a user, grouped by asset index.
 * Returns groups where ≥2 active Investments share the same asset index.
 *
 * For each group: keep = latest (max createdAt), toRefund = sisanya.
 */
export async function detectDuplicateActiveInvestments(
  userId: string,
  maps?: Awaited<ReturnType<typeof buildAssetIndexMaps>>
): Promise<DuplicateGroup[]> {
  const { productIndexMap, pkgIndexMap, productNameMap, pkgNameMap } =
    maps || (await buildAssetIndexMaps());

  const activeInvestments = await db.investment.findMany({
    where: { userId, status: 'active' },
    include: {
      package: { select: { id: true, name: true } },
      purchase: { select: { product: { select: { id: true, name: true } } } },
    },
    orderBy: [{ createdAt: 'desc' }, { startDate: 'desc' }],
  });

  // Group by asset index
  const byAsset = new Map<number, typeof activeInvestments>();
  for (const inv of activeInvestments) {
    let assetIdx: number | null = null;
    if (inv.purchaseId && inv.purchase?.product) {
      assetIdx = productIndexMap.get(inv.purchase.product.id) ?? null;
    } else if (inv.package) {
      assetIdx = pkgIndexMap.get(inv.package.id) ?? null;
    }
    if (assetIdx === null) continue;
    const arr = byAsset.get(assetIdx) || [];
    arr.push(inv);
    byAsset.set(assetIdx, arr);
  }

  const groups: DuplicateGroup[] = [];
  for (const [assetIdx, arr] of byAsset) {
    if (arr.length < 2) continue; // no duplicate
    // arr is sorted desc by createdAt → first = latest = keep
    const keep = arr[0];
    const toRefund = arr.slice(1);
    // Asset name: prefer product name (real) over package name (might be _internal_default)
    const keepProductName =
      keep.purchase?.product?.name ||
      productNameMap.get(keep.purchase?.product?.id || '') ||
      null;
    const keepPackageName =
      keep.package?.name && keep.package.name !== '_internal_default'
        ? keep.package.name
        : null;
    const assetName = keepProductName || keepPackageName || `Aset ${assetIdx}`;
    groups.push({
      assetIndex: assetIdx,
      assetName,
      keep: {
        id: keep.id,
        createdAt: keep.createdAt,
        totalProfitEarned: keep.totalProfitEarned || 0,
      },
      toRefund: toRefund.map((inv) => ({
        id: inv.id,
        createdAt: inv.createdAt,
        totalProfitEarned: inv.totalProfitEarned || 0,
        purchaseId: inv.purchaseId,
      })),
    });
  }

  return groups;
}

export interface CleanupReport {
  usersScanned: number;
  usersFixed: number;
  duplicateInvestmentsRefunded: number;
  totalProfitRefunded: number;
  purchasesMarkedCompleted: number;
  perUser: Array<{
    userId: string;
    name: string;
    groupsFixed: number;
    investmentsRefunded: number;
    profitRefunded: number;
  }>;
}

/**
 * ★★★ THE DEFINITIVE CLEANUP ★★★
 *
 * For a single user:
 *   1. Detect duplicate active Investments (per asset index)
 *   2. For each duplicate group:
 *      - Keep latest Investment (max createdAt)
 *      - For each older duplicate:
 *        ★ REFUND totalProfitEarned from User.mainBalance + totalProfit
 *        ★ Create BonusLog(type='refund', amount=-X, description='Refund profit duplikat')
 *        ★ Mark Investment status='completed'
 *        ★ Sync linked Purchase status='completed' (if any)
 *
 * Returns per-user report.
 *
 * Idempotent: kalo gak ada duplicate → no-op. Run berkala aman.
 */
export async function cleanupDuplicateInvestmentsForUser(
  userId: string,
  apply = true
): Promise<{
  groupsFixed: number;
  investmentsRefunded: number;
  profitRefunded: number;
  purchasesMarkedCompleted: number;
}> {
  const groups = await detectDuplicateActiveInvestments(userId);
  if (groups.length === 0) {
    return {
      groupsFixed: 0,
      investmentsRefunded: 0,
      profitRefunded: 0,
      purchasesMarkedCompleted: 0,
    };
  }

  let investmentsRefunded = 0;
  let profitRefunded = 0;
  let purchasesMarkedCompleted = 0;

  if (!apply) {
    // Dry-run: just count
    for (const g of groups) {
      investmentsRefunded += g.toRefund.length;
      profitRefunded += g.toRefund.reduce((s, r) => s + r.totalProfitEarned, 0);
    }
    return {
      groupsFixed: groups.length,
      investmentsRefunded,
      profitRefunded,
      purchasesMarkedCompleted: 0, // not computed in dry-run
    };
  }

  // APPLY: do the refund + mark in a transaction per duplicate
  for (const g of groups) {
    for (const dup of g.toRefund) {
      const refundAmount = dup.totalProfitEarned || 0;
      await db
        .$transaction(async (tx) => {
          // 1. Refund User balance (clamp ke 0 — jangan sampai negatif)
          if (refundAmount > 0) {
            const user = await tx.user.findUnique({
              where: { id: userId },
              select: { mainBalance: true, totalProfit: true, name: true, userId: true },
            });
            if (user) {
              const newMain = Math.max(0, user.mainBalance - refundAmount);
              const newTotalProfit = Math.max(0, user.totalProfit - refundAmount);
              const actualRefundMain = user.mainBalance - newMain;
              const actualRefundTotal = user.totalProfit - newTotalProfit;
              const actualRefund = Math.min(actualRefundMain, actualRefundTotal);
              await tx.user.update({
                where: { id: userId },
                data: {
                  mainBalance: newMain,
                  totalProfit: newTotalProfit,
                },
              });
              // 2. Create BonusLog refund entry (audit trail)
              if (actualRefund > 0) {
                await tx.bonusLog.create({
                  data: {
                    userId,
                    fromUserId: userId,
                    type: 'refund',
                    level: 0,
                    amount: -actualRefund, // negative = refund
                    description: `Refund profit duplikat (aset "${g.assetName}" sama, Investment older ditandai completed). Rp${Math.floor(actualRefund).toLocaleString('id-ID')} dikembalikan.`,
                  },
                });
                profitRefunded += actualRefund;
              }
            }
          }

          // 3. Mark Investment as 'completed' + set endDate to now (★ v20 fix)
          //    ★ Cron loop filter: `endDate > wibNow` → kalau endDate di-set ke now,
          //      cron akan skip Investment ini (tidak kredit profit lagi).
          //    Tanpa set endDate, cron v2.5 masih kredit karena endDate masih future.
          await tx.investment.update({
            where: { id: dup.id },
            data: {
              status: 'completed',
              endDate: new Date(), // ★ v20: set to now so cron skips it
            },
          });
          investmentsRefunded++;

          // 4. Sync linked Purchase status (if any) — also mark 'completed'
          if (dup.purchaseId) {
            const updatedPurchase = await tx.purchase.updateMany({
              where: { id: dup.purchaseId, status: 'active' },
              data: { status: 'completed' },
            });
            if (updatedPurchase.count > 0) {
              purchasesMarkedCompleted++;
            }
          }
        })
        .catch((e) => {
          console.error(`[InvestmentCleanup] ❌ Failed to refund ${dup.id}:`, e.message);
        });
    }
  }

  return {
    groupsFixed: groups.length,
    investmentsRefunded,
    profitRefunded,
    purchasesMarkedCompleted,
  };
}

/**
 * Loop SEMUA user, apply cleanupDuplicateInvestmentsForUser.
 * Returns aggregate report.
 */
export async function cleanupAllUsersDuplicateInvestments(
  apply = true
): Promise<CleanupReport> {
  const allUsers = await db.user.findMany({
    select: { id: true, userId: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  const report: CleanupReport = {
    usersScanned: allUsers.length,
    usersFixed: 0,
    duplicateInvestmentsRefunded: 0,
    totalProfitRefunded: 0,
    purchasesMarkedCompleted: 0,
    perUser: [],
  };

  for (const u of allUsers) {
    const result = await cleanupDuplicateInvestmentsForUser(u.id, apply);
    if (result.groupsFixed > 0) {
      report.usersFixed++;
      report.duplicateInvestmentsRefunded += result.investmentsRefunded;
      report.totalProfitRefunded += result.profitRefunded;
      report.purchasesMarkedCompleted += result.purchasesMarkedCompleted;
      report.perUser.push({
        userId: u.userId,
        name: u.name || '-',
        groupsFixed: result.groupsFixed,
        investmentsRefunded: result.investmentsRefunded,
        profitRefunded: result.profitRefunded,
      });
    }
  }

  return report;
}

/**
 * ════════════════════════════════════════════════════════════════
 *  deleteInvestmentWithRefund (v20.1) ★★★
 * ════════════════════════════════════════════════════════════════
 *
 *  THE FIX for: "tadi aku dah hapus yang duplikat tapi profitnya lo"
 *
 *  Problem:
 *    - Admin delete-investment LAMA: cuma hapus record Investment.
 *    - TIDAK refund profit yg sudah masuk ke User.mainBalance + totalProfit.
 *    - User balance TETAP dobel walau Investment udah dihapus.
 *
 *  Solution (v20.1):
 *    1. Baca Investment (totalProfitEarned, packageId, purchaseId, userId).
 *    2. Kalau totalProfitEarned > 0:
 *       - REFUND deduct dari User.mainBalance + User.totalProfit (clamp 0).
 *       - Create BonusLog(type='refund', amount=-X) — audit trail.
 *       - Decrement linked Purchase.profitEarned (if any, clamp 0).
 *    3. Delete linked ProfitLog entries (kalau Investment ini punya Purchase
 *       dan adalah satu-satunya Investment di Purchase itu → delete semua
 *       ProfitLog untuk Purchase tsb; kalau ada Investment lain, skip).
 *       ★ Safe approach: ProfitLog cuma link ke Purchase, jadi kalau Purchase
 *         dihapus juga, ProfitLog ikut terhapus (onDelete: Cascade). Tapi
 *         kalau Purchase tetap aktif, ProfitLog TIDAK dihapus (mungkin serve
 *         Investment lain di Purchase yg sama).
 *    4. Delete Investment record.
 *
 *  Idempotent: kalau Investment gak ada → no-op.
 *  Safe: refund di-clamp ke 0, gak bikin balance negatif.
 * ════════════════════════════════════════════════════════════════
 */
export async function deleteInvestmentWithRefund(
  investmentId: string,
  apply = true
): Promise<{
  found: boolean;
  refunded: number;
  deleted: boolean;
  purchaseSynced: boolean;
  error?: string;
}> {
  const inv = await db.investment.findUnique({
    where: { id: investmentId },
    select: {
      id: true,
      userId: true,
      packageId: true,
      purchaseId: true,
      amount: true,
      totalProfitEarned: true,
      status: true,
    },
  });

  if (!inv) {
    return {
      found: false,
      refunded: 0,
      deleted: false,
      purchaseSynced: false,
    };
  }

  const refundAmount = inv.totalProfitEarned || 0;

  if (!apply) {
    return {
      found: true,
      refunded: refundAmount,
      deleted: false,
      purchaseSynced: !!inv.purchaseId,
    };
  }

  let refunded = 0;
  let purchaseSynced = false;

  try {
    await db.$transaction(async (tx) => {
      // 1. Refund User balance (clamp ke 0)
      if (refundAmount > 0) {
        const user = await tx.user.findUnique({
          where: { id: inv.userId },
          select: { mainBalance: true, totalProfit: true },
        });
        if (user) {
          const newMain = Math.max(0, user.mainBalance - refundAmount);
          const newTotalProfit = Math.max(0, user.totalProfit - refundAmount);
          const actualRefundMain = user.mainBalance - newMain;
          const actualRefundTotal = user.totalProfit - newTotalProfit;
          const actualRefund = Math.min(actualRefundMain, actualRefundTotal);
          await tx.user.update({
            where: { id: inv.userId },
            data: {
              mainBalance: newMain,
              totalProfit: newTotalProfit,
            },
          });
          if (actualRefund > 0) {
            await tx.bonusLog.create({
              data: {
                userId: inv.userId,
                fromUserId: inv.userId,
                type: 'refund',
                level: 0,
                amount: -actualRefund,
                description: `Refund profit dari hapus Investment ${investmentId} (amount ${inv.amount}). Rp${Math.floor(actualRefund).toLocaleString('id-ID')} dikembalikan.`,
              },
            });
            refunded = actualRefund;
          }
        }
      }

      // 2. Sync linked Purchase.profitEarned (decrement, clamp 0)
      if (inv.purchaseId) {
        const purchase = await tx.purchase.findUnique({
          where: { id: inv.purchaseId },
          select: { id: true, profitEarned: true },
        });
        if (purchase) {
          const newProfit = Math.max(0, (purchase.profitEarned || 0) - refundAmount);
          await tx.purchase.update({
            where: { id: inv.purchaseId },
            data: { profitEarned: newProfit },
          });
          purchaseSynced = true;
        }
      }

      // 3. Delete Investment
      await tx.investment.delete({ where: { id: investmentId } });
    });

    return {
      found: true,
      refunded,
      deleted: true,
      purchaseSynced,
    };
  } catch (e: any) {
    return {
      found: true,
      refunded: 0,
      deleted: false,
      purchaseSynced: false,
      error: e?.message || 'Unknown error',
    };
  }
}
