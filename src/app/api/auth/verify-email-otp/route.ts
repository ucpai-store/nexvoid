import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Verify email OTP for registration verification AND forgot-password flow.
 * - If purpose is 'forgot-password', only verifies OTP (doesn't change isVerified, doesn't clear OTP)
 * - Otherwise, sets isVerified: true on successful verification and clears OTP
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = (body.email || '').toString().trim();
    const otp = (body.otp || '').toString().trim();
    const { purpose } = body;

    if (!email || !otp) {
      console.log(`[VERIFY-OTP] Missing fields: email=${email ? 'provided' : 'MISSING'}, otp=${otp ? 'provided' : 'MISSING'}`);
      return NextResponse.json(
        { success: false, error: 'Email and OTP code are required' },
        { status: 400 }
      );
    }

    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      console.log(`[VERIFY-OTP] Invalid OTP format: length=${otp.length}, value=${otp}`);
      return NextResponse.json(
        { success: false, error: 'OTP must be a 6-digit code' },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`[VERIFY-OTP] User not found for email: ${email}`);
      return NextResponse.json(
        { success: false, error: 'Account not found' },
        { status: 404 }
      );
    }

    // For forgot-password flow, skip the isVerified check
    const isForgotPassword = purpose === 'forgot-password';

    // If already verified and NOT forgot-password flow
    if (user.isVerified && !isForgotPassword) {
      console.log(`[VERIFY-OTP] User already verified: ${email}`);
      return NextResponse.json(
        { success: false, error: 'Email already verified' },
        { status: 400 }
      );
    }

    // Check if email OTP exists
    if (!user.emailOtpCode || !user.emailOtpExpiry) {
      console.log(`[VERIFY-OTP] No OTP on record for: ${email}`);
      return NextResponse.json(
        { success: false, error: 'OTP code not sent yet. Please resend.' },
        { status: 400 }
      );
    }

    // Verify OTP
    if (user.emailOtpCode !== otp) {
      console.log(`[VERIFY-OTP] Mismatch for ${email}: entered=${otp}`);
      return NextResponse.json(
        { success: false, error: 'Invalid OTP code. Please check your email and try again.' },
        { status: 400 }
      );
    }

    const now = new Date();
    if (now > user.emailOtpExpiry) {
      return NextResponse.json(
        { success: false, error: 'OTP code has expired. Please resend.' },
        { status: 400 }
      );
    }

    // For forgot-password: don't clear OTP yet - the reset-password endpoint will clear it
    // For registration: mark as verified and clear OTP
    // NOTE: Referral bonuses are NO LONGER credited on registration/verification.
    // They are now credited when the referred user makes their FIRST investment/purchase.
    // See: /src/lib/referral-bonus.ts → creditInvestmentReferralBonuses()
    if (!isForgotPassword) {
      await db.user.update({
        where: { id: user.id },
        data: {
          isVerified: true,
          emailOtpCode: null,
          emailOtpExpiry: null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        emailVerified: true,
        isVerified: isForgotPassword ? user.isVerified : true,
        message: isForgotPassword
          ? 'OTP verified. Please create a new password.'
          : 'Verification successful! Your account is now active.',
      },
    });
  } catch (error) {
    console.error('Verify email OTP error:', error);
    return NextResponse.json(
      { success: false, error: 'Database belum tersedia. Silakan hubungi admin.' },
      { status: 503 }
    );
  }
}
