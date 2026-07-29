/**
 * ════════════════════════════════════════════════════════════════
 *  NEXVO — Verify v19 handles VIP 4, VIP 5, VIP 6+ (lebih dari 3 tier)
 * ════════════════════════════════════════════════════════════════
 *
 *  User clarification: "kan ada yang lebih juga sampek vip 4 5 tu biarin
 *  cuman yang dobel sam tu kamu perbaiki itu aja"
 *
 *  → v19 asset index is computed dynamically (NOT hardcoded to 3).
 *    If DB has 5 packages + 5 products → indices are 1..5.
 *    User can have VIP1+VIP2+VIP3+VIP4+VIP5 all active (different assets).
 *    Only same-asset duplicates are blocked.
 *
 *  This script:
 *    1. Saves existing package/product state
 *    2. Creates extra packages (VIP 4, VIP 5) + products (Aset 4, 5)
 *    3. Verifies getPackageAssetIndex returns 4, 5 (not capped at 3)
 *    4. Verifies getProductAssetIndex returns 4, 5
 *    5. Cleans up (deletes the extra test packages/products)
 * ════════════════════════════════════════════════════════════════
 */
import { db } from '../src/lib/db';
import {
  getPackageAssetIndex,
  getProductAssetIndex,
} from '../src/lib/tier-system';

