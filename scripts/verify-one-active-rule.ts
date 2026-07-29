/**
 * ★★★ v19 VERIFICATION SCRIPT — PER-ASSET-UNIQUE-RULE ★★★
 *
 * Verifies that the implementation correctly enforces:
 *   - User BOLEH punya banyak aset aktif (VIP1 + VIP2 + VIP3 bersamaan)
 *   - YANG DILARANG: 2 active investments untuk aset yang SAMA (same tier index)
 *   - produk[i] (by price asc) ≡ paket[i] (by amount asc) = same asset i
 *   - Beli produk VIP1 + beli paket VIP1 = BLOCKED (same asset)
 *   - Beli produk VIP1 + beli paket VIP2 = ALLOWED (different asset)
 *   - Kontrak selesai (status='completed') → bisa beli aset yg sama lagi
 *
 * Run: bun run scripts/verify-one-active-rule.ts
 */

import { db } from '../src/lib/db';
import {
  getUserActiveAssets,
  getUserActiveAssetInfo,
  getPackageAssetIndex,
  getProductAssetIndex,
  validateProductPurchase,
  validateTierPurchase,
} from '../src/lib/tier-system';

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let pass = 0;
let fail = 0;

function logPass(msg: string) {
  console.log(`${GREEN}✓ PASS${RESET}: ${msg}`);
  pass++;
}
function logFail(msg: string) {
  console.log(`${RED}✗ FAIL${RESET}: ${msg}`);
  fail++;
}
function logInfo(msg: string) {
  console.log(`${CYAN}ℹ${RESET} ${msg}`);
}
function logHeader(msg: string) {
  console.log(`\n${BOLD}${YELLOW}━━━ ${msg} ━━━${RESET}`);
}

