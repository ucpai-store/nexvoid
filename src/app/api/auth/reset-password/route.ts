import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, otp, newPassword } = body;

    if (!email || !otp || !newPassword) {
      return NextResponse.json(
        { success: false, error: 'Email, OTP code, and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Account not found' },
        { status: 404 }
      );
    }

    // Verify OTP
    if (!user.emailOtpCode || !user.emailOtpExpiry) {
      return NextResponse.json(
        { success: false, error: 'OTP code not sent yet. Please start over.' },
        { status: 400 }
      );
    }

    if (user.emailOtpCode !== otp) {
      return NextResponse.json(
        { success: false, error: 'Invalid OTP code' },
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

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 8);

    // Update password and clear OTP
    await db.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        emailOtpCode: null,
        emailOtpExpiry: null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        message: 'Password changed successfully. Please log in with your new password.',
      },
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { success: false, error: 'Database belum tersedia. Silakan hubungi admin.' },
      { status: 503 }
    );
  }
}
