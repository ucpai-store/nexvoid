import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateBotRequest } from '@/lib/bot-auth';
import { generateOtp } from '@/lib/email';

// GET - Retrieve pending OTP for a WhatsApp number (requires API key)
// Called by the external WhatsApp bot to get the OTP that needs to be sent
export async function GET(request: NextRequest) {
  try {
    // Authenticate (API Key or admin JWT from pairing code)
    const auth = await authenticateBotRequest(request);
    if (!auth.authenticated) return auth.error;

    const { searchParams } = new URL(request.url);
    const whatsapp = searchParams.get('whatsapp');

    if (!whatsapp) {
      return NextResponse.json(
        { success: false, error: 'whatsapp query parameter is required' },
        { status: 400 }
      );
    }

    const cleanWhatsapp = whatsapp.trim().replace(/[^0-9]/g, '');

    // Find user by whatsapp
    const user = await db.user.findUnique({ where: { whatsapp: cleanWhatsapp } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if there's a pending OTP
    if (!user.otpCode || !user.otpExpiry) {
      return NextResponse.json({
        success: true,
        data: {
          hasOtp: false,
          whatsapp: cleanWhatsapp,
          message: 'No pending OTP for this number',
        },
      });
    }

    // Check if OTP is still valid
    const now = new Date();
    if (now > user.otpExpiry) {
      return NextResponse.json({
        success: true,
        data: {
          hasOtp: false,
          whatsapp: cleanWhatsapp,
          message: 'OTP has expired',
        },
      });
    }

    // Return the OTP so the bot can send it via WhatsApp
    return NextResponse.json({
      success: true,
      data: {
        hasOtp: true,
        otp: user.otpCode,
        whatsapp: cleanWhatsapp,
        expiresAt: user.otpExpiry.toISOString(),
        userName: user.name || user.userId,
      },
    });
  } catch (error) {
    console.error('Get OTP error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Generate and store a new OTP (requires API key)
// Called by the external WhatsApp bot to create/store an OTP
export async function POST(request: NextRequest) {
  try {
    // Authenticate (API Key or admin JWT from pairing code)
    const auth = await authenticateBotRequest(request);
    if (!auth.authenticated) return auth.error;

    const body = await request.json();
    const { whatsapp, otp } = body;

    if (!whatsapp || typeof whatsapp !== 'string' || whatsapp.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'whatsapp number is required' },
        { status: 400 }
      );
    }

    const cleanWhatsapp = whatsapp.trim().replace(/[^0-9]/g, '');

    // Find user by whatsapp
    const user = await db.user.findUnique({ where: { whatsapp: cleanWhatsapp } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Use provided OTP or generate a new one
    const otpCode = otp && typeof otp === 'string' ? otp : generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 5 minutes from now

    // Store OTP on user record
    await db.user.update({
      where: { id: user.id },
      data: { otpCode, otpExpiry },
    });

    // Return OTP - the bot will send it to user's WhatsApp
    return NextResponse.json({
      success: true,
      data: {
        otp: otpCode,
        whatsapp: cleanWhatsapp,
        userName: user.name || user.userId,
      },
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
