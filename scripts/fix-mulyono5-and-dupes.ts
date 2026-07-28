/**
 * ════════════════════════════════════════════════════════════════
 *  NEXVO — Fix Mulyono5 + Audit Duplicate Packages Across All Users
 * ════════════════════════════════════════════════════════════════
 *
 *  Run on VPS:
 *    cd /var/www/nexvo && bun run scripts/fix-mulyono5-and-dupes.ts
 *
 *  Default mode = DRY-RUN (read-only, no DB writes).
 *  Add --apply to actually perform the fix.
 *
 *  What this script does:
 *    1. Find user "mulyono5" (by userId exact, case-insensitive).
 *    2. List all their active purchases; detect duplicate product IDs.
 *       Show every duplicate package (product name + qty duplicates).
 *    3. (apply) For mulyono5: delete duplicate active purchases keeping
 *       only the LATEST one per productId (cascade profitLogs + nullify
 *       investment.purchaseId). Other users' duplicates are REPORTED ONLY
 *       (not auto-fixed) — admin should fix them via admin UI to stay safe.
 *    4. (apply) Set mulyono5's saldo to 0 (mainBalance, depositBalance,
 *       profitBalance all → 0). Stats (totalDeposit/totalWithdraw/
 *       totalProfit) NOT touched — admin can reset-stats via UI if needed.
 *    5. Audit ALL other users: list every user with duplicate active
 *       purchases (same productId appears > 1 time with status='active').
 *       Print a report table.
 *
 *  Safety:
 *    - DRY-RUN by default. Will NOT modify anything.
 *    - Only mulyono5's saldo + duplicates are touched when --apply is used.
 *    - Other users are reported, NOT auto-fixed.
 *    - Uses Prisma $transaction for atomicity.
 * ════════════════════════════════════════════════════════════════
 */
import { db } from '../src/lib/db';

const TARGET_USER_ID = 'mulyono5'; // exact match (case-insensitive)
const APPLY = process.argv.includes('--apply');

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

