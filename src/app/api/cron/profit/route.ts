import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { creditDailyReferralBonuses } from '@/lib/referral-bonus';
import { sendPushNotification } from '@/lib/push-notification';

// ★ CRITICAL FIX v7: Force dynamic — disable Next.js route cache.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

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

// ★ v2.7 ATOMIC CLAIM FIX (mirror cron-service.ts v2.7)
//   Returns WIB date string "YYYY-MM-DD" for a given Date.
function getWibDateString(date: Date): string {
  const wibDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
  return `${wibDate.getFullYear()}-${String(wibDate.getMonth() + 1).padStart(2, '0')}-${String(wibDate.getDate()).padStart(2, '0')}`;
}

function getTodayWibDateString(): string {
  return getWibDateString(new Date());
}

/**
 * Count weekdays (Mon-Fri) MISSED between lastCreditDateStr+1 and todayStr (EXCLUSIVE today).
 * Used for backfill: e.g., if last credit was Thursday and today is Monday,
 * missed days = Friday (1 day, since Sat/Sun are skipped).
 *
 * @param lastCreditDateStr  WIB date string "YYYY-MM-DD" of last successful credit
 * @param todayStr           WIB date string "YYYY-MM-DD" of today
 * @returns number of weekdays missed (0 if none)
 */
