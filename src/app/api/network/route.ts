import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// Level bonus percentages (based on group omzet difference)
const LEVEL_BONUS_RATES: Record<number, number> = {
  1: 0.05, // 5%
  2: 0.04, // 4%
  3: 0.03, // 3%
  4: 0.02, // 2%
  5: 0.01, // 1%
};

// Reward bonus milestones based on group omzet
const REWARD_MILESTONES = [
  { level: 1, omzet: 1000000, reward: 100000, label: 'Level 1 - Omzet 1JT' },
  { level: 2, omzet: 5000000, reward: 500000, label: 'Level 2 - Omzet 5JT' },
  { level: 3, omzet: 10000000, reward: 1000000, label: 'Level 3 - Omzet 10JT' },
  { level: 4, omzet: 25000000, reward: 2500000, label: 'Level 4 - Omzet 25JT' },
  { level: 5, omzet: 50000000, reward: 5000000, label: 'Level 5 - Omzet 50JT' },
];

interface ReferralNode {
  id: string;
  userId: string;
  name: string;
  whatsapp: string;
  referralCode: string;
  level: number;
  totalDeposit: number;
  groupOmzet: number;
  directCount: number;
}

/**
 * Get all direct referrals of a user (by internal id)
 */
async function getDirectReferrals(internalId: string): Promise<string[]> {
  const referrals = await db.referral.findMany({
    where: { referrerId: internalId },
    select: { referredId: true },
  });
  return referrals.map((r) => r.referredId);
}

/**
 * Calculate total investment amount for a user (their personal deposits)
 */
async function getUserTotalDeposit(internalId: string): Promise<number> {
  const result = await db.investment.aggregate({
    where: { userId: internalId, status: 'active' },
    _sum: { amount: true },
  });
  return result._sum.amount || 0;
}

/**
 * Calculate group omzet for a user (total investments of user + all downline, 5 levels deep)
 */
async function calculateGroupOmzet(internalId: string, maxDepth: number = 5): Promise<number> {
  let totalOmzet = 0;
  const visited = new Set<string>();
  let currentLevelIds: string[] = [internalId];

  for (let depth = 0; depth <= maxDepth; depth++) {
    const nextLevelIds: string[] = [];

    for (const uid of currentLevelIds) {
      if (visited.has(uid)) continue;
      visited.add(uid);

      // Add this user's total deposit to group omzet
      const deposit = await getUserTotalDeposit(uid);
      totalOmzet += deposit;

      // Get their direct referrals for next level
      const refs = await getDirectReferrals(uid);
      nextLevelIds.push(...refs);
    }

    currentLevelIds = nextLevelIds;
  }

  return totalOmzet;
}

/**
 * Build referral tree for a user, N levels deep
 */
async function buildReferralTree(
  internalId: string,
  maxLevels: number = 5
): Promise<ReferralNode[]> {
  const allNodes: ReferralNode[] = [];
  let currentLevelIds = await getDirectReferrals(internalId);

  for (let level = 1; level <= maxLevels; level++) {
    if (currentLevelIds.length === 0) break;

    const nextLevelIds: string[] = [];

    // Batch fetch user data for current level
    const users = await db.user.findMany({
      where: { id: { in: currentLevelIds } },
      select: {
        id: true,
        userId: true,
        name: true,
        whatsapp: true,
        referralCode: true,
      },
    });

    for (const u of users) {
      const totalDeposit = await getUserTotalDeposit(u.id);
      const directRefs = await getDirectReferrals(u.id);
      const groupOmzet = await calculateGroupOmzet(u.id, maxLevels - level);

      allNodes.push({
        id: u.id,
        userId: u.userId,
        name: u.name || u.userId,
        whatsapp: u.whatsapp,
        referralCode: u.referralCode,
        level,
        totalDeposit,
        groupOmzet,
        directCount: directRefs.length,
      });

      nextLevelIds.push(...directRefs);
    }

    currentLevelIds = nextLevelIds;
  }

  return allNodes;
}

