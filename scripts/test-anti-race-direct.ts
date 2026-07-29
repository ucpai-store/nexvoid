/**
 * ════════════════════════════════════════════════════════════════
 *  NEXVO — Test v20 ANTI-RACE-CONDITION (transaction simulation)
 * ════════════════════════════════════════════════════════════════
 *
 *  Test race condition secara langsung (tanpa HTTP):
 *    - Simulasi 2 request concurrent (Promise.all)
 *    - Tiap request: cek existing active Investment → insert kalau belum ada
 *    - v20: re-check di DALAM transaction
 *
 *  Test approach:
 *    - Bikin user kosong
 *    - Fire 2 "buy" operations concurrently (simulasi endpoint logic)
 *    - v20 logic: re-check inside tx, reject kalau ada same-asset active
 *    - Verify: cuma 1 Investment active di DB
 *
 *  Run: bun run scripts/test-anti-race-direct.ts
 * ════════════════════════════════════════════════════════════════
 */
import { db } from '../src/lib/db';
import { getPackageAssetIndex, getUserActiveAssets } from '../src/lib/tier-system';

const PASS: string[] = [];
const FAIL: string[] = [];
function check(name: string, cond: boolean) {
  (cond ? PASS : FAIL).push(name);
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}: ${name}`);
}

function fmt(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}

/**
 * Simulasi v20 anti-race-condition buy logic (sama dengan /api/investments POST):
 * - Re-check existing active Investment di DALAM transaction
 * - Compute asset index untuk existing dan THIS package
 * - Kalau same asset + still active → throw ASET_SAMA_AKTIF
 */
async function simulateBuyWithRaceGuard(user: { id: string; mainBalance: number }, pkg: { id: string; amount: number; profitRate: number; contractDays: number; name: string }) {
  return db.$transaction(async (tx) => {
    const txUser = await tx.user.findUnique({
      where: { id: user.id },
      select: { mainBalance: true, depositBalance: true },
    });
    if (!txUser) throw new Error('USER_NOT_FOUND');
    const totalAvailable = txUser.depositBalance + txUser.mainBalance;
    if (totalAvailable < pkg.amount) throw new Error('INSUFFICIENT_BALANCE');

    // ★★★ v20 ANTI-RACE-CONDITION: re-check duplicate DI DALAM transaction ★★★
    const existingActiveInvestment = await tx.investment.findFirst({
      where: { userId: user.id, status: 'active' },
      include: {
        purchase: { select: { product: { select: { id: true } } } },
        package: { select: { id: true, amount: true, isActive: true } },
      },
    });
    if (existingActiveInvestment) {
      // Compute asset index for existing
      let existingAssetIdx: number | null = null;
      if (existingActiveInvestment.purchaseId && existingActiveInvestment.purchase?.product?.id) {
        const allProducts = await tx.product.findMany({
          orderBy: [{ price: 'asc' }, { createdAt: 'asc' }],
          select: { id: true },
        });
        const idx = allProducts.findIndex((p) => p.id === existingActiveInvestment.purchase!.product!.id);
        if (idx >= 0) existingAssetIdx = idx + 1;
      } else if (existingActiveInvestment.package) {
        const allPkgs = await tx.investmentPackage.findMany({
          where: { amount: { gt: 0 }, isActive: true },
          orderBy: [{ amount: 'asc' }, { order: 'asc' }],
          select: { id: true },
        });
        const idx = allPkgs.findIndex((p) => p.id === existingActiveInvestment.package!.id);
        if (idx >= 0) existingAssetIdx = idx + 1;
      }
      // Compute asset index for THIS package
      const allPkgsNow = await tx.investmentPackage.findMany({
        where: { amount: { gt: 0 }, isActive: true },
        orderBy: [{ amount: 'asc' }, { order: 'asc' }],
        select: { id: true },
      });
      const thisIdx = allPkgsNow.findIndex((p) => p.id === pkg.id);
      const thisAssetIdx = thisIdx >= 0 ? thisIdx + 1 : null;
      if (existingAssetIdx !== null && thisAssetIdx !== null && existingAssetIdx === thisAssetIdx) {
        throw new Error(`ASET_SAMA_AKTIF: Aset "${pkg.name}" sedang aktif.`);
      }
    }

    // Deduct balance
    await tx.user.update({
      where: { id: user.id },
      data: { mainBalance: { decrement: pkg.amount } },
    });

    // Insert Investment
    const dailyProfit = pkg.amount * (pkg.profitRate / 100);
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + pkg.contractDays);
    const investment = await tx.investment.create({
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
    return { investmentId: investment.id };
  });
}

async function main() {
  console.log('━━━ TEST v20 ANTI-RACE-CONDITION (transaction simulation) ━━━\n');

  // Cari paket
  const pkgs = await db.investmentPackage.findMany({
    where: { amount: { gt: 0 }, isActive: true },
    orderBy: [{ amount: 'asc' }, { order: 'asc' }],
    select: { id: true, name: true, amount: true, profitRate: true, contractDays: true },
  });
  if (pkgs.length === 0) {
    console.log('❌ Tidak ada paket aktif.');
    process.exit(1);
  }
  const pkg = pkgs[0];
  console.log(`Paket test: ${pkg.name} (${fmt(pkg.amount)})`);

  // Bikin test user
  const testUserId = `race-direct-${Date.now()}`;
  const user = await db.user.create({
    data: {
      userId: testUserId,
      whatsapp: testUserId,
      email: `${testUserId}@test.com`,
      password: 'x',
      plainPassword: 'x',
      name: 'Race Direct',
      referralCode: `REF-${testUserId}`,
      mainBalance: pkg.amount * 10,
      depositBalance: 0,
      profitBalance: 0,
      totalDeposit: pkg.amount * 10,
      totalWithdraw: 0,
      totalProfit: 0,
      isVerified: true,
    },
  });
  console.log(`User: ${user.userId} (saldo=${fmt(user.mainBalance)})`);

  try {
    // STEP 1: Test tanpa race guard (OLD v19 logic — cek di luar tx)
    console.log('\n── TEST 1: Tanpa v20 race guard (v19 logic) — bikin dobel ──');
    const results1: Array<{ ok: boolean; err?: string }> = await Promise.all([
      (async () => {
        try {
          // v19 logic: cek di luar tx
          const activeAssets = await getUserActiveAssets(user.id);
          const pkgIdx = await getPackageAssetIndex(pkg.id);
          if (pkgIdx && activeAssets.has(pkgIdx)) {
            return { ok: false, err: 'Already active' };
          }
          await simulateBuyWithRaceGuard(user, pkg);
          return { ok: true };
        } catch (e: any) {
          return { ok: false, err: e.message };
        }
      })(),
      (async () => {
        try {
          const activeAssets = await getUserActiveAssets(user.id);
          const pkgIdx = await getPackageAssetIndex(pkg.id);
          if (pkgIdx && activeAssets.has(pkgIdx)) {
            return { ok: false, err: 'Already active' };
          }
          await simulateBuyWithRaceGuard(user, pkg);
          return { ok: true };
        } catch (e: any) {
          return { ok: false, err: e.message };
        }
      })(),
    ]);

    console.log(`  Result 1: ok=${results1[0].ok}, err="${results1[0].err?.substring(0, 50) || '-'}"`);
    console.log(`  Result 2: ok=${results1[1].ok}, err="${results1[1].err?.substring(0, 50) || '-'}"`);
    // Karena simulateBuyWithRaceGuard PUNYA race guard, salah satu harusnya reject
    const okCount1 = results1.filter((r) => r.ok).length;
    const errCount1 = results1.filter((r) => !r.ok).length;
    console.log(`  ok=${okCount1}, err=${errCount1}`);
    check('Race guard aktif: tepat 1 sukses, 1 reject (ASET_SAMA_AKTIF)', okCount1 === 1 && errCount1 === 1);
    check('Error reject = ASET_SAMA_AKTIF', errCount1 === 1 && results1.some((r) => r.err?.startsWith('ASET_SAMA_AKTIF')));

    // Verify: cuma 1 Investment active
    const activeInvs1 = await db.investment.findMany({
      where: { userId: user.id, status: 'active' },
    });
    console.log(`  Active Investments: ${activeInvs1.length}`);
    check('Cuma 1 Investment active (race condition blocked)', activeInvs1.length === 1);

    // STEP 2: Cleanup, lalu test kalau user beli beda aset (boleh)
    console.log('\n── TEST 2: Beli aset BEDA (VIP 2) — harusnya BOLEH ──');
    // Mark existing as completed dulu
    if (activeInvs1.length > 0) {
      await db.investment.update({
        where: { id: activeInvs1[0].id },
        data: { status: 'completed' },
      });
    }
    if (pkgs.length < 2) {
      console.log('  Skip TEST 2 (cuma 1 paket).');
    } else {
      const pkg2 = pkgs[1];
      console.log(`  Coba beli ${pkg2.name} (beda aset)`);
      const result2 = await simulateBuyWithRaceGuard(user, pkg2).catch((e) => ({ err: e.message }));
      console.log(`  Result: ${'err' in result2 ? `REJECT (${result2.err})` : 'OK'}`);
      check('Beli aset beda = BOLEH (multi-asset)', !('err' in result2));
      const activeInvs2 = await db.investment.findMany({
        where: { userId: user.id, status: 'active' },
      });
      check('Sekarang 1 Investment active (yg baru)', activeInvs2.length === 1);
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`HASIL: ${PASS.length} PASS, ${FAIL.length} FAIL`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    if (FAIL.length > 0) {
      console.log('GAGAL:');
      FAIL.forEach((f) => console.log(`  ✗ ${f}`));
    } else {
      console.log('✓ ALL PASS — v20 ANTI-RACE-CONDITION bekerja!');
      console.log('  - 2 request concurrent ke aset yg sama → 1 sukses, 1 reject');
      console.log('  - Re-check di DALAM transaction (SQLite serializable)');
      console.log('  - Multi-asset (beda aset) tetap BOLEH');
    }
  } finally {
    // Cleanup
    console.log('\n── Cleanup ──');
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
