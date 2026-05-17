import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ──────────── Constants ────────────

const WIB_OFFSET = 7; // UTC+7 for Asia/Jakarta

const DEFAULT_MATCHING_RATES: Record<number, number> = {
  1: 5,
  2: 4,
  3: 3,
  4: 2,
  5: 1,
};
const MAX_MATCHING_LEVEL = 5; // Level 6+ = auto disconnect

// ──────────── Auth Helper ────────────

function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET || process.env.JWT_SECRET;
  if (!cronSecret) {
    console.error('[Cron API] CRON_SECRET not configured');
    return false;
  }

  // Check Authorization: Bearer {CRON_SECRET}
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1] === cronSecret) {
      return true;
    }
  }

  // Check x-cron-key header (used by cron service)
  const cronKeyHeader = request.headers.get('x-cron-key');
  if (cronKeyHeader && cronKeyHeader === cronSecret) {
    return true;
  }

  // Check ?secret={CRON_SECRET}
  const url = new URL(request.url);
  const secretParam = url.searchParams.get('secret');
  if (secretParam === cronSecret) {
    return true;
  }

  return false;
}

// ──────────── Time Helpers ────────────

function getWibNow(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + WIB_OFFSET * 3600000);
}

function formatRupiahSimple(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}

// ──────────── Matching Config Helper ────────────

async function getMatchingRates(): Promise<Record<number, number>> {
  const config = await db.matchingConfig.findFirst({ where: { isActive: true } });
  if (!config) return { ...DEFAULT_MATCHING_RATES };
  return {
    1: config.level1,
    2: config.level2,
    3: config.level3,
    4: config.level4,
    5: config.level5,
  };
}

// ──────────── Matching Bonus (Event-Driven) ────────────

/**
 * Credit matching bonus to upline when a downline earns profit.
 * This is called immediately after crediting daily investment profit.
 * Level 6+ = AUTO DISCONNECT (no matching bonus).
 */
async function creditMatchingOnProfit(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  earningUserId: string,
  profitAmount: number,
): Promise<{
  totalMatchCredited: number;
  details: Array<{ level: number; uplineId: string; rate: number; amount: number; disconnected: boolean }>;
}> {
  const result = {
    totalMatchCredited: 0,
    details: [] as Array<{ level: number; uplineId: string; rate: number; amount: number; disconnected: boolean }>,
  };

  if (profitAmount <= 0) return result;

  // Find all upline members for this user
  const uplineRefs = await tx.referral.findMany({
    where: { referredId: earningUserId },
    orderBy: { level: 'asc' },
  });

  if (uplineRefs.length === 0) return result;

  // Get the earning user's info
  const earningUser = await tx.user.findUnique({
    where: { id: earningUserId },
    select: { name: true, userId: true },
  });
  const earningUserName = earningUser?.name || earningUser?.userId || 'User';

  // Get matching rates
  const rates = await getMatchingRates();

  // Process each upline level
  for (const ref of uplineRefs) {
    const level = ref.level;

    // AUTO DISCONNECT: Level 6+ gets NO matching bonus
    if (level > MAX_MATCHING_LEVEL) {
      result.details.push({
        level,
        uplineId: ref.referrerId,
        rate: 0,
        amount: 0,
        disconnected: true,
      });
      continue;
    }

    const rate = rates[level] || 0;
    if (rate <= 0) continue;

    const matchAmount = Math.floor(profitAmount * (rate / 100));
    if (matchAmount <= 0) continue;

    // Credit matching bonus to upline's mainBalance
    await tx.user.update({
      where: { id: ref.referrerId },
      data: {
        mainBalance: { increment: matchAmount },
        totalProfit: { increment: matchAmount },
      },
    });

    // Create MatchingBonus record
    await tx.matchingBonus.create({
      data: {
        userId: ref.referrerId,
        leftOmzet: 0,
        rightOmzet: 0,
        matchedOmzet: profitAmount,
        level,
        rate,
        amount: matchAmount,
        status: 'paid',
      },
    });

    // Create BonusLog entry
    await tx.bonusLog.create({
      data: {
        userId: ref.referrerId,
        fromUserId: earningUserId,
        type: 'matching',
        level,
        amount: matchAmount,
        description: `Matching Profit Level ${level} (${rate}%) dari profit ${earningUserName} — ${formatRupiahSimple(profitAmount)} × ${rate}% = ${formatRupiahSimple(matchAmount)}`,
      },
    });

    result.totalMatchCredited += matchAmount;
    result.details.push({
      level,
      uplineId: ref.referrerId,
      rate,
      amount: matchAmount,
      disconnected: false,
    });
  }

  return result;
}

// ──────────── Daily Investment Profit Logic ────────────

