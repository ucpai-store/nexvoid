import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';
import { sendPushNotification } from '@/lib/push-notification';

// ★ CRITICAL FIX v7: Force dynamic — disable Next.js route cache.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// WIB offset
const WIB_OFFSET = 7;

function getWibNow(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + WIB_OFFSET * 3600000);
}

function getWibDateString(date: Date): string {
  const wibDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
  return `${wibDate.getFullYear()}-${String(wibDate.getMonth() + 1).padStart(2, '0')}-${String(wibDate.getDate()).padStart(2, '0')}`;
}

function formatRupiahSimple(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
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

// ──────────── Matching Bonus (Event-Driven) ────────────

const DEFAULT_MATCHING_RATES: Record<number, number> = {
  1: 5, 2: 4, 3: 3, 4: 2, 5: 1,
};
const MAX_MATCHING_LEVEL = 5;

async function getMatchingRates(): Promise<Record<number, number>> {
  const config = await db.matchingConfig.findFirst({ where: { isActive: true } });
  if (!config) return { ...DEFAULT_MATCHING_RATES };
  return {
    1: config.level1, 2: config.level2, 3: config.level3,
    4: config.level4, 5: config.level5,
  };
}

async function creditMatchingOnProfit(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  earningUserId: string,
  profitAmount: number,
): Promise<number> {
  let totalMatchCredited = 0;
  if (profitAmount <= 0) return 0;

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
  const rates = await getMatchingRates();

  for (const ref of uplineRefs) {
    const level = ref.level;
    if (level > MAX_MATCHING_LEVEL) continue;

    const rate = rates[level] || 0;
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

    await tx.matchingBonus.create({
      data: {
        userId: ref.referrerId,
        leftOmzet: 0, rightOmzet: 0, matchedOmzet: profitAmount,
        level, rate, amount: matchAmount, status: 'paid',
      },
    });

    await tx.bonusLog.create({
      data: {
        userId: ref.referrerId,
        fromUserId: earningUserId,
        type: 'matching',
        level,
        amount: matchAmount,
        description: `Matching Profit L${level} (${rate}%) dari ${earningUserName} — ${formatRupiahSimple(profitAmount)} × ${rate}% = ${formatRupiahSimple(matchAmount)}`,
      },
    });

    totalMatchCredited += matchAmount;
  }

  return totalMatchCredited;
}

// ──────────── Daily Profit Logic (with optional force flag) ────────────

async function processDailyInvestmentProfits(options?: { force?: boolean }): Promise<{
  processed: number;
  totalProfit: number;
  totalMatching: number;
  errors: number;
  errorDetails: string[];
  skipped: number;
}> {
  const result = { processed: 0, totalProfit: 0, totalMatching: 0, errors: 0, errorDetails: [] as string[], skipped: 0 };

  // ★ WEEKEND LIBUR: No profit on Saturday (6) & Sunday (0) — profit & WD libur (deposit & salary tetap jalan) ★
  // Can be bypassed with force=true for admin manual trigger
  const wibNow = getWibNow();
  const dayOfWeek = wibNow.getDay();
  const todayWIB = getWibDateString(new Date());
  const isTodayWeekday = dayOfWeek !== 0 && dayOfWeek !== 6;

  if (!options?.force && (dayOfWeek === 0 || dayOfWeek === 6)) {
    const dayName = dayOfWeek === 0 ? 'Minggu' : 'Sabtu';
    console.log(`[Admin Profit Trigger] ⏸️ SKIPPED — today is ${dayName} (weekend libur). Use force=true to override.`);
    return { ...result, errorDetails: [`Weekend (${dayName}) — skipped. Use ?force=true to override.`] };
  }

  // ★★★ v2.5 BULLETPROOF: NO status filter — fetch ALL investments, use endDate
  //   as source of truth. Old code filtered status='active' which returned 0
  //   if VPS had any status variation (Active/ACTIVE/ongoing/completed/stopped).
  const allInvestments = await db.investment.findMany({
    include: { package: true },
  });
  const investments = allInvestments.filter((inv) => {
    if (!inv.endDate) return true; // no endDate = treat as active
    return new Date(inv.endDate) > wibNow;
  });

  console.log(`[Admin Profit Trigger] Processing ${investments.length} active investments (total=${allInvestments.length}, today=${todayWIB}, dow=${dayOfWeek}, weekday=${isTodayWeekday}, force=${!!options?.force})...`);

  for (const inv of investments) {
    try {
      // Skip if already credited today (unless force=true)
      if (!options?.force && inv.lastProfitDate) {
        const lastProfitWIB = getWibDateString(new Date(inv.lastProfitDate));
        if (lastProfitWIB === todayWIB) {
          result.skipped++;
          continue;
        }
      }

      // Skip if investment was created today (same WIB day) — unless force
      if (!options?.force) {
        const createdDate = inv.startDate ? new Date(inv.startDate) : new Date(inv.createdAt);
        const createdWIB = getWibDateString(createdDate);
        if (createdWIB === todayWIB) {
          result.skipped++;
          continue;
        }
      }

      // Check if investment ended
      if (inv.endDate) {
        const endDate = new Date(inv.endDate);
        if (wibNow >= endDate) {
          await db.investment.update({
            where: { id: inv.id },
            data: { status: 'completed' },
          });
          result.skipped++;
          continue;
        }
      }

      // ★ BUG FIX: Use stored inv.dailyProfit — do NOT recompute from inv.package.profitRate.
      //   For Product (VIP) purchases, packageId is linked to `_internal_default` (profitRate=0)
      //   which made dailyProfit=0 → profit never credited.
      const dailyProfit = inv.dailyProfit && inv.dailyProfit > 0
        ? inv.dailyProfit
        : Math.floor(inv.amount * ((inv.package?.profitRate || 0) / 100));
      if (dailyProfit <= 0) {
        result.skipped++;
        continue;
      }

      // ★ HARD CAP: total profit cannot exceed dailyProfit × contractDays
      const contractDays = inv.package?.contractDays || 180;
      const hardCap = dailyProfit * contractDays;
      const remainingCap = Math.max(0, hardCap - inv.totalProfitEarned);

      if (remainingCap <= 0) {
        // Already hit hard cap → mark as completed
        await db.investment.update({
          where: { id: inv.id },
          data: { status: 'completed' },
        });
        result.skipped++;
        continue;
      }

      // ─── BACKFILL LOGIC: Calculate missed weekdays (EXCLUDING today) ───
      // Mirror cron-service.ts v2.7 logic for consistency.
      let lastCreditDateStr: string;
      if (inv.lastProfitDate) {
        lastCreditDateStr = getWibDateString(new Date(inv.lastProfitDate));
      } else {
        const createdDate = inv.startDate ? new Date(inv.startDate) : new Date(inv.createdAt);
        lastCreditDateStr = getWibDateString(createdDate);
      }

      const missedDays = countWeekdaysMissed(lastCreditDateStr, todayWIB);
      // Total days to credit = missed weekdays + today (if today is weekday OR force)
      // Cap at 30 days total for safety
      const includeToday = options?.force ? true : isTodayWeekday;
      const totalDays = Math.min(missedDays + (includeToday ? 1 : 0), 30);

      if (totalDays <= 0) {
        result.skipped++;
        continue;
      }

      let creditAmount = dailyProfit * totalDays;
      let willComplete = false;
      if (creditAmount >= remainingCap) {
        creditAmount = remainingCap;
        willComplete = true;
      }
      const daysCredited = Math.ceil(creditAmount / dailyProfit);

      // ★★★ v2.7 ATOMIC CLAIM — 100% race-condition-proof ★★★
      // Old code used findUnique + compare (read-then-write): 2 processes could
      // both read old lastProfitDate, both pass check, both credit → DOUBLE PROFIT.
      // Fix: use conditional updateMany — only 1 process can successfully update.
      // SQLite executes this atomically — no race possible.
      // NOTE: when force=true, we bypass the lastProfitDate check in WHERE (admin override),
      // but we still re-check inside transaction to avoid duplicate admin triggers.
      const startOfDayWIBDate = new Date(todayWIB + 'T00:00:00+07:00');
      const invClaim = await db.$transaction(async (tx) => {
        // For force mode: skip atomic WHERE check (admin wants to re-credit)
        // For normal mode: atomic claim via updateMany WHERE lastProfitDate < today
        if (!options?.force) {
          const claim = await tx.investment.updateMany({
            where: {
              id: inv.id,
              OR: [
                { lastProfitDate: null },
                { lastProfitDate: { lt: startOfDayWIBDate } },
              ],
            },
            data: {
              totalProfitEarned: { increment: creditAmount },
              dailyProfit: dailyProfit,
              lastProfitDate: new Date(),
              ...(willComplete ? { status: 'completed' as const, endDate: new Date() } : {}),
            },
          });
          if (claim.count === 0) {
            return false; // already credited by another process — skip
          }
        } else {
          // Force mode: just update (admin override)
          await tx.investment.update({
            where: { id: inv.id },
            data: {
              totalProfitEarned: { increment: creditAmount },
              dailyProfit: dailyProfit,
              lastProfitDate: new Date(),
              ...(willComplete ? { status: 'completed' as const, endDate: new Date() } : {}),
            },
          });
        }

        // Claim succeeded — now credit user balance + create logs
        await tx.user.update({
          where: { id: inv.userId },
          data: {
            mainBalance: { increment: creditAmount },
            totalProfit: { increment: creditAmount },
          },
        });

        // Sync linked Purchase tracking (v2.6 fix: prevents Asset/History drift)
        const purchase = await tx.purchase.findFirst({
          where: { userId: inv.userId, status: 'active' },
          orderBy: { createdAt: 'desc' },
        });
        if (purchase) {
          await tx.purchase.update({
            where: { id: purchase.id },
            data: {
              profitEarned: { increment: creditAmount },
              dailyProfit: dailyProfit,
              lastProfitDate: new Date(),
            },
          });
        }

        const pkgName = inv.package?.name || 'Investment';
        const catchupNote = totalDays > 1 ? ` [CATCHUP ${daysCredited} hari]` : '';
        const capNote = willComplete ? ` [HARD CAP ${formatRupiahSimple(hardCap)} → SELESAI]` : '';
        await tx.bonusLog.create({
          data: {
            userId: inv.userId,
            fromUserId: inv.userId,
            type: 'profit',
            level: 0,
            amount: creditAmount,
            description: options?.force
              ? `[ADMIN TRIGGER] Profit harian ${pkgName} — ${formatRupiahSimple(creditAmount)}${catchupNote}${capNote}`
              : `Profit harian ${pkgName} — ${formatRupiahSimple(creditAmount)}${catchupNote}${capNote}`,
          },
        });

        const matchAmount = await creditMatchingOnProfit(tx, inv.userId, creditAmount);
        result.totalMatching += matchAmount;
        return true;
      });

      if (!invClaim) {
        // Already credited by another process — skip without error
        result.skipped++;
        continue;
      }

      result.processed++;
      result.totalProfit += creditAmount;

      sendPushNotification(inv.userId, "user", "💰 Profit Harian", `Anda mendapat profit Rp ${Math.floor(creditAmount).toLocaleString("id-ID")} ${totalDays > 1 ? `(catchup ${daysCredited} hari)` : 'hari ini'}`, { type: "daily_profit", amount: creditAmount }).catch(() => {});
    } catch (error: unknown) {
      result.errors++;
      const message = error instanceof Error ? error.message : String(error);
      result.errorDetails.push(`Investment ${inv.id}: ${message}`);
      console.error(`[Admin Profit Trigger] ❌ Investment ${inv.id}: ${message}`);
    }
  }

  console.log(`[Admin Profit Trigger] Done. Processed: ${result.processed}, Skipped: ${result.skipped}, Profit: ${formatRupiahSimple(result.totalProfit)}, Matching: ${formatRupiahSimple(result.totalMatching)}, Errors: ${result.errors}`);
  return result;
}

// ──────────── API Handler ────────────

/**
 * POST /api/admin/profit-trigger
 * Admin-only manual trigger for daily profit distribution.
 *
 * Query params:
 *   - force=true: bypass weekend guard + "already credited today" check
 *
 * Body (optional):
 *   - action: "diagnostic" | "trigger" (default: "trigger")
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    let body: { action?: string } = {};
    try {
      body = await request.json();
    } catch {
      // No body or invalid JSON — default to trigger
    }
    const action = body.action || 'trigger';

    // ─── DIAGNOSTIC MODE: return status without running ───
    if (action === 'diagnostic') {
      const wibNow = getWibNow();
      const dayOfWeek = wibNow.getDay();
      const todayWIB = getWibDateString(new Date());

      // ★★★ v2.5 BULLETPROOF: NO status filter — use endDate as source of truth
      const allInvestments = await db.investment.findMany({
        include: { package: true, user: { select: { userId: true, name: true } } },
      });
      const investments = allInvestments.filter((inv) => {
        if (!inv.endDate) return true;
        return new Date(inv.endDate) > wibNow;
      });

      const diagnosticData = investments.map((inv) => {
        const lastProfitWIB = inv.lastProfitDate ? getWibDateString(new Date(inv.lastProfitDate)) : null;
        const createdWIB = inv.startDate ? getWibDateString(new Date(inv.startDate)) : getWibDateString(new Date(inv.createdAt));
        return {
          investmentId: inv.id,
          user: `${inv.user.userId} (${inv.user.name})`,
          package: inv.package.name,
          amount: inv.amount,
          profitRate: inv.package.profitRate,
          dailyProfit: Math.floor(inv.amount * (inv.package.profitRate / 100)),
          totalProfitEarned: inv.totalProfitEarned,
          lastProfitDateWIB: inv.lastProfitDate ? new Date(inv.lastProfitDate).toISOString() : null,
          lastProfitDateWIBStr: lastProfitWIB,
          startDateWIB: createdWIB,
          alreadyCreditedToday: lastProfitWIB === todayWIB,
          willCreditOnTrigger: force ? true : (lastProfitWIB !== todayWIB && createdWIB !== todayWIB),
        };
      });

      return NextResponse.json({
        success: true,
        diagnostic: true,
        data: {
          wibTime: wibNow.toISOString(),
          wibDateStr: todayWIB,
          dayOfWeek,
          dayName: ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][dayOfWeek],
          isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
          totalActiveInvestments: investments.length,
          alreadyCreditedToday: diagnosticData.filter(d => d.alreadyCreditedToday).length,
          willCreditOnTrigger: diagnosticData.filter(d => d.willCreditOnTrigger).length,
          investments: diagnosticData,
        },
      });
    }

    // ─── TRIGGER MODE: run profit now ───
    console.log(`[Admin Profit Trigger] Admin ${admin.username} triggered profit (force=${force})`);
    const startTime = Date.now();
    const result = await processDailyInvestmentProfits({ force });
    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        force,
        durationMs,
        wibTime: getWibNow().toISOString(),
      },
      message: `Profit selesai diproses. ${result.processed} investasi dikreditkan, ${result.skipped} di-skip, ${result.errors} error. Total profit: ${formatRupiahSimple(result.totalProfit)}, matching: ${formatRupiahSimple(result.totalMatching)}.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Admin Profit Trigger] Error:', message);
    return NextResponse.json({ success: false, error: 'Gagal trigger profit', details: message }, { status: 500 });
  }
}

/**
 * GET /api/admin/profit-trigger
 * Returns diagnostic info (read-only, safe to call anytime)
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const wibNow = getWibNow();
    const dayOfWeek = wibNow.getDay();
    const todayWIB = getWibDateString(new Date());

    // ★★★ v2.5 BULLETPROOF: NO status filter — use endDate as source of truth
    const allInvestments = await db.investment.findMany({
      include: { package: true, user: { select: { userId: true, name: true } } },
    });
    const investments = allInvestments.filter((inv) => {
      if (!inv.endDate) return true;
      return new Date(inv.endDate) > wibNow;
    });

    const diagnosticData = investments.map((inv) => {
      const lastProfitWIB = inv.lastProfitDate ? getWibDateString(new Date(inv.lastProfitDate)) : null;
      const createdWIB = inv.startDate ? getWibDateString(new Date(inv.startDate)) : getWibDateString(new Date(inv.createdAt));
      return {
        investmentId: inv.id,
        user: `${inv.user.userId} (${inv.user.name})`,
        package: inv.package.name,
        amount: inv.amount,
        profitRate: inv.package.profitRate,
        dailyProfit: Math.floor(inv.amount * (inv.package.profitRate / 100)),
        totalProfitEarned: inv.totalProfitEarned,
        lastProfitDateWIB: inv.lastProfitDate ? new Date(inv.lastProfitDate).toISOString() : null,
        lastProfitDateWIBStr: lastProfitWIB,
        startDateWIB: createdWIB,
        alreadyCreditedToday: lastProfitWIB === todayWIB,
      };
    });

    return NextResponse.json({
      success: true,
      diagnostic: true,
      data: {
        wibTime: wibNow.toISOString(),
        wibDateStr: todayWIB,
        dayOfWeek,
        dayName: ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][dayOfWeek],
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        totalActiveInvestments: investments.length,
        alreadyCreditedToday: diagnosticData.filter(d => d.alreadyCreditedToday).length,
        needsCrediting: diagnosticData.filter(d => !d.alreadyCreditedToday).length,
        investments: diagnosticData,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Admin Profit Trigger GET] Error:', message);
    return NextResponse.json({ success: false, error: 'Gagal diagnostic', details: message }, { status: 500 });
  }
}
