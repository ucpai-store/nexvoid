#!/usr/bin/env bun
/**
 * Standalone Profit Cleanup Script
 *
 * Usage:
 *   bun run scripts/run-profit-cleanup.ts
 *
 * Runs the full cleanupDuplicateProfits() pipeline and prints a detailed report.
 * Safe to run multiple times (idempotent).
 *
 * What it does:
 *   1. Dedup BonusLog(type='profit') per (userId, WIB day)
 *   2. Recalculate Investment.totalProfitEarned from weekday progress
 *   3. Recalculate Purchase.profitEarned = sum(linked Investment.totalProfitEarned)
 *   4. Recalculate User.mainBalance & totalProfit (refund over-credit)
 */

import { cleanupDuplicateProfits } from '../src/lib/profit-cleanup';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  NEXVO Profit Cleanup — Standalone Runner');
  console.log('  Removes duplicate profit entries & recalculates balances');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const report = await cleanupDuplicateProfits();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  CLEANUP REPORT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Started:  ${report.startedAt.toISOString()}`);
  console.log(`  Finished: ${report.finishedAt?.toISOString()}`);
  console.log(`  Duration: ${report.durationMs}ms`);
  console.log('');
  console.log(`  BonusLog entries:      ${report.bonusLogBefore} → ${report.bonusLogAfter}`);
  console.log(`  Duplicates removed:    ${report.duplicateEntriesRemoved}`);
  console.log(`  Amount refunded:       Rp ${report.duplicateAmountRefunded.toLocaleString('id-ID')}`);
  console.log(`  Investments fixed:     ${report.investmentsRecalculated} (drift: ${report.investmentsDriftFixed})`);
  console.log(`  Purchases recalculated:${report.purchasesRecalculated}`);
  console.log(`  Users balance corrected:${report.usersBalanceCorrected}`);
  console.log(`  Total over-credit removed: Rp ${report.totalBalanceCorrected.toLocaleString('id-ID')}`);
  console.log(`  Errors:                ${report.errors.length}`);

  if (report.errors.length > 0) {
    console.log('\n  Errors:');
    for (const e of report.errors) console.log(`    - ${e}`);
  }

  if (report.details.duplicateGroups.length > 0) {
    console.log('\n  Duplicate groups (first 20):');
    for (const g of report.details.duplicateGroups.slice(0, 20)) {
      console.log(`    - ${g.userId} @ ${g.wibDay}: ${g.entriesBefore}→${g.entriesAfter} (refund Rp ${g.amountRefunded.toLocaleString('id-ID')})`);
    }
  }

  if (report.details.userBalance.length > 0) {
    console.log('\n  User balance corrections (first 20):');
    for (const u of report.details.userBalance.slice(0, 20)) {
      console.log(`    - ${u.userId}: main Rp ${u.beforeMain.toLocaleString('id-ID')} → Rp ${u.afterMain.toLocaleString('id-ID')} (-Rp ${u.corrected.toLocaleString('id-ID')})`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ✅ Cleanup complete');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch((e) => {
  console.error('❌ Cleanup failed:', e);
  process.exit(1);
});
