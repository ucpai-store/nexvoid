import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || 'nexvo-secret-key-2024';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, otp } = body;

    if (!email || !otp) {
      return NextResponse.json(
        { success: false, error: 'Email and verification code are required' },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid verification code' },
        { status: 400 }
      );
    }

    // Check OTP matches
    if (user.emailOtpCode !== otp) {
      return NextResponse.json(
        { success: false, error: 'Invalid verification code' },
        { status: 400 }
      );
    }

    // Check OTP not expired
    if (!user.emailOtpExpiry || new Date() > user.emailOtpExpiry) {
      return NextResponse.json(
        { success: false, error: 'Verification code has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // Generate reset token (JWT, 15 min expiry)
    const resetToken = jwt.sign(
      { userId: user.id, type: 'password-reset' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Store reset token and expiry in user record
    const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await db.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry,
        emailOtpCode: null, // Clear OTP
        emailOtpExpiry: null,
      },
    });

    return NextResponse.json({
      success: true,
      data: { resetToken },
    });
  } catch (error) {
    console.error('Verify reset OTP error:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
