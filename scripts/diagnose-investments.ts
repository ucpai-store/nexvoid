/**
 * Diagnose why investments are still showing 'completed' or not crediting profit.
 * Run: bun run scripts/diagnose-investments.ts
 */
import { db } from '../src/lib/db';

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  NEXVO — Diagnose Investments');
  console.log('═══════════════════════════════════════════════════\n');

  // All investments grouped by status
  const all = await db.investment.findMany({
    include: { package: true, user: { select: { userId: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Total investments: ${all.length}`);
  const byStatus: Record<string, number> = {};
  for (const inv of all) {
    byStatus[inv.status] = (byStatus[inv.status] || 0) + 1;
  }
  console.log('By status:', byStatus);

  console.log('\n--- Last 15 investments (most recent) ---');
  for (const inv of all.slice(0, 15)) {
    const pkgName = inv.package?.name || '(no package)';
    const pkgRate = inv.package?.profitRate ?? 0;
    const pkgContractDays = inv.package?.contractDays ?? 0;
    console.log(`\n  [${inv.id}] status=${inv.status}`);
    console.log(`    user=${inv.user?.userId} | amount=${inv.amount} | storedDailyProfit=${inv.dailyProfit}`);
    console.log(`    package: name="${pkgName}" profitRate=${pkgRate}% contractDays=${pkgContractDays}`);
    console.log(`    startDate=${inv.startDate?.toISOString()}`);
    console.log(`    endDate=${inv.endDate?.toISOString()}`);
    console.log(`    lastProfitDate=${inv.lastProfitDate?.toISOString() || 'null'}`);
    console.log(`    totalProfitEarned=${inv.totalProfitEarned}`);
    
    // Derive expected daily profit
    const expectedDaily = inv.amount * (pkgRate / 100);
    const matches = Math.abs(expectedDaily - inv.dailyProfit) < 1;
    console.log(`    expectedDaily (amount×rate%)=${expectedDaily} | matches stored: ${matches ? 'YES ✅' : 'NO ❌'}`);
    
    // Check if endDate is in future
    const now = Date.now();
    const endMs = inv.endDate ? new Date(inv.endDate).getTime() : 0;
    const ended = endMs > 0 && endMs <= now;
    console.log(`    endDate in future: ${endMs > now ? 'YES ✅ (still active period)' : 'NO ❌ (expired or missing)'}`);
  }

  // Look for the specific bug pattern: completed but endDate in future
  const wronglyCompleted = all.filter(inv => {
    if (inv.status !== 'completed') return false;
    if (!inv.endDate) return false;
    return new Date(inv.endDate).getTime() > Date.now();
  });
  console.log(`\n--- WRONGLY COMPLETED (status=completed but endDate in future): ${wronglyCompleted.length} ---`);
  for (const inv of wronglyCompleted) {
    console.log(`  [${inv.id}] user=${inv.user?.userId} | storedDailyProfit=${inv.dailyProfit} | pkgRate=${inv.package?.profitRate}%`);
  }
}

main()
  .catch(console.error)
  .finally(async () => { await db.$disconnect(); });