async function main() {
  console.log(`${BOLD}${CYAN}`);
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  v19 VERIFIKASI: PER-ASSET-UNIQUE-RULE                       ║');
  console.log('║  Konsep: user boleh banyak aset aktif (VIP1+VIP2+VIP3)        ║');
  console.log('║  Aturan: 1 aset maks 1 aktif. produk[i] ≡ paket[i] = same.    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`${RESET}`);

  // ─── Seed 3 PRODUK + 3 PAKET kalau kosong (konsep 3 aset) ───
  const existingProducts = await db.product.count();
  if (existingProducts === 0) {
    for (const p of [
      { name: 'Gold Premium Aset 1', price: 160000, profitRate: 2.0, duration: 180, estimatedProfit: 576000, quota: 999, quotaUsed: 0, description: 'Test', isActive: true, isStopped: false },
      { name: 'Gold Premium Aset 2', price: 320000, profitRate: 2.5, duration: 180, estimatedProfit: 1440000, quota: 999, quotaUsed: 0, description: 'Test', isActive: true, isStopped: false },
      { name: 'Gold Premium Aset 3', price: 640000, profitRate: 3.0, duration: 180, estimatedProfit: 3456000, quota: 999, quotaUsed: 0, description: 'Test', isActive: true, isStopped: false },
    ]) {
      await db.product.create({ data: p });
    }
    logInfo('Seeded 3 produk (Gold Premium Aset 1-3)');
  }

  const existingPkgs = await db.investmentPackage.count({ where: { isActive: true } });
  if (existingPkgs === 0) {
    for (const t of [
      { name: 'VIP 1', amount: 100000, profitRate: 10, contractDays: 90, order: 1, isActive: true },
      { name: 'VIP 2', amount: 500000, profitRate: 10, contractDays: 90, order: 2, isActive: true },
      { name: 'VIP 3', amount: 1000000, profitRate: 12, contractDays: 90, order: 3, isActive: true },
    ]) {
      await db.investmentPackage.create({ data: t });
    }
    logInfo('Seeded 3 paket (VIP 1-3)');
  }

  // Find or create a test user
  const testUserId = 'verify-test-user-' + Date.now();
  const testUser = await db.user.create({
    data: {
      id: testUserId,
      userId: 'VERIFY' + Date.now(),
      whatsapp: '62' + Date.now().toString().slice(-10),
      email: 'verify' + Date.now() + '@test.local',
      password: '$2a$10$dummyhash',
      referralCode: 'VERIFY' + Date.now().toString(36).toUpperCase(),
      isVerified: true,
      mainBalance: 10_000_000, // saldo cukup buat beli apa aja
    },
  });
  logInfo(`Created test user: ${testUser.userId}`);

  // Find products ordered by price asc (asset index 1, 2, 3)
  const products = await db.product.findMany({
    where: { isActive: true, isStopped: false },
    orderBy: { price: 'asc' },
  });
  if (products.length < 2) {
    logFail('Butuh minimal 2 produk aktif buat test (matching VIP1↔produk1, VIP2↔produk2). Found: ' + products.length);
    return;
  }
  const product1 = products[0]; // asset 1 (cheapest)
  const product2 = products[1]; // asset 2
  logInfo(`Produk 1 (asset 1): ${product1.name} (Rp ${product1.price.toLocaleString('id-ID')})`);
  logInfo(`Produk 2 (asset 2): ${product2.name} (Rp ${product2.price.toLocaleString('id-ID')})`);

  // Find packages ordered by amount asc
  const pkgs = await db.investmentPackage.findMany({
    where: { isActive: true },
    orderBy: { amount: 'asc' },
  });
  if (pkgs.length < 2) {
    logFail('Butuh minimal 2 paket aktif buat test. Found: ' + pkgs.length);
    return;
  }
  const pkg1 = pkgs[0]; // asset 1 (cheapest)
  const pkg2 = pkgs[1]; // asset 2
  logInfo(`Paket 1 (asset 1): ${pkg1.name} (Rp ${pkg1.amount.toLocaleString('id-ID')})`);
  logInfo(`Paket 2 (asset 2): ${pkg2.name} (Rp ${pkg2.amount.toLocaleString('id-ID')})`);

  // Verify asset index helpers
  logHeader('TEST 1: Asset index helpers benar');
  const prod1Idx = await getProductAssetIndex(product1.id);
  const prod2Idx = await getProductAssetIndex(product2.id);
  const pkg1Idx = await getPackageAssetIndex(pkg1.id);
  const pkg2Idx = await getPackageAssetIndex(pkg2.id);
  logInfo(`  produk 1 → asset ${prod1Idx}, produk 2 → asset ${prod2Idx}`);
  logInfo(`  paket 1 → asset ${pkg1Idx}, paket 2 → asset ${pkg2Idx}`);
  if (prod1Idx === 1 && prod2Idx === 2 && pkg1Idx === 1 && pkg2Idx === 2) {
    logPass('Asset index mapping benar (produk[i] ≡ paket[i] = asset i)');
  } else {
    logFail(`Asset index salah. Expected 1/2/1/2, got ${prod1Idx}/${prod2Idx}/${pkg1Idx}/${pkg2Idx}`);
  }

  // ────────────────────────────────────────────────────────────────
  // TEST 2: User kosong → boleh beli apa aja
  // ────────────────────────────────────────────────────────────────
  logHeader('TEST 2: User kosong → boleh beli apa aja');
  const emptyAssets = await getUserActiveAssets(testUserId);
  if (emptyAssets.size === 0) {
    logPass('User kosong → getUserActiveAssets.size = 0 (boleh beli apa aja)');
  } else {
    logFail(`User kosong tapi size = ${emptyAssets.size} — INI BUG`);
  }

  // ────────────────────────────────────────────────────────────────
  // TEST 3: Beli PRODUK 1 (asset 1) → aset 1 aktif
  // ────────────────────────────────────────────────────────────────
  logHeader('TEST 3: Beli PRODUK 1 (asset 1)');
  const purchase1 = await db.purchase.create({
    data: {
      userId: testUserId,
      productId: product1.id,
      quantity: 1,
      totalPrice: product1.price,
      status: 'active',
      profitEarned: 0,
      dailyProfit: Math.floor(product1.price * (product1.profitRate / 100)),
    },
  });
  await db.investment.create({
    data: {
      userId: testUserId,
      packageId: pkg1.id, // any active pkg as FK fallback
      purchaseId: purchase1.id, // LINKED → indicates "from produk"
      amount: product1.price,
      dailyProfit: Math.floor(product1.price * (product1.profitRate / 100)),
      totalProfitEarned: 0,
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      lastProfitDate: null,
    },
  });
  logInfo('Created Purchase + Investment for produk 1 (asset 1)');

  // ────────────────────────────────────────────────────────────────
  // TEST 4: getUserActiveAssets harus detect aset 1 aktif
  // ────────────────────────────────────────────────────────────────
  logHeader('TEST 4: getUserActiveAssets detect aset 1');
  const afterProd1Assets = await getUserActiveAssets(testUserId);
  logInfo(`  Active assets: ${[...afterProd1Assets].join(', ')}`);
  if (afterProd1Assets.size === 1 && afterProd1Assets.has(1)) {
    logPass('aset 1 aktif terdetect (size=1, has(1)=true)');
  } else {
    logFail(`Expected size=1 with asset 1, got size=${afterProd1Assets.size}, has(1)=${afterProd1Assets.has(1)}`);
  }

  // ────────────────────────────────────────────────────────────────
  // TEST 5: Coba beli PAKET 1 (same asset 1) → HARUS DIBLOCK
  // ────────────────────────────────────────────────────────────────
  logHeader('TEST 5: Coba beli PAKET 1 (same asset 1) → DIBLOCK');
  const blockSamePaket = await validateTierPurchase(testUserId, pkg1.id);
  if (!blockSamePaket.ok) {
    logPass(`validateTierPurchase reject (same asset): ${blockSamePaket.error.substring(0, 100)}...`);
  } else {
    logFail('validateTierPurchase harusnya reject (same asset 1 via produk sudah aktif)');
  }

  // ────────────────────────────────────────────────────────────────
  // TEST 6: Coba beli PRODUK 1 lagi (same asset 1) → HARUS DIBLOCK
  // ────────────────────────────────────────────────────────────────
  logHeader('TEST 6: Coba beli PRODUK 1 lagi (same asset 1) → DIBLOCK');
  const blockSameProduk = await validateProductPurchase(testUserId, product1.id);
  if (!blockSameProduk.ok) {
    logPass(`validateProductPurchase reject (same asset): ${blockSameProduk.error.substring(0, 100)}...`);
  } else {
    logFail('validateProductPurchase harusnya reject (same asset 1 sudah aktif)');
  }

  // ────────────────────────────────────────────────────────────────
  // TEST 7: ★★ Coba beli PAKET 2 (different asset 2) → HARUS BOLEH
  //   Ini beda dari v18 — sekarang multi-asset allowed.
  // ────────────────────────────────────────────────────────────────
  logHeader('TEST 7: ★★ Coba beli PAKET 2 (different asset 2) → BOLEH');
  const allowDiffPaket = await validateTierPurchase(testUserId, pkg2.id);
  if (allowDiffPaket.ok) {
    logPass('validateTierPurchase allow (different asset 2) — multi-asset OK');
  } else {
    logFail(`validateTierPurchase harusnya allow (different asset), got: ${allowDiffPaket.error}`);
  }

  // ────────────────────────────────────────────────────────────────
  // TEST 8: ★★ Coba beli PRODUK 2 (different asset 2) → HARUS BOLEH
  // ────────────────────────────────────────────────────────────────
  logHeader('TEST 8: ★★ Coba beli PRODUK 2 (different asset 2) → BOLEH');
  const allowDiffProduk = await validateProductPurchase(testUserId, product2.id);
  if (allowDiffProduk.ok) {
    logPass('validateProductPurchase allow (different asset 2) — multi-asset OK');
  } else {
    logFail(`validateProductPurchase harusnya allow (different asset), got: ${allowDiffProduk.error}`);
  }

  // ────────────────────────────────────────────────────────────────
  // TEST 9: Beli PAKET 2 (asset 2) → sekarang aset 1 + aset 2 aktif
  // ────────────────────────────────────────────────────────────────
  logHeader('TEST 9: Beli PAKET 2 (asset 2) → sekarang 2 aset aktif');
  await db.investment.create({
    data: {
      userId: testUserId,
      packageId: pkg2.id, // paket 2 spesifik
      purchaseId: null, // NULL → indicates "from paket"
      amount: pkg2.amount,
      dailyProfit: Math.floor(pkg2.amount * (pkg2.profitRate / 100)),
      totalProfitEarned: 0,
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + pkg2.contractDays * 24 * 60 * 60 * 1000),
      lastProfitDate: null,
    },
  });
  logInfo('Created Investment from paket 2 (asset 2, purchaseId=null)');

  const afterPaket2Assets = await getUserActiveAssets(testUserId);
  logInfo(`  Active assets: ${[...afterPaket2Assets].join(', ')}`);
  if (afterPaket2Assets.size === 2 && afterPaket2Assets.has(1) && afterPaket2Assets.has(2)) {
    logPass('aset 1 + aset 2 aktif (multi-asset allowed)');
  } else {
    logFail(`Expected size=2 with assets {1, 2}, got size=${afterPaket2Assets.size}, assets=${[...afterPaket2Assets].join(',')}`);
  }

  // ────────────────────────────────────────────────────────────────
  // TEST 10: Sekarang coba beli PAKET 2 lagi (same asset 2) → DIBLOCK
  // ────────────────────────────────────────────────────────────────
  logHeader('TEST 10: Coba beli PAKET 2 lagi (same asset 2) → DIBLOCK');
  const blockSamePaket2 = await validateTierPurchase(testUserId, pkg2.id);
  if (!blockSamePaket2.ok) {
    logPass(`validateTierPurchase reject (same asset 2): ${blockSamePaket2.error.substring(0, 100)}...`);
  } else {
    logFail('validateTierPurchase harusnya reject (same asset 2 sudah aktif via paket 2)');
  }

  // ────────────────────────────────────────────────────────────────
  // TEST 11: Coba beli PRODUK 2 lagi (same asset 2 via different route) → DIBLOCK
  // ────────────────────────────────────────────────────────────────
  logHeader('TEST 11: Coba beli PRODUK 2 (same asset 2 via different route) → DIBLOCK');
  const blockSameProduk2 = await validateProductPurchase(testUserId, product2.id);
  if (!blockSameProduk2.ok) {
    logPass(`validateProductPurchase reject (same asset 2 cross-route): ${blockSameProduk2.error.substring(0, 100)}...`);
  } else {
    logFail('validateProductPurchase harusnya reject (asset 2 sudah aktif via paket 2, beli produk 2 = same asset)');
  }

  // ────────────────────────────────────────────────────────────────
  // TEST 12: getUserActiveAssetInfo return meaningful info
  // ────────────────────────────────────────────────────────────────
  logHeader('TEST 12: getUserActiveAssetInfo return meaningful info');
  const info1 = await getUserActiveAssetInfo(testUserId, 1);
  const info2 = await getUserActiveAssetInfo(testUserId, 2);
  logInfo(`  Asset 1: hasActive=${info1.hasActive}, type=${info1.activeType}, name="${info1.activeAssetName}", days=${info1.daysRemaining}`);
  logInfo(`  Asset 2: hasActive=${info2.hasActive}, type=${info2.activeType}, name="${info2.activeAssetName}", days=${info2.daysRemaining}`);
  if (info1.hasActive && info1.activeType === 'product' &&
      info2.hasActive && info2.activeType === 'package') {
    logPass('asset 1 dari "product" route, asset 2 dari "package" route — benar detect');
  } else {
    logFail(`type salah. asset 1 type=${info1.activeType} (expected "product"), asset 2 type=${info2.activeType} (expected "package")`);
  }

  // ────────────────────────────────────────────────────────────────
  // TEST 13: Kontrak aset 1 selesai (completed) → bisa beli aset 1 lagi
  // ────────────────────────────────────────────────────────────────
  logHeader('TEST 13: Kontrak aset 1 selesai (completed) → bisa beli lagi');
  await db.investment.updateMany({
    where: { userId: testUserId, packageId: pkg1.id, status: 'active' },
    data: { status: 'completed' },
  });
  await db.purchase.updateMany({
    where: { userId: testUserId, productId: product1.id, status: 'active' },
    data: { status: 'completed' },
  });
  logInfo('Set status=completed untuk aset 1 (Purchase + Investment)');

  const afterCompleteAssets = await getUserActiveAssets(testUserId);
  logInfo(`  Active assets: ${[...afterCompleteAssets].join(', ')}`);
  if (afterCompleteAssets.size === 1 && afterCompleteAssets.has(2) && !afterCompleteAssets.has(1)) {
    logPass('aset 1 selesai, aset 2 masih aktif (size=1, only asset 2)');
  } else {
    logFail(`Expected size=1 with only asset 2, got size=${afterCompleteAssets.size}, assets=${[...afterCompleteAssets].join(',')}`);
  }

  // Sekarang bisa beli aset 1 lagi
  const allowAfterComplete = await validateTierPurchase(testUserId, pkg1.id);
  if (allowAfterComplete.ok) {
    logPass('Setelah aset 1 completed → bisa beli paket 1 lagi');
  } else {
    logFail(`Should allow re-activation, got: ${allowAfterComplete.error}`);
  }
  const allowProdukAfterComplete = await validateProductPurchase(testUserId, product1.id);
  if (allowProdukAfterComplete.ok) {
    logPass('Setelah aset 1 completed → bisa beli produk 1 lagi');
  } else {
    logFail(`Should allow re-activation, got: ${allowProdukAfterComplete.error}`);
  }

  // ────────────────────────────────────────────────────────────────
  // TEST 14: Konsep 3 aset (bukan 6)
  // ────────────────────────────────────────────────────────────────
  logHeader('TEST 14: Konsep 3 aset (produk + paket = same asset)');
  const allProducts = await db.product.findMany({ where: { isActive: true } });
  const allPackages = await db.investmentPackage.findMany({ where: { isActive: true } });
  logInfo(`Jumlah produk aktif: ${allProducts.length}`);
  logInfo(`Jumlah paket aktif: ${allPackages.length}`);
  logInfo(`Total "tampilan": ${allProducts.length + allPackages.length} (produk+paket terpisah)`);
  logInfo(`Total "aset unik": MAX(${allProducts.length}, ${allPackages.length}) = ${Math.max(allProducts.length, allPackages.length)}`);
  logInfo(`   Karena produk[i] ≡ paket[i] = same asset i.`);
  logInfo(`   User boleh punya banyak aset aktif (multi-asset allowed).`);
  logInfo(`   YANG DILARANG: dobel aset yang sama (same tier index).`);
  if (allProducts.length > 0 && allPackages.length > 0) {
    logPass('Sistem mengenal produk & paket, user boleh banyak aset aktif (1 per aset)');
  } else {
    logInfo('Skip — produk atau paket belum di-seed');
  }

  // ────────────────────────────────────────────────────────────────
  // CLEANUP
  // ────────────────────────────────────────────────────────────────
  logHeader('CLEANUP — hapus test data');
  await db.investment.deleteMany({ where: { userId: testUserId } });
  await db.purchase.deleteMany({ where: { userId: testUserId } });
  await db.user.delete({ where: { id: testUserId } });
  logInfo(`Hapus test user + purchases + investments: ${testUserId}`);

  // ────────────────────────────────────────────────────────────────
  // SUMMARY
  // ────────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${BOLD}HASIL: ${GREEN}${pass} PASS${RESET}, ${RED}${fail} FAIL${RESET}`);
  console.log(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);

  if (fail === 0) {
    console.log(`${GREEN}${BOLD}✓ ALL PASS — PER-ASSET-UNIQUE-RULE BENAR${RESET}`);
    console.log(`${GREEN}  - User BOLEH punya banyak aset aktif (VIP1+VIP2+VIP3)${RESET}`);
    console.log(`${GREEN}  - YANG DILARANG: dobel aset yang sama (same tier index)${RESET}`);
    console.log(`${GREEN}  - produk[i] (price asc) ≡ paket[i] (amount asc) = same asset i${RESET}`);
    console.log(`${GREEN}  - Beli produk VIP1 + beli paket VIP1 (same asset) → DIBLOCK${RESET}`);
    console.log(`${GREEN}  - Beli produk VIP1 + beli paket VIP2 (different asset) → BOLEH${RESET}`);
    console.log(`${GREEN}  - Kontrak selesai → bisa beli aset yang sama lagi${RESET}`);
  } else {
    console.log(`${RED}${BOLD}✗ ADA FAIL — cek log di atas${RESET}`);
  }

  await db.$disconnect();
}

main().catch((err) => {
  console.error(`${RED}Fatal error:${RESET}`, err);
  process.exit(1);
});
