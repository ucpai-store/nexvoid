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
 *  Search behaviour (FIXED — was failing on VPS before):
 *    The script searches across ALL identifying fields, not just userId:
 *      - userId   (exact match, then contains)
 *      - whatsapp (contains)
 *      - email    (contains)
 *      - name     (contains)
 *    Because on VPS the userId is auto-generated as "NXV-XXXXXX", so
 *    searching userId="mulyono5" always returns 0 rows. We must search
 *    email/whatsapp/name instead.
 *
 *  Custom target:
 *    --user=<term>     search for a different user (any identifier)
 *    --apply           actually modify DB (default = dry-run)
 *
 *  What this script does:
 *    1. Find the target user across userId/whatsapp/email/name.
 *       If multiple matches, list them and exit (admin picks one with --user=).
 *    2. List all their active purchases; detect duplicate product IDs.
 *    3. (apply) Delete duplicate active purchases keeping only the LATEST
 *       one per productId (cascade profitLogs + nullify investment.purchaseId).
 *    4. (apply) Set the target's saldo to 0 (mainBalance, depositBalance,
 *       profitBalance all → 0). Stats (totalDeposit/totalWithdraw/
 *       totalProfit) NOT touched.
 *    5. Audit ALL other users: list every user with duplicate active
 *       purchases (same productId appears > 1 time with status='active').
 *
 *  Safety:
 *    - DRY-RUN by default. Will NOT modify anything.
 *    - Only the matched target's saldo + duplicates are touched when --apply.
 *    - Other users are reported, NOT auto-fixed.
 *    - Uses Prisma $transaction for atomicity.
 * ════════════════════════════════════════════════════════════════
 */
import { db } from '../src/lib/db';

const DEFAULT_SEARCH = 'mulyono5';
const APPLY = process.argv.includes('--apply');
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
  console.log(`  Mode       : ${APPLY ? '⚡ APPLY (will modify DB)' : '🔍 DRY-RUN (read-only)'}`);
  console.log(`  Search term: "${SEARCH_TERM}"`);
  console.log(`  Fields     : userId | whatsapp | email | name`);
  console.log('═══════════════════════════════════════════════════════════════\n');

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

  /* ─── 2. Detect duplicates for target ─── */
  const { activePurchases, duplicates } = await detectDuplicatesForUser(target.id);

  console.log(`📦 Active purchases: ${activePurchases.length} total`);
  console.log(`🔁 Duplicate groups: ${duplicates.length}`);
  if (duplicates.length > 0) {
    console.log('\n   ── DUPLICATE PACKAGES ──');
    for (const d of duplicates) {
      console.log(`\n   Product: "${d.productName}" (productId=${d.productId})`);
      console.log(`   Active count: ${d.count}`);
      d.purchases.forEach((p, idx) => {
        const tag = idx === 0 ? '✅ KEEP (latest)' : `❌ DELETE (dup #${idx + 1})`;
        console.log(`     ${tag} | ${p.id} | qty=${p.quantity} | total=${fmt(p.totalPrice)} | created=${ts(p.createdAt)} | profitEarned=${fmt(p.profitEarned)}`);
      });
    }
  } else {
    console.log('   ✅ Tidak ada duplikat untuk user ini.');
  }
  console.log();

  /* ─── 3. Apply fix for target ─── */
  if (APPLY) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ⚡ APPLY — Performing fix...');
    console.log('═══════════════════════════════════════════════════════════════\n');

    await db.$transaction(async (tx) => {
      // 3a. Delete duplicate purchases (keep latest per product)
      let totalDeleted = 0;
      for (const d of duplicates) {
        const toDelete = d.purchases.slice(1); // skip first (latest)
        const ids = toDelete.map((p) => p.id);
        if (ids.length === 0) continue;

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
  let totalDupeRecords = 0;

  for (const u of allUsers) {
    const { duplicates: userDupes } = await detectDuplicatesForUser(u.id);
    if (userDupes.length > 0) {
      usersWithDupes++;
      for (const d of userDupes) {
        totalDupeRecords += d.count - 1;
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