async function processDailyInvestmentProfits(): Promise<{
  processed: number;
  totalProfit: number;
  totalMatching: number;
  errors: number;
  errorDetails: string[];
}> {
  const result = { processed: 0, totalProfit: 0, totalMatching: 0, errors: 0, errorDetails: [] as string[] };

  const now = getWibNow();
  // Create WIB "today" date for comparison (just the date part)
  const todayWIB = { year: now.getFullYear(), month: now.getMonth(), date: now.getDate() };

  // Get all active investments
  const investments = await db.investment.findMany({
    where: { status: 'active' },
    include: { package: true },
  });

  console.log(`[Profit Cron] Processing ${investments.length} active investments...`);

  for (const inv of investments) {
    try {
      // Check if already credited today (compare in WIB timezone)
      if (inv.lastProfitDate) {
        const lastDateUTC = new Date(inv.lastProfitDate);
        // Convert to WIB for date comparison
        const lastDateMs = lastDateUTC.getTime() + lastDateUTC.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000;
        const lastDateWIB = new Date(lastDateMs);
        if (lastDateWIB.getFullYear() === todayWIB.year &&
            lastDateWIB.getMonth() === todayWIB.month &&
            lastDateWIB.getDate() === todayWIB.date) {
          continue; // Already credited today
        }
      }

      // Check if investment has ended
      if (inv.endDate) {
        const endDate = new Date(inv.endDate);
        if (now >= endDate) {
          await db.investment.update({
            where: { id: inv.id },
            data: { status: 'completed' },
          });
          continue;
        }
      }

      // Credit daily profit - ALWAYS recalculate from package profitRate for accuracy
      // Formula: dailyProfit = investmentAmount × (profitRate / 100)
      const dailyProfit = Math.floor(inv.amount * (inv.package.profitRate / 100));

      await db.$transaction(async (tx) => {
        // ★ RE-CHECK inside transaction to prevent double credit (race condition) ★
        const currentInv = await tx.investment.findUnique({ where: { id: inv.id } });
        if (currentInv?.lastProfitDate) {
          const lastDateUTC = new Date(currentInv.lastProfitDate);
          const lastDateMs = lastDateUTC.getTime() + lastDateUTC.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000;
          const lastDateWIB = new Date(lastDateMs);
          if (lastDateWIB.getFullYear() === todayWIB.year &&
              lastDateWIB.getMonth() === todayWIB.month &&
              lastDateWIB.getDate() === todayWIB.date) {
            return; // Already credited today — skip
          }
        }

        // 1. Credit daily profit to user's mainBalance
        await tx.user.update({
          where: { id: inv.userId },
          data: {
            mainBalance: { increment: dailyProfit },
            totalProfit: { increment: dailyProfit },
          },
        });

        // 2. Update investment record (also fix stored dailyProfit if incorrect)
        await tx.investment.update({
          where: { id: inv.id },
          data: {
            totalProfitEarned: { increment: dailyProfit },
            dailyProfit: dailyProfit, // Fix stored value if it was wrong
            lastProfitDate: new Date(),  // Store real UTC time
          },
        });

        // 3. Create profit log
        const purchase = await tx.purchase.findFirst({
          where: { userId: inv.userId, status: 'active' },
          orderBy: { createdAt: 'desc' },
        });

        if (purchase) {
          await tx.profitLog.create({
            data: {
              purchaseId: purchase.id,
              userId: inv.userId,
              amount: dailyProfit,
            },
          });
        }

        // 4. Create bonus log for daily profit
        await tx.bonusLog.create({
          data: {
            userId: inv.userId,
            fromUserId: inv.userId,
            type: 'profit',
            level: 0,
            amount: dailyProfit,
            description: `Profit harian investasi ${formatRupiahSimple(inv.amount)} — ${formatRupiahSimple(dailyProfit)}`,
          },
        });

        // 5. ★ EVENT-DRIVEN MATCHING BONUS ★
        // Credit matching bonus to all upline members immediately
        const matchResult = await creditMatchingOnProfit(tx, inv.userId, dailyProfit);

        if (matchResult.totalMatchCredited > 0) {
          result.totalMatching += matchResult.totalMatchCredited;
        }
      });

      result.processed++;
      result.totalProfit += dailyProfit;
    } catch (error: unknown) {
      result.errors++;
      const message = error instanceof Error ? error.message : String(error);
      result.errorDetails.push(`Investment ${inv.id}: ${message}`);
      console.error(`[Profit Cron] ❌ Investment ${inv.id}: ${message}`);
    }
  }

  // ═══════ Purchase (Product) Profit Processing ═══════
  // Products also generate daily profit, same as investment packages
  const purchases = await db.purchase.findMany({
    where: { status: 'active' },
    include: { product: true },
  });

  console.log(`[Profit Cron] Processing ${purchases.length} active product purchases...`);

  for (const purchase of purchases) {
    try {
      // Check if already credited today
      if (purchase.lastProfitDate) {
        const lastDateUTC = new Date(purchase.lastProfitDate);
        const lastDateMs = lastDateUTC.getTime() + lastDateUTC.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000;
        const lastDateWIB = new Date(lastDateMs);
        if (lastDateWIB.getFullYear() === todayWIB.year &&
            lastDateWIB.getMonth() === todayWIB.month &&
            lastDateWIB.getDate() === todayWIB.date) {
          continue; // Already credited today
        }
      }

      // Calculate daily profit: totalPrice × (profitRate / 100)
      const productProfitRate = purchase.product?.profitRate || 0;
      const dailyProfit = Math.floor(purchase.totalPrice * (productProfitRate / 100));

      if (dailyProfit <= 0) continue;

      await db.$transaction(async (tx) => {
        // Re-check inside transaction
        const currentPurchase = await tx.purchase.findUnique({ where: { id: purchase.id } });
        if (currentPurchase?.lastProfitDate) {
          const lastDateUTC = new Date(currentPurchase.lastProfitDate);
          const lastDateMs = lastDateUTC.getTime() + lastDateUTC.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000;
          const lastDateWIB = new Date(lastDateMs);
          if (lastDateWIB.getFullYear() === todayWIB.year &&
              lastDateWIB.getMonth() === todayWIB.month &&
              lastDateWIB.getDate() === todayWIB.date) {
            return;
          }
        }

        // 1. Credit daily profit to user's mainBalance
        await tx.user.update({
          where: { id: purchase.userId },
          data: {
            mainBalance: { increment: dailyProfit },
            totalProfit: { increment: dailyProfit },
          },
        });

        // 2. Update purchase record
        await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            profitEarned: { increment: dailyProfit },
            dailyProfit: dailyProfit,
            lastProfitDate: new Date(),  // Store real UTC time
          },
        });

        // 3. Create profit log
        await tx.profitLog.create({
          data: {
            purchaseId: purchase.id,
            userId: purchase.userId,
            amount: dailyProfit,
          },
        });

        // 4. Create bonus log for daily profit
        await tx.bonusLog.create({
          data: {
            userId: purchase.userId,
            fromUserId: purchase.userId,
            type: 'profit',
            level: 0,
            amount: dailyProfit,
            description: `Profit harian produk ${purchase.product?.name || 'Produk'} (${purchase.quantity}x) — ${formatRupiahSimple(dailyProfit)}`,
          },
        });

        // 5. Event-driven matching bonus
        const matchResult = await creditMatchingOnProfit(tx, purchase.userId, dailyProfit);
        if (matchResult.totalMatchCredited > 0) {
          result.totalMatching += matchResult.totalMatchCredited;
        }
      });

      result.processed++;
      result.totalProfit += dailyProfit;
    } catch (error: unknown) {
      result.errors++;
      const message = error instanceof Error ? error.message : String(error);
      result.errorDetails.push(`Purchase ${purchase.id}: ${message}`);
      console.error(`[Profit Cron] ❌ Purchase ${purchase.id}: ${message}`);
    }
  }

  console.log(`[Profit Cron] Done. Processed: ${result.processed}, Total Profit: ${formatRupiahSimple(result.totalProfit)}, Total Matching: ${formatRupiahSimple(result.totalMatching)}, Errors: ${result.errors}`);
  return result;
}

// ──────────── API Route Handler ────────────

export async function POST(request: NextRequest) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Invalid or missing cron secret.' },
      { status: 401 },
    );
  }

  try {
    console.log('[Cron API] 🌅 Manual trigger: Daily investment profit + matching bonus');
    const startTime = Date.now();
    const result = await processDailyInvestmentProfits();
    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        durationMs,
        wibTime: getWibNow().toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Cron API] Profit cron error:', message);
    return NextResponse.json(
      { success: false, error: 'Cron execution failed', details: message },
      { status: 500 },
    );
  }
}

// Also support GET for simpler cron triggers (e.g., Hostinger cron panel)
export async function GET(request: NextRequest) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Invalid or missing cron secret.' },
      { status: 401 },
    );
  }

  try {
    console.log('[Cron API] 🌅 GET trigger: Daily investment profit + matching bonus');
    const startTime = Date.now();
    const result = await processDailyInvestmentProfits();
    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        durationMs,
        wibTime: getWibNow().toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Cron API] Profit cron error:', message);
    return NextResponse.json(
      { success: false, error: 'Cron execution failed', details: message },
      { status: 500 },
    );
  }
}
