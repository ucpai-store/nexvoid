import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ──────────── Constants ────────────

const WIB_OFFSET = 7; // UTC+7 for Asia/Jakarta

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

function getWeekInfo(date: Date): { weekNumber: number; year: number } {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return { weekNumber: Math.ceil(dayOfYear / 7), year: date.getFullYear() };
}

function formatRupiahSimple(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}

// ──────────── Salary Bonus Helpers ────────────

async function getDirectRefCount(internalId: string): Promise<number> {
  return db.referral.count({ where: { referrerId: internalId, level: 1 } });
}

async function userHasActiveDeposit(internalId: string): Promise<boolean> {
  const count = await db.investment.count({
    where: { userId: internalId, status: 'active' },
  });
  return count > 0;
}

async function getActiveDepositRefCount(internalId: string): Promise<number> {
  const directRefs = await db.referral.findMany({
    where: { referrerId: internalId, level: 1 },
    select: { referredId: true },
  });
  if (directRefs.length === 0) return 0;
  const refIds = directRefs.map(r => r.referredId);
  const usersWithActiveInvestments = await db.investment.groupBy({
    by: ['userId'],
    where: { userId: { in: refIds }, status: 'active' },
    _count: true,
  });
  return usersWithActiveInvestments.length;
}

async function checkAllDirectRefsActive(internalId: string): Promise<{
  total: number;
  active: number;
  allActive: boolean;
}> {
  const directRefs = await db.referral.findMany({
    where: { referrerId: internalId, level: 1 },
    select: { referredId: true },
  });
  const total = directRefs.length;
  if (total === 0) {
    return { total: 0, active: 0, allActive: false };
  }
  const refIds = directRefs.map(r => r.referredId);
  const usersWithActiveInvestments = await db.investment.groupBy({
    by: ['userId'],
    where: { userId: { in: refIds }, status: 'active' },
    _count: true,
  });
  const active = usersWithActiveInvestments.length;
  return { total, active, allActive: active === total };
}

async function getAllDownlineIds(internalId: string, maxDepth: number = 5): Promise<string[]> {
  const allIds: string[] = [];
  const visited = new Set<string>();
  let currentLevelIds: string[] = [internalId];
  for (let depth = 0; depth < maxDepth; depth++) {
    const nextLevelIds: string[] = [];
    const referrals = await db.referral.findMany({
      where: { referrerId: { in: currentLevelIds }, level: 1 },
      select: { referredId: true },
    });
    for (const ref of referrals) {
      if (!visited.has(ref.referredId)) {
        visited.add(ref.referredId);
        allIds.push(ref.referredId);
        nextLevelIds.push(ref.referredId);
      }
    }
    if (nextLevelIds.length === 0) break;
    currentLevelIds = nextLevelIds;
  }
  return allIds;
}

async function calculateGroupOmzet(internalId: string): Promise<number> {
  const ownInvestment = await db.investment.aggregate({
    where: { userId: internalId, status: 'active' },
    _sum: { amount: true },
  });
  const downlineIds = await getAllDownlineIds(internalId, 5);
  let downlineOmzet = 0;
  if (downlineIds.length > 0) {
    const downlineInvestment = await db.investment.aggregate({
      where: { userId: { in: downlineIds }, status: 'active' },
      _sum: { amount: true },
    });
    downlineOmzet = downlineInvestment._sum.amount || 0;
  }
  return (ownInvestment._sum.amount || 0) + downlineOmzet;
}

// ──────────── Salary Bonus Logic ────────────

