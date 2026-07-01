/**
 * ★★★ FIX DEFINITIF: RECALCULATE mainBalance & totalProfit DARI GROUND TRUTH ★★★
 *
 * Masalah:
 *   - User.mainBalance drift (lebih kecil dari seharusnya)
 *   - User.totalProfit drift
 *   - Cleanup lama cuma sync ke BonusLog — TIDAK cukup karena BonusLog juga bisa incomplete
 *
 * Solusi:
 *   - totalProfit seharusnya = sum(Investment.totalProfitEarned) + sum(BonusLog non-profit)
 *     (profit harian sudah ada di Investment.totalProfitEarned — itu ground truth paling akurat)
 *     (matching/referral/salary ambil dari BonusLog)
 *   - mainBalance seharusnya = totalProfit - totalWithdraw
 *     (saldo utama = semua profit yang sudah masuk - yang sudah ditarik)
 *
 * Safety:
 *   - Hanya update user yang drift (> Rp 1 selisih)
 *   - Print before/after untuk audit
 *   - Idempotent — running 2x = no-op
 *
 * Usage:
 *   bun run scripts/fix-saldo-drift.ts
 *   bun run scripts/fix-saldo-drift.ts --dry-run    (preview tanpa ubah)
 */

import { db } from '../src/lib/db';

const WIB_OFFSET = 7;

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  FIX SALDO DRIFT — ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE RUN'}`);
  console.log(`═══════════════════════════════════════════════════\n`);

  // 1. Aggregate Investment.totalProfitEarned per user (ground truth for daily profit)
  const invAgg = await db.investment.groupBy({
    by: ['userId'],
    _sum: { totalProfitEarned: true },
  });
  const invByUser = new Map<string, number>();
  for (const a of invAgg) {
    invByUser.set(a.userId, a._sum.totalProfitEarned || 0);
  }
  console.log(`[STEP 1] Found ${invAgg.length} users with Investment.totalProfitEarned records`);

  // 2. Aggregate BonusLog (NON-profit types: matching + referral + salary) per user
  //    (profit type sudah tercatat di Investment.totalProfitEarned — jangan dihitung dobel)
  const bonusAgg = await db.bonusLog.groupBy({
    by: ['userId'],
    where: { type: { in: ['matching', 'referral', 'salary'] } },
    _sum: { amount: true },
  });
  const bonusByUser = new Map<string, number>();
  for (const a of bonusAgg) {
    bonusByUser.set(a.userId, a._sum.amount || 0);
  }
  console.log(`[STEP 2] Found ${bonusAgg.length} users with non-profit BonusLogs (matching+referral+salary)`);

  // 3. For each user, recalculate
  const users = await db.user.findMany({
    select: {
      id: true, userId: true, name: true, whatsapp: true,
      mainBalance: true, totalProfit: true, totalWithdraw: true,
    },
  });
  console.log(`[STEP 3] Checking ${users.length} users...\n`);

  let fixedCount = 0;
  let totalDriftFixed = 0;
  const fixes: Array<{
    userId: string; name: string;
    mainBefore: number; mainAfter: number;
    profitBefore: number; profitAfter: number;
    totalWithdraw: number;
    invEarned: number; bonusEarned: number;
  }> = [];

  for (const u of users) {
    const invEarned = invByUser.get(u.id) || 0;
    const bonusEarned = bonusByUser.get(u.id) || 0;
    const expectedTotalProfit = invEarned + bonusEarned;
    const expectedMainBalance = Math.max(0, expectedTotalProfit - u.totalWithdraw);

    const profitDrift = expectedTotalProfit - u.totalProfit;
    const mainDrift = expectedMainBalance - u.mainBalance;

    if (Math.abs(profitDrift) < 2 && Math.abs(mainDrift) < 2) continue;

    fixedCount++;
    totalDriftFixed += Math.abs(mainDrift);

    fixes.push({
      userId: u.userId,
      name: u.name,
      mainBefore: u.mainBalance,
      mainAfter: expectedMainBalance,
      profitBefore: u.totalProfit,
      profitAfter: expectedTotalProfit,
      totalWithdraw: u.totalWithdraw,
      invEarned,
      bonusEarned,
    });

    console.log(`👤 ${u.userId} (${u.name || u.whatsapp})`);
    console.log(`   Investment.totalProfitEarned sum:  ${formatRp(invEarned)}`);
    console.log(`   BonusLog (matching+ref+salary):    ${formatRp(bonusEarned)}`);
    console.log(`   Expected totalProfit:              ${formatRp(expectedTotalProfit)}`);
    console.log(`   Current totalProfit:               ${formatRp(u.totalProfit)}  →  ${formatRp(expectedTotalProfit)}  (drift ${formatRp(profitDrift)})`);
    console.log(`   totalWithdraw:                     ${formatRp(u.totalWithdraw)}`);
    console.log(`   Expected mainBalance:              ${formatRp(expectedMainBalance)}`);
    console.log(`   Current mainBalance:               ${formatRp(u.mainBalance)}  →  ${formatRp(expectedMainBalance)}  (drift ${formatRp(mainDrift)})`);

    if (!isDryRun) {
      await db.user.update({
        where: { id: u.id },
        data: {
          totalProfit: expectedTotalProfit,
          mainBalance: expectedMainBalance,
        },
      });
      console.log(`   ✅ UPDATED`);
    } else {
      console.log(`   ⏸️  DRY RUN — no changes made`);
    }
    console.log('');
  }

  console.log(`═══════════════════════════════════════════════════`);
  console.log(`  HASIL ${isDryRun ? '(DRY RUN)' : '(LIVE)'}`);
  console.log(`═══════════════════════════════════════════════════`);
  console.log(`  Total user diperiksa:    ${users.length}`);
  console.log(`  User dengan drift:       ${fixedCount}`);
  console.log(`  Total drift di-fix:      ${formatRp(totalDriftFixed)}`);
  if (!isDryRun && fixedCount > 0) {
    console.log(`  ✅ SEMUA SALDO SUDAH DI-RECALCULATE`);
    console.log(`  💡 Refresh aplikasi — saldo utama & total profit sudah balanced`);
  } else if (isDryRun && fixedCount > 0) {
    console.log(`  💡 Jalankan tanpa --dry-run untuk apply fix`);
  } else {
    console.log(`  ✅ Semua user sudah balanced — tidak ada drift`);
  }
  console.log(`═══════════════════════════════════════════════════\n`);
}

function formatRp(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}Rp${Math.floor(Math.abs(n)).toLocaleString('id-ID')}`;
}

main()
  .catch((e) => { console.error('❌ ERROR:', e); process.exit(1); })
  .finally(() => process.exit(0));
