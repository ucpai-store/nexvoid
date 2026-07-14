/**
 * restore-saldo-v7.ts — COMPREHENSIVE SALDO RESTORE
 *
 * Formula "pendapatan yang bener" (match dengan My Assets page):
 *
 *   pendapatan_user = MAX(
 *     SUM(BonusLog.amount WHERE type IN profit/referral/matching/salary),
 *     SUM(Investment.totalProfitEarned) +
 *       SUM(Purchase.profitEarned for purchases WITHOUT linked Investment) +
 *       SUM(SalaryBonus.amount) +
 *       SUM(MatchingBonus.amount) +
 *       SUM(BonusLog.amount WHERE type='referral')
 *   )
 *
 *   correctMainBalance = MAX(0, pendapatan_user - SUM(Withdrawal WHERE status != rejected))
 *   correctTotalProfit = pendapatan_user
 *
 * Mode:
 *   - Default: DRY RUN (read-only, show what would change)
 *   - --apply: actually update User table
 *
 * Usage:
 *   bun run deploy-fix/restore-saldo-v7.ts            # DRY RUN
 *   bun run deploy-fix/restore-saldo-v7.ts --apply    # APPLY
 */

import { db } from '../src/lib/db';

async function main() {
  const apply = process.argv.includes('--apply');
  console.log('════════════════════════════════════════════════');
  console.log('🚨 NEXVO COMPREHENSIVE SALDO RESTORE v7.0');
  console.log('════════════════════════════════════════════════');
  console.log(`Mode: ${apply ? '🟥 APPLY' : '🟢 DRY RUN (read-only)'}`);
  console.log('');

  // 1. All users
  const users = await db.user.findMany({
    select: { id: true, userId: true, name: true, whatsapp: true, mainBalance: true, totalProfit: true },
  });
  console.log(`[1/6] Users: ${users.length}`);

  // 2. Source A: BonusLog sum (all bonus types)
  const bonusAgg = await db.bonusLog.groupBy({
    by: ['userId'],
    where: { type: { in: ['profit', 'referral', 'matching', 'salary'] } },
    _sum: { amount: true },
  });
  const bonusByUser = new Map<string, number>();
  for (const a of bonusAgg) bonusByUser.set(a.userId, a._sum.amount || 0);
  console.log(`[2/6] BonusLog sum (all types): ${bonusByUser.size} users`);

  // 3. Source B: Investment.totalProfitEarned
  const invAgg = await db.investment.groupBy({
    by: ['userId'],
    _sum: { totalProfitEarned: true },
  });
  const invByUser = new Map<string, number>();
  for (const a of invAgg) invByUser.set(a.userId, a._sum.totalProfitEarned || 0);
  console.log(`[3/6] Investment.totalProfitEarned: ${invByUser.size} users`);

  // 4. Source C: Standalone Purchase.profitEarned (without linked Investment)
  const linkedPurchaseIds = new Set<string>(
    (await db.investment.findMany({
      where: { purchaseId: { not: null } },
      select: { purchaseId: true },
      distinct: ['purchaseId'],
    }))
      .map((i) => i.purchaseId!)
      .filter(Boolean)
  );
  const allPurchases = await db.purchase.findMany({
    select: { id: true, userId: true, profitEarned: true },
  });
  const purchaseByUser = new Map<string, number>();
  let standaloneCount = 0;
  for (const p of allPurchases) {
    if (linkedPurchaseIds.has(p.id)) continue;
    if ((p.profitEarned || 0) <= 0) continue;
    standaloneCount++;
    purchaseByUser.set(p.userId, (purchaseByUser.get(p.userId) || 0) + (p.profitEarned || 0));
  }
  console.log(`[4/6] Standalone Purchase.profitEarned: ${standaloneCount} purchases, ${purchaseByUser.size} users`);

  // 5. Source D: SalaryBonus + MatchingBonus + BonusLog referral
  const salaryAgg = await db.salaryBonus.groupBy({
    by: ['userId'],
    where: { status: 'paid' },
    _sum: { amount: true },
  });
  const salaryByUser = new Map<string, number>();
  for (const a of salaryAgg) salaryByUser.set(a.userId, a._sum.amount || 0);

  const matchingAgg = await db.matchingBonus.groupBy({
    by: ['userId'],
    where: { status: 'paid' },
    _sum: { amount: true },
  });
  const matchingByUser = new Map<string, number>();
  for (const a of matchingAgg) matchingByUser.set(a.userId, a._sum.amount || 0);

  const referralAgg = await db.bonusLog.groupBy({
    by: ['userId'],
    where: { type: 'referral' },
    _sum: { amount: true },
  });
  const referralByUser = new Map<string, number>();
  for (const a of referralAgg) referralByUser.set(a.userId, a._sum.amount || 0);
  console.log(`[5/6] SalaryBonus: ${salaryByUser.size} | MatchingBonus: ${matchingByUser.size} | Referral: ${referralByUser.size}`);

  // 6. Withdrawals (non-rejected)
  const wdAgg = await db.withdrawal.groupBy({
    by: ['userId'],
    where: { status: { not: 'rejected' } },
    _sum: { amount: true },
  });
  const wdByUser = new Map<string, number>();
  for (const a of wdAgg) wdByUser.set(a.userId, a._sum.amount || 0);
  console.log(`[6/6] Withdrawals (non-rejected): ${wdByUser.size} users`);

  // Compute correct pendapatan per user
  let needFix = 0;
  let alreadyCorrect = 0;
  const fixes: Array<{
    userId: string; name: string; wa: string;
    srcA_bonus: number; srcB_assets: number;
    pendapatan: number; withdrawals: number;
    beforeMain: number; afterMain: number;
    beforeTotal: number; afterTotal: number;
  }> = [];

  for (const u of users) {
    const srcA = bonusByUser.get(u.id) || 0;
    const srcB =
      (invByUser.get(u.id) || 0) +
      (purchaseByUser.get(u.id) || 0) +
      (salaryByUser.get(u.id) || 0) +
      (matchingByUser.get(u.id) || 0) +
      (referralByUser.get(u.id) || 0);
    // Take MAX as correct pendapatan (most generous — won't under-credit user)
    const pendapatan = Math.max(srcA, srcB);
    const withdrawals = wdByUser.get(u.id) || 0;
    const correctMain = Math.max(0, pendapatan - withdrawals);
    const correctTotal = pendapatan;

    const driftMain = Math.abs(u.mainBalance - correctMain);
    const driftTotal = Math.abs(u.totalProfit - correctTotal);
    if (driftMain < 1 && driftTotal < 1) {
      alreadyCorrect++;
      continue;
    }
    needFix++;
    fixes.push({
      userId: u.userId, name: u.name || '(no name)', wa: u.whatsapp,
      srcA_bonus: srcA, srcB_assets: srcB,
      pendapatan, withdrawals,
      beforeMain: u.mainBalance, afterMain: correctMain,
      beforeTotal: u.totalProfit, afterTotal: correctTotal,
    });
  }

  console.log('');
  console.log('────────────────────────────────────────────────');
  console.log(`📊 SUMMARY:`);
  console.log(`   Total users:          ${users.length}`);
  console.log(`   ✅ Already correct:   ${alreadyCorrect}`);
  console.log(`   🟥 Need restoration:  ${needFix}`);
  console.log('────────────────────────────────────────────────');
  console.log('');

  if (needFix === 0) {
    console.log('✅ All users already correct. Nothing to restore.');
    return;
  }

  // Show first 30 users
  console.log(`📋 First 30 users that need restoration:`);
  console.log('');
  for (const f of fixes.slice(0, 30)) {
    const srcLabel = f.srcA_bonus >= f.srcB_assets ? 'BonusLog' : 'Assets';
    console.log(`  ${f.userId} | ${f.name} | ${f.wa}`);
    console.log(`    Source: ${srcLabel} (BonusLog=${f.srcA_bonus}, Assets=${f.srcB_assets})`);
    console.log(`    Pendapatan: Rp ${f.pendapatan.toLocaleString('id-ID')} | Withdraw: Rp ${f.withdrawals.toLocaleString('id-ID')}`);
    console.log(`    Saldo:  Rp ${f.beforeMain.toLocaleString('id-ID')} → Rp ${f.afterMain.toLocaleString('id-ID')}`);
    console.log(`    Profit: Rp ${f.beforeTotal.toLocaleString('id-ID')} → Rp ${f.afterTotal.toLocaleString('id-ID')}`);
    console.log('');
  }
  if (fixes.length > 30) console.log(`  ... and ${fixes.length - 30} more users\n`);

  if (!apply) {
    console.log('────────────────────────────────────────────────');
    console.log('🟢 DRY RUN complete. No data changed.');
    console.log('');
    console.log('To APPLY restoration, run:');
    console.log('  bun run deploy-fix/restore-saldo-v7.ts --apply');
    console.log('────────────────────────────────────────────────');
    return;
  }

  // APPLY
  console.log('────────────────────────────────────────────────');
  console.log('🟥 APPLYING RESTORATION...');
  console.log('────────────────────────────────────────────────');
  let applied = 0, failed = 0;
  for (const u of users) {
    const srcA = bonusByUser.get(u.id) || 0;
    const srcB =
      (invByUser.get(u.id) || 0) +
      (purchaseByUser.get(u.id) || 0) +
      (salaryByUser.get(u.id) || 0) +
      (matchingByUser.get(u.id) || 0) +
      (referralByUser.get(u.id) || 0);
    const pendapatan = Math.max(srcA, srcB);
    const withdrawals = wdByUser.get(u.id) || 0;
    const correctMain = Math.max(0, pendapatan - withdrawals);
    const correctTotal = pendapatan;
    const driftMain = Math.abs(u.mainBalance - correctMain);
    const driftTotal = Math.abs(u.totalProfit - correctTotal);
    if (driftMain < 1 && driftTotal < 1) continue;
    try {
      await db.user.update({
        where: { id: u.id },
        data: { mainBalance: correctMain, totalProfit: correctTotal },
      });
      applied++;
      if (applied % 50 === 0) console.log(`  Restored ${applied}/${needFix}...`);
    } catch (e: any) {
      failed++;
      console.error(`  ❌ Failed: ${u.userId} — ${e.message}`);
    }
  }
  console.log('');
  console.log('════════════════════════════════════════════════');
  console.log(`✅ RESTORE COMPLETE`);
  console.log(`   Applied: ${applied} users`);
  console.log(`   Failed:  ${failed} users`);
  console.log('════════════════════════════════════════════════');
  console.log('Next: pm2 restart nexvo-cron  (cron code already fixed, won\'t wipe again)');
}

main()
  .catch((e) => { console.error('FATAL:', e); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
