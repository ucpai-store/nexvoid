import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateOtp, sendOtpEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
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

    // Generate new 6-digit OTP
    const emailOtp = generateOtp();
    const emailOtpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 5 minutes

    await db.user.update({
      where: { id: user.id },
      data: { emailOtpCode: emailOtp, emailOtpExpiry },
    });

    // Send OTP email
    const emailSent = await sendOtpEmail(email, emailOtp, user.name || undefined, 'forgot-password');

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
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { success: false, error: 'Database belum tersedia. Silakan hubungi admin.' },
      { status: 503 }
    );
  }
}
