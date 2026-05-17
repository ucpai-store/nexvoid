import { db } from '@/lib/db';

/**
 * NEXVO Matching Profit Bonus System
 *
 * Rules:
 * - When a user earns profit (daily investment profit), their upline receives a matching bonus
 * - Level 1 (direct sponsor): 5% of the profit earned
 * - Level 2: 4%
 * - Level 3: 3%
 * - Level 4: 2%
 * - Level 5: 1%
 * - Level 6+: No matching bonus beyond level 5 (not displayed in UI)
 * - This is NOT binary — no left/right leg, no weaker leg principle
 * - Matching bonus is credited immediately when profit is earned (event-driven)
 *
 * The matching bonus is based on the PROFIT AMOUNT earned by downline,
 * NOT on investment amount or cumulative totals.
 */

/**
 * Default matching profit rates per level (percentages)
 */
const DEFAULT_MATCHING_RATES: Record<number, number> = {
  1: 5,
  2: 4,
  3: 3,
  4: 2,
  5: 1,
};

const MAX_MATCHING_LEVEL = 5; // Level 6+ = auto disconnect

/**
 * Get the active MatchingConfig, or return defaults if none exists
 */
export async function getMatchingConfig() {
  const config = await db.matchingConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
  });

  if (!config) {
    return {
      level1: DEFAULT_MATCHING_RATES[1],
      level2: DEFAULT_MATCHING_RATES[2],
      level3: DEFAULT_MATCHING_RATES[3],
      level4: DEFAULT_MATCHING_RATES[4],
      level5: DEFAULT_MATCHING_RATES[5],
      isActive: true,
    };
  }

  return {
    level1: config.level1,
    level2: config.level2,
    level3: config.level3,
    level4: config.level4,
    level5: config.level5,
    isActive: config.isActive,
  };
}

/**
 * Get matching rate for a specific level from config
 */
async function getMatchingRate(level: number): Promise<number> {
  if (level > MAX_MATCHING_LEVEL || level < 1) return 0; // Auto disconnect at level 6+

  const config = await getMatchingConfig();
  const rates: Record<number, number> = {
    1: config.level1,
    2: config.level2,
    3: config.level3,
    4: config.level4,
    5: config.level5,
  };

  return rates[level] || 0;
}

/**
 * Credit matching profit bonus to upline when a user earns profit.
 * This should be called INSIDE a Prisma transaction when profit is credited.
 *
 * Finds all upline members (via Referral table where referredId = userId),
 * credits matching bonus to each upline based on their level:
 * - Level 1 (direct sponsor): 5%
 * - Level 2: 4%
 * - Level 3: 3%
 * - Level 4: 2%
 * - Level 5: 1%
 * - Level 6+: No bonus (not displayed in UI)
 *
 * @param tx - Prisma transaction client
 * @param userId - The user who earned the profit (internal DB id)
 * @param profitAmount - The profit amount earned
 * @param profitSource - Description of the profit source (e.g., "daily investment profit")
 */
export async function creditMatchingBonusOnProfit(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  userId: string,
  profitAmount: number,
  profitSource: string = 'profit',
): Promise<{
  totalMatchCredited: number;
  uplineDetails: Array<{
    level: number;
    uplineId: string;
    rate: number;
    amount: number;
    disconnected: boolean;
  }>;
}> {
  const result = {
    totalMatchCredited: 0,
    uplineDetails: [] as Array<{
      level: number;
      uplineId: string;
      rate: number;
      amount: number;
      disconnected: boolean;
    }>,
  };

  if (profitAmount <= 0) return result;

  // Find all upline members for this user (sorted by level ascending)
  const uplineRefs = await tx.referral.findMany({
    where: { referredId: userId },
    orderBy: { level: 'asc' },
  });

  if (uplineRefs.length === 0) return result;

  // Get the earning user's info for the log description
  const earningUser = await tx.user.findUnique({
    where: { id: userId },
    select: { name: true, userId: true },
  });
  const earningUserName = earningUser?.name || earningUser?.userId || 'User';

  // Process each upline level
  for (const ref of uplineRefs) {
    const level = ref.level;

    // AUTO DISCONNECT: Level 6+ gets no matching bonus
    if (level > MAX_MATCHING_LEVEL) {
      result.uplineDetails.push({
        level,
        uplineId: ref.referrerId,
        rate: 0,
        amount: 0,
        disconnected: true,
      });
      continue;
    }

    const rate = await getMatchingRate(level);
    if (rate <= 0) {
      result.uplineDetails.push({
        level,
        uplineId: ref.referrerId,
        rate: 0,
        amount: 0,
        disconnected: level > MAX_MATCHING_LEVEL,
      });
      continue;
    }

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
        fromUserId: userId,
        type: 'matching',
        level,
        amount: matchAmount,
        description: `Matching Profit Level ${level} (${rate}%) dari profit ${earningUserName} — ${formatRupiahSimple(profitAmount)} × ${rate}% = ${formatRupiahSimple(matchAmount)}`,
      },
    });

    result.totalMatchCredited += matchAmount;
    result.uplineDetails.push({
      level,
      uplineId: ref.referrerId,
      rate,
      amount: matchAmount,
      disconnected: false,
    });
  }

  return result;
}

