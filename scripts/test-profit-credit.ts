/**
 * Direct profit credit test — bypasses cron HTTP server.
 * Runs the self-heal + profit logic directly against local DB.
 * Use to verify profit gets credited without waiting for 00:00 WIB.
 *
 * Run: bun run scripts/test-profit-credit.ts
 */
import { PrismaClient } from '@prisma/client';
import path from 'path';

const WIB_OFFSET = 7;

const db = new PrismaClient({
  datasources: {
    db: { url: `file:${path.resolve(process.cwd(), 'db/custom.db')}` },
  },
});

function getWibNow(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + WIB_OFFSET * 3600000);
}

function formatRupiahSimple(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}

function countWeekdaysBetween(startWib: Date, endWib: Date): number {
  let count = 0;
  const current = new Date(startWib.getFullYear(), startWib.getMonth(), startWib.getDate());
  current.setDate(current.getDate() + 1);
  const end = new Date(endWib.getFullYear(), endWib.getMonth(), endWib.getDate());
  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  NEXVO — Direct Profit Credit Test');
  console.log('  WIB now:', getWibNow().toISOString());
  console.log('═══════════════════════════════════════════════════\n');

  // ─── SELF-HEAL ───
  console.log('▼ [1/3] SELF-HEAL: Check for wrongly-completed investments...');
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
    console.log(`  ♻️  Reactivated ${inv.id} — dailyProfit=${storedDailyProfit}, hardCap=${hardCap}, earned=${inv.totalProfitEarned}`);
  }
  console.log(`  Self-heal: reactivated ${reactivated} / ${completed.length} completed investments\n`);

  // ─── PROCESS ACTIVE INVESTMENTS ───
  console.log('▼ [2/3] Process active investments (force mode, bypass weekend guard)...');
  const wibNow = getWibNow();
  const today = new Date(wibNow.getFullYear(), wibNow.getMonth(), wibNow.getDate());

  const investments = await db.investment.findMany({
    where: { status: 'active' },
    include: { package: true, user: { select: { userId: true, name: true, mainBalance: true } } },
  });
  console.log(`  Found ${investments.length} active investments\n`);

  let totalCredited = 0;
  let processed = 0;
  for (const inv of investments) {
    const storedDailyProfit = inv.dailyProfit && inv.dailyProfit > 0
      ? inv.dailyProfit
      : Math.floor(inv.amount * ((inv.package?.profitRate || 0) / 100));
    if (storedDailyProfit <= 0) {
      console.log(`  ⚠️ Skip ${inv.id}: dailyProfit=0`);
      continue;
    }
    if (!inv.lastProfitDate) {
      const startWib = new Date(inv.startDate.getTime() + inv.startDate.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
      const startDay = new Date(startWib.getFullYear(), startWib.getMonth(), startWib.getDate());
      if (startDay.getTime() === today.getTime()) {
        console.log(`  ⏭️ Skip ${inv.id}: bought today, first profit tomorrow 00:00 WIB`);
        continue;
      }
    } else {
      const lastDate = new Date(inv.lastProfitDate);
      const lastWib = new Date(lastDate.getTime() + lastDate.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
      const lastDay = new Date(lastWib.getFullYear(), lastWib.getMonth(), lastWib.getDate());
      if (lastDay.getTime() === today.getTime()) {
        console.log(`  ⏭️ Skip ${inv.id}: already credited today`);
        continue;
      }
    }

    // Calculate missed days
    let missedDays = 1;
    if (inv.lastProfitDate) {
      const lastDate = new Date(inv.lastProfitDate);
      const lastWib = new Date(lastDate.getTime() + lastDate.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
      missedDays = countWeekdaysBetween(lastWib, wibNow);
      if (missedDays <= 0) missedDays = 1;
    }

    const creditAmount = storedDailyProfit * missedDays;

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: inv.userId },
        data: {
          mainBalance: { increment: creditAmount },
          totalProfit: { increment: creditAmount },
        },
      });
      await tx.investment.update({
        where: { id: inv.id },
        data: {
          totalProfitEarned: { increment: creditAmount },
          dailyProfit: storedDailyProfit,
          lastProfitDate: new Date(),
        },
      });
      await tx.bonusLog.create({
        data: {
          userId: inv.userId,
          fromUserId: inv.userId,
          type: 'profit',
          level: 0,
          amount: creditAmount,
          description: `Profit ${missedDays} hari — ${inv.package?.name || 'Investment'}: ${formatRupiahSimple(storedDailyProfit)} × ${missedDays} = ${formatRupiahSimple(creditAmount)}`,
        },
      });
    });

    console.log(`  ✅ ${inv.id} (${inv.user?.userId}): ${missedDays} day(s) × ${formatRupiahSimple(storedDailyProfit)} = ${formatRupiahSimple(creditAmount)} → mainBalance (was ${formatRupiahSimple(inv.user?.mainBalance || 0)})`);
    totalCredited += creditAmount;
    processed++;
  }

  console.log('\n▼ [3/3] Final balance check...');
  const users = await db.user.findMany({ select: { userId: true, name: true, mainBalance: true, totalProfit: true } });
  for (const u of users) {
    console.log(`  ${u.userId} (${u.name}): mainBalance=${formatRupiahSimple(u.mainBalance)}, totalProfit=${formatRupiahSimple(u.totalProfit)}`);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  DONE — processed ${processed} investments, credited total ${formatRupiahSimple(totalCredited)}`);
  console.log('═══════════════════════════════════════════════════\n');
}

main()
  .catch((e) => { console.error('❌ Failed:', e); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