function countWeekdaysMissed(lastCreditDateStr: string, todayStr: string): number {
  const [ly, lm, ld] = lastCreditDateStr.split('-').map(Number);
  const [ty, tm, td] = todayStr.split('-').map(Number);
  // Start from day AFTER last credit (the first potentially-missed day)
  const start = new Date(Date.UTC(ly, lm - 1, ld + 1));
  // End at today (exclusive — today is handled separately)
  const end = new Date(Date.UTC(ty, tm - 1, td));

  let count = 0;
  const cursor = new Date(start);
  let safety = 60;
  while (cursor < end && safety-- > 0) {
    const dow = cursor.getUTCDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
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
  totalReferral: number;
  errors: number;
  errorDetails: string[];
}> {
  const result = { processed: 0, totalProfit: 0, totalMatching: 0, totalReferral: 0, errors: 0, errorDetails: [] as string[] };

  const now = getWibNow();
  const todayWIB = getTodayWibDateString();
  const todayDow = now.getDay(); // 0=Sun, 6=Sat
  const isTodayWeekday = todayDow !== 0 && todayDow !== 6;

  // ★★★ v2.5 BULLETPROOF: NO status filter — fetch ALL investments, use endDate
  //   as source of truth. Old code filtered status='active' which returned 0
  //   if VPS had any status variation (Active/ACTIVE/ongoing/completed/stopped).
  const allInvestments = await db.investment.findMany({
    include: { package: true },
  });
  const investments = allInvestments.filter((inv) => {
    if (!inv.endDate) return true; // no endDate = treat as active
    return new Date(inv.endDate) > now;
  });

  console.log(`[Profit Cron] Processing ${investments.length} active investments (total=${allInvestments.length}, today=${todayWIB}, dow=${todayDow}, weekday=${isTodayWeekday})...`);

  for (const inv of investments) {
    try {
      // ─── Skip if already credited today (using WIB date string) ───
      if (inv.lastProfitDate) {
        const lastProfitWIB = getWibDateString(new Date(inv.lastProfitDate));
        if (lastProfitWIB === todayWIB) {
          continue;
        }
      }

      // ─── Skip if bought today (profit starts next weekday) ───
      const createdDate = inv.startDate ? new Date(inv.startDate) : new Date(inv.createdAt);
      const createdWIB = getWibDateString(createdDate);
      if (createdWIB === todayWIB) {
        continue;
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

      // ★ BUG FIX: Use stored inv.dailyProfit — do NOT recompute from inv.package.profitRate.
      //   For Product (VIP) purchases, packageId is linked to `_internal_default` (profitRate=0)
      //   which made dailyProfit=0 → profit never credited.
      //   The stored `inv.dailyProfit` is the TRUE daily profit (set at purchase time).
      const dailyProfit = inv.dailyProfit && inv.dailyProfit > 0
        ? inv.dailyProfit
        : Math.floor(inv.amount * ((inv.package?.profitRate || 0) / 100));
      if (dailyProfit <= 0) {
        console.log(`[Profit Cron] ⚠️ Investment ${inv.id} has dailyProfit=0 — skipping`);
        continue;
      }

      // ─── BACKFILL LOGIC: Calculate missed weekdays (EXCLUDING today) ───
      let lastCreditDateStr: string;
      if (inv.lastProfitDate) {
        lastCreditDateStr = getWibDateString(new Date(inv.lastProfitDate));
      } else {
        lastCreditDateStr = createdWIB; // first profit cycle starts day after purchase
      }

      const missedDays = countWeekdaysMissed(lastCreditDateStr, todayWIB);
      // Total days to credit = missed weekdays + today (if today is weekday)
      // Cap at 30 days total for safety (prevents runaway credit on bad data)
      const totalDays = Math.min(missedDays + (isTodayWeekday ? 1 : 0), 30);

      if (totalDays <= 0) {
        // Weekend with no missed days — nothing to credit
        continue;
      }

      const totalCredit = dailyProfit * totalDays;
      const isBackfill = missedDays > 0;

      // ★★★ v2.7 ATOMIC CLAIM — 100% race-condition-proof ★★★
      // Old code used findUnique + compare (read-then-write): 2 processes could
      // both read old lastProfitDate, both pass check, both credit → DOUBLE PROFIT.
      // Fix: use conditional updateMany — only 1 process can successfully update
      // (WHERE clause fails for 2nd process because lastProfitDate is now today).
      // SQLite executes this atomically — no race possible.
      const startOfDayWIBDate = new Date(todayWIB + 'T00:00:00+07:00');
      const invClaim = await db.$transaction(async (tx) => {
        const claim = await tx.investment.updateMany({
          where: {
            id: inv.id,
            OR: [
              { lastProfitDate: null },
              { lastProfitDate: { lt: startOfDayWIBDate } },
            ],
          },
          data: {
            totalProfitEarned: { increment: totalCredit },
            dailyProfit: dailyProfit,
            lastProfitDate: new Date(),
          },
        });
        if (claim.count === 0) {
          return false; // already credited by another process — skip
        }

        // Claim succeeded — now credit user balance + create logs
        await tx.user.update({
          where: { id: inv.userId },
          data: {
            mainBalance: { increment: totalCredit },
            totalProfit: { increment: totalCredit },
          },
        });

        // Create profit log (linked to most recent active purchase if any)
        const purchase = await tx.purchase.findFirst({
          where: { userId: inv.userId, status: 'active' },
          orderBy: { createdAt: 'desc' },
        });

        if (purchase) {
          await tx.profitLog.create({
            data: {
              purchaseId: purchase.id,
              userId: inv.userId,
              amount: totalCredit,
            },
          });

          // Sync Purchase.profitEarned to match Investment.totalProfitEarned
          // (v2.6 fix: prevents drift between Asset page and History page)
          await tx.purchase.update({
            where: { id: purchase.id },
            data: {
              profitEarned: { increment: totalCredit },
              dailyProfit: dailyProfit,
              lastProfitDate: new Date(),
            },
          });
        }

        const pkgName = inv.package?.name || 'Investment';
        const pkgRate = inv.package?.profitRate || (inv.amount > 0 ? (dailyProfit / inv.amount) * 100 : 0);
        const desc = totalDays === 1
          ? `Profit harian ${pkgName} — ${formatRupiahSimple(inv.amount)} x ${pkgRate.toFixed(2)}% = ${formatRupiahSimple(dailyProfit)}`
          : `Profit ${totalDays} hari (${isBackfill ? `${missedDays} tertinggal + ${isTodayWeekday ? 'hari ini' : '0'}` : 'semua hari ini'}) — ${pkgName}: ${formatRupiahSimple(dailyProfit)} x ${totalDays} = ${formatRupiahSimple(totalCredit)}`;

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

        // ★ EVENT-DRIVEN MATCHING BONUS
        const matchResult = await creditMatchingOnProfit(tx, inv.userId, totalCredit);
        if (matchResult.totalMatchCredited > 0) {
          result.totalMatching += matchResult.totalMatchCredited;
        }

        // ★ DAILY REFERRAL BONUS
        const referralResult = await creditDailyReferralBonuses(tx, inv.userId, totalCredit);
        if (referralResult.totalReferralCredited > 0) {
          result.totalReferral += referralResult.totalReferralCredited;
        }
        return true;
      });

      if (!invClaim) {
        // Already credited by another process — skip without error
        continue;
      }

      result.processed++;
      result.totalProfit += totalCredit;

      // Push notification to user about daily profit
      sendPushNotification(inv.userId, "user", "💰 Profit Harian", `Anda mendapat profit Rp ${Math.floor(totalCredit).toLocaleString("id-ID")} ${totalDays > 1 ? `(catchup ${totalDays} hari)` : 'hari ini'}`, { type: "daily_profit", amount: totalCredit }).catch(() => {});
    } catch (error: unknown) {
      result.errors++;
      const message = error instanceof Error ? error.message : String(error);
      result.errorDetails.push(`Investment ${inv.id}: ${message}`);
      console.error(`[Profit Cron] ❌ Investment ${inv.id}: ${message}`);
    }
  }

  // ═══════ Purchase (Product) Profit Processing ═══════
  // ★ FIX: Purchases that have linked Investment records are ALREADY processed above
  //   (Investment loop credits user balance + BonusLog + ProfitLog + syncs Purchase.profitEarned).
  //   So for linked purchases, we DO NOTHING here — already fully handled.
  //   Only LEGACY purchases (no linked Investment) get profit credited here.
  // ★★★ v2.5 BULLETPROOF: NO status filter — use product duration + createdAt
  const allPurchases = await db.purchase.findMany({
    include: { product: true },
  });
  const purchases = allPurchases.filter((pur) => {
    const contractDays = pur.product?.duration || 90;
    const endDate = new Date(pur.createdAt);
    endDate.setDate(endDate.getDate() + contractDays);
    return endDate > now;
  });

  // Check which purchases already have linked investment records
  const purchaseIdsWithInvestments = new Set(
    investments
      .filter(inv => (inv as any).purchaseId)
      .map(inv => (inv as any).purchaseId!)
  );

  console.log(`[Profit Cron] Checking ${purchases.length} active product purchases (${purchaseIdsWithInvestments.size} have linked investments, ${purchases.length - purchaseIdsWithInvestments.size} legacy standalone)...`);

  for (const purchase of purchases) {
    try {
      // ─── Skip if already credited today (using WIB date string) ───
      if (purchase.lastProfitDate) {
        const lastProfitWIB = getWibDateString(new Date(purchase.lastProfitDate));
        if (lastProfitWIB === todayWIB) {
          continue; // Already credited today
        }
      }

      // ─── Skip if bought today (profit starts next weekday) ───
      const purchaseCreatedWIB = getWibDateString(new Date(purchase.createdAt));
      if (purchaseCreatedWIB === todayWIB) {
        continue;
      }

      if (purchaseIdsWithInvestments.has(purchase.id)) {
        // ★ This purchase has linked Investment records — profit was ALREADY credited
        //   by the Investment loop above (including Purchase.profitEarned sync).
        //   DO NOTHING here — otherwise we'd double-update Purchase.profitEarned.
        continue;
      }

      // ★ LEGACY: This purchase does NOT have linked investments — credit profit here.
      // Use stored purchase.dailyProfit if available, otherwise recompute from product profitRate.
      const productProfitRate = purchase.product?.profitRate || 0;
      const dailyProfit = purchase.dailyProfit && purchase.dailyProfit > 0
        ? purchase.dailyProfit
        : Math.floor(purchase.totalPrice * (productProfitRate / 100));

      if (dailyProfit <= 0) continue;

      // ─── BACKFILL LOGIC (mirror Investment loop) ───
      let lastCreditDateStr: string;
      if (purchase.lastProfitDate) {
        lastCreditDateStr = getWibDateString(new Date(purchase.lastProfitDate));
      } else {
        lastCreditDateStr = purchaseCreatedWIB;
      }

      const missedDays = countWeekdaysMissed(lastCreditDateStr, todayWIB);
      const totalDays = Math.min(missedDays + (isTodayWeekday ? 1 : 0), 30);

      if (totalDays <= 0) {
        continue; // Weekend with no missed days
      }

      const totalCredit = dailyProfit * totalDays;

      // ★★★ v2.7 ATOMIC CLAIM for Purchase (race-condition-proof) ★★★
      const startOfDayWIBDate = new Date(todayWIB + 'T00:00:00+07:00');
      const purClaim = await db.$transaction(async (tx) => {
        const claim = await tx.purchase.updateMany({
          where: {
            id: purchase.id,
            OR: [
              { lastProfitDate: null },
              { lastProfitDate: { lt: startOfDayWIBDate } },
            ],
          },
          data: {
            profitEarned: { increment: totalCredit },
            dailyProfit: dailyProfit,
            lastProfitDate: new Date(),
          },
        });
        if (claim.count === 0) {
          return false; // already credited by another process
        }

        // Credit user balance
        await tx.user.update({
          where: { id: purchase.userId },
          data: {
            mainBalance: { increment: totalCredit },
            totalProfit: { increment: totalCredit },
          },
        });

        // Create profit log
        await tx.profitLog.create({
          data: {
            purchaseId: purchase.id,
            userId: purchase.userId,
            amount: totalCredit,
          },
        });

        // Create bonus log
        const prodName = purchase.product?.name || 'Produk';
        const desc = totalDays === 1
          ? `Profit harian produk ${prodName} (${purchase.quantity}x) — ${formatRupiahSimple(dailyProfit)}`
          : `Profit ${totalDays} hari produk ${prodName} (${purchase.quantity}x) — ${formatRupiahSimple(dailyProfit)} x ${totalDays} = ${formatRupiahSimple(totalCredit)}`;
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

        // Event-driven matching bonus
        const matchResult = await creditMatchingOnProfit(tx, purchase.userId, totalCredit);
        if (matchResult.totalMatchCredited > 0) {
          result.totalMatching += matchResult.totalMatchCredited;
        }

        // Daily referral bonus
        const referralResult = await creditDailyReferralBonuses(tx, purchase.userId, totalCredit);
        if (referralResult.totalReferralCredited > 0) {
          result.totalReferral += referralResult.totalReferralCredited;
        }
        return true;
      });

      if (!purClaim) {
        continue; // Already credited by another process
      }

      result.processed++;
      result.totalProfit += totalCredit;

      // Push notification
      sendPushNotification(purchase.userId, "user", "💰 Profit Harian", `Anda mendapat profit Rp ${Math.floor(totalCredit).toLocaleString("id-ID")} ${totalDays > 1 ? `(catchup ${totalDays} hari)` : 'hari ini'}`, { type: "daily_profit", amount: totalCredit }).catch(() => {});
    } catch (error: unknown) {
      result.errors++;
      const message = error instanceof Error ? error.message : String(error);
      result.errorDetails.push(`Purchase ${purchase.id}: ${message}`);
      console.error(`[Profit Cron] ❌ Purchase ${purchase.id}: ${message}`);
    }
  }

  console.log(`[Profit Cron] Done. Processed: ${result.processed}, Total Profit: ${formatRupiahSimple(result.totalProfit)}, Total Matching: ${formatRupiahSimple(result.totalMatching)}, Total Referral: ${formatRupiahSimple(result.totalReferral)}, Errors: ${result.errors}`);
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
    // ─── WEEKEND BLOCK: No profit distribution on Saturday & Sunday ───
    const wibNow = getWibNow();
    const dayOfWeek = wibNow.getDay(); // 0=Sunday, 6=Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      const dayName = dayOfWeek === 0 ? 'Minggu' : 'Sabtu';
      console.log(`[Cron API] ⏸️ Profit cron skipped — today is ${dayName} (weekend libur). Profit & WD off — deposit & salary tetap jalan.`);
      return NextResponse.json({
        success: true,
        data: {
          processed: 0,
          totalProfit: 0,
          totalMatching: 0,
          totalReferral: 0,
          errors: 0,
          errorDetails: [],
          skipped: true,
          skipReason: `Weekend (${dayName}) — profit & WD libur di akhir pekan`,
          durationMs: 0,
          wibTime: wibNow.toISOString(),
        },
      });
    }

    console.log('[Cron API] 🌅 Manual trigger: Daily investment profit + matching bonus');
    const startTime = Date.now();
    const result = await processDailyInvestmentProfits();
    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        durationMs,
        wibTime: wibNow.toISOString(),
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
    // ─── WEEKEND BLOCK: No profit distribution on Saturday & Sunday ───
    const wibNow = getWibNow();
    const dayOfWeek = wibNow.getDay(); // 0=Sunday, 6=Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      const dayName = dayOfWeek === 0 ? 'Minggu' : 'Sabtu';
      console.log(`[Cron API] ⏸️ GET profit cron skipped — today is ${dayName} (weekend libur). Profit & WD off — deposit & salary tetap jalan.`);
      return NextResponse.json({
        success: true,
        data: {
          processed: 0,
          totalProfit: 0,
          totalMatching: 0,
          totalReferral: 0,
          errors: 0,
          errorDetails: [],
          skipped: true,
          skipReason: `Weekend (${dayName}) — profit & WD libur di akhir pekan`,
          durationMs: 0,
          wibTime: wibNow.toISOString(),
        },
      });
    }

    console.log('[Cron API] 🌅 GET trigger: Daily investment profit + matching bonus');
    const startTime = Date.now();
    const result = await processDailyInvestmentProfits();
    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        durationMs,
        wibTime: wibNow.toISOString(),
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
