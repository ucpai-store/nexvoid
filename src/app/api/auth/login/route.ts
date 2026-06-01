import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { signToken } from '@/lib/auth';
import { generateOtp, sendOtpEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { whatsapp, email, password } = body;

    // Allow login with either whatsapp or email
    if ((!whatsapp && !email) || !password) {
      return NextResponse.json(
        { success: false, error: 'WhatsApp/email and password are required' },
        { status: 400 }
      );
    }

    // Find user by whatsapp or email
    let user;
    if (whatsapp) {
      // Try exact match first
      user = await db.user.findUnique({ where: { whatsapp } });
      // If not found and number doesn't start with country code, try prepending common codes
      if (!user && !whatsapp.startsWith('62') && !whatsapp.startsWith('60') && !whatsapp.startsWith('65')) {
        // Try with 62 prefix (Indonesia) for backward compatibility
        user = await db.user.findUnique({ where: { whatsapp: '62' + whatsapp } });
      }
      // If still not found and starts with 62, try without it
      if (!user && whatsapp.startsWith('62')) {
        user = await db.user.findUnique({ where: { whatsapp: whatsapp.substring(2) } });
      }
    } else if (email) {
      user = await db.user.findUnique({ where: { email } });
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Account not found' },
        { status: 401 }
      );
    }

    if (user.isSuspended) {
      return NextResponse.json(
        { success: false, error: 'Account has been suspended' },
        { status: 403 }
      );
    }

    // Check password FIRST before any OTP-related actions (security)
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return NextResponse.json(
        { success: false, error: 'Incorrect password' },
        { status: 401 }
      );
    }

    // After password is verified, check if email is verified
    if (!user.isVerified) {
      // Auto-send OTP so the user can verify their email
      // Reuse existing OTP if still valid, otherwise generate new one
      let otpSent = false;
      try {
        let emailOtp: string;
        let emailOtpExpiry: Date;

        if (user.emailOtpCode && user.emailOtpExpiry && new Date() < user.emailOtpExpiry) {
          // Reuse existing valid OTP
          emailOtp = user.emailOtpCode;
          emailOtpExpiry = user.emailOtpExpiry;
        } else {
          // Generate new OTP
          emailOtp = generateOtp();
          emailOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
          await db.user.update({
            where: { id: user.id },
            data: { emailOtpCode: emailOtp, emailOtpExpiry },
          });
        }
        otpSent = await sendOtpEmail(user.email, emailOtp, user.name || undefined, 'registration');
      } catch (emailError) {
        console.error('Failed to send OTP for unverified login:', emailError);
      }

      return NextResponse.json(
        {
          success: false,
          error: otpSent
            ? 'Your email is not yet verified. A new verification code has been sent to your email.'
            : 'Your email is not yet verified. Please use the "Resend Code" button on the verification page.',
          code: 'EMAIL_NOT_VERIFIED',
          email: user.email,
        },
        { status: 403 }
      );
    }

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
          avatar: user.avatar,
          referralCode: user.referralCode,
          level: user.level,
          mainBalance: user.mainBalance,
          depositBalance: user.depositBalance || 0,
          profitBalance: user.profitBalance,
          totalDeposit: user.totalDeposit,
          totalWithdraw: user.totalWithdraw,
          totalProfit: user.totalProfit,
          isSuspended: user.isSuspended,
          isVerified: user.isVerified,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: 'Database belum tersedia. Silakan hubungi admin.' },
      { status: 503 }
    );
  }
}
