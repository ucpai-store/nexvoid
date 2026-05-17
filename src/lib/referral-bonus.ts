import { db } from '@/lib/db';

/**
 * ★ Referral Bonus System ★
 * 
 * Referral bonus is credited PER INVESTMENT (not daily, not one-time).
 * Every time a downline invests/buys a package, the upline gets bonus
 * based on the INVESTMENT amount.
 * 
 * Percentages per level:
 * Level 1 (Direct/Sponsor): 10% of downline's investment amount
 * Level 2: 5% of downline's investment amount
 * Level 3: 4% of downline's investment amount
 * Level 4: 3% of downline's investment amount
 * Level 5: 2% of downline's investment amount
 *
 * Example: Downline invests 100K → L1 gets 10K (immediately)
 *          Downline invests again 500K → L1 gets 50K (immediately)
 *
 * This is NOT like M.Profit (which is daily from profit).
 * Referral is per-investment, from investment amount.
 */
const REFERRAL_BONUS_PERCENTAGES: Record<number, number> = {
  1: 10,  // 10%
  2: 5,   // 5%
  3: 4,   // 4%
  4: 3,   // 3%
  5: 2,   // 2%
};

/**
 * Credit referral bonus to ALL upline users (Level 1-5).
 * Called IMMEDIATELY when a downline makes an investment.
 * Bonus = percentage × investment amount.
 * Goes directly to mainBalance (withdrawable).
 *
 * @param tx - Prisma transaction client
 * @param userId - The user who just invested
 * @param investmentAmount - The investment amount
 */
export async function creditInvestmentReferralBonusesTx(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  userId: string,
  investmentAmount: number,
): Promise<{
  totalReferralCredited: number;
  details: Array<{ level: number; uplineId: string; rate: number; amount: number }>;
}> {
  const result = {
    totalReferralCredited: 0,
    details: [] as Array<{ level: number; uplineId: string; rate: number; amount: number }>,
  };

  if (investmentAmount <= 0) return result;

  // Find all upline members for this user
  const uplineRefs = await tx.referral.findMany({
    where: { referredId: userId },
    orderBy: { level: 'asc' },
  });

  if (uplineRefs.length === 0) return result;

  // Get the investing user's info
  const investingUser = await tx.user.findUnique({
    where: { id: userId },
    select: { name: true, userId: true },
  });
  const investingUserName = investingUser?.name || investingUser?.userId || 'User';

  // Process each upline level
  for (const ref of uplineRefs) {
    const level = ref.level;

    // Only process levels 1-5
    if (level > 5) continue;

    const rate = REFERRAL_BONUS_PERCENTAGES[level] || 0;
    if (rate <= 0) continue;

    const bonusAmount = Math.floor(investmentAmount * (rate / 100));
    if (bonusAmount <= 0) continue;

    // Credit referral bonus to upline's mainBalance
    await tx.user.update({
      where: { id: ref.referrerId },
      data: {
        mainBalance: { increment: bonusAmount },
        totalProfit: { increment: bonusAmount },
      },
    });

    // Create BonusLog entry with type 'referral'
    await tx.bonusLog.create({
      data: {
        userId: ref.referrerId,
        fromUserId: userId,
        type: 'referral',
        level,
        amount: bonusAmount,
        description: `Bonus Referral Level ${level} (${rate}%) dari investasi ${investingUserName} — Rp${Math.floor(investmentAmount).toLocaleString('id-ID')} x ${rate}% = Rp${bonusAmount.toLocaleString('id-ID')}`,
      },
    });

    result.totalReferralCredited += bonusAmount;
    result.details.push({
      level,
      uplineId: ref.referrerId,
      rate,
      amount: bonusAmount,
    });
  }

  return result;
}

/**
 * Get the bonus percentage for a given level
 */
export function getReferralBonusPercentage(level: number): number {
  return REFERRAL_BONUS_PERCENTAGES[level] || 0;
}

/**
 * Get the bonus amount for a given level and investment amount
 */
export function getReferralBonusAmount(level: number, investmentAmount: number): number {
  const percentage = REFERRAL_BONUS_PERCENTAGES[level] || 0;
  return Math.floor(investmentAmount * (percentage / 100));
}

/**
 * Daily referral bonus - NO LONGER USED.
 * Referral bonuses are now per-investment (credited immediately when downline invests).
 */
export async function creditDailyReferralBonuses(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  _earningUserId: string,
  _investmentAmount: number,
): Promise<{
  totalReferralCredited: number;
  details: Array<{ level: number; uplineId: string; rate: number; amount: number }>;
}> {
  // ★ NO-OP: Referral bonuses are now PER-INVESTMENT, not daily ★
  console.log('[REFERRAL-BONUS] Skipping daily referral bonus — now handled per-investment');
  return { totalReferralCredited: 0, details: [] };
}

/**
 * Legacy registration-based function - NO LONGER USED.
 */
export async function creditReferralBonuses(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  _userId: string,
  _amount: number,
  _triggerType: 'deposit' | 'purchase' | 'investment',
): Promise<void> {
  // ★ NO-OP ★
  console.log('[REFERRAL-BONUS] Skipping legacy referral bonus — now handled per-investment');
}

export async function creditRegistrationReferralBonuses(_userId: string): Promise<void> {
  // ★ NO-OP ★
  console.log('[REFERRAL-BONUS] creditRegistrationReferralBonuses is deprecated — now handled per-investment');
}

export async function creditInvestmentReferralBonuses(_userId: string, _investmentAmount: number): Promise<void> {
  // ★ NO-OP: Use creditInvestmentReferralBonusesTx instead (needs transaction) ★
  console.log('[REFERRAL-BONUS] creditInvestmentReferralBonuses is deprecated — use creditInvestmentReferralBonusesTx');
}
