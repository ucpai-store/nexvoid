import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateOtp, sendOtpEmail, isSmtpConfigured } from '@/lib/email';

function hashEmailKey(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    // Check SMTP configuration
    if (!isSmtpConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Email service is not configured. Please contact support.' },
        { status: 500 }
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

    // Generate new OTP
    const newOtp = generateOtp();
    const newExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Update the stored registration data with new OTP
    regData.otp = newOtp;
    regData.expiresAt = newExpiresAt.toISOString();

    await db.systemSettings.update({
      where: { key: regKey },
      data: { value: JSON.stringify(regData) },
    });

    // Send new OTP email
    const emailSent = await sendOtpEmail(email, newOtp, regData.name || undefined);
    if (!emailSent) {
      return NextResponse.json(
        { success: false, error: 'Failed to send verification email. Please try again.' },
        { status: 500 }
      );
    }

    console.log(`[RESEND REGISTER OTP] New OTP sent to ${email}: ${newOtp}`);

    return NextResponse.json({
      success: true,
      data: {
        email,
        message: 'A new verification code has been sent to your email.',
      },
    });
  } catch (error) {
    console.error('Resend register OTP error:', error);
    return NextResponse.json(
      { success: false, error: 'Server error occurred' },
      { status: 500 }
    );
  }
}
