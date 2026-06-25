/**
 * Quick fix script — force SalaryConfig to 1%/week PERMANEN (maxWeeks=0).
 * Run: bun run scripts/fix-salary-config.ts
 *
 * This kills any stale "2.5%" rate or "12 minggu" maxWeeks that an admin
 * (or old deploy) may have left in the DB.
 */
import { db } from '../src/lib/db';

async function main() {
  const existing = await db.salaryConfig.findFirst();

  const CORRECT = {
    minDirectRefs: 10,
    salaryRate: 1,
    maxWeeks: 0,
    requireActiveDeposit: true,
    fixedSalaryAmount: 25000,
    isActive: true,
  };

  if (existing) {
    const before = { salaryRate: existing.salaryRate, maxWeeks: existing.maxWeeks, minDirectRefs: existing.minDirectRefs };
    await db.salaryConfig.update({
      where: { id: existing.id },
      data: CORRECT,
    });
    console.log('✅ SalaryConfig FORCE-UPDATED');
    console.log('   BEFORE:', JSON.stringify(before));
    console.log('   AFTER :', JSON.stringify({ salaryRate: 1, maxWeeks: 0, minDirectRefs: 10 }));
  } else {
    await db.salaryConfig.create({ data: CORRECT });
    console.log('✅ SalaryConfig CREATED (1%/week PERMANEN — maxWeeks=0)');
  }

  const verify = await db.salaryConfig.findFirst();
  console.log('\nVerify:', JSON.stringify(verify, null, 2));
}

main()
  .catch((e) => { console.error('❌', e); process.exit(1); })
  .finally(() => process.exit(0));
