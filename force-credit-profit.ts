/**
 * NEXVO — Force Credit Profit (Standalone, NO cron service needed)
 *
 * Runs directly with Bun + Prisma. Credits ALL missed profit for every
 * active investment AND active purchase, with automatic backfill of missed weekdays.
 *
 * Usage:
 *   bun run force-credit-profit.ts              # normal (skip weekend)
 *   bun run force-credit-profit.ts --force      # force (bypass weekend)
 *   bun run force-credit-profit.ts --dry-run    # show what would be credited, no DB change
 *
 * This is the FALLBACK when cron-service is broken/not running.
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const WIB_OFFSET = 7; // UTC+7

// ─── DB path resolution (works both on VPS /home/nexvo and locally) ───
const DB_CANDIDATES = [
  '/home/nexvo/prisma/custom.db',
  '/home/nexvo/db/custom.db',
  path.join(process.cwd(), 'prisma/custom.db'),
  path.join(process.cwd(), 'db/custom.db'),
  path.join(process.cwd(), 'custom.db'),
];
const DB_PATH = DB_CANDIDATES.find((p) => fs.existsSync(p));

if (!DB_PATH) {
  console.error('❌ Database file not found. Checked:');
  DB_CANDIDATES.forEach((p) => console.error(`   - ${p}`));
  process.exit(1);
}
console.log(`📁 Using DB: ${DB_PATH}`);

const db = new PrismaClient({
  datasources: { db: { url: `file:${DB_PATH}` } },
});

// ─── CLI flags ───
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY_RUN = args.includes('--dry-run');

// ─── Time helpers (WIB = UTC+7) ───
function getWibNow(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + WIB_OFFSET * 3600000);
}

function getWibDateString(date: Date): string {
  // Treat the given Date as a UTC moment, shift to WIB wall time, format YYYY-MM-DD
  const wibDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
  return `${wibDate.getFullYear()}-${String(wibDate.getMonth() + 1).padStart(2, '0')}-${String(wibDate.getDate()).padStart(2, '0')}`;
}

function getTodayWibDateString(): string {
  return getWibDateString(new Date());
}

function getWibDayOfWeekFromDate(date: Date): number {
  const wibStr = getWibDateString(date);
  const [y, m, d] = wibStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Count weekdays (Mon-Fri) MISSED between lastCreditDate+1 and today (exclusive today).
 * Sat/Sun are skipped (weekend libur).
 */
