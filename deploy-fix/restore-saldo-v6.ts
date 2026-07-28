/**
 * restore-saldo-v6.ts
 *
 * EMERGENCY RESTORE SCRIPT — restores all users' mainBalance & totalProfit
 * from BonusLog ground truth, after the buggy profit-cleanup.ts wiped them.
 *
 * Formula (per user):
 *   correctTotalProfit = SUM(BonusLog.amount WHERE type IN ('profit','referral','matching','salary'))
 *   withdrawalsAmount  = SUM(Withdrawal.amount WHERE status != 'rejected')
 *   correctMainBalance = MAX(0, correctTotalProfit - withdrawalsAmount)
 *
 * IMPORTANT:
 *   - READ-ONLY check first by default (DRY RUN)
 *   - Will NOT change anything until you pass --apply
 *   - Logs every user that will change with before/after values
 *
 * Usage:
 *   bun run deploy-fix/restore-saldo-v6.ts              # DRY RUN (just check)
 *   bun run deploy-fix/restore-saldo-v6.ts --apply      # actually fix
 */

import { db } from '../src/lib/db';

const BONUS_TYPES = ['profit', 'referral', 'matching', 'salary'] as const;

async function main() {
  const apply = process.argv.includes('--apply');
  console.log('================================================');
  console.log('🚨 NEXVO EMERGENCY SALDO RESTORE v6.0');
  console.log('================================================');
  console.log(`Mode: ${apply ? '🟥 APPLY (will change data)' : '🟢 DRY RUN (read-only)'}`);
  console.log('');

  // Step 1: Get all users
  const users = await db.user.findMany({
    select: {
      id: true,
      userId: true,
      name: true,
      whatsapp: true,
      mainBalance: true,
      totalProfit: true,
    },
  });
  console.log(`[1/4] Found ${users.length} users`);

  // Step 2: Sum ALL bonus types per user (ground truth for totalProfit)
  const bonusAgg = await db.bonusLog.groupBy({
    by: ['userId'],
    where: { type: { in: [...BONUS_TYPES] } },
    _sum: { amount: true },
  });
  const bonusByUser = new Map<string, number>();
  for (const a of bonusAgg) {
    bonusByUser.set(a.userId, a._sum.amount || 0);
  }
  console.log(`[2/4] Found ${bonusByUser.size} users with bonus entries`);

  // Step 3: Sum all non-rejected withdrawals per user
  const withdrawAgg = await db.withdrawal.groupBy({
    by: ['userId'],
    where: { status: { not: 'rejected' } },
    _sum: { amount: true },
  });
  const withdrawByUser = new Map<string, number>();
  for (const a of withdrawAgg) {
    withdrawByUser.set(a.userId, a._sum.amount || 0);
  }
  console.log(`[3/4] Found ${withdrawByUser.size} users with withdrawals`);

  // Step 4: Compute correct values & restore
  console.log(`[4/4] Computing correct balances...`);
  console.log('');

  let needFix = 0;
  let alreadyCorrect = 0;
  let totalDrift = 0;
  const fixes: Array<{
    userId: string;
    name: string;
    whatsapp: string;
    beforeMain: number;
    afterMain: number;
    beforeTotal: number;
    afterTotal: number;
  }> = [];

  for (const u of users) {
    const correctTotalProfit = bonusByUser.get(u.id) || 0;
    const withdrawals = withdrawByUser.get(u.id) || 0;
    const correctMainBalance = Math.max(0, correctTotalProfit - withdrawals);

    const driftMain = Math.abs(u.mainBalance - correctMainBalance);
    const driftTotal = Math.abs(u.totalProfit - correctTotalProfit);

    if (driftMain < 1 && driftTotal < 1) {
      alreadyCorrect++;
      continue;
    }

    needFix++;
    totalDrift += driftMain;
    fixes.push({
      userId: u.userId,
      name: u.name || '(no name)',
      whatsapp: u.whatsapp,
      beforeMain: u.mainBalance,
      afterMain: correctMainBalance,
      beforeTotal: u.totalProfit,
      afterTotal: correctTotalProfit,
    });
  }

  // Print summary
  console.log('────────────────────────────────────────────────');
  console.log(`📊 SUMMARY:`);
  console.log(`   Total users:           ${users.length}`);
  console.log(`   ✅ Already correct:    ${alreadyCorrect}`);
  console.log(`   🟥 Need restoration:   ${needFix}`);
  console.log(`   💰 Total drift:        Rp ${totalDrift.toLocaleString('id-ID')}`);
  console.log('────────────────────────────────────────────────');
  console.log('');

  if (needFix === 0) {
    console.log('✅ All users already correct. No action needed.');
    return;
  }

  // Show first 20 users that need fixing
  console.log(`📋 First 20 users that need restoration:`);
  console.log('');
  for (const f of fixes.slice(0, 20)) {
    console.log(`  ${f.userId} | ${f.name}`);
    console.log(`    WA: ${f.whatsapp}`);
    console.log(`    Saldo:    Rp ${f.beforeMain.toLocaleString('id-ID')} → Rp ${f.afterMain.toLocaleString('id-ID')}`);
    console.log(`    Profit:   Rp ${f.beforeTotal.toLocaleString('id-ID')} → Rp ${f.afterTotal.toLocaleString('id-ID')}`);
    console.log('');
  }
  if (fixes.length > 20) {
    console.log(`  ... and ${fixes.length - 20} more users`);
    console.log('');
  }

  if (!apply) {
    console.log('────────────────────────────────────────────────');
    console.log('🟢 DRY RUN complete. No data was changed.');
    console.log('');
    console.log('To ACTUALLY restore, run:');
    console.log('  bun run deploy-fix/restore-saldo-v6.ts --apply');
    console.log('────────────────────────────────────────────────');
    return;
  }

  // APPLY
  console.log('────────────────────────────────────────────────');
  console.log('🟥 APPLYING RESTORATION...');
  console.log('────────────────────────────────────────────────');

  let applied = 0;
  let failed = 0;
  for (const u of users) {
    const correctTotalProfit = bonusByUser.get(u.id) || 0;
    const withdrawals = withdrawByUser.get(u.id) || 0;
    const correctMainBalance = Math.max(0, correctTotalProfit - withdrawals);

    const driftMain = Math.abs(u.mainBalance - correctMainBalance);
    const driftTotal = Math.abs(u.totalProfit - correctTotalProfit);
    if (driftMain < 1 && driftTotal < 1) continue;

    try {
      await db.user.update({
        where: { id: u.id },
        data: {
          mainBalance: correctMainBalance,
          totalProfit: correctTotalProfit,
        },
      });
      applied++;
      if (applied % 50 === 0) {
        console.log(`  Restored ${applied}/${needFix} users...`);
      }
    } catch (e: any) {
      failed++;
      console.error(`  ❌ Failed: ${u.userId} (${u.name}) — ${e.message}`);
    }
  }

  console.log('');
  console.log('════════════════════════════════════════════════');
  console.log(`✅ RESTORATION COMPLETE`);
  console.log(`   Applied: ${applied} users`);
  console.log(`   Failed:  ${failed} users`);
  console.log('════════════════════════════════════════════════');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Verify in admin → Users page (check random user saldo)');
  console.log('  2. Restart cron: pm2 restart nexvo-cron');
  console.log('     (cron now uses FIXED code — will NOT wipe again)');
  console.log('════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
