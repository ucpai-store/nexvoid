/**
 * NUCLEAR fix — kill ALL stale SalaryConfig rows (2.5%/12 minggu) and create ONE clean config.
 * Run: bun run scripts/fix-salary-config.ts
 *
 * This handles:
 * - Multiple duplicate SalaryConfig rows (seed only updates first, API may read another)
 * - Stale 2.5% rate / 12 maxWeeks left by old admin settings or old deploys
 * - Any config with isActive: false that shouldn't be there
 */
import { db } from '../src/lib/db';

async function main() {
  // 1. Show ALL existing configs (so we can see what's wrong)
  const all = await db.salaryConfig.findMany({ orderBy: { updatedAt: 'asc' } });
  console.log(`\nFound ${all.length} SalaryConfig row(s) BEFORE fix:`);
  all.forEach((c, i) => {
    console.log(`  [${i}] id=${c.id} | rate=${c.salaryRate}% | maxWeeks=${c.maxWeeks} | minRefs=${c.minDirectRefs} | active=${c.isActive}`);
  });

  // 2. DELETE ALL existing configs (nuclear — no stale data survives)
  const deleted = await db.salaryConfig.deleteMany({});
  console.log(`\n🗑️  Deleted ${deleted.count} stale config(s)`);

  // 3. CREATE ONE clean config: 1%/week, PERMANEN (maxWeeks=0), min 10 refs
  const CORRECT = {
    minDirectRefs: 10,
    salaryRate: 1,
    maxWeeks: 0,
    requireActiveDeposit: true,
    fixedSalaryAmount: 25000,
    isActive: true,
  };
  await db.salaryConfig.create({ data: CORRECT });
  console.log('✅ Created ONE clean config: 1%/week PERMANEN (maxWeeks=0, min 10 refs)');

  // 4. Verify
  const verify = await db.salaryConfig.findMany();
  console.log(`\nAFTER fix: ${verify.length} config row(s):`);
  verify.forEach((c, i) => {
    console.log(`  [${i}] rate=${c.salaryRate}% | maxWeeks=${c.maxWeeks} | minRefs=${c.minDirectRefs} | active=${c.isActive}`);
  });

  console.log('\n🎉 Done. Refresh the salary page — 2.5% → 1%, 12 minggu → Selamanya.');
}

main()
  .catch((e) => { console.error('❌', e); process.exit(1); })
  .finally(() => process.exit(0));