function countWeekdaysMissed(lastCreditDateStr: string, todayStr: string): number {
  const [ly, lm, ld] = lastCreditDateStr.split('-').map(Number);
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const start = new Date(Date.UTC(ly, lm - 1, ld + 1));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  let count = 0;
  const cursor = new Date(start);
  let safety = 60;
  while (cursor < end && safety-- > 0) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function formatRupiahSimple(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}

// ─── DEFAULT MATCHING RATES (event-driven on profit) ───
const DEFAULT_MATCHING_RATES: Record<number, number> = { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 };
const MAX_MATCHING_LEVEL = 5;

async function getMatchingRates(): Promise<Record<number, number>> {
  try {
    const config = await db.matchingConfig.findFirst({ where: { isActive: true } });
    if (!config) return { ...DEFAULT_MATCHING_RATES };
    return { 1: config.level1, 2: config.level2, 3: config.level3, 4: config.level4, 5: config.level5 };
  } catch {
    return { ...DEFAULT_MATCHING_RATES };
  }
}

async function creditMatchingOnProfit(
  tx: any,
  earningUserId: string,
  profitAmount: number,
  matchingRates: Record<number, number>,
): Promise<number> {
  let totalMatchCredited = 0;
  if (profitAmount <= 0) return 0;

  // ★ v2.4 FIX: Use the Referral model (like cron-service.ts does).
  //   The OLD code used user.referredBy + user.status — but the User model
  //   has NO `status` field (only isSuspended/isVerified), so Prisma threw
  //   a validation error and the whole transaction crashed → no profit
  //   credited at all. Switching to the Referral model fixes this.
  const uplineRefs = await tx.referral.findMany({
    where: { referredId: earningUserId },
    orderBy: { level: 'asc' },
  });
  if (uplineRefs.length === 0) return 0;

  const earningUser = await tx.user.findUnique({
    where: { id: earningUserId },
    select: { name: true, userId: true },
  });
  const earningUserName = earningUser?.name || earningUser?.userId || 'User';

  for (const ref of uplineRefs) {
    const level = ref.level;
    if (level > MAX_MATCHING_LEVEL) continue;
    const rate = matchingRates[level] || 0;
    if (rate <= 0) continue;
    const matchAmount = Math.floor(profitAmount * (rate / 100));
    if (matchAmount <= 0) continue;

    await tx.user.update({
      where: { id: ref.referrerId },
      data: {
        mainBalance: { increment: matchAmount },
        totalProfit: { increment: matchAmount },
      },
    });
    await tx.bonusLog.create({
      data: {
        userId: ref.referrerId,
        fromUserId: earningUserId,
        type: 'matching',
        level,
        amount: matchAmount,
        description: `Matching bonus level ${level} (${rate}%) dari profit ${earningUserName} — ${formatRupiahSimple(profitAmount)} × ${rate}% = ${formatRupiahSimple(matchAmount)}`,
      },
    });
    totalMatchCredited += matchAmount;
  }
  return totalMatchCredited;
}

// ─── MAIN ───
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  NEXVO Force Credit Profit (Standalone)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Mode: ${DRY_RUN ? 'DRY-RUN (no DB change)' : 'LIVE (will update DB)'}`);
  console.log(`  Force (bypass weekend): ${FORCE}`);
  const wibNow = getWibNow();
  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  // FIX: wibNow is already WIB-shifted; .getDay() returns the correct WIB day-of-week.
  // (getWibDayOfWeekFromDate(wibNow) would double-shift and misread Fri evening as Sat.)
  console.log(`  WIB Now: ${getWibDateString(wibNow)} ${String(wibNow.getHours()).padStart(2,'0')}:${String(wibNow.getMinutes()).padStart(2,'0')} (${dayNames[wibNow.getDay()]})`);
  console.log('═══════════════════════════════════════════════════════\n');

  const todayWIB = getTodayWibDateString();
  // FIX: wibNow is already WIB-shifted; use .getDay() directly to avoid double-shift bug.
  const todayDow = wibNow.getDay();
  const isTodayWeekday = todayDow !== 0 && todayDow !== 6;

  if (!FORCE && !isTodayWeekday) {
    const dayName = dayNames[todayDow];
    console.log(`⏸️  Today is ${dayName} (weekend libur). Use --force to bypass.\n`);
    return;
  }

  const matchingRates = await getMatchingRates();
  console.log('Matching rates:', matchingRates, '\n');

  // ─── SELF-HEAL: Reactivate investments wrongly marked 'completed' ───
  if (!DRY_RUN) {
    const completed = await db.investment.findMany({
      where: { status: 'completed' },
      include: { package: true },
    });
    let reactivated = 0;
    for (const inv of completed) {
      if (!inv.endDate) continue;
      if (new Date(inv.endDate).getTime() <= Date.now()) continue;
      const storedDailyProfit = inv.dailyProfit && inv.dailyProfit > 0
        ? inv.dailyProfit
        : Math.floor(inv.amount * ((inv.package?.profitRate || 0) / 100));
      if (storedDailyProfit <= 0) continue;
      let contractDays = 0;
      if (inv.startDate && inv.endDate) {
        const msDiff = new Date(inv.endDate).getTime() - new Date(inv.startDate).getTime();
        contractDays = Math.max(1, Math.round(msDiff / (24 * 60 * 60 * 1000)));
      } else {
        contractDays = inv.package?.contractDays || 180;
      }
      const hardCap = storedDailyProfit * contractDays;
      if ((inv.totalProfitEarned || 0) >= hardCap) continue;
      await db.investment.update({
        where: { id: inv.id },
        data: { status: 'active', dailyProfit: storedDailyProfit },
      });
      reactivated++;
      console.log(`   ♻️  SELF-HEAL: Reactivated ${inv.id} — dailyProfit=${storedDailyProfit}, hardCap=${hardCap}, earned=${inv.totalProfitEarned}`);
    }
    if (reactivated > 0) console.log(`   ♻️  SELF-HEAL: Reactivated ${reactivated} investment(s)\n`);
  }

  // ─── Process Investments (v2.5 BULLETPROOF: NO status filter, use endDate) ───
  const allInvestments = await db.investment.findMany({
    include: { package: true, user: true },
  });
  const investments = allInvestments.filter((inv) => {
    if (!inv.endDate) return true;
    return new Date(inv.endDate) > wibNow;
  });
  console.log(`📊 Active investments: ${investments.length} (total fetched: ${allInvestments.length})\n`);

  let totalProcessed = 0;
  let totalProfitCredited = 0;
  let totalMatchingCredited = 0;
  let totalBackfillDays = 0;
  let errors = 0;

  for (const inv of investments) {
    try {
      // Skip if already credited today
      if (inv.lastProfitDate) {
        const lastProfitWIB = getWibDateString(new Date(inv.lastProfitDate));
        if (lastProfitWIB === todayWIB) {
          console.log(`   ⏭️  ${inv.userId} (${inv.package?.name || 'paket'}): already credited today`);
          continue;
        }
      }

      // Skip if bought today (profit starts tomorrow)
      const createdDate = inv.startDate ? new Date(inv.startDate) : new Date(inv.createdAt);
      const createdWIB = getWibDateString(createdDate);
      if (createdWIB === todayWIB) {
        console.log(`   ⏭️  ${inv.userId} (${inv.package?.name || 'paket'}): bought today, profit starts tomorrow`);
        continue;
      }

      // Skip if contract ended
      if (inv.endDate) {
        const endDate = new Date(inv.endDate);
        if (wibNow >= endDate) {
          if (!DRY_RUN) {
            await db.investment.update({
              where: { id: inv.id },
              data: { status: 'completed' },
            });
          }
          console.log(`   🏁 ${inv.userId}: contract ended, marked completed`);
          continue;
        }
      }

      // ★ BUG FIX: Use stored inv.dailyProfit — do NOT recompute from inv.package.profitRate.
      //   For Product (VIP) purchases, packageId is linked to _internal_default (profitRate=0)
      //   which made dailyProfit=0 → profit never credited.
      const dailyProfit = inv.dailyProfit && inv.dailyProfit > 0
        ? inv.dailyProfit
        : Math.floor(inv.amount * ((inv.package?.profitRate || 0) / 100));
      if (dailyProfit <= 0) {
        console.log(`   ⚠️  ${inv.userId}: dailyProfit=0 (stored=${inv.dailyProfit}, amount=${inv.amount}, pkgRate=${inv.package?.profitRate})`);
        continue;
      }

      // ─── BACKFILL: calculate missed weekdays ───
      let lastCreditDateStr: string;
      if (inv.lastProfitDate) {
        lastCreditDateStr = getWibDateString(new Date(inv.lastProfitDate));
      } else {
        lastCreditDateStr = createdWIB;
      }
      const missedDays = countWeekdaysMissed(lastCreditDateStr, todayWIB);
      const totalDays = Math.min(missedDays + (isTodayWeekday ? 1 : 0), 30);
      if (totalDays <= 0) {
        console.log(`   ⏭️  ${inv.userId}: no days to credit (missed=${missedDays}, todayWeekday=${isTodayWeekday})`);
        continue;
      }
      const totalCredit = dailyProfit * totalDays;
      const isBackfill = missedDays > 0;

      console.log(
        `   💰 ${inv.userId} (${inv.package?.name || 'paket'}): ${totalDays} day(s) × ${formatRupiahSimple(dailyProfit)} = ${formatRupiahSimple(totalCredit)}` +
        (isBackfill ? ` [BACKFILL: ${missedDays} missed]` : '') +
        (DRY_RUN ? ' (DRY-RUN)' : '')
      );

      if (DRY_RUN) {
        totalProcessed++;
        totalProfitCredited += totalCredit;
        if (isBackfill) totalBackfillDays += missedDays;
        continue;
      }

      // ─── Credit in transaction ───
      const matchCredited = await db.$transaction(async (tx) => {
        // Re-check inside transaction
        const currentInv = await tx.investment.findUnique({ where: { id: inv.id } });
        if (currentInv?.lastProfitDate) {
          const lastProfitWIB = getWibDateString(new Date(currentInv.lastProfitDate));
          if (lastProfitWIB === todayWIB) return 0;
        }

        await tx.user.update({
          where: { id: inv.userId },
          data: {
            mainBalance: { increment: totalCredit },
            totalProfit: { increment: totalCredit },
          },
        });

        await tx.investment.update({
          where: { id: inv.id },
          data: {
            totalProfitEarned: { increment: totalCredit },
            dailyProfit: dailyProfit,
            lastProfitDate: new Date(),
          },
        });

        const desc = totalDays === 1
          ? `Profit harian ${inv.package?.name || 'paket'} — ${formatRupiahSimple(inv.amount)} × ${(inv.package?.profitRate || 0)}% = ${formatRupiahSimple(dailyProfit)}`
          : `Profit ${totalDays} hari (${isBackfill ? `${missedDays} tertinggal + ${isTodayWeekday ? 'hari ini' : '0'}` : 'semua hari ini'}) — ${inv.package?.name || 'paket'}: ${formatRupiahSimple(dailyProfit)} × ${totalDays} = ${formatRupiahSimple(totalCredit)}`;

        await tx.bonusLog.create({
          data: {
            userId: inv.userId,
            fromUserId: inv.userId,
            type: 'profit',
            level: 0,
            amount: totalCredit,
            description: desc,
          },
        });

        const match = await creditMatchingOnProfit(tx, inv.userId, totalCredit, matchingRates);
        return match;
      });

      totalProcessed++;
      totalProfitCredited += totalCredit;
      totalMatchingCredited += matchCredited;
      if (isBackfill) totalBackfillDays += missedDays;
    } catch (e: any) {
      errors++;
      console.error(`   ❌ Investment ${inv.id} (${inv.userId}): ${e.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  PURCHASE (PRODUCT) PROFIT — v2.4 FIX ★★★
  //  OLD BUG: only updated tracking stats, never credited balance.
  //  FIX: standalone purchases (no linked Investment) get full credit
  //  (balance + BonusLog + ProfitLog + LiveActivity + matching).
  //  Purchases WITH a linked Investment stay sync-only.
  // ═══════════════════════════════════════════════════════════
  const purchases = await db.purchase.findMany({
    where: { status: 'active' },
    include: { product: true, user: true },
  });
  console.log(`\n📊 Active purchases: ${purchases.length}`);

  // Pre-fetch linked investment purchaseIds
  const linkedPurchaseIds = new Set<string>(
    (await db.investment.findMany({
      where: { purchaseId: { not: null } },
      select: { purchaseId: true },
      distinct: ['purchaseId'],
    })).map(i => i.purchaseId!).filter(Boolean)
  );

  let purchaseUpdated = 0;
  let purchaseProfitCredited = 0;
  for (const purchase of purchases) {
    try {
      if (purchase.lastProfitDate) {
        const lastWIB = getWibDateString(new Date(purchase.lastProfitDate));
        if (lastWIB === todayWIB) continue;
      }
      const createdDate = new Date(purchase.createdAt);
      const createdWIB = getWibDateString(createdDate);
      if (createdWIB === todayWIB) continue;

      const productProfitRate = purchase.product?.profitRate || 0;
      const dailyProfit = Math.floor(purchase.totalPrice * (productProfitRate / 100));
      if (dailyProfit <= 0) {
        console.log(`   ⚠️  Purchase ${purchase.id}: dailyProfit=0 (total=${purchase.totalPrice}, rate=${productProfitRate})`);
        continue;
      }

      let lastCreditDateStr = purchase.lastProfitDate ? getWibDateString(new Date(purchase.lastProfitDate)) : createdWIB;
      const missedDays = countWeekdaysMissed(lastCreditDateStr, todayWIB);
      const totalDays = Math.min(missedDays + (isTodayWeekday ? 1 : 0), 30);
      if (totalDays <= 0) continue;
      const totalCredit = dailyProfit * totalDays;
      const isBackfill = missedDays > 0;
      const productName = purchase.product?.name || 'Produk';

      // ★★★ v2.5 BULLETPROOF: If linked Investment exists, check whether it was
      //   actually credited TODAY. If yes → sync tracking only. If NO → CREDIT
      //   via Purchase path. This is the fix that guarantees profit masuk 100%.
      if (linkedPurchaseIds.has(purchase.id)) {
        const linkedInvs = await db.investment.findMany({
          where: { purchaseId: purchase.id },
          select: { id: true, lastProfitDate: true, status: true, endDate: true },
        });
        const anyCreditedToday = linkedInvs.some((li) => {
          if (!li.lastProfitDate) return false;
          return getWibDateString(new Date(li.lastProfitDate)) === todayWIB;
        });

        if (anyCreditedToday) {
          // Investment loop credited today — sync tracking only
          if (!DRY_RUN) {
            await db.purchase.update({
              where: { id: purchase.id },
              data: {
                profitEarned: { increment: totalCredit },
                dailyProfit: dailyProfit,
                lastProfitDate: new Date(),
              },
            });
          }
          purchaseUpdated++;
          console.log(`   📦 ${purchase.userId} (${productName}) [linked-inv, sync-only]: ${totalDays}d × ${formatRupiahSimple(dailyProfit)} = ${formatRupiahSimple(totalCredit)}${DRY_RUN ? ' (DRY-RUN)' : ''}`);
          continue;
        }
        // Linked Investment NOT credited today — fall through to standalone credit
        console.log(`   ⚠️  Purchase ${purchase.id} (${purchase.userId}) has linked Investment but it wasn't credited today — crediting via Purchase path (v2.5 fix)`);
      }

      // ★★★ STANDALONE PURCHASE — CREDIT PROFIT HERE ★★★
      console.log(
        `   💰 ${purchase.userId} (${productName}) [standalone, CREDIT]: ${totalDays}d × ${formatRupiahSimple(dailyProfit)} = ${formatRupiahSimple(totalCredit)}` +
        (isBackfill ? ` [BACKFILL: ${missedDays} missed]` : '') +
        (DRY_RUN ? ' (DRY-RUN)' : '')
      );

      if (DRY_RUN) {
        purchaseUpdated++;
        purchaseProfitCredited += totalCredit;
        continue;
      }

      const matchCredited = await db.$transaction(async (tx) => {
        // Re-check inside transaction
        const currentPurchase = await tx.purchase.findUnique({ where: { id: purchase.id } });
        if (currentPurchase?.lastProfitDate) {
          const lastWIB = getWibDateString(new Date(currentPurchase.lastProfitDate));
          if (lastWIB === todayWIB) return 0;
        }

        // 1. Credit user balance
        await tx.user.update({
          where: { id: purchase.userId },
          data: {
            mainBalance: { increment: totalCredit },
            totalProfit: { increment: totalCredit },
          },
        });

        // 2. Update purchase tracking
        await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            profitEarned: { increment: totalCredit },
            dailyProfit: dailyProfit,
            lastProfitDate: new Date(),
          },
        });

        // 3. ProfitLog
        await tx.profitLog.create({
          data: {
            purchaseId: purchase.id,
            userId: purchase.userId,
            amount: totalCredit,
          },
        });

        // 4. BonusLog(type='profit') — for Riwayat page
        const desc = totalDays === 1
          ? `Profit harian ${productName} — ${formatRupiahSimple(purchase.totalPrice)} × ${productProfitRate.toFixed(2)}% = ${formatRupiahSimple(dailyProfit)}`
          : `Profit ${totalDays} hari (${isBackfill ? `${missedDays} tertinggal + ${isTodayWeekday ? 'hari ini' : '0'}` : 'semua hari ini'}) — ${productName}: ${formatRupiahSimple(dailyProfit)} × ${totalDays} = ${formatRupiahSimple(totalCredit)}`;
        await tx.bonusLog.create({
          data: {
            userId: purchase.userId,
            fromUserId: purchase.userId,
            type: 'profit',
            level: 0,
            amount: totalCredit,
            description: desc,
          },
        });

        // 5. LiveActivity
        await tx.liveActivity.create({
          data: {
            type: 'profit',
            userName: purchase.user?.name || purchase.user?.userId || 'User',
            amount: totalCredit,
            productName,
            isFake: false,
          },
        });

        // 6. Matching bonus
        const match = await creditMatchingOnProfit(tx, purchase.userId, totalCredit, matchingRates);
        return match;
      });

      purchaseUpdated++;
      purchaseProfitCredited += totalCredit;
      totalMatchingCredited += matchCredited;
      if (isBackfill) totalBackfillDays += missedDays;
    } catch (e: any) {
      errors++;
      console.error(`   ❌ Purchase ${purchase.id}: ${e.message}`);
    }
  }
  totalProfitCredited += purchaseProfitCredited;

  // ─── Summary ───
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Investments processed: ${totalProcessed}`);
  console.log(`  Total profit credited: ${formatRupiahSimple(totalProfitCredited)}`);
  console.log(`  Total matching credited: ${formatRupiahSimple(totalMatchingCredited)}`);
  console.log(`  Backfill days credited: ${totalBackfillDays}`);
  console.log(`  Purchases updated: ${purchaseUpdated}`);
  console.log(`  Errors: ${errors}`);
  if (DRY_RUN) {
    console.log('\n  ⚠️  DRY-RUN mode — no DB changes were made.');
    console.log('  Run without --dry-run to actually credit profit.');
  } else {
    console.log('\n  ✅ Profit has been credited to user balances.');
    console.log('  Refresh Admin Asset page to see updated Total Profit.');
  }
  console.log('═══════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('FATAL ERROR:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
