import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { signToken, generateUserId, generateReferralCode } from '@/lib/auth';
import { notifyBot } from '@/lib/bot-notification';
// Referral bonuses are NO LONGER credited on registration/verification.
// They are credited when the referred user makes their FIRST investment/purchase.

function hashEmailKey(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, otp } = body;

    if (!email || !otp) {
      return NextResponse.json(
        { success: false, error: 'Email and OTP code are required' },
        { status: 400 }
      );
    }

    // Look up the registration data from SystemSettings
    const regKey = `reg_otp_${hashEmailKey(email)}`;
    const stored = await db.systemSettings.findUnique({ where: { key: regKey } });

    if (!stored) {
      return NextResponse.json(
        { success: false, error: 'No pending registration found. Please register again.' },
        { status: 400 }
      );
    }

    let regData: {
      whatsapp: string;
      email: string;
      password: string;
      name: string;
      referralCode: string | null;
      otp: string;
      expiresAt: string;
    };

    try {
      regData = JSON.parse(stored.value);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid registration data. Please register again.' },
        { status: 400 }
      );
    }

    // Verify OTP matches
    if (regData.otp !== otp) {
      return NextResponse.json(
        { success: false, error: 'Invalid verification code. Please try again.' },
        { status: 400 }
      );
    }

    // Check if OTP has expired
    if (new Date(regData.expiresAt) < new Date()) {
      // Clean up expired data
      try {
        await db.systemSettings.delete({ where: { key: regKey } });
      } catch { /* ignore */ }
      return NextResponse.json(
        { success: false, error: 'Verification code has expired. Please register again.' },
        { status: 400 }
      );
    }

    // Double-check email/whatsapp not already taken (race condition guard)
    const existingEmail = await db.user.findUnique({ where: { email: regData.email } });
    if (existingEmail) {
      try { await db.systemSettings.delete({ where: { key: regKey } }); } catch { /* ignore */ }
      return NextResponse.json(
        { success: false, error: 'Email is already registered' },
        { status: 400 }
      );
    }

    const existingWhatsapp = await db.user.findUnique({ where: { whatsapp: regData.whatsapp } });
    if (existingWhatsapp) {
      try { await db.systemSettings.delete({ where: { key: regKey } }); } catch { /* ignore */ }
      return NextResponse.json(
        { success: false, error: 'WhatsApp number is already registered' },
        { status: 400 }
      );
    }

    // Generate user IDs
    const userId = generateUserId();
    const userReferralCode = generateReferralCode();

    // Resolve referral
    let referredBy: string | null = null;
    let referrerId: string | null = null;
    if (regData.referralCode) {
      const referrer = await db.user.findUnique({ where: { referralCode: regData.referralCode } });
      if (referrer) {
        referredBy = referrer.userId;
        referrerId = referrer.id;
      }
    }

    // Create the verified user
    const user = await db.user.create({
      data: {
        userId,
        whatsapp: regData.whatsapp,
        email: regData.email,
        password: regData.password, // Already hashed
        referralCode: userReferralCode,
        referredBy,
        name: regData.name || '',
        avatar: '',
        isVerified: true,
        otpCode: null,
        otpExpiry: null,
        emailOtpCode: null,
        emailOtpExpiry: null,
      },
    });

    // Create referral entries for the entire upline chain (up to 5 levels) - NO LIMIT on referrals
    if (regData.referralCode && referrerId) {
      // Build upline chain
      const uplineChain: { referrerId: string; level: number }[] = [];
      let currentReferrerId: string | null = referrerId;
      let level = 1;

      while (currentReferrerId && level <= 5) {
        uplineChain.push({ referrerId: currentReferrerId, level });

        const referrerUser = await db.user.findUnique({
          where: { id: currentReferrerId },
          select: { referredBy: true },
        });

        if (!referrerUser?.referredBy) break;

        const uplineUser = await db.user.findUnique({
          where: { userId: referrerUser.referredBy },
          select: { id: true },
        });

        if (!uplineUser) break;
        currentReferrerId = uplineUser.id;
        level++;
      }

      // Create referral records
      await db.$transaction(async (tx) => {
        for (const upline of uplineChain) {
          // Check if referral already exists (avoid duplicates)
          const existing = await tx.referral.findFirst({
            where: { referrerId: upline.referrerId, referredId: user.id },
          });
          if (!existing) {
            await tx.referral.create({
              data: {
                referrerId: upline.referrerId,
                referredId: user.id,
                level: upline.level,
                bonus: 0,
              },
            });
          }
        }
      });

      console.log(`[VERIFY-REGISTER-OTP] Created ${uplineChain.length} referral chain entries for user ${user.userId}`);

      // NOTE: Referral bonuses are NO LONGER credited on registration/verification.
      // They are credited when the referred user makes their FIRST investment/purchase.
      // See: /src/lib/referral-bonus.ts → creditInvestmentReferralBonusesTx()
      // Called from: /src/app/api/investments/route.ts and /src/app/api/products/route.ts
    }

    // Delete the temporary registration data
    try {
      await db.systemSettings.delete({ where: { key: regKey } });
    } catch { /* ignore cleanup error */ }

    // Notify bot about new registration
    try {
      await notifyBot('register', {
        userId: user.id,
        userDbId: user.userId,
        userName: user.name || user.userId,
        whatsapp: regData.whatsapp,
        email: regData.email,
        referralCode: user.referralCode,
        level: user.level,
        isVerified: user.isVerified,
        registeredAt: user.createdAt.toISOString(),
        message: `Registration successful! ID: ${user.userId}, Referral Code: ${user.referralCode}`,
      });
    } catch { /* ignore notification errors */ }

    // Generate JWT token
    const token = signToken({ userId: user.id, type: 'user' });

    return NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          userId: user.userId,
          whatsapp: user.whatsapp,
          email: user.email,
          name: user.name,
          referralCode: user.referralCode,
          level: user.level,
          mainBalance: user.mainBalance,
          profitBalance: user.profitBalance,
          isVerified: user.isVerified,
        },
        message: 'Registration successful! Your account is now active.',
      },
    });
  } catch (error) {
    console.error('Verify register OTP error:', error);
    return NextResponse.json(
      { success: false, error: 'Server error occurred' },
      { status: 500 }
    );
  }
}
