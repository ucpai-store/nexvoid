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
 * Count WEEKDAYS (Mon-Fri) between two dates (exclusive start, inclusive end).
 * Sat/Sun are LIBUR — not counted in catchup.
 */
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

  console.log(`[Admin Profit Trigger] Processing ${investments.length} active investments (total=${allInvestments.length})...`);

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

      // Skip if investment was created today (same WIB day)
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

      // ★ HARD CAP: total profit cannot exceed dailyProfit × contractDays
      const dailyProfit = Math.floor(inv.amount * (inv.package.profitRate / 100));
      if (dailyProfit <= 0) {
        result.skipped++;
        continue;
      }
      const contractDays = inv.package.contractDays || 180;
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

      // ★ AUTO-CATCHUP: credit all missed WEEKDAYS at once (capped by remainingCap) ★
      // Weekend (Sat/Sun) = LIBUR, tidak dihitung dalam catchup
      let missedDays = 1;
      if (inv.lastProfitDate) {
        const lastProfitWIB = getWibDateString(new Date(inv.lastProfitDate));
        if (lastProfitWIB !== todayWIB || options?.force) {
          const lastDate = new Date(inv.lastProfitDate);
          const lastWib = new Date(lastDate.getTime() + lastDate.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
          missedDays = countWeekdaysBetween(lastWib, wibNow);
          if (missedDays <= 0) {
            result.skipped++;
            continue; // already credited all weekdays up to today
          }
        } else {
          result.skipped++;
          continue; // Already credited today
        }
      }

      let creditAmount = dailyProfit * missedDays;
      let willComplete = false;
      if (creditAmount >= remainingCap) {
        creditAmount = remainingCap;
        willComplete = true;
      }
      const daysCredited = Math.ceil(creditAmount / dailyProfit);

      await db.$transaction(async (tx) => {
        // Re-check inside transaction
        if (!options?.force) {
          const currentInv = await tx.investment.findUnique({ where: { id: inv.id } });
          if (currentInv?.lastProfitDate) {
            const lastProfitWIB = getWibDateString(new Date(currentInv.lastProfitDate));
            if (lastProfitWIB === todayWIB) return;
          }
        }

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
            dailyProfit: dailyProfit,
            lastProfitDate: new Date(),
            ...(willComplete ? { status: 'completed' as const, endDate: new Date() } : {}),
          },
        });

        const catchupNote = missedDays > 1 ? ` [CATCHUP ${daysCredited} hari]` : '';
        const capNote = willComplete ? ` [HARD CAP ${formatRupiahSimple(hardCap)} → SELESAI]` : '';
        await tx.bonusLog.create({
          data: {
            userId: inv.userId,
            fromUserId: inv.userId,
            type: 'profit',
            level: 0,
            amount: creditAmount,
            description: options?.force
              ? `[ADMIN TRIGGER] Profit harian ${inv.package.name} — ${formatRupiahSimple(creditAmount)}${catchupNote}${capNote}`
              : `Profit harian ${inv.package.name} — ${formatRupiahSimple(creditAmount)}${catchupNote}${capNote}`,
          },
        });

        const matchAmount = await creditMatchingOnProfit(tx, inv.userId, creditAmount);
        result.totalMatching += matchAmount;
      });

      result.processed++;
      result.totalProfit += creditAmount;

      sendPushNotification(inv.userId, "user", "💰 Profit Harian", `Anda mendapat profit Rp ${Math.floor(creditAmount).toLocaleString("id-ID")} ${missedDays > 1 ? `(catchup ${daysCredited} hari)` : 'hari ini'}`, { type: "daily_profit", amount: creditAmount }).catch(() => {});
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
