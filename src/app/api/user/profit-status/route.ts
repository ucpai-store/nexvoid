import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

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

/**
 * GET /api/user/profit-status
 * Returns the user's profit schedule status:
 * - nextProfitTime: when the next daily profit will be credited (00:00 WIB)
 * - lastProfitDate: last time profit was credited for any of their investments
 * - todayProfitCredited: whether today's profit has been credited
 * - totalDailyProfit: total daily profit from all active investments
 * - activeInvestments: count of active investments
 * - matchingBonusMode: how matching bonus works (event-driven)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Tidak terautentikasi' },
        { status: 401 }
      );
    }

    const wibNow = getWibNow();
    const dayOfWeek = wibNow.getDay(); // 0=Sunday, 6=Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Calculate next profit time (00:00 WIB tomorrow)
    // ★ WEEKEND LIBUR: If today is weekend, next profit is next Monday 00:00 WIB ★
    const nextProfitWIB = new Date(wibNow);
    if (isWeekend) {
      // Skip to next Monday
      // If Sunday (0) → +1 day = Monday; If Saturday (6) → +2 days = Monday
      const daysUntilMonday = dayOfWeek === 0 ? 1 : 2;
      nextProfitWIB.setDate(nextProfitWIB.getDate() + daysUntilMonday);
    } else {
      nextProfitWIB.setDate(nextProfitWIB.getDate() + 1);
    }
    nextProfitWIB.setHours(0, 0, 0, 0);

    // Get all active investments for this user
    const activeInvestments = await db.investment.findMany({
      where: { userId: user.id, status: 'active' },
      include: { package: true },
    });

    // Total daily profit
    const totalDailyProfit = activeInvestments.reduce((sum, inv) => sum + inv.dailyProfit, 0);

    // Find the most recent lastProfitDate across all active investments
    const lastProfitDates = activeInvestments
      .map(inv => inv.lastProfitDate)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const lastProfitDate = lastProfitDates.length > 0 ? lastProfitDates[0] : null;

    // Check if today's profit has been credited
    const todayWIB = new Date(wibNow.getFullYear(), wibNow.getMonth(), wibNow.getDate());
    let todayProfitCredited = false;
    if (lastProfitDate) {
      const lastDate = new Date(lastProfitDate);
      // Convert lastProfitDate to WIB for comparison
      const lastWIB = new Date(lastDate.getTime() + lastDate.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
      todayProfitCredited = (
        lastWIB.getFullYear() === todayWIB.getFullYear() &&
        lastWIB.getMonth() === todayWIB.getMonth() &&
        lastWIB.getDate() === todayWIB.getDate()
      );
    }

    // Get today's earnings (from BonusLog since midnight WIB)
    const todayStart = new Date(wibNow);
    todayStart.setHours(0, 0, 0, 0);
    const todayStartUTC = new Date(todayStart.getTime() - WIB_OFFSET * 3600000);

    const todayRewardLog = await db.bonusLog.aggregate({
      where: {
        userId: user.id,
        type: { in: ['reward', 'profit'] },
        createdAt: { gte: todayStartUTC },
      },
      _sum: { amount: true },
      _count: true,
    });

    const todayMatchingLog = await db.bonusLog.aggregate({
      where: {
        userId: user.id,
        type: 'matching',
        createdAt: { gte: todayStartUTC },
      },
      _sum: { amount: true },
    });

    const todaySalaryLog = await db.bonusLog.aggregate({
      where: {
        userId: user.id,
        type: 'salary',
        createdAt: { gte: todayStartUTC },
      },
      _sum: { amount: true },
    });

    const todaySponsorLog = await db.bonusLog.aggregate({
      where: {
        userId: user.id,
        // ★ FIX V18: backend writes type='referral' (per-investment), not 'sponsor'/'level'
        //   Include both for backward compat with old data
        type: { in: ['referral', 'sponsor', 'level'] },
        createdAt: { gte: todayStartUTC },
      },
      _sum: { amount: true },
    });

    // Calculate time until next profit
    const msUntilNextProfit = nextProfitWIB.getTime() - wibNow.getTime();
    const hoursUntilNext = Math.floor(msUntilNextProfit / (1000 * 60 * 60));
    const minutesUntilNext = Math.floor((msUntilNextProfit % (1000 * 60 * 60)) / (1000 * 60));
    const secondsUntilNext = Math.floor((msUntilNextProfit % (1000 * 60)) / 1000);

    // Is it Monday? (for salary bonus)
    const isMonday = wibNow.getDay() === 1;

    // Salary config
    const salaryConfig = await db.salaryConfig.findFirst({ where: { isActive: true } });

    // Matching config
    const matchingConfig = await db.matchingConfig.findFirst({ where: { isActive: true } });

    return NextResponse.json({
      success: true,
      data: {
        // Schedule
        wibTime: wibNow.toISOString(),
        nextProfitTime: nextProfitWIB.toISOString(),
        timeUntilNextProfit: {
          hours: hoursUntilNext,
          minutes: minutesUntilNext,
          seconds: secondsUntilNext,
          totalMs: msUntilNextProfit,
        },
        lastProfitDate: lastProfitDate ? new Date(lastProfitDate).toISOString() : null,
        todayProfitCredited,
        isMonday,
        isWeekend,

        // Investment summary
        activeInvestments: activeInvestments.length,
        totalDailyProfit,
        totalInvestmentAmount: activeInvestments.reduce((sum, inv) => sum + inv.amount, 0),

        // Today's earnings breakdown
        todayEarnings: {
          profit: todayRewardLog._sum.amount || 0,
          matching: todayMatchingLog._sum.amount || 0,
          salary: todaySalaryLog._sum.amount || 0,
          sponsor: todaySponsorLog._sum.amount || 0,
          total: (todayRewardLog._sum.amount || 0) + (todayMatchingLog._sum.amount || 0) + (todaySalaryLog._sum.amount || 0) + (todaySponsorLog._sum.amount || 0),
        },

        // Bonus system info
        matchingMode: 'event-driven (dikreditkan bersama profit harian jam 00:00 WIB)',
        salaryMode: salaryConfig ? `Setiap Senin jam 00:00 WIB (${salaryConfig.salaryRate}% dari omzet grup)` : 'belum dikonfigurasi',
        matchingRates: matchingConfig ? {
          level1: matchingConfig.level1,
          level2: matchingConfig.level2,
          level3: matchingConfig.level3,
          level4: matchingConfig.level4,
          level5: matchingConfig.level5,
        } : { level1: 5, level2: 4, level3: 3, level4: 2, level5: 1 },

        // Schedule info
        schedule: {
          dailyProfit: isWeekend
            ? 'Senin-Jumat jam 00:00 WIB (LIBUR di Sabtu & Minggu)'
            : 'Senin-Jumat jam 00:00 WIB (libur Sabtu & Minggu)',
          matchingProfit: 'Otomatis saat profit harian dikreditkan',
          salaryBonus: 'Setiap hari Senin jam 00:00 WIB',
          sponsorBonus: 'Saat downline mendaftar (registrasi)',
        },
      },
    });
  } catch (error) {
    console.error('Get profit status error:', error);
    return NextResponse.json({
      success: true,
      data: {
        wibTime: getWibNow().toISOString(),
        nextProfitTime: null,
        timeUntilNextProfit: { hours: 0, minutes: 0, seconds: 0, totalMs: 0 },
        lastProfitDate: null,
        todayProfitCredited: false,
        isMonday: false,
        isWeekend: false,
        activeInvestments: 0,
        totalDailyProfit: 0,
        totalInvestmentAmount: 0,
        todayEarnings: { profit: 0, matching: 0, salary: 0, sponsor: 0, total: 0 },
        matchingMode: 'event-driven',
        salaryMode: 'belum dikonfigurasi',
        matchingRates: { level1: 5, level2: 4, level3: 3, level4: 2, level5: 1 },
        schedule: {
          dailyProfit: 'Senin-Jumat jam 00:00 WIB (libur Sabtu & Minggu)',
          matchingProfit: 'Otomatis saat profit harian dikreditkan',
          salaryBonus: 'Setiap hari Senin jam 00:00 WIB',
          sponsorBonus: 'Saat downline mendaftar (registrasi)',
        },
      },
    });
  }
}
