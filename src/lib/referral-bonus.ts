import { db } from '@/lib/db';

/**
 * Referral bonus PERCENTAGES per level (triggered on FIRST investment/purchase)
 * Level 1 (Direct/Sponsor): 10% of investment amount
 * Level 2: 5% of investment amount
 * Level 3: 4% of investment amount
 * Level 4: 3% of investment amount
 * Level 5: 2% of investment amount
 *
 * REQUIREMENT: The referred user MUST invest first before referrer gets bonus.
 * Bonus is credited ONCE when the referred user makes their FIRST investment/purchase.
 * The bonus amount = percentage × investment amount.
 * Bonus goes directly to mainBalance (withdrawable).
 *
 * Example: Friend invests 100K → L1 referrer gets 10% = 10K, L2 gets 5% = 5K, etc.
 */
const REFERRAL_BONUS_PERCENTAGES: Record<number, number> = {
  1: 10,  // 10%
  2: 5,   // 5%
  3: 4,   // 4%
  4: 3,   // 3%
  5: 2,   // 2%
};

/**
 * Credit investment-based referral bonuses to ALL upline users (Level 1-5).
 * Called when a user makes their FIRST investment/purchase.
 * Bonus is PERCENTAGE of the investment amount, ONE TIME per referral.
 * Goes directly to mainBalance.
 *
 * @param userId - The investing user's internal DB id
 * @param investmentAmount - The amount invested/purchased
 */
export async function creditInvestmentReferralBonuses(userId: string, investmentAmount: number): Promise<void> {
  console.log(`[REFERRAL-BONUS] Starting investment-based referral bonus for user ${userId}, amount: ${investmentAmount}`);

  // Check if referral bonus was already credited for this user (prevent double crediting)
  const existingBonuses = await db.referral.findMany({
    where: { referredId: userId, bonus: { gt: 0 } },
  });

  if (existingBonuses.length > 0) {
    console.log(`[REFERRAL-BONUS] Referral bonuses already credited for user ${userId}, skipping`);
    return;
  }

  // Find all upline referrals for this user (all levels where this user is the referred)
  const referrals = await db.referral.findMany({
    where: { referredId: userId },
    orderBy: { level: 'asc' },
  });

  if (referrals.length === 0) {
    console.log(`[REFERRAL-BONUS] No upline referrals found for user ${userId}`);
    return;
  }

  // Get the user who just invested
  const triggerUser = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, userId: true },
  });

  const triggerUserName = triggerUser?.name || triggerUser?.userId || 'User';

  for (const referral of referrals) {
    const percentage = REFERRAL_BONUS_PERCENTAGES[referral.level];
    if (!percentage) continue; // Skip levels beyond 5

    const bonusAmount = Math.floor(investmentAmount * (percentage / 100));

    if (bonusAmount <= 0) continue;

    // Credit bonus to the referrer's mainBalance and totalProfit
    await db.user.update({
      where: { id: referral.referrerId },
      data: {
        mainBalance: { increment: bonusAmount },
        totalProfit: { increment: bonusAmount },
      },
    });

    // Create a BonusLog entry with type 'referral'
    await db.bonusLog.create({
      data: {
        userId: referral.referrerId,
        fromUserId: userId,
        type: 'referral',
        level: referral.level,
        amount: bonusAmount,
        description: `Bonus Referral Level ${referral.level} dari ${triggerUserName} (investasi ${formatRupiahSimple(investmentAmount)}) — ${percentage}% = ${formatRupiahSimple(bonusAmount)}`,
      },
    });

    // Update the referral entry with the bonus amount
    await db.referral.update({
      where: { id: referral.id },
      data: {
        bonus: bonusAmount,
      },
    });

    console.log(`[REFERRAL-BONUS] Credited ${percentage}% = ${formatRupiahSimple(bonusAmount)} to referrer ${referral.referrerId} for Level ${referral.level}`);
  }

  console.log(`[REFERRAL-BONUS] Completed investment-based referral bonus for user ${userId}, investment: ${formatRupiahSimple(investmentAmount)}`);
}

/**
 * Transaction-safe version that can be called within a Prisma transaction.
 * Used inside investment and product purchase transactions for atomicity.
 */
export async function creditInvestmentReferralBonusesTx(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  userId: string,
  investmentAmount: number,
): Promise<void> {
  console.log(`[REFERRAL-BONUS-TX] Starting TX investment-based referral bonus for user ${userId}, amount: ${investmentAmount}`);

  // Check if referral bonus was already credited for this user (prevent double crediting)
  const existingBonuses = await tx.referral.findMany({
    where: { referredId: userId, bonus: { gt: 0 } },
  });

  if (existingBonuses.length > 0) {
    console.log(`[REFERRAL-BONUS-TX] Referral bonuses already credited for user ${userId}, skipping`);
    return;
  }

  // Find all upline referrals
  const referrals = await tx.referral.findMany({
    where: { referredId: userId },
    orderBy: { level: 'asc' },
  });

  if (referrals.length === 0) {
    console.log(`[REFERRAL-BONUS-TX] No upline referrals found for user ${userId}`);
    return;
  }

  const triggerUser = await tx.user.findUnique({
    where: { id: userId },
    select: { name: true, userId: true },
  });

  const triggerUserName = triggerUser?.name || triggerUser?.userId || 'User';

  for (const referral of referrals) {
    const percentage = REFERRAL_BONUS_PERCENTAGES[referral.level];
    if (!percentage) continue;

    const bonusAmount = Math.floor(investmentAmount * (percentage / 100));
    if (bonusAmount <= 0) continue;

    // Credit bonus to the referrer's mainBalance and totalProfit
    await tx.user.update({
      where: { id: referral.referrerId },
      data: {
        mainBalance: { increment: bonusAmount },
        totalProfit: { increment: bonusAmount },
      },
    });

    // Create a BonusLog entry
    await tx.bonusLog.create({
      data: {
        userId: referral.referrerId,
        fromUserId: userId,
        type: 'referral',
        level: referral.level,
        amount: bonusAmount,
        description: `Bonus Referral Level ${referral.level} dari ${triggerUserName} (investasi ${formatRupiahSimple(investmentAmount)}) — ${percentage}% = ${formatRupiahSimple(bonusAmount)}`,
      },
    });

    // Update the referral entry with the bonus amount
    await tx.referral.update({
      where: { id: referral.id },
      data: { bonus: bonusAmount },
    });

    console.log(`[REFERRAL-BONUS-TX] Credited ${percentage}% = ${formatRupiahSimple(bonusAmount)} to referrer ${referral.referrerId} for Level ${referral.level}`);
  }

  console.log(`[REFERRAL-BONUS-TX] Completed TX referral bonus for user ${userId}`);
}

/**
 * Legacy function kept for backward compatibility.
 * Now redirects to the new percentage-based investment system.
 */
export async function creditReferralBonuses(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  userId: string,
  amount: number,
  triggerType: 'deposit' | 'purchase' | 'investment',
): Promise<void> {
  // Redirect to the new percentage-based system
  await creditInvestmentReferralBonusesTx(tx, userId, amount);
}

/**
 * Legacy registration-based function - NO LONGER USED.
 * Referral bonuses are now credited on first investment, not registration.
 */
export async function creditRegistrationReferralBonuses(userId: string): Promise<void> {
  console.log(`[REFERRAL-BONUS] creditRegistrationReferralBonuses called but referral bonuses are now credited on first investment. Skipping.`);
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
 * Simple Rupiah formatting without importing from auth.ts (to avoid circular deps)
 */
function formatRupiahSimple(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}

