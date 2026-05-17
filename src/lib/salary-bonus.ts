import { db } from '@/lib/db';

/**
 * NEXVO Bonus Salary System
 * 
 * Rules:
 * - User MUST have an active deposit (investment) themselves
 * - ALL Level 1/direct referrals MUST have active deposits
 * - At least 1 direct referral required
 * - Salary = 2.5% of group omzet (own + all downline active investments)
 * - System automatically detects 2.5% regardless of omzet amount
 * - Maximum: 12 weeks of salary
 * - Auto-credited at 00:00 WIB every Monday via cron service
 * - Once a user reaches 12 weeks, they no longer receive salary bonus
 */

/**
 * Get the current ISO week number and year using WIB (UTC+7) timezone
 * This must match the cron route's WIB time calculation
 */
function getCurrentWeekInfo(): { weekNumber: number; year: number } {
  // Convert to WIB (UTC+7) for consistent week calculation
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const wibNow = new Date(utcMs + 7 * 3600000);

  const startOfYear = new Date(wibNow.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((wibNow.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const weekNumber = Math.ceil(dayOfYear / 7);
  return { weekNumber, year: wibNow.getFullYear() };
}

/**
 * Get direct referrals count for a user (level 1 only)
 */
async function getDirectRefCount(internalId: string): Promise<number> {
  const count = await db.referral.count({
    where: { referrerId: internalId, level: 1 },
  });
  return count;
}

/**
 * Check if a user has at least one active investment (deposit)
 */
async function userHasActiveDeposit(internalId: string): Promise<boolean> {
  const count = await db.investment.count({
    where: { userId: internalId, status: 'active' },
  });
  return count > 0;
}

/**
 * Get direct referrals who have active deposits
 * A referral is considered "active deposit" if they have at least one active investment
 */
async function getActiveDepositRefCount(internalId: string): Promise<number> {
  // Get all level-1 referrals
  const directRefs = await db.referral.findMany({
    where: { referrerId: internalId, level: 1 },
    select: { referredId: true },
  });

  if (directRefs.length === 0) return 0;

  const refIds = directRefs.map(r => r.referredId);

  // Count how many of them have at least one active investment
  const usersWithActiveInvestments = await db.investment.groupBy({
    by: ['userId'],
    where: {
      userId: { in: refIds },
      status: 'active',
    },
    _count: true,
  });

  return usersWithActiveInvestments.length;
}

/**
 * Check if ALL direct referrals have active deposits
 * Returns { total, active, allActive }
 */
async function checkAllDirectRefsActive(internalId: string): Promise<{
  total: number;
  active: number;
  allActive: boolean;
}> {
  // Get all level-1 referrals
  const directRefs = await db.referral.findMany({
    where: { referrerId: internalId, level: 1 },
    select: { referredId: true },
  });

  const total = directRefs.length;
  if (total === 0) {
    return { total: 0, active: 0, allActive: false };
  }

  const refIds = directRefs.map(r => r.referredId);

  // Count how many of them have at least one active investment
  const usersWithActiveInvestments = await db.investment.groupBy({
    by: ['userId'],
    where: {
      userId: { in: refIds },
      status: 'active',
    },
    _count: true,
  });

  const active = usersWithActiveInvestments.length;
  return { total, active, allActive: active === total };
}

/**
 * Get all downline user IDs recursively up to maxDepth levels
 */
async function getAllDownlineIds(internalId: string, maxDepth: number = 5): Promise<string[]> {
  const allIds: string[] = [];
  const visited = new Set<string>();
  let currentLevelIds: string[] = [internalId];

  for (let depth = 0; depth < maxDepth; depth++) {
    const nextLevelIds: string[] = [];

    const referrals = await db.referral.findMany({
      where: {
        referrerId: { in: currentLevelIds },
        level: 1,
      },
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

/**
 * Calculate group omzet for a user (sum of all active investments from user + all downline)
 */
async function calculateGroupOmzet(internalId: string): Promise<number> {
  // Include the user's own investments
  const ownInvestment = await db.investment.aggregate({
    where: { userId: internalId, status: 'active' },
    _sum: { amount: true },
  });

  // Get all downline IDs
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

/**
 * Get how many weeks of salary a user has already received
 */
async function getSalaryWeeksReceived(userId: string): Promise<number> {
  const count = await db.salaryBonus.count({
    where: { userId, status: 'paid' },
  });
  return count;
}

/**
 * Simple Rupiah formatting (avoid circular deps)
 */
function formatRupiahSimple(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}

/**
 * Check and credit salary bonus for a user.
 * 
 * Logic:
 * - User MUST have an active deposit (investment) themselves
 * - ALL Level 1/direct referrals MUST have active deposits
 * - At least 1 direct referral required
 * - Salary = salaryRate% (2.5%) of group omzet (auto-detected)
 * - Maximum maxWeeks (12) weeks of salary
 * - Unique per userId+weekNumber+year
 */
export async function checkAndCreditSalaryBonus(userId: string): Promise<{
  success: boolean;
  message: string;
  amount?: number;
  alreadyClaimed?: boolean;
  weekOfTotal?: number;
  maxWeeks?: number;
  weeksRemaining?: number;
}> {
  const { weekNumber, year } = getCurrentWeekInfo();

  return await db.$transaction(async (tx) => {
    // Get active salary config
    const config = await tx.salaryConfig.findFirst({
      where: { isActive: true },
    });

    if (!config) {
      return {
        success: false,
        message: 'Konfigurasi gaji mingguan tidak ditemukan atau tidak aktif',
      };
    }

    const salaryRate = config.salaryRate;
    const maxWeeks = config.maxWeeks;
    const requireActiveDeposit = config.requireActiveDeposit;

    // CHECK 1: User themselves MUST have an active deposit (investment)
    if (requireActiveDeposit) {
      const hasActiveDeposit = await userHasActiveDeposit(userId);
      if (!hasActiveDeposit) {
        return {
          success: false,
          message: 'Anda harus memiliki deposit aktif (investasi) untuk mendapatkan bonus gaji',
        };
      }
    }

    // Check if already claimed for this week
    const existingBonus = await tx.salaryBonus.findUnique({
      where: { userId_weekNumber_year: { userId, weekNumber, year } },
    });

    if (existingBonus) {
      return {
        success: false,
        message: 'Gaji mingguan sudah diklaim untuk minggu ini',
        alreadyClaimed: true,
      };
    }

    // Check how many weeks of salary already received
    const weeksReceived = await getSalaryWeeksReceived(userId);
    if (weeksReceived >= maxWeeks) {
      return {
        success: false,
        message: `Anda sudah menerima gaji mingguan selama ${maxWeeks} minggu. Program gaji telah selesai.`,
        maxWeeks,
      };
    }

    // CHECK 2: Must have minimum direct referrals (default 10)
    const minDirectRefs = config.minDirectRefs || 10;
    const refCheck = await checkAllDirectRefsActive(userId);
    
    if (refCheck.total === 0) {
      return {
        success: false,
        message: `Anda belum memiliki referral langsung (Level 1). Minimal ${minDirectRefs} referral aktif diperlukan.`,
      };
    }

    // Check minimum direct referrals count
    if (refCheck.total < minDirectRefs) {
      return {
        success: false,
        message: `Anda harus memiliki minimal ${minDirectRefs} referral langsung. Saat ini Anda memiliki ${refCheck.total} referral.`,
      };
    }

    // Check active deposit referrals
    const effectiveActiveRefs = requireActiveDeposit ? refCheck.active : refCheck.total;
    if (effectiveActiveRefs < minDirectRefs) {
      return {
        success: false,
        message: `Minimal ${minDirectRefs} referral dengan deposit aktif diperlukan. Saat ini ${refCheck.active} dari ${refCheck.total} referral yang memiliki deposit aktif.`,
      };
    }

    // Calculate group omzet (auto-detect 2.5%)
    const groupOmzet = await calculateGroupOmzet(userId);

    // Calculate salary: salaryRate% of group omzet
    const salaryAmount = Math.floor(groupOmzet * (salaryRate / 100));

    // Minimum salary amount (at least 1 if eligible)
    if (salaryAmount <= 0) {
      return {
        success: false,
        message: `Omzet grup Anda saat ini ${formatRupiahSimple(groupOmzet)}, gaji ${salaryRate}% = ${formatRupiahSimple(0)}. Tidak dapat dikreditkan.`,
      };
    }

    const currentWeekOfTotal = weeksReceived + 1;

    // Update user's mainBalance
    await tx.user.update({
      where: { id: userId },
      data: {
        mainBalance: { increment: salaryAmount },
        totalProfit: { increment: salaryAmount },
      },
    });

    // Create SalaryBonus entry
    await tx.salaryBonus.create({
      data: {
        userId,
        weekNumber,
        year,
        weekOfTotal: currentWeekOfTotal,
        amount: salaryAmount,
        baseOmzet: groupOmzet,
        salaryRate,
        activeRefDeposits: refCheck.active,
        directRefs: refCheck.total,
        groupOmzet,
        status: 'paid',
      },
    });

    // Create BonusLog entry
    await tx.bonusLog.create({
      data: {
        userId,
        fromUserId: userId,
        type: 'salary',
        level: 0,
        amount: salaryAmount,
        description: `Gaji mingguan Minggu ${weekNumber}/${year} (${currentWeekOfTotal}/${maxWeeks}) - ${refCheck.active}/${refCheck.total} referral aktif, omzet ${formatRupiahSimple(groupOmzet)}, rate ${salaryRate}%`,
      },
    });

    return {
      success: true,
      message: `Gaji mingguan ${formatRupiahSimple(salaryAmount)} berhasil dikreditkan (Minggu ${currentWeekOfTotal}/${maxWeeks})`,
      amount: salaryAmount,
      weekOfTotal: currentWeekOfTotal,
      maxWeeks,
      weeksRemaining: maxWeeks - currentWeekOfTotal,
    };
  });
}

/**
 * Process all eligible users for weekly salary (used by cron service)
 * Returns stats about processed users
 */
export async function processAllSalaryBonuses(): Promise<{
  processed: number;
  eligible: number;
  skipped: number;
  completed: number;
  errors: number;
  totalAmount: number;
  details: Array<{ userId: string; amount: number; weekOfTotal: number; message: string }>;
}> {
  const result = {
    processed: 0,
    eligible: 0,
    skipped: 0,
    completed: 0,
    errors: 0,
    totalAmount: 0,
    details: [] as Array<{ userId: string; amount: number; weekOfTotal: number; message: string }>,
  };

  // Get active salary config
  const config = await db.salaryConfig.findFirst({ where: { isActive: true } });
  if (!config) {
    console.log('[Salary Cron] No active salary config found. Skipping.');
    return result;
  }

  // Get all users who are not suspended and are verified
  const users = await db.user.findMany({
    where: {
      isSuspended: false,
      isVerified: true,
    },
    select: { id: true, userId: true, name: true },
  });

  console.log(`[Salary Cron] Checking ${users.length} users for salary eligibility...`);

  for (const user of users) {
    try {
      // Quick filter: check if user has any referrals first
      const refCount = await getDirectRefCount(user.id);
      if (refCount === 0) {
        result.skipped++;
        continue;
      }

      // Check weeks received
      const weeksReceived = await getSalaryWeeksReceived(user.id);
      if (weeksReceived >= config.maxWeeks) {
        result.completed++;
        continue;
      }

      // Try to credit salary
      const creditResult = await checkAndCreditSalaryBonus(user.id);
      result.processed++;

      if (creditResult.success) {
        result.eligible++;
        result.totalAmount += creditResult.amount || 0;
        result.details.push({
          userId: user.userId,
          amount: creditResult.amount || 0,
          weekOfTotal: creditResult.weekOfTotal || 0,
          message: creditResult.message,
        });
        console.log(`[Salary Cron] ✅ ${user.userId}: ${creditResult.message}`);
      } else {
        result.skipped++;
        console.log(`[Salary Cron] ⏭️ ${user.userId}: ${creditResult.message}`);
      }
    } catch (error: any) {
      result.errors++;
      console.error(`[Salary Cron] ❌ ${user.userId}: ${error.message}`);
    }
  }

  console.log(`[Salary Cron] Done. Processed: ${result.processed}, Eligible: ${result.eligible}, Skipped: ${result.skipped}, Completed(12w): ${result.completed}, Errors: ${result.errors}, Total: Rp${result.totalAmount.toLocaleString('id-ID')}`);
  return result;
}

/**
 * Get user's salary bonus eligibility information
 */
export async function getUserSalaryEligibility(userId: string): Promise<{
  directRefs: number;
  activeRefDeposits: number;
  minDirectRefs: number;
  groupOmzet: number;
  salaryRate: number;
  maxWeeks: number;
  weeksReceived: number;
  weeksRemaining: number;
  estimatedSalary: number;
  isEligible: boolean;
  isActive: boolean;
  refProgress: number;
  isCompleted: boolean;
  requireActiveDeposit: boolean;
  userHasActiveDeposit: boolean;
  allRefsActive: boolean;
  meetsMinDirectRefs: boolean;
}> {
  // Get active salary config
  const config = await db.salaryConfig.findFirst({
    where: { isActive: true },
  });

  const isActive = !!config;
  const salaryRate = config?.salaryRate ?? 2.5;
  const maxWeeks = config?.maxWeeks ?? 12;
  const requireActiveDeposit = config?.requireActiveDeposit ?? true;
  const minDirectRefs = config?.minDirectRefs ?? 10;

  // Check if user themselves has an active deposit
  const userOwnActiveDeposit = requireActiveDeposit
    ? await userHasActiveDeposit(userId)
    : true;

  // Check all direct referrals - must ALL have active deposits
  const refCheck = await checkAllDirectRefsActive(userId);

  // Calculate group omzet (auto-detect 2.5%)
  const groupOmzet = await calculateGroupOmzet(userId);

  // Weeks received
  const weeksReceived = await getSalaryWeeksReceived(userId);
  const weeksRemaining = Math.max(0, maxWeeks - weeksReceived);

  // Estimated salary (2.5% of group omzet, auto-detected)
  const estimatedSalary = Math.floor(groupOmzet * (salaryRate / 100));

  // Check minimum direct referrals requirement
  const meetsMinDirectRefs = refCheck.total >= minDirectRefs &&
    (requireActiveDeposit ? refCheck.active >= minDirectRefs : refCheck.total >= minDirectRefs);

  // Check eligibility - MUST meet minDirectRefs requirement
  const isEligible = isActive && userOwnActiveDeposit && meetsMinDirectRefs && refCheck.total >= minDirectRefs && weeksReceived < maxWeeks && estimatedSalary > 0;
  const isCompleted = weeksReceived >= maxWeeks;

  const refProgress = refCheck.total > 0 ? Math.min((refCheck.active / refCheck.total) * 100, 100) : 0;

  return {
    directRefs: refCheck.total,
    activeRefDeposits: refCheck.active,
    minDirectRefs,
    groupOmzet,
    salaryRate,
    maxWeeks,
    weeksReceived,
    weeksRemaining,
    estimatedSalary,
    isEligible,
    isActive,
    refProgress,
    isCompleted,
    requireActiveDeposit,
    userHasActiveDeposit: userOwnActiveDeposit,
    allRefsActive: refCheck.allActive,
    meetsMinDirectRefs,
  };
}

