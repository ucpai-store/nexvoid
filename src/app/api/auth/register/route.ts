import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { signToken, generateUserId, generateReferralCode } from '@/lib/auth';
import { generateOtp, sendOtpEmail } from '@/lib/email';
import { notifyBot } from '@/lib/bot-notification';
// Referral bonuses are NOT credited on registration.
// They are credited when the referred user makes their FIRST investment/purchase.
// See: /src/lib/referral-bonus.ts → creditInvestmentReferralBonusesTx()

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { whatsapp, email, password, referralCode, name } = body;

    // Validate required fields
    if (!name || !name.trim() || !whatsapp || !email || !password) {
      return NextResponse.json(
        { success: false, error: 'Name, WhatsApp, email, and password are required' },
        { status: 400 }
      );
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate WhatsApp number - now accepts numbers with country code
    const cleanWhatsapp = whatsapp.replace(/[^0-9]/g, '');
    if (cleanWhatsapp.length < 8 || cleanWhatsapp.length > 15) {
      return NextResponse.json(
        { success: false, error: 'Invalid WhatsApp number (8-15 digits with country code)' },
        { status: 400 }
      );
    }

    // Validate password length
    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Check if whatsapp already exists
    const existingWhatsapp = await db.user.findUnique({ where: { whatsapp: cleanWhatsapp } });
    if (existingWhatsapp) {
      return NextResponse.json(
        { success: false, error: 'WhatsApp number already registered' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingEmail = await db.user.findUnique({ where: { email } });
    if (existingEmail) {
      return NextResponse.json(
        { success: false, error: 'Email already registered' },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 8);
    const userId = generateUserId();
    const userReferralCode = generateReferralCode();

    let referredBy: string | null = null;
    let referrerId: string | null = null;
    if (referralCode) {
      const referrer = await db.user.findUnique({ where: { referralCode } });
      if (!referrer) {
        return NextResponse.json(
          { success: false, error: 'Invalid referral code' },
          { status: 400 }
        );
      }

      referredBy = referrer.userId;
      referrerId = referrer.id;
    }

    // Generate email OTP for verification
    const emailOtp = generateOtp();
    const emailOtpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create user with isVerified: false - requires email verification
    const user = await db.user.create({
      data: {
        userId,
        whatsapp: cleanWhatsapp,
        email,
        password: hashedPassword,
        referralCode: userReferralCode,
        referredBy,
        name: name || '',
        avatar: '',
        isVerified: false,
        otpCode: null,
        otpExpiry: null,
        emailOtpCode: emailOtp,
        emailOtpExpiry,
      },
    });

    // Create referral chain for ALL upline users (Level 1-5)
    // NO LIMIT on number of referrals - unlimited referrals allowed
    // Bonuses (bonus: 0) are NOT credited here - they are credited when
    // the referred user makes their FIRST investment/purchase
    if (referrerId) {
      // Build the upline chain
      const uplineChain: { referrerId: string; level: number }[] = [];
      let currentReferrerId: string | null = referrerId;
      let level = 1;

      while (currentReferrerId && level <= 5) {
        uplineChain.push({ referrerId: currentReferrerId, level });
        
        // Find this referrer's own referrer (their "referredBy" points to a userId, not an id)
        const referrerUser = await db.user.findUnique({
          where: { id: currentReferrerId },
          select: { referredBy: true },
        });
        
        if (!referrerUser?.referredBy) break;
        
        // Find the actual user who referred this referrer
        const uplineUser = await db.user.findUnique({
          where: { userId: referrerUser.referredBy },
          select: { id: true },
        });
        
        if (!uplineUser) break;
        currentReferrerId = uplineUser.id;
        level++;
      }

      // Create referral records for ALL upline levels
      await db.$transaction(async (tx) => {
        for (const upline of uplineChain) {
          await tx.referral.create({
            data: {
              referrerId: upline.referrerId,
              referredId: user.id,
              level: upline.level,
              bonus: 0, // Will be updated by creditInvestmentReferralBonusesTx when user makes first investment
            },
          });
        }
      });

      console.log(`[REGISTER] Created ${uplineChain.length} referral chain entries for user ${user.userId} (bonuses will be credited on first investment)`);
    }

    // Send email OTP for verification
    console.log(`[REGISTER] Sending OTP to ${email}, code: ${emailOtp.substring(0,2)}****`);
    const emailSent = await sendOtpEmail(email, emailOtp, undefined, 'registration');
    console.log(`[REGISTER] OTP email result for ${email}: ${emailSent ? 'SENT ✅' : 'FAILED ❌'}`);

    // Notify bot about new registration
    try {
      await notifyBot('register', {
        userId: user.id,
        userDbId: user.userId,
        userName: user.name || user.userId,
        whatsapp: cleanWhatsapp,
        email,
        referralCode: user.referralCode,
        level: user.level,
        isVerified: user.isVerified,
        registeredAt: user.createdAt.toISOString(),
        message: `Registration successful! ID: ${user.userId}, Referral Code: ${user.referralCode}`,
      });
    } catch { /* ignore notification errors */ }

    // Generate token for the user (for OTP page access)
    const token = signToken({ userId: user.id, type: 'user' });

    if (!emailSent) {
      console.error(`[REGISTER] ❌ Failed to send OTP email to: ${email}. User will need to use Resend Code.`);
    }

    return NextResponse.json({
      success: true,
      data: {
        token,
        requiresVerification: true,
        emailSent,
        user: {
          id: user.id,
          userId: user.userId,
          whatsapp: user.whatsapp,
          email: user.email,
          name: user.name,
          referralCode: user.referralCode,
          level: user.level,
          mainBalance: user.mainBalance,
          depositBalance: user.depositBalance || 0,
          profitBalance: user.profitBalance,
          isVerified: user.isVerified,
        },
        message: emailSent
          ? 'Registration successful! A verification code has been sent to your email.'
          : 'Registration successful! However, we could not send the verification email. Please use the Resend Code button on the verification page.',
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json(
      { success: false, error: 'Database belum tersedia. Silakan hubungi admin.' },
      { status: 503 }
    );
  }
}
