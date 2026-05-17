import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateOtp } from '@/lib/email';
import { notifyBot } from '@/lib/bot-notification';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { whatsapp } = body;

    if (!whatsapp || typeof whatsapp !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Nomor WhatsApp wajib diisi' },
        { status: 400 }
      );
    }

    const cleanWhatsapp = whatsapp.replace(/[^0-9]/g, '');

    // Find user by whatsapp
    const user = await db.user.findUnique({ where: { whatsapp: cleanWhatsapp } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Akun tidak ditemukan' },
        { status: 404 }
      );
    }

    // If already fully verified and no WhatsApp OTP pending
    if (user.isVerified && !user.otpCode) {
      return NextResponse.json(
        { success: false, error: 'WhatsApp sudah terverifikasi' },
        { status: 400 }
      );
    }

    // Generate new 6-digit OTP
    const whatsappOtp = generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 5 minutes from now

    // Store OTP on user record
    await db.user.update({
      where: { id: user.id },
      data: { otpCode: whatsappOtp, otpExpiry },
    });

    // Notify bot to send WhatsApp OTP
    await notifyBot('otp_requested', {
      whatsapp: cleanWhatsapp,
      otp: whatsappOtp,
      userName: user.name || user.userId,
    });

    return NextResponse.json({
      success: true,
      data: {
        whatsapp: cleanWhatsapp,
        message: 'OTP WhatsApp baru telah dibuat. Kode akan dikirim melalui WhatsApp bot.',
      },
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    return NextResponse.json(
      { success: false, error: 'Database belum tersedia. Silakan hubungi admin.' },
      { status: 503 }
    );
  }
}