async function processAllSalaryBonuses(): Promise<{
  processed: number;
  eligible: number;
  skipped: number;
  completed: number;
  errors: number;
  totalAmount: number;
  errorDetails: string[];
}> {
  const result = { processed: 0, eligible: 0, skipped: 0, completed: 0, errors: 0, totalAmount: 0, errorDetails: [] as string[] };

  const config = await db.salaryConfig.findFirst({ where: { isActive: true } });
  if (!config) {
    console.log('[Salary Cron] No active salary config. Skipping.');
    return result;
  }

  const { weekNumber, year } = getWeekInfo(getWibNow());

  const users = await db.user.findMany({
    where: { isSuspended: false, isVerified: true },
    select: { id: true, userId: true },
  });

  console.log(`[Salary Cron] Week ${weekNumber}/${year} — Checking ${users.length} users...`);

  for (const user of users) {
    try {
      const refCount = await getDirectRefCount(user.id);
      if (refCount === 0) {
        result.skipped++;
        continue;
      }

      const weeksReceived = await db.salaryBonus.count({ where: { userId: user.id, status: 'paid' } });
      if (weeksReceived >= config.maxWeeks) {
        result.completed++;
        continue;
      }

      const existing = await db.salaryBonus.findUnique({
        where: { userId_weekNumber_year: { userId: user.id, weekNumber, year } },
      });
      if (existing) {
        result.skipped++;
        continue;
      }

      // CHECK: User themselves MUST have an active deposit (investment)
      if (config.requireActiveDeposit) {
        const userHasDeposit = await userHasActiveDeposit(user.id);
        if (!userHasDeposit) {
          result.skipped++;
          continue;
        }
      }

      // CHECK: ALL Level 1/direct referrals MUST have active deposits
      const refCheck = await checkAllDirectRefsActive(user.id);
      if (!refCheck.allActive) {
        result.skipped++;
        continue;
      }

      const groupOmzet = await calculateGroupOmzet(user.id);
      const salaryAmount = Math.floor(groupOmzet * (config.salaryRate / 100));

      if (salaryAmount <= 0) {
        result.skipped++;
        continue;
      }

      const currentWeekOfTotal = weeksReceived + 1;

      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            mainBalance: { increment: salaryAmount },
            totalProfit: { increment: salaryAmount },
          },
        });

        await tx.salaryBonus.create({
          data: {
            userId: user.id,
            weekNumber,
            year,
            weekOfTotal: currentWeekOfTotal,
            amount: salaryAmount,
            baseOmzet: groupOmzet,
            salaryRate: config.salaryRate,
            activeRefDeposits: refCheck.active,
            directRefs: refCheck.total,
            groupOmzet,
            status: 'paid',
          },
        });

        await tx.bonusLog.create({
          data: {
            userId: user.id,
            fromUserId: user.id,
            type: 'salary',
            level: 0,
            amount: salaryAmount,
            description: `Gaji mingguan otomatis Minggu ${weekNumber}/${year} (${currentWeekOfTotal}/${config.maxWeeks}) - ${refCheck.active}/${refCheck.total} referral aktif, omzet ${formatRupiahSimple(groupOmzet)}, rate ${config.salaryRate}%`,
          },
        });
      });

      result.eligible++;
      result.totalAmount += salaryAmount;
      result.processed++;
      console.log(`[Salary Cron] ✅ ${user.userId}: ${formatRupiahSimple(salaryAmount)} (Week ${currentWeekOfTotal}/${config.maxWeeks})`);
    } catch (error: unknown) {
      result.errors++;
      const message = error instanceof Error ? error.message : String(error);
      result.errorDetails.push(`${user.userId}: ${message}`);
      console.error(`[Salary Cron] ❌ ${user.userId}: ${message}`);
    }
  }

  console.log(`[Salary Cron] Done. Eligible: ${result.eligible}, Total: ${formatRupiahSimple(result.totalAmount)}, Skipped: ${result.skipped}, Completed: ${result.completed}, Errors: ${result.errors}`);
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
    console.log('[Cron API] 💰 Manual trigger: Weekly salary bonus');
    const startTime = Date.now();
    const result = await processAllSalaryBonuses();
    const durationMs = Date.now() - startTime;

    const { weekNumber, year } = getWeekInfo(getWibNow());

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        weekNumber,
        year,
        durationMs,
        wibTime: getWibNow().toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Cron API] Salary cron error:', message);
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
    console.log('[Cron API] 💰 GET trigger: Weekly salary bonus');
    const startTime = Date.now();
    const result = await processAllSalaryBonuses();
    const durationMs = Date.now() - startTime;

    const { weekNumber, year } = getWeekInfo(getWibNow());

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        weekNumber,
        year,
        durationMs,
        wibTime: getWibNow().toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Cron API] Salary cron error:', message);
    return NextResponse.json(
      { success: false, error: 'Cron execution failed', details: message },
      { status: 500 },
    );
  }
}

