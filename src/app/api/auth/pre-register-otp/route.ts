import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateOtp, sendOtpEmail } from '@/lib/email';
import { notifyBot } from '@/lib/bot-notification';

/**
 * Pre-registration OTP: Send OTP to WhatsApp and/or Email BEFORE account creation.
 * Stores OTP in SystemSettings with a prefixed key so it can be verified later.
 * The register endpoint will check for these pre-verified tokens.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { whatsapp, email } = body;

    if (!whatsapp && !email) {
      return NextResponse.json(
        { success: false, error: 'WhatsApp atau email wajib diisi' },
        { status: 400 }
      );
    }

    const results: { whatsappSent?: boolean; emailSent?: boolean } = {};

    // ── WhatsApp OTP ──
    if (whatsapp) {
      const cleanWhatsapp = whatsapp.replace(/[^0-9]/g, '');
      if (cleanWhatsapp.length < 10 || cleanWhatsapp.length > 15) {
        return NextResponse.json(
          { success: false, error: 'Nomor WhatsApp tidak valid' },
          { status: 400 }
        );
      }

      // Check if WhatsApp already registered with verified account
      const existingWa = await db.user.findUnique({ where: { whatsapp: cleanWhatsapp } });
      if (existingWa && existingWa.isVerified) {
        return NextResponse.json(
          { success: false, error: 'Nomor WhatsApp sudah terdaftar' },
          { status: 400 }
        );
      }

      const whatsappOtp = generateOtp();
      const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 5 min

      // Store pre-registration OTP in SystemSettings
      await db.systemSettings.upsert({
        where: { key: `pre_otp_wa_${cleanWhatsapp}` },
        update: { value: JSON.stringify({ otp: whatsappOtp, expiresAt: otpExpiry.toISOString(), verified: false }) },
        create: { key: `pre_otp_wa_${cleanWhatsapp}`, value: JSON.stringify({ otp: whatsappOtp, expiresAt: otpExpiry.toISOString(), verified: false }) },
      });

      // Send via WhatsApp bot notification
      await notifyBot('otp_requested', {
        whatsapp: cleanWhatsapp,
        otp: whatsappOtp,
        userName: 'Pengguna Baru',
      });

      console.log(`[PRE-REGISTER OTP] WhatsApp OTP sent for ${cleanWhatsapp}`);
      results.whatsappSent = true;
    }

    // ── Email OTP ──
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { success: false, error: 'Format email tidak valid' },
          { status: 400 }
        );
      }

      // Check if email already registered with verified account
      const existingEmail = await db.user.findUnique({ where: { email } });
      if (existingEmail && existingEmail.isVerified) {
        return NextResponse.json(
          { success: false, error: 'Email sudah terdaftar' },
          { status: 400 }
        );
      }

      const emailOtp = generateOtp();
      const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 5 min

      // Store pre-registration OTP in SystemSettings
      const emailKey = `pre_otp_em_${email.toLowerCase()}`;
      await db.systemSettings.upsert({
        where: { key: emailKey },
        update: { value: JSON.stringify({ otp: emailOtp, expiresAt: otpExpiry.toISOString(), verified: false }) },
        create: { key: emailKey, value: JSON.stringify({ otp: emailOtp, expiresAt: otpExpiry.toISOString(), verified: false }) },
      });

      // Send via email
      await sendOtpEmail(email, emailOtp);

      console.log(`[PRE-REGISTER OTP] Email OTP sent for ${email}`);
      results.emailSent = true;
    }

    return NextResponse.json({
      success: true,
      data: {
        ...results,
        message: 'Kode OTP telah dikirim. Silakan cek WhatsApp dan email Anda.',
      },
    });
  } catch (error) {
    console.error('Pre-register OTP send error:', error);
    return NextResponse.json(
      { success: false, error: 'Database belum tersedia. Silakan hubungi admin.' },
      { status: 503 }
    );
  }
}