/**
 * Get all direct referrals (level 1) of a user
 */
async function getDirectReferrals(userId: string): Promise<string[]> {
  const referrals = await db.referral.findMany({
    where: { referrerId: userId, level: 1 },
    select: { referredId: true },
  });
  return referrals.map((r) => r.referredId);
}

/**
 * Get downline user IDs at a specific level (1-indexed).
 * Level 1 = direct referrals, Level 2 = referrals of referrals, etc.
 */
async function getDownlineByLevel(userId: string, maxLevel: number = 5): Promise<Map<number, string[]>> {
  const levelMap = new Map<number, string[]>();
  const visited = new Set<string>();
  let currentLevelIds = await getDirectReferrals(userId);

  for (let level = 1; level <= maxLevel; level++) {
    if (currentLevelIds.length === 0) break;

    const nextLevelIds: string[] = [];
    const thisLevelIds: string[] = [];

    for (const id of currentLevelIds) {
      if (visited.has(id)) continue;
      visited.add(id);
      thisLevelIds.push(id);

      const refs = await getDirectReferrals(id);
      nextLevelIds.push(...refs);
    }

    levelMap.set(level, thisLevelIds);
    currentLevelIds = nextLevelIds;
  }

  return levelMap;
}

/**
 * Get user's matching profit overview info (for display/preview purposes)
 * This shows the POTENTIAL matching bonus based on current downline profit.
 * The actual matching bonus is event-driven (credited when profit is earned).
 */
export async function getUserMatchingInfo(userId: string): Promise<{
  totalDownlineProfit: number;
  totalDownlineMembers: number;
  potentialBonus: number;
  levels: Array<{
    level: number;
    rate: number;
    profitOmzet: number;
    memberCount: number;
    amount: number;
    isDisconnected: boolean;
  }>;
  levelMembers: Array<{
    level: number;
    count: number;
  }>;
  totalMatchingEarned: number;
  maxMatchingLevel: number;
}> {
  const config = await getMatchingConfig();
  const rates: Record<number, number> = {
    1: config.level1,
    2: config.level2,
    3: config.level3,
    4: config.level4,
    5: config.level5,
  };

  const downlineByLevel = await getDownlineByLevel(userId, MAX_MATCHING_LEVEL);

  // Get total profit from investments for downline at each level
  const levelResults: Array<{
    level: number;
    rate: number;
    profitOmzet: number;
    memberCount: number;
    amount: number;
    isDisconnected: boolean;
  }> = [];

  let totalBonus = 0;
  let totalDownlineProfit = 0;
  let totalDownlineMembers = 0;
  const levelMembers: Array<{ level: number; count: number }> = [];

  for (let level = 1; level <= MAX_MATCHING_LEVEL; level++) {
    const rate = rates[level] || 0;
    const memberIds = downlineByLevel.get(level) || [];
    let profitOmzet = 0;

    // Sum total profit earned by all members at this level
    for (const memberId of memberIds) {
      const investResult = await db.investment.aggregate({
        where: { userId: memberId, status: { in: ['active', 'completed'] } },
        _sum: { totalProfitEarned: true },
      });
      const purchaseResult = await db.purchase.aggregate({
        where: { userId: memberId, status: { in: ['active', 'completed'] } },
        _sum: { profitEarned: true },
      });
      profitOmzet += (investResult._sum.totalProfitEarned || 0) + (purchaseResult._sum.profitEarned || 0);
    }

    const amount = rate > 0 ? Math.floor(profitOmzet * (rate / 100)) : 0;

    levelResults.push({
      level,
      rate,
      profitOmzet,
      memberCount: memberIds.length,
      amount,
      isDisconnected: false,
    });

    levelMembers.push({ level, count: memberIds.length });

    totalBonus += amount;
    totalDownlineProfit += profitOmzet;
    totalDownlineMembers += memberIds.length;
  }

  // Get total matching bonus already earned
  const matchingTotal = await db.bonusLog.aggregate({
    where: { userId, type: 'matching' },
    _sum: { amount: true },
  });

  return {
    totalDownlineProfit,
    totalDownlineMembers,
    potentialBonus: totalBonus,
    levels: levelResults,
    levelMembers,
    totalMatchingEarned: matchingTotal._sum.amount || 0,
    maxMatchingLevel: MAX_MATCHING_LEVEL,
  };
}

