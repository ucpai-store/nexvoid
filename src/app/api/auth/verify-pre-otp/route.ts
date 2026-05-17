import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Pre-registration OTP Verification: Verify OTP sent to WhatsApp and/or Email
 * BEFORE account creation. Marks the OTP as "verified" in SystemSettings so
 * the register endpoint can check that verification was completed.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { whatsapp, email, whatsappOtp, emailOtp } = body;

    if (!whatsappOtp && !emailOtp) {
      return NextResponse.json(
        { success: false, error: 'Kode OTP wajib diisi' },
        { status: 400 }
      );
    }

    const results: { whatsappVerified?: boolean; emailVerified?: boolean } = {};
    const now = new Date();

    // ── Verify WhatsApp OTP ──
    if (whatsappOtp && whatsapp) {
      const cleanWhatsapp = whatsapp.replace(/[^0-9]/g, '');
      const key = `pre_otp_wa_${cleanWhatsapp}`;

      const record = await db.systemSettings.findUnique({ where: { key } });
      if (!record) {
        return NextResponse.json(
          { success: false, error: 'Kode OTP WhatsApp belum dikirim. Silakan kirim ulang.' },
          { status: 400 }
        );
      }

      const data = JSON.parse(record.value);
      if (data.verified) {
        results.whatsappVerified = true;
      } else if (data.otp !== whatsappOtp) {
        return NextResponse.json(
          { success: false, error: 'Kode OTP WhatsApp salah' },
          { status: 400 }
        );
      } else if (now > new Date(data.expiresAt)) {
        return NextResponse.json(
          { success: false, error: 'Kode OTP WhatsApp sudah kedaluwarsa. Silakan kirim ulang.' },
          { status: 400 }
        );
      } else {
        // Mark as verified
        await db.systemSettings.update({
          where: { key },
          data: { value: JSON.stringify({ ...data, verified: true }) },
        });
        results.whatsappVerified = true;
      }
    }

    // ── Verify Email OTP ──
    if (emailOtp && email) {
      const key = `pre_otp_em_${email.toLowerCase()}`;

      const record = await db.systemSettings.findUnique({ where: { key } });
      if (!record) {
        return NextResponse.json(
          { success: false, error: 'Kode OTP email belum dikirim. Silakan kirim ulang.' },
          { status: 400 }
        );
      }

      const data = JSON.parse(record.value);
      if (data.verified) {
        results.emailVerified = true;
      } else if (data.otp !== emailOtp) {
        return NextResponse.json(
          { success: false, error: 'Kode OTP email salah' },
          { status: 400 }
        );
      } else if (now > new Date(data.expiresAt)) {
        return NextResponse.json(
          { success: false, error: 'Kode OTP email sudah kedaluwarsa. Silakan kirim ulang.' },
          { status: 400 }
        );
      } else {
        // Mark as verified
        await db.systemSettings.update({
          where: { key },
          data: { value: JSON.stringify({ ...data, verified: true }) },
        });
        results.emailVerified = true;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...results,
        message: 'Kode OTP berhasil diverifikasi.',
      },
    });
  } catch (error) {
    console.error('Pre-register OTP verify error:', error);
    return NextResponse.json(
      { success: false, error: 'Database belum tersedia. Silakan hubungi admin.' },
      { status: 503 }
    );
  }
}