// GET: Get user's network/referral tree
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Tidak terautentikasi' },
        { status: 401 }
      );
    }

    // Build the referral tree 5 levels deep
    const referralTree = await buildReferralTree(user.id, 5);

    // Group by level
    const levels: Record<number, ReferralNode[]> = {};
    for (const node of referralTree) {
      if (!levels[node.level]) levels[node.level] = [];
      levels[node.level].push(node);
    }

    // Calculate group omzet per level
    const levelOmzet: Record<number, number> = {};
    for (const [level, nodes] of Object.entries(levels)) {
      levelOmzet[parseInt(level)] = nodes.reduce((sum, n) => sum + n.totalDeposit, 0);
    }

    // Calculate user's own group omzet
    const myGroupOmzet = await calculateGroupOmzet(user.id, 5);
    const myTotalDeposit = await getUserTotalDeposit(user.id);

    // Calculate level bonus potential
    // Level bonus = (your group omzet) - (sum of same-level group omzet from downlines at that depth) * rate
    const levelBonusBreakdown: { level: number; rate: number; omzetDiff: number; bonus: number }[] = [];

    for (let lvl = 1; lvl <= 5; lvl++) {
      const rate = LEVEL_BONUS_RATES[lvl];
      if (!rate) continue;

      // Group omzet at this level = sum of investments from people at this level
      const levelTotalOmzet = levelOmzet[lvl] || 0;

      // For level bonus, we compare group omzet between levels
      // Bonus = (your total group omzet at this level depth) * rate
      // Simplified: each level's omzet * rate
      const bonus = levelTotalOmzet * rate;
      levelBonusBreakdown.push({
        level: lvl,
        rate: rate * 100,
        omzetDiff: levelTotalOmzet,
        bonus,
      });
    }

    // Check reward bonus milestones
    const achievedRewards = REWARD_MILESTONES.filter((m) => myGroupOmzet >= m.omzet);

    // Get bonus stats from BonusLog
    const [sponsorTotal, levelTotal, rewardTotal] = await Promise.all([
      db.bonusLog.aggregate({
        where: { userId: user.id, type: 'sponsor' },
        _sum: { amount: true },
      }),
      db.bonusLog.aggregate({
        where: { userId: user.id, type: 'level' },
        _sum: { amount: true },
      }),
      db.bonusLog.aggregate({
        where: { userId: user.id, type: 'reward' },
        _sum: { amount: true },
      }),
    ]);

    // Count total network members
    const totalNetworkCount = referralTree.length;

    // Count direct referrals
    const directReferralCount = (levels[1] || []).length;

    return NextResponse.json({
      success: true,
      data: {
        referralCode: user.referralCode,
        myTotalDeposit,
        myGroupOmzet,
        totalNetworkCount,
        directReferralCount,
        levels: Object.fromEntries(
          Object.entries(levels).map(([lvl, nodes]) => [
            lvl,
            {
              members: nodes.map((n) => ({
                id: n.id,
                userId: n.userId,
                name: n.name,
                whatsapp: n.whatsapp,
                totalDeposit: n.totalDeposit,
                groupOmzet: n.groupOmzet,
                directCount: n.directCount,
              })),
              count: nodes.length,
              levelOmzet: levelOmzet[parseInt(lvl)] || 0,
            },
          ])
        ),
        bonusStats: {
          sponsor: {
            totalAmount: sponsorTotal._sum.amount || 0,
          },
          level: {
            totalAmount: levelTotal._sum.amount || 0,
            breakdown: levelBonusBreakdown,
          },
          reward: {
            totalAmount: rewardTotal._sum.amount || 0,
            milestones: REWARD_MILESTONES.map((m) => ({
              ...m,
              achieved: myGroupOmzet >= m.omzet,
              progress: Math.min((myGroupOmzet / m.omzet) * 100, 100),
            })),
          },
        },
      },
    });
  } catch (error) {
    console.error('Get network error:', error);
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan server' },
      { status: 500 }
    );
  }
}
