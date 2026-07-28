/**
 * ════════════════════════════════════════════════════════════════
 *  NEXVO — Fix Mulyono5 + Audit Duplicate Packages + ONE-ACTIVE-RULE
 * ════════════════════════════════════════════════════════════════
 *
 *  v18 ONE-ACTIVE-RULE: user hanya boleh punya SATU paket/produk aktif.
 *  Script ini detect:
 *    A. Same-product duplicates (≥2 active purchases untuk produk yang sama)
 *    B. Multi-active violations (≥2 active purchases untuk produk BERBEDA)
 *       — sebelumnya boleh (MULTI-ACTIVE era), sekarang dilarang.
 *
 *  Fix apply untuk A & B:
 *    - Keep 1 active purchase terbaru (createdAt DESC)
 *    - Purchase duplikat → nullify Investment.purchaseId + delete ProfitLog
 *      + delete Purchase.
 *    - Investment duplikat → mark 'completed' (jangan hard-delete, keep audit trail).
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
  // NOTE: SQLite's `contains` is already case-insensitive, no `mode` arg needed.
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
 * Detect duplicates for a user — v18 ONE-ACTIVE-RULE aware.
 *
 * Returns:
 *   - activePurchases: ALL active purchases (any product), sorted by createdAt DESC.
 *   - sameProductDuplicates: groups where same product has ≥2 active.
 *   - multiActiveViolation: under v18, only 1 active purchase allowed TOTAL.
 *     If user has ≥2 active for DIFFERENT products, that's a violation.
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

  // B: multi-active violation — under v18, only 1 active purchase allowed TOTAL.
  // If user has ≥2 active purchases (across ANY products), it's a violation.
  // Strategy: keep the LATEST active purchase, mark all others 'completed'.
  let multiActiveViolation: {
    isViolation: boolean;
    keepPurchase: typeof activePurchases[number] | null;
    toRemove: typeof activePurchases;
    description: string;
  } | null = null;

  if (activePurchases.length > 1) {
    const keep = activePurchases[0]; // already sorted desc by createdAt
    const toRemove = activePurchases.slice(1);
    const removedNames = toRemove.map((p) => p.product?.name || '(deleted)');
    multiActiveViolation = {
      isViolation: true,
      keepPurchase: keep,
      toRemove,
      description: `User punya ${activePurchases.length} paket aktif (harusnya 1). Keep: ${keep.product?.name || '-'}. Hapus: ${removedNames.join(', ')}.`,
    };
  }

  return {
    activePurchases,
    sameProductDuplicates,
    multiActiveViolation,
  };
}

/**
 * Fix ALL users with duplicates in one go (v18 ONE-ACTIVE-RULE).
 * Same logic as `fix-all-dupes` admin action.
 */