/**
 * Calculate matching profit bonus for a user (for manual claim / admin trigger)
 * This is used for one-time manual claims or admin-triggered processing.
 * For automatic processing, use creditMatchingBonusOnProfit instead.
 *
 * IMPORTANT: The matching bonus is based on NEW profit earned since the last
 * matching bonus was credited (to avoid double-counting).
 */
export async function calculateMatchingBonus(userId: string): Promise<{
  totalBonus: number;
  levels: Array<{
    level: number;
    rate: number;
    profitOmzet: number;
    memberCount: number;
    amount: number;
    isDisconnected: boolean;
  }>;
}> {
  const config = await getMatchingConfig();
  const rates: Record<number, number> = {
    1: config.level1,
    2: config.level2,
    3: config.level3,
    4: config.level4,
    5: config.level5,
  };

  const downlineByLevel = await getDownlineByLevel(userId, MAX_MATCHING_LEVEL);

  const levelResults: Array<{
    level: number;
    rate: number;
    profitOmzet: number;
    memberCount: number;
    amount: number;
    isDisconnected: boolean;
  }> = [];

  let totalBonus = 0;

  for (let level = 1; level <= MAX_MATCHING_LEVEL; level++) {
    const rate = rates[level];
    if (!rate || rate <= 0) continue;

    const memberIds = downlineByLevel.get(level) || [];
    let profitOmzet = 0;

    // Sum total profit earned by all members at this level
    for (const memberId of memberIds) {
      const investResult = await db.investment.aggregate({
        where: { userId: memberId, status: { in: ['active', 'completed'] } },
        _sum: { totalProfitEarned: true },
      });
      const purchaseResult = await db.purchase.aggregate({
        where: { userId: memberId, status: { in: ['active', 'completed'] } },
        _sum: { profitEarned: true },
      });
      profitOmzet += (investResult._sum.totalProfitEarned || 0) + (purchaseResult._sum.profitEarned || 0);
    }

    // Subtract profit that was already matched (from previous matching bonuses)
    const alreadyMatched = await db.matchingBonus.aggregate({
      where: { userId, level },
      _sum: { matchedOmzet: true },
    });
    const alreadyMatchedOmzet = alreadyMatched._sum.matchedOmzet || 0;
    const newProfitOmzet = Math.max(0, profitOmzet - alreadyMatchedOmzet);

    const amount = Math.floor(newProfitOmzet * (rate / 100));

    levelResults.push({
      level,
      rate,
      profitOmzet: newProfitOmzet,
      memberCount: memberIds.length,
      amount,
      isDisconnected: false,
    });

    totalBonus += amount;
  }

  return { totalBonus, levels: levelResults };
}

/**
 * Calculate and credit matching profit bonus for a user (manual claim).
 * Uses calculateMatchingBonus to get the new (unmatched) profit, then credits it.
 */
export async function creditMatchingBonus(userId: string): Promise<{
  totalBonus: number;
  levels: Array<{
    level: number;
    rate: number;
    profitOmzet: number;
    memberCount: number;
    amount: number;
    isDisconnected: boolean;
  }>;
}> {
  const calculation = await calculateMatchingBonus(userId);

  if (calculation.totalBonus <= 0) {
    return calculation;
  }

  await db.$transaction(async (tx) => {
    // Credit total bonus to mainBalance
    await tx.user.update({
      where: { id: userId },
      data: {
        mainBalance: { increment: calculation.totalBonus },
        totalProfit: { increment: calculation.totalBonus },
      },
    });

    // Create MatchingBonus records and BonusLog entries for each level
    for (const lvl of calculation.levels) {
      if (lvl.amount <= 0 || lvl.isDisconnected) continue;

      await tx.matchingBonus.create({
        data: {
          userId,
          leftOmzet: 0,
          rightOmzet: 0,
          matchedOmzet: lvl.profitOmzet,
          level: lvl.level,
          rate: lvl.rate,
          amount: lvl.amount,
          status: 'paid',
        },
      });

      await tx.bonusLog.create({
        data: {
          userId,
          fromUserId: userId,
          type: 'matching',
          level: lvl.level,
          amount: lvl.amount,
          description: `Matching Profit Level ${lvl.level} — Profit Downline: ${formatRupiahSimple(lvl.profitOmzet)} (${lvl.memberCount} member) × ${lvl.rate}% = ${formatRupiahSimple(lvl.amount)}`,
        },
      });
    }
  });

  return calculation;
}

/**
 * Simple Rupiah formatting without importing from auth.ts (to avoid circular deps)
 */
function formatRupiahSimple(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}
