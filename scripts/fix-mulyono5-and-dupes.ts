/**
 * ════════════════════════════════════════════════════════════════
 *  NEXVO — Fix Mulyono5 + Audit Duplicate Packages + PER-ASSET-UNIQUE-RULE
 * ════════════════════════════════════════════════════════════════
 *
 *  v19 PER-ASSET-UNIQUE-RULE: user boleh punya BANYAK aset aktif
 *  (VIP1 + VIP2 + VIP3 bersamaan). Yang dilarang: 2 active investments
 *  untuk aset yang sama (same tier index).
 *
 *  Matching produk ↔ paket:
 *    - produk[i] (by price asc) = asset i
 *    - paket[i] (by amount asc) = asset i
 *    - produk[i] ≡ paket[i] = same asset
 *
 *  Script ini detect:
 *    A. Same-product Purchase duplicates (≥2 active untuk produk yang sama)
 *    B. Same-asset Investment duplicates (≥2 active Investments for same asset
 *       index — includes cross-route: beli via produk + beli via paket)
 *
 *  Fix apply:
 *    A. Hard-delete duplicate Purchases (keep latest per productId)
 *    B. Mark older Investments 'completed' per asset (keep latest)
 *       + sync Purchase terkait juga 'completed'
 *
 *  Run on VPS:
 *    # Fix SEMUA user dengan duplikat (recommended — one shot):
 *    cd /var/www/nexvo && bun run scripts/fix-mulyono5-and-dupes.ts --fix-all
 *    cd /var/www/nexvo && bun run scripts/fix-mulyono5-and-dupes.ts --fix-all --apply
 *
 *    # Fix per-user (untuk user spesifik):
 *    cd /var/www/nexvo && bun run scripts/fix-mulyono5-and-dupes.ts
 *    cd /var/www/nexvo && bun run scripts/fix-mulyono5-and-dupes.ts --apply
 *    cd /var/www/nexvo && bun run scripts/fix-mulyono5-and-dupes.ts --user=62812xxxx --apply
 *
 *  Default = DRY-RUN (read-only). Add --apply to actually modify DB.
 * ════════════════════════════════════════════════════════════════
 */
import { db } from '../src/lib/db';

const DEFAULT_SEARCH = 'mulyono5';
const APPLY = process.argv.includes('--apply');
const FIX_ALL = process.argv.includes('--fix-all');
const userArg = process.argv.find((a) => a.startsWith('--user='));
const SEARCH_TERM = (userArg ? userArg.split('=')[1] : DEFAULT_SEARCH) as string;

function fmt(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}

function ts(date: Date | string | null): string {
  if (!date) return '(null)';
  return new Date(date).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'short',
    timeStyle: 'short',
  }) + ' WIB';
}

/** Search a user across all identifying fields. Returns all matches. */
async function findUserEverywhere(term: string) {
  const lc = term.toLowerCase();
  // 1) Try exact userId match first
  const exact = await db.user.findUnique({ where: { userId: term } }).catch(() => null);
  const matches: Awaited<ReturnType<typeof db.user.findMany>> = [];
  if (exact) matches.push(exact as any);

  // 2) Then contains search across all identifier fields
  const [byUserId, byWhatsapp, byEmail, byName] = await Promise.all([
    db.user.findMany({ where: { userId:   { contains: term } } }),
    db.user.findMany({ where: { whatsapp: { contains: term } } }),
    db.user.findMany({ where: { email:    { contains: term } } }),
    db.user.findMany({ where: { name:     { contains: term } } }),
  ]);

  // Extra JS-level filter for safety (in case future DB is case-sensitive)
  const filterCi = (rows: any[], field: string) =>
    rows.filter((r) => String(r[field] ?? '').toLowerCase().includes(lc));

  const combined = new Map<string, any>();
  for (const u of [exact, ...filterCi(byUserId, 'userId'), ...filterCi(byWhatsapp, 'whatsapp'), ...filterCi(byEmail, 'email'), ...filterCi(byName, 'name')]) {
    if (u) combined.set((u as any).id, u);
  }
  return Array.from(combined.values());
}

/**
 * Build asset index maps:
 *   - productIndexMap: productId → 1-based asset index (by price asc)
 *   - pkgIndexMap: packageId → 1-based asset index (by amount asc)
 *
 *produk[i] (price asc) ≡ paket[i] (amount asc) = same asset i.
 */
