/**
 * ════════════════════════════════════════════════════════════════
 *  NEXVO — Test v20 ANTI-DOUBLE-PROFIT end-to-end
 * ════════════════════════════════════════════════════════════════
 *
 *  Simulasi masalah user:
 *    - Bikin user dengan 2 active Investments untuk aset yg sama (simulasi race condition)
 *    - Credit profit dobel ke user (simulasi cron yg kredit SEMUA active)
 *    - Cek user balance = dobel
 *    - Run cleanupDuplicateInvestmentsForUser (v20 fix)
 *    - Cek: 1 Investment jadi 'completed', profit dobel di-refund, user balance benar
 *
 *  Run: bun run scripts/test-anti-double-profit.ts
 * ════════════════════════════════════════════════════════════════
 */
import { db } from '../src/lib/db';
import {
  cleanupDuplicateInvestmentsForUser,
  detectDuplicateActiveInvestments,
} from '../src/lib/investment-cleanup';

const PASS: string[] = [];
const FAIL: string[] = [];
function check(name: string, cond: boolean) {
  (cond ? PASS : FAIL).push(name);
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}: ${name}`);
}

function fmt(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}

async function main() {
  console.log('━━━ TEST v20 ANTI-DOUBLE-PROFIT end-to-end ━━━\n');

  // Cari paket termurah buat test
  const pkgs = await db.investmentPackage.findMany({
    where: { amount: { gt: 0 }, isActive: true },
    orderBy: [{ amount: 'asc' }, { order: 'asc' }],
    select: { id: true, name: true, amount: true, profitRate: true, contractDays: true },
  });
  if (pkgs.length === 0) {
    console.log('❌ Tidak ada paket aktif untuk test. Abort.');
    process.exit(1);
  }
  const pkg = pkgs[0];
  console.log(`Paket test: ${pkg.name} (amount=${fmt(pkg.amount)}, rate=${pkg.profitRate}%, days=${pkg.contractDays})`);

  const dailyProfit = pkg.amount * (pkg.profitRate / 100);
  console.log(`Daily profit: ${fmt(dailyProfit)}/hari\n`);

  // Bikin test user
  const testUserId = `test-v20-${Date.now()}`;
  const testReferral = `REF-${testUserId}`;
  const user = await db.user.create({
    data: {
      userId: testUserId,
      whatsapp: testUserId,
      email: `${testUserId}@test.com`,
      password: 'x',
      plainPassword: 'x',
      name: 'Test V20',
      referralCode: testReferral,
      mainBalance: 1000000,
      depositBalance: 0,
      profitBalance: 0,
      totalDeposit: 1000000,
      totalWithdraw: 0,
      totalProfit: 0,
    },
  });
  console.log(`User test: ${user.userId} (id=${user.id}, mainBalance awal=${fmt(user.mainBalance)})`);

  try {
    // STEP 1: Simulasi RACE CONDITION — bikin 2 active Investments untuk aset yg sama
    console.log('\n── STEP 1: Simulasi race condition (bikin 2 Investment untuk aset 1) ──');
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + pkg.contractDays);

    const inv1 = await db.investment.create({
      data: {
        userId: user.id,
        packageId: pkg.id,
        amount: pkg.amount,
        dailyProfit,
        totalProfitEarned: 0,
        status: 'active',
        startDate,
        endDate,
        lastProfitDate: null,
      },
    });
    console.log(`  Investment 1 (older): ${inv1.id} createdAt=${inv1.createdAt.toISOString()}`);

    // Sedikit delay supaya createdAt beda
    await new Promise((r) => setTimeout(r, 50));

    const inv2 = await db.investment.create({
      data: {
        userId: user.id,
        packageId: pkg.id,
        amount: pkg.amount,
        dailyProfit,
        totalProfitEarned: 0,
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + pkg.contractDays * 86400000),
        lastProfitDate: null,
      },
    });
    console.log(`  Investment 2 (newer): ${inv2.id} createdAt=${inv2.createdAt.toISOString()}`);

    // STEP 2: Simulasi cron kredit profit dobel (cron kredit ke SEMUA active)
    console.log('\n── STEP 2: Simulasi cron kredit profit dobel (3 hari x 2 Investment) ──');
    const daysCredited = 3;
    const profitPerDayEach = dailyProfit * daysCredited;
    const totalDobel = profitPerDayEach * 2;

    await db.investment.update({
      where: { id: inv1.id },
      data: { totalProfitEarned: profitPerDayEach, lastProfitDate: new Date() },
    });
    await db.investment.update({
      where: { id: inv2.id },
      data: { totalProfitEarned: profitPerDayEach, lastProfitDate: new Date() },
    });
    await db.user.update({
      where: { id: user.id },
      data: {
        mainBalance: { increment: totalDobel },
        totalProfit: { increment: totalDobel },
      },
    });
    // BonusLog dobel (simulasi cron yg buat 2 entry per hari)
    for (let i = 0; i < daysCredited; i++) {
      await db.bonusLog.create({
        data: {
          userId: user.id,
          fromUserId: user.id,
          type: 'profit',
          level: 0,
          amount: dailyProfit,
          description: `Profit harian (inv 1) hari ke-${i + 1}`,
        },
      });
      await db.bonusLog.create({
        data: {
          userId: user.id,
          fromUserId: user.id,
          type: 'profit',
          level: 0,
          amount: dailyProfit,
          description: `Profit harian (inv 2) hari ke-${i + 1}`,
        },
      });
    }

    const userAfterDobel = await db.user.findUnique({ where: { id: user.id } });
    console.log(`  User balance setelah profit dobel: ${fmt(userAfterDobel!.mainBalance)} (totalProfit=${fmt(userAfterDobel!.totalProfit)})`);
    console.log(`  Expected dobel: +${fmt(totalDobel)} (${daysCredited} hari x 2 inv x ${fmt(dailyProfit)})`);

    check('User balance naik dobel (mainBalance)', userAfterDobel!.mainBalance === 1000000 + totalDobel);
    check('User totalProfit naik dobel', userAfterDobel!.totalProfit === totalDobel);

    // STEP 3: Detect duplicates
    console.log('\n── STEP 3: Detect duplicate active Investments ──');
    const groups = await detectDuplicateActiveInvestments(user.id);
    console.log(`  Groups detected: ${groups.length}`);
    for (const g of groups) {
      console.log(`    Asset ${g.assetIndex} "${g.assetName}": keep=${g.keep.id}, toRefund=${g.toRefund.length}`);
    }
    check('1 group detected (aset 1)', groups.length === 1);
    check('Keep = inv2 (newer)', groups[0]?.keep.id === inv2.id);
    check('toRefund = inv1 (older)', groups[0]?.toRefund.length === 1 && groups[0]?.toRefund[0].id === inv1.id);

    // STEP 4: Run v20 cleanup
    console.log('\n── STEP 4: Run v20 cleanupDuplicateInvestmentsForUser ──');
    const result = await cleanupDuplicateInvestmentsForUser(user.id, true);
    console.log(`  groupsFixed: ${result.groupsFixed}`);
    console.log(`  investmentsRefunded: ${result.investmentsRefunded}`);
    console.log(`  profitRefunded: ${fmt(result.profitRefunded)}`);
    console.log(`  purchasesMarkedCompleted: ${result.purchasesMarkedCompleted}`);

    check('1 group fixed', result.groupsFixed === 1);
    check('1 investment refunded (inv1)', result.investmentsRefunded === 1);
    check('Profit refunded = profitPerDayEach (3 hari)', result.profitRefunded === profitPerDayEach);
    check('0 purchases marked (no Purchase linked)', result.purchasesMarkedCompleted === 0);

    // STEP 5: Verify post-fix state
    console.log('\n── STEP 5: Verify post-fix state ──');
    const userAfter = await db.user.findUnique({ where: { id: user.id } });
    const inv1After = await db.investment.findUnique({ where: { id: inv1.id } });
    const inv2After = await db.investment.findUnique({ where: { id: inv2.id } });
    console.log(`  User mainBalance: ${fmt(userAfter!.mainBalance)} (expected ${fmt(1000000 + profitPerDayEach)})`);
    console.log(`  User totalProfit: ${fmt(userAfter!.totalProfit)} (expected ${fmt(profitPerDayEach)})`);
    console.log(`  Investment 1 (older): status=${inv1After!.status}, totalProfitEarned=${fmt(inv1After!.totalProfitEarned)}, endDate=${inv1After!.endDate?.toISOString()}`);
    console.log(`  Investment 2 (newer): status=${inv2After!.status}, totalProfitEarned=${fmt(inv2After!.totalProfitEarned)}, endDate=${inv2After!.endDate?.toISOString()}`);

    check('User balance kembali normal (1x profit)', userAfter!.mainBalance === 1000000 + profitPerDayEach);
    check('User totalProfit = 1x profit (bukan dobel)', userAfter!.totalProfit === profitPerDayEach);
    check('Investment 1 (older) status=completed', inv1After!.status === 'completed');
    check('Investment 1 endDate=now (cron skip)', inv1After!.endDate !== null && new Date(inv1After!.endDate!).getTime() <= Date.now() + 60000);
    check('Investment 2 (newer) tetap active', inv2After!.status === 'active');
    check('Investment 2 totalProfitEarned tetap utuh', inv2After!.totalProfitEarned === profitPerDayEach);

    // STEP 6: Verify BonusLog refund entry created
    const refundLogs = await db.bonusLog.findMany({
      where: { userId: user.id, type: 'refund' },
    });
    console.log(`\n  BonusLog refund entries: ${refundLogs.length}`);
    if (refundLogs.length > 0) {
      console.log(`    amount: ${refundLogs[0].amount}, desc: ${refundLogs[0].description}`);
    }
    check('1 BonusLog refund entry dibuat', refundLogs.length === 1);
    check('Refund amount = -profitPerDayEach (negative)', refundLogs[0]?.amount === -profitPerDayEach);

    // STEP 7: Idempotency test — run lagi, harus no-op
    console.log('\n── STEP 6: Idempotency test (run lagi) ──');
    const result2 = await cleanupDuplicateInvestmentsForUser(user.id, true);
    console.log(`  groupsFixed: ${result2.groupsFixed}, investmentsRefunded: ${result2.investmentsRefunded}`);
    check('Run ke-2 = no-op (0 groups)', result2.groupsFixed === 0);
    check('Run ke-2 = 0 refund', result2.investmentsRefunded === 0);

    const userFinal = await db.user.findUnique({ where: { id: user.id } });
    check('User balance tidak berubah setelah run ke-2', userFinal!.mainBalance === 1000000 + profitPerDayEach);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`HASIL: ${PASS.length} PASS, ${FAIL.length} FAIL`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    if (FAIL.length > 0) {
      console.log('GAGAL:');
      FAIL.forEach((f) => console.log(`  ✗ ${f}`));
    } else {
      console.log('✓ ALL PASS — v20 ANTI-DOUBLE-PROFIT bekerja sempurna!');
      console.log('  - Duplicate Investment detected (same asset, same user)');
      console.log('  - Older duplicate marked completed + endDate=now (cron skip)');
      console.log('  - Profit dobel di-refund dari User balance');
      console.log('  - BonusLog refund entry dibuat (audit trail)');
      console.log('  - Idempotent — run berkala aman');
    }
  } finally {
    // CLEANUP
    console.log('\n── Cleanup: hapus test data ──');
    await db.bonusLog.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.investment.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.purchase.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
    console.log('  Test data dihapus.');
  }

  if (FAIL.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
