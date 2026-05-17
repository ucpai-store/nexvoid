import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ──────────── Constants ────────────

const WIB_OFFSET = 7; // UTC+7 for Asia/Jakarta

// ──────────── Auth Helper ────────────

function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
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

  // Check ?secret={CRON_SECRET}
  const url = new URL(request.url);
  const secretParam = url.searchParams.get('secret');
  if (secretParam === cronSecret) {
    return true;
  }

  return false;
}

// ──────────── Time Helper ────────────

function getWibNow(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + WIB_OFFSET * 3600000);
}

function getWeekInfo(date: Date): { weekNumber: number; year: number } {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return { weekNumber: Math.ceil(dayOfYear / 7), year: date.getFullYear() };
}

// ──────────── API Route Handler ────────────

export async function GET(request: NextRequest) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Invalid or missing cron secret.' },
      { status: 401 },
    );
  }

  try {
    const wibNow = getWibNow();
    const { weekNumber, year } = getWeekInfo(wibNow);
    const dayOfWeek = wibNow.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Get some basic stats
    const activeInvestments = await db.investment.count({ where: { status: 'active' } });
    const activeSalaryConfig = await db.salaryConfig.findFirst({ where: { isActive: true } });
    const activeMatchingConfig = await db.matchingConfig.findFirst({ where: { isActive: true } });

    return NextResponse.json({
      success: true,
      data: {
        service: 'NEXVO Cron API',
        status: 'running',
        wibTime: wibNow.toISOString(),
        wibTimeFormatted: wibNow.toLocaleString('id-ID', { timeZone: 'UTC' }),
        wibDate: `${wibNow.getFullYear()}-${String(wibNow.getMonth() + 1).padStart(2, '0')}-${String(wibNow.getDate()).padStart(2, '0')}`,
        wibTimeOfDay: `${String(wibNow.getHours()).padStart(2, '0')}:${String(wibNow.getMinutes()).padStart(2, '0')}`,
        dayOfWeek,
        dayName: dayNames[dayOfWeek],
        weekInfo: { weekNumber, year },
        isMonday: dayOfWeek === 1,
        matchingMode: 'event-driven (credited with daily profit)',
        activeInvestments,
        salaryConfig: activeSalaryConfig
          ? {
              salaryRate: activeSalaryConfig.salaryRate,
              minDirectRefs: activeSalaryConfig.minDirectRefs,
              maxWeeks: activeSalaryConfig.maxWeeks,
              requireActiveDeposit: activeSalaryConfig.requireActiveDeposit,
            }
          : null,
        matchingConfig: activeMatchingConfig
          ? {
              level1: activeMatchingConfig.level1,
              level2: activeMatchingConfig.level2,
              level3: activeMatchingConfig.level3,
              level4: activeMatchingConfig.level4,
              level5: activeMatchingConfig.level5,
            }
          : null,
        cronEndpoints: {
          profit: '/api/cron/profit',
          salary: '/api/cron/salary',
          status: '/api/cron/status',
        },
        schedule: {
          dailyProfit: 'Every day at 00:00 WIB',
          weeklySalary: 'Every Monday at 00:00 WIB',
          matching: 'Event-driven (auto-credited with daily profit)',
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Cron API] Status error:', message);
    return NextResponse.json(
      { success: false, error: 'Failed to get cron status', details: message },
      { status: 500 },
    );
  }
}
