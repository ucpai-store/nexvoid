import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest, maskWhatsApp } from '@/lib/auth';

/**
 * Referral bonus percentages per level (for display purposes)
 * L1=10%, L2=5%, L3=4%, L4=3%, L5=2% of first investment amount
 */
const REFERRAL_PERCENTAGES: Record<number, number> = {
  1: 10,
  2: 5,
  3: 4,
  4: 3,
  5: 2,
};

export async function GET(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getUserFromRequest>> = null;
  try {
    user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    // Get referrals made by this user
    const referrals = await db.referral.findMany({
      where: { referrerId: user.id },
      include: {
        referred: {
          select: {
            userId: true,
            name: true,
            whatsapp: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalReferrals = referrals.length;
    const totalBonus = referrals.reduce((sum, r) => sum + r.bonus, 0);

    const referredUsers = referrals.map((r) => ({
      id: r.id,
      name: r.referred.name || r.referred.userId,
      whatsapp: maskWhatsApp(r.referred.whatsapp),
      bonus: r.bonus,
      level: r.level,
      createdAt: r.referred.createdAt,
    }));

    return NextResponse.json({
      success: true,
      data: {
        referralCode: user.referralCode,
        referrals: referredUsers,
        totalBonus,
        referralPercentages: REFERRAL_PERCENTAGES,
        totalReferrals,
      },
    });
  } catch (error) {
    console.error('Get referral info error:', error);
    return NextResponse.json({
      success: true,
      data: {
        referralCode: user?.referralCode || '',
        referrals: [],
        totalBonus: 0,
        referralPercentages: REFERRAL_PERCENTAGES,
        totalReferrals: 0,
      },
    });
  }
}