const PASS: string[] = [];
const FAIL: string[] = [];
function check(name: string, cond: boolean) {
  (cond ? PASS : FAIL).push(name);
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}: ${name}`);
}

async function main() {
  console.log('━━━ TEST: v19 handle VIP 4, VIP 5+ (lebih dari 3 tier) ━━━\n');

  // ── 1. Cek state awal ──
  const beforeProducts = await db.product.findMany({
    orderBy: [{ price: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, price: true },
  });
  const beforePkgs = await db.investmentPackage.findMany({
    where: { amount: { gt: 0 }, isActive: true },
    orderBy: [{ amount: 'asc' }, { order: 'asc' }],
    select: { id: true, name: true, amount: true },
  });
  console.log(`Sebelum: ${beforeProducts.length} produk, ${beforePkgs.length} paket`);
  console.log(`  Produk: ${beforeProducts.map((p) => `${p.name}(Rp${p.price})`).join(', ')}`);
  console.log(`  Paket:  ${beforePkgs.map((p) => `${p.name}(Rp${p.amount})`).join(', ')}`);

  // ── 2. Bikin extra test paket (VIP 4, VIP 5) + produk (Aset 4, Aset 5) ──
  const testPkgIds: string[] = [];
  const testProductIds: string[] = [];
  const highestAmount = beforePkgs[beforePkgs.length - 1]?.amount ?? 100000;
  const highestPrice = beforeProducts[beforeProducts.length - 1]?.price ?? 100000;

  try {
    // Paket VIP 4
    const pkg4 = await db.investmentPackage.create({
      data: {
        name: 'TEST VIP 4 (verify-multi-tier)',
        amount: highestAmount + 100000,
        profitRate: 2,
        contractDays: 90,
        order: 4,
        isActive: true,
      },
    });
    testPkgIds.push(pkg4.id);

    // Paket VIP 5
    const pkg5 = await db.investmentPackage.create({
      data: {
        name: 'TEST VIP 5 (verify-multi-tier)',
        amount: highestAmount + 200000,
        profitRate: 2.5,
        contractDays: 90,
        order: 5,
        isActive: true,
      },
    });
    testPkgIds.push(pkg5.id);

    // Produk Aset 4
    const prod4 = await db.product.create({
      data: {
        name: 'TEST Produk Aset 4 (verify-multi-tier)',
        price: highestPrice + 100000,
        profitRate: 2,
        duration: 90,
        estimatedProfit: 0,
        quota: 100,
        description: 'test',
      },
    });
    testProductIds.push(prod4.id);

    // Produk Aset 5
    const prod5 = await db.product.create({
      data: {
        name: 'TEST Produk Aset 5 (verify-multi-tier)',
        price: highestPrice + 200000,
        profitRate: 2.5,
        duration: 90,
        estimatedProfit: 0,
        quota: 100,
        description: 'test',
      },
    });
    testProductIds.push(prod5.id);

    // ── 3. Cek asset index untuk paket baru ──
    console.log('\n── Cek asset index setelah tambah VIP 4 & 5 ──');
    const afterPkgs = await db.investmentPackage.findMany({
      where: { amount: { gt: 0 }, isActive: true },
      orderBy: [{ amount: 'asc' }, { order: 'asc' }],
      select: { id: true, name: true },
    });
    console.log(`  Total paket aktif sekarang: ${afterPkgs.length}`);
    for (let i = 0; i < afterPkgs.length; i++) {
      const idx = await getPackageAssetIndex(afterPkgs[i].id);
      const expected = i + 1;
      console.log(`    ${afterPkgs[i].name} → asset index ${idx} (expected ${expected})`);
      check(
        `paket "${afterPkgs[i].name}" → index ${idx} = ${expected}`,
        idx === expected
      );
    }

    // ── 4. Cek asset index untuk produk baru ──
    console.log('\n── Cek asset index setelah tambah Produk Aset 4 & 5 ──');
    const afterProducts = await db.product.findMany({
      orderBy: [{ price: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true },
    });
    console.log(`  Total produk sekarang: ${afterProducts.length}`);
    for (let i = 0; i < afterProducts.length; i++) {
      const idx = await getProductAssetIndex(afterProducts[i].id);
      const expected = i + 1;
      console.log(`    ${afterProducts[i].name} → asset index ${idx} (expected ${expected})`);
      check(
        `produk "${afterProducts[i].name}" → index ${idx} = ${expected}`,
        idx === expected
      );
    }

    // ── 5. Konfirmasi: index > 3 (VIP 4, VIP 5) BERFUNGSI ──
    console.log('\n── Konfirmasi: VIP 4 & VIP 5 dapat asset index > 3 ──');
    const idx4pkg = await getPackageAssetIndex(pkg4.id);
    const idx5pkg = await getPackageAssetIndex(pkg5.id);
    const idx4prod = await getProductAssetIndex(prod4.id);
    const idx5prod = await getProductAssetIndex(prod5.id);
    console.log(`  VIP 4 paket → index ${idx4pkg}`);
    console.log(`  VIP 5 paket → index ${idx5pkg}`);
    console.log(`  Aset 4 produk → index ${idx4prod}`);
    console.log(`  Aset 5 produk → index ${idx5prod}`);
    check('VIP 4 paket index > 3 (TIDAK dibatasi 3)', idx4pkg !== null && idx4pkg > 3);
    check('VIP 5 paket index > 4 (TIDAK dibatasi 3)', idx5pkg !== null && idx5pkg > 4);
    check('Aset 4 produk index > 3 (TIDAK dibatasi 3)', idx4prod !== null && idx4prod > 3);
    check('Aset 5 produk index > 4 (TIDAK dibatasi 3)', idx5prod !== null && idx5prod > 4);

    // ── 6. Konfirmasi: produk[i] ≡ paket[i] = same asset (untuk index > 3) ──
    check(
      'produk[4] ≡ paket[4] (index sama, = same asset 4)',
      idx4pkg === idx4prod
    );
    check(
      'produk[5] ≡ paket[5] (index sama, = same asset 5)',
      idx5pkg === idx5prod
    );
  } finally {
    // ── CLEANUP: hapus test paket & produk ──
    console.log('\n── Cleanup: hapus test paket & produk ──');
    if (testProductIds.length > 0) {
      await db.product.deleteMany({ where: { id: { in: testProductIds } } });
      console.log(`  Hapus ${testProductIds.length} test produk`);
    }
    if (testPkgIds.length > 0) {
      // pastikan tidak ada Investment yang pakai packageId ini
      await db.investment.deleteMany({ where: { packageId: { in: testPkgIds } } }).catch(() => {});
      await db.investmentPackage.deleteMany({ where: { id: { in: testPkgIds } } });
      console.log(`  Hapus ${testPkgIds.length} test paket`);
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`HASIL: ${PASS.length} PASS, ${FAIL.length} FAIL`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  if (FAIL.length > 0) {
    console.log('GAGAL:');
    FAIL.forEach((f) => console.log(`  ✗ ${f}`));
    process.exit(1);
  }
  console.log('✓ ALL PASS — v19 handle N tier (bukan cuma 3). VIP 4/5/6+ OK.');
  console.log('  - Asset index dihitung dinamis dari jumlah produk/paket di DB');
  console.log('  - TIDAK ada batas hardcoded 3');
  console.log('  - User boleh aktifkan VIP1+VIP2+VIP3+VIP4+VIP5 bersamaan (beda aset)');
  console.log('  - Yang DIBLOCK: dobel aset yang sama (same index) saja');
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
