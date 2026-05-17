import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateOtp, sendOtpEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = (body.email || '').toString().trim();

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'No account found with this email' },
        { status: 404 }
      );
    }

    // Allow OTP resend for both unverified users (registration) and verified users (forgot-password)
    // Remove the overly restrictive check that blocked verified users without existing OTP codes

    // If there's an existing OTP that hasn't expired yet, keep it and resend the same code
    // This prevents OTP mismatch if user requests resend before the old code expires
    let emailOtp: string;
    let emailOtpExpiry: Date;

    if (user.emailOtpCode && user.emailOtpExpiry && new Date() < user.emailOtpExpiry) {
      // Reuse existing OTP - just resend the same code
      emailOtp = user.emailOtpCode;
      emailOtpExpiry = user.emailOtpExpiry;
      console.log(`[SEND-OTP] Reusing existing OTP for ${email}`);
    } else {
      // Generate new OTP
      emailOtp = generateOtp();
      emailOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    }

    await db.user.update({
      where: { id: user.id },
      data: { emailOtpCode: emailOtp, emailOtpExpiry },
    });

    const emailSent = await sendOtpEmail(email, emailOtp, user.name || undefined, 'registration');

    if (!emailSent) {
      return NextResponse.json(
        { success: false, error: 'Failed to send OTP email. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        email: user.email,
        message: 'OTP code has been sent to your email.',
      },
    });
  } catch (error) {
    console.error('Send email OTP error:', error);
    return NextResponse.json(
      { success: false, error: 'Database belum tersedia. Silakan hubungi admin.' },
      { status: 503 }
    );
  }
}
