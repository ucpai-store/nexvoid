import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';
import { sendPushNotification } from '@/lib/push-notification';

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

  const wibNow = getWibNow();
  const dayOfWeek = wibNow.getDay();
  const todayWIB = getWibDateString(new Date());

  // ★ Profit dikredit TIAP HARI (termasuk Sabtu & Minggu) — 160k × 2% = 3.200/hari × 180 hari = 576.000 total.
  // Tidak ada weekend guard lagi. force=true hanya untuk bypass "already credited today" check.

  const investments = await db.investment.findMany({
    where: { status: 'active' },
    include: { package: true },
  });

  console.log(`[Admin Profit Trigger] Processing ${investments.length} active investments...`);

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

      // ★ Use stored dailyProfit (preferred) — untuk Product purchases yang link ke _internal_default package (profitRate=0).
      // Fallback ke package.profitRate hanya kalau stored dailyProfit = 0 (legacy InvestmentPackage purchases).
      const dailyProfit = inv.dailyProfit > 0
        ? inv.dailyProfit
        : Math.floor(inv.amount * (inv.package.profitRate / 100));
      if (dailyProfit <= 0) {
        result.skipped++;
        continue;
      }

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
            mainBalance: { increment: dailyProfit },
            totalProfit: { increment: dailyProfit },
          },
        });

        await tx.investment.update({
          where: { id: inv.id },
          data: {
            totalProfitEarned: { increment: dailyProfit },
            dailyProfit: dailyProfit,
            lastProfitDate: new Date(),
          },
        });

        await tx.bonusLog.create({
          data: {
            userId: inv.userId,
            fromUserId: inv.userId,
            type: 'profit',
            level: 0,
            amount: dailyProfit,
            description: options?.force
              ? `[ADMIN TRIGGER] Profit harian ${inv.package.name} — ${formatRupiahSimple(inv.amount)} × ${inv.package.profitRate}% = ${formatRupiahSimple(dailyProfit)}`
              : `Profit harian ${inv.package.name} — ${formatRupiahSimple(inv.amount)} × ${inv.package.profitRate}% = ${formatRupiahSimple(dailyProfit)}`,
          },
        });

        const matchAmount = await creditMatchingOnProfit(tx, inv.userId, dailyProfit);
        result.totalMatching += matchAmount;
      });

      result.processed++;
      result.totalProfit += dailyProfit;

      sendPushNotification(inv.userId, "user", "💰 Profit Harian", `Anda mendapat profit Rp ${Math.floor(dailyProfit).toLocaleString("id-ID")} hari ini`, { type: "daily_profit", amount: dailyProfit }).catch(() => {});
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

      const investments = await db.investment.findMany({
        where: { status: 'active' },
        include: { package: true, user: { select: { userId: true, name: true } } },
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

    const investments = await db.investment.findMany({
      where: { status: 'active' },
      include: { package: true, user: { select: { userId: true, name: true } } },
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