async function detectDuplicatesForUser(userId: string) {
  const activePurchases = await db.purchase.findMany({
    where: { userId, status: 'active' },
    orderBy: { createdAt: 'desc' },
    include: { product: true },
  });
  const byProduct = new Map<string, typeof activePurchases>();
  for (const p of activePurchases) {
    const arr = byProduct.get(p.productId) || [];
    arr.push(p);
    byProduct.set(p.productId, arr);
  }
  const duplicates: { productId: string; productName: string; count: number; purchases: typeof activePurchases }[] = [];
  for (const [productId, arr] of byProduct) {
    if (arr.length > 1) {
      duplicates.push({
        productId,
        productName: arr[0].product?.name || '(deleted)',
        count: arr.length,
        purchases: arr,
      });
    }
  }
  return { activePurchases, duplicates };
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  NEXVO — Fix Mulyono5 + Audit Duplicate Packages');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Mode: ${APPLY ? '⚡ APPLY (will modify DB)' : '🔍 DRY-RUN (read-only)'}`);
  console.log(`  Target user: "${TARGET_USER_ID}"`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  /* ─── 1. Find mulyono5 ─── */
  const target = await db.user.findFirst({
    where: { userId: TARGET_USER_ID },
    select: {
      id: true, userId: true, name: true, whatsapp: true, email: true,
      mainBalance: true, depositBalance: true, profitBalance: true,
      totalDeposit: true, totalWithdraw: true, totalProfit: true,
      createdAt: true,
    },
  });

  if (!target) {
    console.log(`❌ User "${TARGET_USER_ID}" tidak ditemukan (case-sensitive match).`);
    console.log('   Mencari user dengan userId mengandung "mulyono"...\n');
    const candidates = await db.user.findMany({
      where: { userId: { contains: 'mulyono' } },
      select: { id: true, userId: true, name: true, whatsapp: true, mainBalance: true },
    });
    if (candidates.length === 0) {
      console.log('   Tidak ada user dengan "mulyono" di userId. Keluar.');
      return;
    }
    console.log('   Kandidat ditemukan:');
    for (const c of candidates) {
      console.log(`     • ${c.userId} | id=${c.id} | name=${c.name || '-'} | wa=${c.whatsapp} | main=${fmt(c.mainBalance)}`);
    }
    console.log('\n   Edit TARGET_USER_ID di script ini kalau perlu, lalu run lagi.');
    return;
  }

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

  /* ─── 2. Detect duplicates for mulyono5 ─── */
  const { activePurchases, duplicates } = await detectDuplicatesForUser(target.id);

  console.log(`📦 Active purchases: ${activePurchases.length} total`);
  console.log(`🔁 Duplicate groups: ${duplicates.length}`);
  if (duplicates.length > 0) {
    console.log('\n   ── DUPLICATE PACKAGES (mulyono5) ──');
    for (const d of duplicates) {
      console.log(`\n   Product: "${d.productName}" (productId=${d.productId})`);
      console.log(`   Active count: ${d.count}`);
      d.purchases.forEach((p, idx) => {
        const tag = idx === 0 ? '✅ KEEP (latest)' : `❌ DELETE (dup #${idx + 1})`;
        console.log(`     ${tag} | ${p.id} | qty=${p.quantity} | total=${fmt(p.totalPrice)} | created=${ts(p.createdAt)} | profitEarned=${fmt(p.profitEarned)}`);
      });
    }
  } else {
    console.log('   ✅ Tidak ada duplikat untuk mulyono5.');
  }
  console.log();

  /* ─── 3. Apply fix for mulyono5 ─── */
  if (APPLY) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ⚡ APPLY — Performing fix for mulyono5...');
    console.log('═══════════════════════════════════════════════════════════════\n');

    await db.$transaction(async (tx) => {
      // 3a. Delete duplicate purchases (keep latest per product)
      let totalDeleted = 0;
      for (const d of duplicates) {
        const toDelete = d.purchases.slice(1); // skip first (latest)
        const ids = toDelete.map((p) => p.id);
        if (ids.length === 0) continue;

        // Cascade: profitLogs, then nullify investment.purchaseId, then delete purchase
        await tx.profitLog.deleteMany({ where: { purchaseId: { in: ids } } });
        await tx.investment.updateMany({ where: { purchaseId: { in: ids } }, data: { purchaseId: null } });
        await tx.purchase.deleteMany({ where: { id: { in: ids } } });
        totalDeleted += ids.length;
        console.log(`  🗑️  Hapus ${ids.length} duplikat untuk product "${d.productName}" (productId=${d.productId})`);
      }
      console.log(`  ✅ Total duplikat dihapus: ${totalDeleted} purchases`);

      // 3b. Set saldo to 0 (main + deposit + profit)
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

    console.log('\n✅ Fix selesai untuk mulyono5.\n');
  } else {
    console.log('🔍 DRY-RUN: tidak ada perubahan. Run dengan --apply untuk eksekusi.');
    console.log('   Contoh: bun run scripts/fix-mulyono5-and-dupes.ts --apply\n');
  }

  /* ─── 4. Audit ALL users for duplicate active packages ─── */
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🔍 AUDIT — Cek duplikat paket aktif untuk SEMUA user');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const allUsers = await db.user.findMany({
    select: { id: true, userId: true, name: true, whatsapp: true, mainBalance: true, depositBalance: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Total users: ${allUsers.length}`);

  let usersWithDupes = 0;
  let totalDupeRecords = 0;
  const report: Array<{ userId: string; name: string; productName: string; count: number }> = [];

  for (const u of allUsers) {
    const { duplicates: userDupes } = await detectDuplicatesForUser(u.id);
    if (userDupes.length > 0) {
      usersWithDupes++;
      for (const d of userDupes) {
        totalDupeRecords += d.count - 1; // count of duplicates to delete
        report.push({ userId: u.userId, name: u.name || '-', productName: d.productName, count: d.count });
        console.log(`  ⚠️  ${u.userId} | ${u.name || '-'} | duplikat "${d.productName}" (×${d.count}) — perlu hapus ${d.count - 1}`);
      }
    }
  }

  console.log(`\n  ── RINGKASAN AUDIT ──`);
  console.log(`  Users dengan duplikat: ${usersWithDupes}`);
  console.log(`  Total duplikat yang perlu dihapus (estimasi): ${totalDupeRecords}`);
  if (usersWithDupes > 0) {
    console.log('\n  👉 Cara fix: buka admin panel → Kelola Users → klik tombol 📦 (Kelola Aset)');
    console.log('     → lihat banner merah "Paket Duplikat Ditemukan" → klik "Fix Duplikat Paket".');
    console.log('     Atau admin bisa hapus per-purchase satu-satu lewat tombol 🗑️.');
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
