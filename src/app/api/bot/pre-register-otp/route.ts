import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateBotRequest } from '@/lib/bot-auth';

/**
 * Bot API: Retrieve pre-registration OTP for a WhatsApp number or email.
 *
 * This endpoint is used by the external WhatsApp bot to fetch the OTP
 * that was generated for a user who hasn't registered yet. This is needed
 * because `/api/bot/send-otp` only works for existing users.
 *
 * GET /api/bot/pre-register-otp?whatsapp=62812xxxxx
 * GET /api/bot/pre-register-otp?email=user@email.com
 *
 * Headers:
 *   X-API-Key: nxv_live_xxxxxxxx
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate (API Key or admin JWT from pairing code)
    const auth = await authenticateBotRequest(request);
    if (!auth.authenticated) return auth.error;

    const { searchParams } = new URL(request.url);
    const whatsapp = searchParams.get('whatsapp');
    const email = searchParams.get('email');

    if (!whatsapp && !email) {
      return NextResponse.json(
        { success: false, error: 'whatsapp or email query parameter is required' },
        { status: 400 }
      );
    }

    const results: { whatsappOtp?: { otp: string; expiresAt: string; verified: boolean } | null; emailOtp?: { otp: string; expiresAt: string; verified: boolean } | null } = {};

    // ── Get WhatsApp OTP ──
    if (whatsapp) {
      const cleanWhatsapp = whatsapp.replace(/[^0-9]/g, '');
      const key = `pre_otp_wa_${cleanWhatsapp}`;
      const record = await db.systemSettings.findUnique({ where: { key } });

      if (record) {
        const data = JSON.parse(record.value);
        const isExpired = new Date() > new Date(data.expiresAt);
        results.whatsappOtp = isExpired ? null : { otp: data.otp, expiresAt: data.expiresAt, verified: data.verified };
      } else {
        results.whatsappOtp = null;
      }
    }

    // ── Get Email OTP ──
    if (email) {
      const key = `pre_otp_em_${email.toLowerCase()}`;
      const record = await db.systemSettings.findUnique({ where: { key } });

      if (record) {
        const data = JSON.parse(record.value);
        const isExpired = new Date() > new Date(data.expiresAt);
        results.emailOtp = isExpired ? null : { otp: data.otp, expiresAt: data.expiresAt, verified: data.verified };
      } else {
        results.emailOtp = null;
      }
    }

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Get pre-register OTP error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
