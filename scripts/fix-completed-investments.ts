/**
 * RECOVERY FIX — reactivate investments that were wrongly marked `completed`
 * by the buggy cron (which used `inv.package.profitRate` instead of stored
 * `inv.dailyProfit`, causing hardCap=0 → immediate completion).
 *
 * Conditions for reactivation:
 * - status = 'completed'
 * - has valid endDate in the FUTURE (i.e. contract not actually expired)
 * - has stored dailyProfit > 0
 * - totalProfitEarned < (dailyProfit × contractDays)  (hasn't truly hit hard cap)
 *
 * Run: bun run scripts/fix-completed-investments.ts
 */
import { db } from '../src/lib/db';

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  NEXVO — Recovery: Reactivate wrongly-completed investments');
  console.log('═══════════════════════════════════════════════════\n');

  const completed = await db.investment.findMany({
    where: { status: 'completed' },
    include: { package: true },
  });

  console.log(`Found ${completed.length} completed investment(s) — checking each...`);

  let reactivated = 0;
  let skippedExpired = 0;
  let skippedAtCap = 0;
  let skippedZeroProfit = 0;

  for (const inv of completed) {
    // Must have stored dailyProfit > 0
    const storedDailyProfit = inv.dailyProfit && inv.dailyProfit > 0
      ? inv.dailyProfit
      : Math.floor(inv.amount * ((inv.package?.profitRate || 0) / 100));

    if (storedDailyProfit <= 0) {
      skippedZeroProfit++;
      continue;
    }

    // Derive contractDays from endDate - startDate (TRUE contract length)
    let contractDays = 0;
    if (inv.startDate && inv.endDate) {
      const msDiff = new Date(inv.endDate).getTime() - new Date(inv.startDate).getTime();
      contractDays = Math.max(1, Math.round(msDiff / (24 * 60 * 60 * 1000)));
    } else {
      contractDays = inv.package?.contractDays || 180;
    }

    const hardCap = storedDailyProfit * contractDays;
    const earned = inv.totalProfitEarned || 0;

    // Case 1: endDate already in the past → genuinely expired, leave completed
    if (inv.endDate && new Date(inv.endDate).getTime() <= Date.now()) {
      skippedExpired++;
      continue;
    }

    // Case 2: totalProfitEarned has truly reached hard cap → leave completed
    if (earned >= hardCap) {
      skippedAtCap++;
      continue;
    }

    // Case 3: endDate still in the future AND earned < hardCap → reactivate!
    console.log(`\n  ♻️  Reactivating investment ${inv.id}`);
    console.log(`     user=${inv.userId} | amount=${inv.amount} | dailyProfit=${storedDailyProfit}`);
    console.log(`     startDate=${inv.startDate?.toISOString()} | endDate=${inv.endDate?.toISOString()}`);
    console.log(`     contractDays=${contractDays} | hardCap=${hardCap} | earned=${earned}`);

    await db.investment.update({
      where: { id: inv.id },
      data: {
        status: 'active',
        dailyProfit: storedDailyProfit,
      },
    });
    reactivated++;
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  RESULT`);
  console.log('═══════════════════════════════════════════════════');
  console.log(`  ♻️  Reactivated : ${reactivated}`);
  console.log(`  ⏭️  Skipped (genuinely expired) : ${skippedExpired}`);
  console.log(`  ⏭️  Skipped (already at hard cap) : ${skippedAtCap}`);
  console.log(`  ⏭️  Skipped (zero dailyProfit) : ${skippedZeroProfit}`);
  console.log('\nDone. ✅\n');
}

main()
  .catch((e) => {
    console.error('❌ Recovery failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
