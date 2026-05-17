import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest } from '@/lib/auth';
import { isSmtpConfigured, sendOtpEmail, generateOtp, verifySmtpConnection } from '@/lib/email';

/**
 * Admin API: Test SMTP configuration.
 * GET - Check SMTP config status and verify connection
 * POST - Send a test OTP email (body: { email: "test@email.com" })
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const configured = isSmtpConfigured();

    // If configured, also verify the connection
    let connectionTest: { success: boolean; error?: string } | null = null;
    if (configured) {
      connectionTest = await verifySmtpConnection();
    }

    return NextResponse.json({
      success: true,
      data: {
        configured,
        connectionTest: connectionTest
          ? { success: connectionTest.success, error: connectionTest.error || undefined }
          : undefined,
        message: !configured
          ? 'SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env'
          : connectionTest?.success
          ? 'SMTP is configured and connection is working. Use POST to send a test email.'
          : `SMTP is configured but connection failed: ${connectionTest?.error}`,
        host: process.env.SMTP_HOST || '(not set)',
        port: process.env.SMTP_PORT || '(not set)',
        secure: process.env.SMTP_SECURE || '(not set)',
        user: process.env.SMTP_USER || '(not set)',
        passConfigured: !!(process.env.SMTP_PASS),
        passLength: process.env.SMTP_PASS?.length || 0,
        fromEmail: process.env.SMTP_FROM_EMAIL || '(not set)',
      },
    });
  } catch (error) {
    console.error('Test SMTP error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!isSmtpConfigured()) {
      return NextResponse.json(
        { success: false, error: 'SMTP not configured. Check your .env file for SMTP_HOST, SMTP_USER, and SMTP_PASS.' },
        { status: 400 }
      );
    }

    // Generate a test OTP and send it
    const testOtp = generateOtp();
    const sent = await sendOtpEmail(email, testOtp, 'Test User');

    return NextResponse.json({
      success: sent,
      data: {
        sent,
        testOtp,
        email,
        message: sent
          ? `Test OTP (${testOtp}) sent to ${email}. Check your inbox (and spam folder).`
          : 'Failed to send test email. Check server logs for detailed error information.',
      },
    });
  } catch (error) {
    console.error('Test SMTP send error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