async function buildAssetIndexMaps() {
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

/**
 * Detect duplicates for a user — v19 PER-ASSET-UNIQUE-RULE aware.
 *
 * Returns:
 *   - activePurchases: ALL active purchases, sorted by createdAt DESC.
 *   - sameProductDuplicates: groups where same product has ≥2 active.
 *   - sameAssetDuplicates: groups where ≥2 active Investments have same asset
 *     index (includes cross-route: beli via produk + via paket).
 */
async function detectDuplicatesForUser(userId: string) {
  const activePurchases = await db.purchase.findMany({
    where: { userId, status: 'active' },
    orderBy: { createdAt: 'desc' },
    include: { product: true },
  });

  // Group by productId (A: same-product duplicates)
  const byProduct = new Map<string, typeof activePurchases>();
  for (const p of activePurchases) {
    const arr = byProduct.get(p.productId) || [];
    arr.push(p);
    byProduct.set(p.productId, arr);
  }
  const sameProductDuplicates: {
    productId: string;
    productName: string;
    count: number;
    purchases: typeof activePurchases;
  }[] = [];
  for (const [productId, arr] of byProduct) {
    if (arr.length > 1) {
      sameProductDuplicates.push({
        productId,
        productName: arr[0].product?.name || '(deleted)',
        count: arr.length,
        purchases: arr,
      });
    }
  }

  return {
    activePurchases,
    sameProductDuplicates,
  };
}

/**
 * Detect active Investments for a user, grouped by asset index.
 * v19 PER-ASSET-UNIQUE-RULE: 1 active per asset allowed. ≥2 = duplicate.
 *
 * Returns groups where ≥2 active Investments share same asset index.
 * For each group: keep latest (ordered desc by createdAt), mark sisanya 'completed'.
 */
async function detectInvestmentViolations(
  userId: string,
  maps?: Awaited<ReturnType<typeof buildAssetIndexMaps>>,
) {
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

  // Find groups with ≥2 active (duplicates)
  const duplicateGroups: {
    assetIndex: number;
    assetName: string;
    count: number;
    keep: typeof activeInvestments[number];
    toMarkCompleted: typeof activeInvestments;
  }[] = [];

  for (const [assetIdx, arr] of byAsset) {
    if (arr.length > 1) {
      const keep = arr[0]; // first = latest (ordered desc)
      const toMarkCompleted = arr.slice(1);
      // Asset name: prefer product name (real) over package name (might be _internal_default)
      const productName = keep.purchase?.product?.name || productNameMap.get(keep.purchase?.product?.id || '') || null;
      const packageName = keep.package?.name && keep.package.name !== '_internal_default' ? keep.package.name : null;
      const assetName = productName || packageName || `Aset ${assetIdx}`;
      duplicateGroups.push({
        assetIndex: assetIdx,
        assetName,
        count: arr.length,
        keep,
        toMarkCompleted,
      });
    }
  }

  return {
    activeCount: activeInvestments.length,
    duplicateGroups,
    toMarkCompleted: duplicateGroups.flatMap((g) => g.toMarkCompleted),
  };
}

/**
 * Fix ALL users with duplicates in one go (v19 PER-ASSET-UNIQUE-RULE).
 * Same logic as `fix-all-dupes` admin action.
 *
 * Strategi:
 *   1. Same-product Purchase duplikat → hard delete (keep latest per productId).
 *   2. ★ Same-asset Investment duplicates → keep latest per asset, mark sisanya
 *      'completed' + sync Purchase terkait.
 *
 * Data user (saldo, profile) TIDAK diubah. Audit trail dijaga (mark, not delete).
 */
async function runFixAll() {
  console.log('🌐 Fix ALL users — detect + fix duplicates untuk SEMUA user (v19 PER-ASSET)\n');
  const allUsers = await db.user.findMany({
    select: { id: true, userId: true, name: true, whatsapp: true, email: true, mainBalance: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Total users: ${allUsers.length}\n`);

  const maps = await buildAssetIndexMaps();

  interface UserReport {
    userId: string; name: string;
    deletedPurchases: number; markedPurchases: number; markedInvestments: number;
  }
  const report: UserReport[] = [];
  let totalDeletedPurchases = 0;
  let totalMarkedPurchases = 0;
  let totalMarkedInvestments = 0;
  let usersFixed = 0;

  for (const u of allUsers) {
    // ─── STEP 1: same-product Purchase duplikat (hard delete) ───
    const activePurchases = await db.purchase.findMany({
      where: { userId: u.id, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    const byProduct = new Map<string, typeof activePurchases>();
    for (const p of activePurchases) {
      const arr = byProduct.get(p.productId) || [];
      arr.push(p);
      byProduct.set(p.productId, arr);
    }
    const deletedPurchaseIds: string[] = [];
    for (const [, arr] of byProduct) {
      if (arr.length > 1) {
        for (const p of arr.slice(1)) deletedPurchaseIds.push(p.id);
      }
    }

    // ─── STEP 2: ★ v19 per-asset Investment duplicates ───
    const { duplicateGroups } = await detectInvestmentViolations(u.id, maps);
    const investmentMarkedIds: string[] = [];
    const purchaseMarkedIds: string[] = [];
    for (const g of duplicateGroups) {
      for (const inv of g.toMarkCompleted) {
        investmentMarkedIds.push(inv.id);
        if (inv.purchaseId) purchaseMarkedIds.push(inv.purchaseId);
      }
    }

    const dp = deletedPurchaseIds.length;
    const mp = purchaseMarkedIds.length;
    const mi = investmentMarkedIds.length;

    if (dp > 0 || mp > 0 || mi > 0) {
      usersFixed++;
      totalDeletedPurchases += dp;
      totalMarkedPurchases += mp;
      totalMarkedInvestments += mi;
      report.push({
        userId: u.userId, name: u.name || '-',
        deletedPurchases: dp, markedPurchases: mp, markedInvestments: mi,
      });
      console.log(
        `  ⚠️  ${u.userId} | ${u.name || '-'} | −${dp} P · →${mp} P 'completed' · →${mi} I 'completed'`,
      );
    }
  }

  console.log(`\n  ── RINGKASAN PREVIEW ──`);
  console.log(`  Users yang bakal diperbaiki: ${usersFixed}`);
  console.log(`  Total Purchase duplikat dihapus: ${totalDeletedPurchases}`);
  console.log(`  Total Purchase ditandai 'completed': ${totalMarkedPurchases}`);
  console.log(`  Total Investment ditandai 'completed': ${totalMarkedInvestments} (★ source of truth)`);

  if (usersFixed === 0) {
    console.log('\n  ✅ Tidak ada user dengan same-asset duplikat. Semua sudah sesuai aturan v19 (1 aset aktif per tier).');
    return;
  }

  if (!APPLY) {
    console.log('\n  🔍 DRY-RUN: tidak ada perubahan. Run dengan --apply untuk eksekusi.');
    console.log('     Contoh: bun run scripts/fix-mulyono5-and-dupes.ts --fix-all --apply\n');
    return;
  }

  // APPLY — execute fix for each user
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ⚡ APPLY — Performing fix for all users...');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const u of allUsers) {
    // STEP 1: same-product Purchase duplikat → hard delete
    const activePurchases = await db.purchase.findMany({
      where: { userId: u.id, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    const byProduct = new Map<string, typeof activePurchases>();
    for (const p of activePurchases) {
      const arr = byProduct.get(p.productId) || [];
      arr.push(p);
      byProduct.set(p.productId, arr);
    }
    const deletedPurchaseIds: string[] = [];
    for (const [, arr] of byProduct) {
      if (arr.length > 1) {
        for (const p of arr.slice(1)) deletedPurchaseIds.push(p.id);
      }
    }
    if (deletedPurchaseIds.length > 0) {
      await db.profitLog.deleteMany({ where: { purchaseId: { in: deletedPurchaseIds } } });
      await db.investment.updateMany({
        where: { purchaseId: { in: deletedPurchaseIds } },
        data: { purchaseId: null, status: 'completed' },
      });
      await db.purchase.deleteMany({ where: { id: { in: deletedPurchaseIds } } });
    }

    // STEP 2: ★ v19 per-asset Investment duplicates
    const { duplicateGroups } = await detectInvestmentViolations(u.id, maps);
    const investmentMarkedIds: string[] = [];
    const purchaseMarkedIds: string[] = [];
    for (const g of duplicateGroups) {
      for (const inv of g.toMarkCompleted) {
        investmentMarkedIds.push(inv.id);
        if (inv.purchaseId) purchaseMarkedIds.push(inv.purchaseId);
      }
    }
    if (investmentMarkedIds.length > 0) {
      await db.investment.updateMany({
        where: { id: { in: investmentMarkedIds } },
        data: { status: 'completed' },
      });
    }
    if (purchaseMarkedIds.length > 0) {
      await db.purchase.updateMany({
        where: { id: { in: purchaseMarkedIds }, status: 'active' },
        data: { status: 'completed' },
      });
    }

    const dp = deletedPurchaseIds.length;
    const mp = purchaseMarkedIds.length;
    const mi = investmentMarkedIds.length;
    if (dp > 0 || mp > 0 || mi > 0) {
      console.log(`  ✅ ${u.userId} | ${u.name || '-'} | hapus ${dp} Purchase + mark ${mp} Purchase + ${mi} Investment 'completed'`);
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  ✅ Fix selesai. ${usersFixed} user diperbaiki.`);
  console.log(`     - ${totalDeletedPurchases} Purchase duplikat dihapus`);
  console.log(`     - ${totalMarkedPurchases} Purchase ditandai 'completed'`);
  console.log(`     - ${totalMarkedInvestments} Investment ditandai 'completed' (★ source of truth)`);
  console.log(`     - Saldo TIDAK diubah (gunakan admin UI "Set Saldo 0" per user kalau perlu)`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  NEXVO — Fix Mulyono5 + Audit + PER-ASSET-UNIQUE-RULE (v19)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Mode       : ${APPLY ? '⚡ APPLY (will modify DB)' : '🔍 DRY-RUN (read-only)'}`);
  console.log(`  Scope      : ${FIX_ALL ? '🌐 ALL users (--fix-all)' : `🎯 single user "${SEARCH_TERM}"`}`);
  console.log(`  Fields     : userId | whatsapp | email | name`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (FIX_ALL) {
    return await runFixAll();
  }
  /* ─── 1. Find target user across all fields ─── */
  const candidates = await findUserEverywhere(SEARCH_TERM);

  if (candidates.length === 0) {
    console.log(`❌ Tidak ada user yang cocok dengan "${SEARCH_TERM}" di field manapun.`);
    console.log('   Coba gunakan --user=<kata-kunci> dengan email / whatsapp / nama user.');
    console.log('\n   ── SEMUA USER (untuk referensi) ──');
    const allUsers = await db.user.findMany({
      select: { userId: true, whatsapp: true, email: true, name: true, mainBalance: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    console.log(`Total: ${allUsers.length} user(s)`);
    for (const u of allUsers) {
      console.log(`  • userId=${u.userId} | wa=${u.whatsapp} | email=${u.email} | name=${u.name || '-'} | main=${fmt(u.mainBalance)}`);
    }
    return;
  }

  if (candidates.length > 1) {
    console.log(`⚠️  Ditemukan ${candidates.length} user yang cocok. Pilih salah satu dengan --user=<identifier>:\n`);
    for (const u of candidates) {
      console.log(`  • userId=${u.userId} | wa=${u.whatsapp} | email=${u.email} | name=${u.name || '-'} | main=${fmt(u.mainBalance)}`);
    }
    console.log('\n  Contoh: bun run scripts/fix-mulyono5-and-dupes.ts --user=62812xxxx --apply');
    return;
  }

  const target = candidates[0];
  console.log(`✅ User ditemukan:`);
  console.log(`   userId         : ${target.userId}`);
  console.log(`   id (cuid)      : ${target.id}`);
  console.log(`   name           : ${target.name || '-'}`);
  console.log(`   whatsapp       : ${target.whatsapp}`);
  console.log(`   email          : ${target.email}`);
  console.log(`   mainBalance    : ${fmt(target.mainBalance)}`);
  console.log(`   depositBalance : ${fmt(target.depositBalance)}`);
  console.log(`   profitBalance  : ${fmt(target.profitBalance)}`);
  console.log(`   totalDeposit   : ${fmt(target.totalDeposit)}`);
  console.log(`   totalWithdraw  : ${fmt(target.totalWithdraw)}`);
  console.log(`   totalProfit    : ${fmt(target.totalProfit)}`);
  console.log();

  /* ─── 2. Detect duplicates for target (v19: same-product + same-asset) ─── */
  const { activePurchases, sameProductDuplicates } =
    await detectDuplicatesForUser(target.id);

  // Also load investment violations for display
  const maps = await buildAssetIndexMaps();
  const { duplicateGroups: sameAssetViolations } = await detectInvestmentViolations(target.id, maps);

  console.log(`📦 Active purchases: ${activePurchases.length} total`);
  console.log(`🔁 Same-product duplicate groups: ${sameProductDuplicates.length}`);
  console.log(`🚫 Same-asset Investment duplicates: ${sameAssetViolations.length}`);

  if (sameProductDuplicates.length > 0) {
    console.log('\n   ── DUPLICATE PACKAGES (same product, ≥2 active) ──');
    for (const d of sameProductDuplicates) {
      console.log(`\n   Product: "${d.productName}" (productId=${d.productId})`);
      console.log(`   Active count: ${d.count}`);
      d.purchases.forEach((p, idx) => {
        const tag = idx === 0 ? '✅ KEEP (latest)' : `❌ DELETE (dup #${idx + 1})`;
        console.log(`     ${tag} | ${p.id} | qty=${p.quantity} | total=${fmt(p.totalPrice)} | created=${ts(p.createdAt)} | profitEarned=${fmt(p.profitEarned)}`);
      });
    }
  }

  if (sameAssetViolations.length > 0) {
    console.log('\n   ── SAME-ASSET INVESTMENT DUPLICATES (v19) ──');
    for (const v of sameAssetViolations) {
      console.log(`\n   Aset ${v.assetIndex} ("${v.assetName}") — ${v.count} active Investments`);
      console.log(`     ✅ KEEP: id=${v.keep.id} | created=${ts(v.keep.createdAt)}`);
      v.toMarkCompleted.forEach((inv, idx) => {
        console.log(`     ❌ MARK: id=${inv.id} | created=${ts(inv.createdAt)}`);
      });
    }
  }

  if (sameProductDuplicates.length === 0 && sameAssetViolations.length === 0) {
    console.log('   ✅ Tidak ada same-product atau same-asset duplikat untuk user ini.');
  }
  console.log();

  /* ─── 3. Apply fix for target ─── */
  if (APPLY) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ⚡ APPLY — Performing fix...');
    console.log('═══════════════════════════════════════════════════════════════\n');

    await db.$transaction(async (tx) => {
      // 3a. Delete same-product duplicates (keep latest per product).
      let totalDeleted = 0;
      for (const d of sameProductDuplicates) {
        const toDelete = d.purchases.slice(1); // skip first (latest)
        const ids = toDelete.map((p) => p.id);
        if (ids.length === 0) continue;

        await tx.profitLog.deleteMany({ where: { purchaseId: { in: ids } } });
        await tx.investment.updateMany({
          where: { purchaseId: { in: ids } },
          data: { purchaseId: null, status: 'completed' },
        });
        await tx.purchase.deleteMany({ where: { id: { in: ids } } });
        totalDeleted += ids.length;
        console.log(`  🗑️  Hapus ${ids.length} duplikat untuk product "${d.productName}" (productId=${d.productId})`);
      }
      console.log(`  ✅ Total same-product duplikat dihapus: ${totalDeleted} purchases`);

      // 3b. ★ v19 — Fix same-asset Investment duplicates per asset.
      //     Keep latest per asset, mark sisanya 'completed' + sync Purchase.
      let totalInvestmentMarked = 0;
      let totalPurchaseMarked = 0;
      for (const v of sameAssetViolations) {
        const invIds = v.toMarkCompleted.map((inv) => inv.id);
        const purchaseIds = v.toMarkCompleted
          .map((inv) => inv.purchaseId)
          .filter((pid): pid is string => !!pid);

        if (invIds.length > 0) {
          await tx.investment.updateMany({
            where: { id: { in: invIds } },
            data: { status: 'completed' },
          });
          totalInvestmentMarked += invIds.length;
        }
        if (purchaseIds.length > 0) {
          await tx.purchase.updateMany({
            where: { id: { in: purchaseIds }, status: 'active' },
            data: { status: 'completed' },
          });
          totalPurchaseMarked += purchaseIds.length;
        }
        console.log(`  🚫 Fix same-asset Aset ${v.assetIndex} ("${v.assetName}"): keep latest, mark ${invIds.length} Investment + ${purchaseIds.length} Purchase 'completed'`);
      }
      console.log(`  ✅ Total same-asset duplicates: ${totalInvestmentMarked} Investment + ${totalPurchaseMarked} Purchase marked 'completed'`);

      // 3c. Set saldo to 0 (main + deposit + profit) — ONLY for mulyono5 legacy cleanup
      const before = {
        main: target.mainBalance,
        dep: target.depositBalance,
        prof: target.profitBalance,
      };
      await tx.user.update({
        where: { id: target.id },
        data: { mainBalance: 0, depositBalance: 0, profitBalance: 0 },
      });
      console.log(`  💸 Saldo di-set ke 0:`);
      console.log(`     mainBalance    : ${fmt(before.main)} → Rp0`);
      console.log(`     depositBalance : ${fmt(before.dep)} → Rp0`);
      console.log(`     profitBalance  : ${fmt(before.prof)} → Rp0`);
      console.log(`     (totalDeposit/totalWithdraw/totalProfit TIDAK diubah — pakai admin UI "Reset Stats" kalau perlu)`);
    });

    console.log('\n✅ Fix selesai.\n');
  } else {
    console.log('🔍 DRY-RUN: tidak ada perubahan. Run dengan --apply untuk eksekusi.');
    console.log('   Contoh: bun run scripts/fix-mulyono5-and-dupes.ts --apply\n');
  }

  /* ─── 4. Audit ALL users for duplicate active packages (v19: same-asset) ─── */
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🔍 AUDIT — Cek same-asset duplikat untuk SEMUA user (v19)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const allUsers = await db.user.findMany({
    select: { id: true, userId: true, name: true, whatsapp: true, email: true, mainBalance: true, depositBalance: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Total users: ${allUsers.length}`);

  let usersWithDupes = 0;
  let usersWithSameAsset = 0;
  let totalDupeRecords = 0;
  let totalSameAssetRecords = 0;

  for (const u of allUsers) {
    const { sameProductDuplicates } = await detectDuplicatesForUser(u.id);
    const { duplicateGroups: sameAssetViolations } = await detectInvestmentViolations(u.id, maps);
    if (sameProductDuplicates.length > 0) {
      usersWithDupes++;
      for (const d of sameProductDuplicates) {
        totalDupeRecords += d.count - 1;
        console.log(`  ⚠️  ${u.userId} | ${u.name || '-'} | same-product dup "${d.productName}" (×${d.count}) — hapus ${d.count - 1}`);
      }
    }
    if (sameAssetViolations.length > 0) {
      usersWithSameAsset++;
      for (const v of sameAssetViolations) {
        totalSameAssetRecords += v.toMarkCompleted.length;
        console.log(`  🚫 ${u.userId} | ${u.name || '-'} | same-asset Aset ${v.assetIndex} "${v.assetName}" (×${v.count}) — keep latest, mark ${v.toMarkCompleted.length} 'completed'`);
      }
    }
  }

  console.log(`\n  ── RINGKASAN AUDIT ──`);
  console.log(`  Users dengan same-product duplicate : ${usersWithDupes}`);
  console.log(`  Users dengan same-asset violation    : ${usersWithSameAsset}`);
  console.log(`  Total same-product duplikat          : ${totalDupeRecords}`);
  console.log(`  Total same-asset to mark completed    : ${totalSameAssetRecords}`);
  if (usersWithDupes > 0 || usersWithSameAsset > 0) {
    console.log('\n  👉 Cara fix: jalankan:');
    console.log('     bun run scripts/fix-mulyono5-and-dupes.ts --fix-all --apply');
    console.log('     Atau via admin UI: Kelola Users → "Fix Semua Duplikat"');
  } else {
    console.log('\n  ✅ Tidak ada user dengan same-asset duplikat. Semua sesuai v19 PER-ASSET-UNIQUE-RULE.');
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Selesai.');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
