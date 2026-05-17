import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const whatsapp = (body.whatsapp || '').toString().trim();
    const otp = (body.otp || '').toString().trim();
    const type = (body.type || '').toString().trim();

    // Validate required fields
    if (!whatsapp || !otp || !type) {
      return NextResponse.json(
        { success: false, error: 'WhatsApp, OTP, dan tipe verifikasi wajib diisi' },
        { status: 400 }
      );
    }

    // Validate OTP format
    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      return NextResponse.json(
        { success: false, error: 'OTP harus berupa kode 6 digit' },
        { status: 400 }
      );
    }

    // Validate type
    if (type !== 'whatsapp' && type !== 'email') {
      return NextResponse.json(
        { success: false, error: 'Tipe verifikasi harus whatsapp atau email' },
        { status: 400 }
      );
    }

    // Find user by whatsapp
    const user = await db.user.findUnique({ where: { whatsapp } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Akun tidak ditemukan' },
        { status: 404 }
      );
    }

    const now = new Date();

    if (type === 'whatsapp') {
      // Verify WhatsApp OTP
      if (!user.otpCode || !user.otpExpiry) {
        return NextResponse.json(
          { success: false, error: 'OTP WhatsApp belum dikirim. Silakan kirim ulang OTP.' },
          { status: 400 }
        );
      }

      if (user.otpCode !== otp) {
        return NextResponse.json(
          { success: false, error: 'Kode OTP WhatsApp salah' },
          { status: 400 }
        );
      }

      if (now > user.otpExpiry) {
        return NextResponse.json(
          { success: false, error: 'Kode OTP WhatsApp sudah kedaluwarsa. Silakan kirim ulang.' },
          { status: 400 }
        );
      }

      // Clear WhatsApp OTP fields after successful verification
      const emailVerified = !user.emailOtpCode || user.isVerified;
      const shouldBeFullyVerified = emailVerified && !user.emailOtpCode;

      await db.user.update({
        where: { id: user.id },
        data: {
          otpCode: null,
          otpExpiry: null,
          ...(shouldBeFullyVerified ? { isVerified: true } : {}),
        },
      });

      const updatedUser = await db.user.findUnique({ where: { id: user.id } });

      return NextResponse.json({
        success: true,
        data: {
          whatsappVerified: true,
          emailVerified: !updatedUser?.emailOtpCode,
          isVerified: updatedUser?.isVerified ?? false,
          message: updatedUser?.isVerified
            ? 'Verifikasi berhasil! Akun Anda telah aktif.'
            : 'OTP WhatsApp terverifikasi. Silakan verifikasi email Anda juga.',
        },
      });
    }

    if (type === 'email') {
      // Verify Email OTP
      if (!user.emailOtpCode || !user.emailOtpExpiry) {
        return NextResponse.json(
          { success: false, error: 'OTP email belum dikirim. Silakan kirim ulang OTP.' },
          { status: 400 }
        );
      }

      if (user.emailOtpCode !== otp) {
        console.log(`[VERIFY-OTP] Email OTP mismatch for ${user.email}: entered=${otp}`);
        return NextResponse.json(
          { success: false, error: 'Kode OTP email salah' },
          { status: 400 }
        );
      }

      if (now > user.emailOtpExpiry) {
        return NextResponse.json(
          { success: false, error: 'Kode OTP email sudah kedaluwarsa. Silakan kirim ulang.' },
          { status: 400 }
        );
      }

      // Check if WhatsApp OTP is also cleared (meaning WhatsApp was verified)
      const whatsappVerified = !user.otpCode;
      const shouldBeFullyVerified = whatsappVerified;

      await db.user.update({
        where: { id: user.id },
        data: {
          emailOtpCode: null,
          emailOtpExpiry: null,
          ...(shouldBeFullyVerified ? { isVerified: true } : {}),
        },
      });

      // Referral bonuses are credited at registration time.
      // If for some reason they weren't (e.g. older flow), credit them now on first verification.
      if (shouldBeFullyVerified && user.referredBy) {
        try {
          const existingReferrals = await db.referral.findMany({
            where: { referredId: user.id, bonus: { gt: 0 } },
          });
          if (existingReferrals.length === 0) {
            const { creditRegistrationReferralBonuses } = await import('@/lib/referral-bonus');
            await creditRegistrationReferralBonuses(user.id);
            console.log(`[VERIFY-OTP] ✅ Credited referral bonuses for newly verified user ${user.id}`);
          } else {
            console.log(`[VERIFY-OTP] Referral bonuses already credited for user ${user.id}, skipping`);
          }
        } catch (bonusError) {
          console.error(`[VERIFY-OTP] ❌ Failed to credit referral bonuses for user ${user.id}:`, bonusError);
        }
      }

      const updatedUser = await db.user.findUnique({ where: { id: user.id } });

      return NextResponse.json({
        success: true,
        data: {
          whatsappVerified: !updatedUser?.otpCode,
          emailVerified: true,
          isVerified: updatedUser?.isVerified ?? false,
          message: updatedUser?.isVerified
            ? 'Verifikasi berhasil! Akun Anda telah aktif.'
            : 'OTP email terverifikasi. Silakan verifikasi WhatsApp Anda juga.',
        },
      });
    }

    // Should never reach here due to type validation above
    return NextResponse.json(
      { success: false, error: 'Tipe verifikasi tidak valid' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Verify OTP error:', error);
    return NextResponse.json(
      { success: false, error: 'Database belum tersedia. Silakan hubungi admin.' },
      { status: 503 }
    );
  }
}
