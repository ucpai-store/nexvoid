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
  let currentUserId: string | null = earningUserId;
  const visited = new Set<string>([earningUserId]);

  for (let level = 1; level <= MAX_MATCHING_LEVEL; level++) {
    if (!currentUserId) break;
    const user = await tx.user.findUnique({
      where: { id: currentUserId },
      select: { id: true, referredBy: true, status: true, isVerified: true },
    });
    if (!user || !user.referredBy) break;
    const uplineId = user.referredBy;
    if (visited.has(uplineId)) break;
    visited.add(uplineId);

    const upline = await tx.user.findUnique({
      where: { id: uplineId },
      select: { id: true, status: true, isVerified: true },
    });
    if (!upline || upline.status !== 'active') {
      // Disconnected — stop matching chain
      break;
    }

    const rate = matchingRates[level] || 0;
    if (rate <= 0) {
      currentUserId = uplineId;
      continue;
    }
    const matchAmount = Math.floor(profitAmount * (rate / 100));
    if (matchAmount > 0) {
      await tx.user.update({
        where: { id: uplineId },
        data: {
          mainBalance: { increment: matchAmount },
          totalProfit: { increment: matchAmount },
        },
      });
      await tx.bonusLog.create({
        data: {
          userId: uplineId,
          fromUserId: earningUserId,
          type: 'matching',
          level,
          amount: matchAmount,
          description: `Matching bonus level ${level} (${rate}%) dari profit ${formatRupiahSimple(profitAmount)}`,
        },
      });
      totalMatchCredited += matchAmount;
    }
    currentUserId = uplineId;
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
  console.log(`  WIB Now: ${getWibDateString(wibNow)} ${String(wibNow.getHours()).padStart(2,'0')}:${String(wibNow.getMinutes()).padStart(2,'0')} (${dayNames[getWibDayOfWeekFromDate(wibNow)]})`);
  console.log('═══════════════════════════════════════════════════════\n');

  const todayWIB = getTodayWibDateString();
  const todayDow = getWibDayOfWeekFromDate(wibNow);
  const isTodayWeekday = todayDow !== 0 && todayDow !== 6;

  if (!FORCE && !isTodayWeekday) {
    const dayName = dayNames[todayDow];
    console.log(`⏸️  Today is ${dayName} (weekend libur). Use --force to bypass.\n`);
    return;
  }

  const matchingRates = await getMatchingRates();
  console.log('Matching rates:', matchingRates, '\n');

  // ─── Process Investments ───
  const investments = await db.investment.findMany({
    where: { status: 'active' },
    include: { package: true, user: true },
  });
  console.log(`📊 Active investments: ${investments.length}\n`);

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

      const dailyProfit = Math.floor(inv.amount * ((inv.package?.profitRate || 0) / 100));
      if (dailyProfit <= 0) {
        console.log(`   ⚠️  ${inv.userId}: dailyProfit=0 (amount=${inv.amount}, rate=${inv.package?.profitRate})`);
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

  // ─── Process Purchases (update stats only, no balance change) ───
  const purchases = await db.purchase.findMany({
    where: { status: 'active' },
    include: { product: true },
  });
  console.log(`\n📊 Active purchases: ${purchases.length}`);
  let purchaseUpdated = 0;
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
      if (dailyProfit <= 0) continue;

      let lastCreditDateStr = purchase.lastProfitDate ? getWibDateString(new Date(purchase.lastProfitDate)) : createdWIB;
      const missedDays = countWeekdaysMissed(lastCreditDateStr, todayWIB);
      const totalDays = Math.min(missedDays + (isTodayWeekday ? 1 : 0), 30);
      if (totalDays <= 0) continue;
      const totalCredit = dailyProfit * totalDays;

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
      console.log(`   📦 ${purchase.userId} (${purchase.product?.name || 'produk'}): ${totalDays} day(s) × ${formatRupiahSimple(dailyProfit)} = ${formatRupiahSimple(totalCredit)}${DRY_RUN ? ' (DRY-RUN)' : ''}`);
    } catch (e: any) {
      console.error(`   ❌ Purchase ${purchase.id}: ${e.message}`);
    }
  }

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