async function runFixAll() {
  console.log('🌐 Fix ALL users — detect + fix duplicates untuk SEMUA user\n');
  const allUsers = await db.user.findMany({
    select: { id: true, userId: true, name: true, whatsapp: true, email: true, mainBalance: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Total users: ${allUsers.length}\n`);

  const report: { userId: string; name: string; deleted: number; marked: number }[] = [];
  let totalDeleted = 0;
  let totalMarked = 0;
  let usersFixed = 0;

  for (const u of allUsers) {
    const { sameProductDuplicates, multiActiveViolation } = await detectDuplicatesForUser(u.id);
    const willDelete = sameProductDuplicates.reduce((sum, d) => sum + (d.count - 1), 0);
    const willMark = multiActiveViolation ? multiActiveViolation.toRemove.length : 0;

    if (willDelete > 0 || willMark > 0) {
      usersFixed++;
      totalDeleted += willDelete;
      totalMarked += willMark;
      report.push({ userId: u.userId, name: u.name || '-', deleted: willDelete, marked: willMark });
      console.log(`  ⚠️  ${u.userId} | ${u.name || '-'} | will delete ${willDelete} same-product dup + mark ${willMark} multi-active 'completed'`);
    }
  }

  console.log(`\n  ── RINGKASAN PREVIEW ──`);
  console.log(`  Users yang bakal diperbaiki: ${usersFixed}`);
  console.log(`  Total same-product dup dihapus: ${totalDeleted}`);
  console.log(`  Total multi-active ditandai 'completed': ${totalMarked}`);

  if (usersFixed === 0) {
    console.log('\n  ✅ Tidak ada user dengan duplikat. Semua sudah sesuai aturan v18.');
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
    const { sameProductDuplicates, multiActiveViolation } = await detectDuplicatesForUser(u.id);
    let deletedForUser = 0;
    let markedForUser = 0;

    // A: same-product duplicates — hard delete
    for (const d of sameProductDuplicates) {
      const ids = d.purchases.slice(1).map((p) => p.id);
      if (ids.length === 0) continue;
      await db.profitLog.deleteMany({ where: { purchaseId: { in: ids } } });
      await db.investment.updateMany({
        where: { purchaseId: { in: ids } },
        data: { purchaseId: null, status: 'completed' },
      });
      await db.purchase.deleteMany({ where: { id: { in: ids } } });
      deletedForUser += ids.length;
    }

    // B: multi-active violation — re-check active, mark older 'completed'
    if (multiActiveViolation) {
      const ids = multiActiveViolation.toRemove.map((p) => p.id);
      await db.purchase.updateMany({ where: { id: { in: ids } }, data: { status: 'completed' } });
      await db.investment.updateMany({ where: { purchaseId: { in: ids } }, data: { status: 'completed' } });
      markedForUser += ids.length;
    }

    if (deletedForUser > 0 || markedForUser > 0) {
      console.log(`  ✅ ${u.userId} | ${u.name || '-'} | hapus ${deletedForUser} + mark ${markedForUser} 'completed'`);
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  ✅ Fix selesai. ${usersFixed} user diperbaiki.`);
  console.log(`     - ${totalDeleted} same-product duplikat dihapus`);
  console.log(`     - ${totalMarked} multi-active ditandai 'completed' (audit trail dipertahankan)`);
  console.log(`     - Saldo TIDAK diubah (gunakan admin UI "Set Saldo 0" per user kalau perlu)`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  NEXVO — Fix Mulyono5 + Audit + ONE-ACTIVE-RULE');
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

  /* ─── 2. Detect duplicates for target (v18: same-product + multi-active) ─── */
  const { activePurchases, sameProductDuplicates, multiActiveViolation } =
    await detectDuplicatesForUser(target.id);

  console.log(`📦 Active purchases: ${activePurchases.length} total`);
  console.log(`🔁 Same-product duplicate groups: ${sameProductDuplicates.length}`);
  console.log(`🚫 Multi-active violations: ${multiActiveViolation ? 1 : 0}`);

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

  if (multiActiveViolation) {
    console.log('\n   ── MULTI-ACTIVE VIOLATION (v18: only 1 active allowed) ──');
    console.log(`   ${multiActiveViolation.description}`);
    console.log(`   ✅ KEEP: ${multiActiveViolation.keepPurchase?.product?.name || '-'} | id=${multiActiveViolation.keepPurchase?.id} | created=${ts(multiActiveViolation.keepPurchase?.createdAt ?? null)}`);
    multiActiveViolation.toRemove.forEach((p, idx) => {
      console.log(`   ❌ REMOVE: ${p.product?.name || '-'} | id=${p.id} | created=${ts(p.createdAt)}`);
    });
  }

  if (sameProductDuplicates.length === 0 && !multiActiveViolation) {
    console.log('   ✅ Tidak ada duplikat atau multi-active violation untuk user ini.');
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

        // Nullify linked Investment.purchaseId + mark Investment 'completed'
        // (so audit trail kept, but profit stops).
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

      // 3b. Multi-active violation fix — under v18, only 1 active allowed TOTAL.
      //     Keep latest, mark all others 'completed' (Purchase + Investment).
      if (multiActiveViolation) {
        const toRemoveIds = multiActiveViolation.toRemove.map((p) => p.id);
        console.log(`  🚫 Fix multi-active violation: keep "${multiActiveViolation.keepPurchase?.product?.name || '-'}", mark ${toRemoveIds.length} lainnya 'completed'`);
        // Mark Purchase 'completed'
        await tx.purchase.updateMany({
          where: { id: { in: toRemoveIds } },
          data: { status: 'completed' },
        });
        // Mark linked Investment 'completed' (don't hard-delete — keep audit trail)
        await tx.investment.updateMany({
          where: { purchaseId: { in: toRemoveIds } },
          data: { status: 'completed' },
        });
        console.log(`  ✅ ${toRemoveIds.length} paket ditandai 'completed' (audit trail dipertahankan)`);
      }

      // 3c. Set saldo to 0 (main + deposit + profit)
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

  /* ─── 4. Audit ALL users for duplicate active packages ─── */
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🔍 AUDIT — Cek duplikat paket aktif untuk SEMUA user');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const allUsers = await db.user.findMany({
    select: { id: true, userId: true, name: true, whatsapp: true, email: true, mainBalance: true, depositBalance: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Total users: ${allUsers.length}`);

  let usersWithDupes = 0;
  let usersWithMultiActive = 0;
  let totalDupeRecords = 0;
  let totalMultiActiveRecords = 0;

  for (const u of allUsers) {
    const { sameProductDuplicates, multiActiveViolation } = await detectDuplicatesForUser(u.id);
    if (sameProductDuplicates.length > 0) {
      usersWithDupes++;
      for (const d of sameProductDuplicates) {
        totalDupeRecords += d.count - 1;
        console.log(`  ⚠️  ${u.userId} | ${u.name || '-'} | same-product dup "${d.productName}" (×${d.count}) — hapus ${d.count - 1}`);
      }
    }
    if (multiActiveViolation) {
      usersWithMultiActive++;
      totalMultiActiveRecords += multiActiveViolation.toRemove.length;
      console.log(`  🚫 ${u.userId} | ${u.name || '-'} | MULTI-ACTIVE (${multiActiveViolation.toRemove.length + 1} paket aktif) — keep latest, mark ${multiActiveViolation.toRemove.length} 'completed'`);
    }
  }

  console.log(`\n  ── RINGKASAN AUDIT ──`);
  console.log(`  Users dengan same-product duplicate: ${usersWithDupes}`);
  console.log(`  Users dengan multi-active violation : ${usersWithMultiActive}`);
  console.log(`  Total same-product duplikat         : ${totalDupeRecords}`);
  console.log(`  Total multi-active to mark completed: ${totalMultiActiveRecords}`);
  if (usersWithDupes > 0 || usersWithMultiActive > 0) {
    console.log('\n  👉 Cara fix: buka admin panel → Kelola Users → klik tombol 📦 (Kelola Aset)');
    console.log('     → lihat banner merah → klik tombol fix.');
    console.log('     Atau jalankan: bun run scripts/fix-mulyono5-and-dupes.ts --user=<identifier> --apply');
    console.log('     untuk fix per-user. Tidak ada opsi fix-semua otomatis (admin wajib pilih user).');
  } else {
    console.log('\n  ✅ Tidak ada user lain dengan duplikat. Selesai.');
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
