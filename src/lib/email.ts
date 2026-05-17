/**
 * NEXVO Email utility.
 * Uses direct nodemailer SMTP for production (Hostinger-compatible).
 * Includes retry mechanism for reliability.
 *
 * SMTP config is read from environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS,
 *   SMTP_FROM_EMAIL, SMTP_FROM_NAME
 */

import nodemailer from 'nodemailer';

/* ------------------------------------------------------------------ */
/*  OTP generation                                                      */
/* ------------------------------------------------------------------ */

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/* ------------------------------------------------------------------ */
/*  Email HTML template                                                 */
/* ------------------------------------------------------------------ */

function buildOtpEmailHtml(otp: string, userName?: string, purpose?: 'registration' | 'forgot-password'): string {
  const purposeTitle = purpose === 'forgot-password' ? 'Password Reset' : 'Email Verification';
  const purposeText = purpose === 'forgot-password' ? 'reset your password' : 'verify your email address';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>NEXVO - ${purposeTitle}</title><style>body{margin:0;padding:0;background:#070B14;font-family:-apple-system,sans-serif;}.ew{width:100%;background:#070B14;padding:40px 16px;}.ec{max-width:520px;margin:0 auto;background:linear-gradient(145deg,#0D1321,#070B14);border-radius:24px;overflow:hidden;border:1px solid rgba(212,175,55,0.15);}.hdr{background:linear-gradient(135deg,#D4AF37,#F0D060,#D4AF37);padding:32px 24px;text-align:center;}.hdr h1{margin:0;color:#070B14;font-size:28px;font-weight:800;letter-spacing:4px;}.hdr p{margin:4px 0 0;color:rgba(7,11,20,0.7);font-size:13px;font-weight:500;letter-spacing:1px;text-transform:uppercase;}.bdy{padding:36px 28px;text-align:center;}.otpc{background:linear-gradient(135deg,rgba(212,175,55,0.12),rgba(212,175,55,0.04));border:2px dashed rgba(212,175,55,0.35);border-radius:16px;padding:20px 28px;display:inline-block;}.otp{font-size:42px;font-weight:800;color:#D4AF37;letter-spacing:12px;font-family:monospace;text-shadow:0 0 30px rgba(212,175,55,0.3);}.exp{color:#94a3b8;font-size:13px;margin:24px 0 0;}.exp strong{color:#D4AF37;}.ftr{padding:20px 28px;text-align:center;}.ftr p{color:#475569;font-size:11px;}</style></head><body><div class="ew"><div class="ec"><div class="hdr"><h1>NEXVO</h1><p>${purposeTitle}</p></div><div class="bdy"><p style="color:#e2e8f0;font-size:17px;">Hello${userName ? ` ${userName}` : ''}!</p><p style="color:#94a3b8;font-size:14px;">You requested to <strong style="color:#e2e8f0;">${purposeText}</strong> on your NEXVO account.</p><div class="otpc"><div class="otp">${otp}</div><p style="color:#64748b;font-size:11px;letter-spacing:2px;margin:12px 0 0;">VERIFICATION CODE</p></div><p class="exp">This code expires in <strong>10 minutes</strong>.</p></div><div class="ftr"><p>&copy; ${new Date().getFullYear()} NEXVO</p></div></div></div></body></html>`;
}

/* ------------------------------------------------------------------ */
/*  SMTP config helpers                                                 */
/* ------------------------------------------------------------------ */

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
}

function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST || '';
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  if (!host || !user || !pass) {
    console.error(`[EMAIL] ❌ SMTP not configured. HOST=${host ? '✓' : '✗'} USER=${user ? '✓' : '✗'} PASS=${pass ? '✓(' + pass.length + 'chars)' : '✗'}`);
    return null;
  }
  return {
    host,
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: process.env.SMTP_SECURE !== 'false', // default true
    user,
    pass,
    fromEmail: process.env.SMTP_FROM_EMAIL || user,
    fromName: process.env.SMTP_FROM_NAME || 'NEXVO',
  };
}

/* ------------------------------------------------------------------ */
/*  Direct nodemailer SMTP (primary method for production/Hostinger)    */
/* ------------------------------------------------------------------ */

const MAX_SMTP_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // 2 seconds between retries

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendViaDirectSmtp(
  config: SmtpConfig,
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  let lastError: string = '';

  for (let attempt = 1; attempt <= MAX_SMTP_RETRIES; attempt++) {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: !config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2',
      },
      connectionTimeout: 20000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });

    try {
      console.log(`[EMAIL] Attempt ${attempt}/${MAX_SMTP_RETRIES}: Sending to ${to} via ${config.host}:${config.port}`);

      const result = await transporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to,
        subject,
        html,
        headers: {
          'X-Mailer': 'NEXVO Mail System',
          'X-Priority': '1', // High priority for OTP emails
        },
      });

      await transporter.close();
      console.log(`[EMAIL] ✅ Sent via SMTP to ${to} (attempt ${attempt}, msgId: ${result.messageId})`);
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      lastError = msg;
      console.error(`[EMAIL] ❌ SMTP attempt ${attempt}/${MAX_SMTP_RETRIES} failed for ${to}: ${msg}`);
      try { await transporter.close(); } catch { /* ignore close errors */ }

      if (attempt < MAX_SMTP_RETRIES) {
        console.log(`[EMAIL] Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  console.error(`[EMAIL] ❌ All ${MAX_SMTP_RETRIES} SMTP attempts failed for ${to}. Last error: ${lastError}`);
  return false;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Send OTP email.
 * Uses direct SMTP with automatic retry (up to 3 attempts).
 */
export async function sendOtpEmail(
  toEmail: string,
  otp: string,
  userName?: string,
  purpose?: 'registration' | 'forgot-password',
): Promise<boolean> {
  const config = getSmtpConfig();

  if (!config) {
    console.error(`[EMAIL] ❌ Cannot send OTP to ${toEmail} - SMTP not configured`);
    return false;
  }

  const subject = purpose === 'forgot-password'
    ? 'Password Reset Code - NEXVO'
    : 'Email Verification Code - NEXVO';
  const html = buildOtpEmailHtml(otp, userName, purpose);

  console.log(`[EMAIL] 📧 Sending OTP email to ${toEmail} (purpose: ${purpose || 'registration'})`);

  // Direct SMTP with retry
  const sent = await sendViaDirectSmtp(config, toEmail, subject, html);

  if (sent) {
    console.log(`[EMAIL] ✅ OTP email delivered to ${toEmail}`);
  } else {
    console.error(`[EMAIL] ❌ OTP email FAILED to deliver to ${toEmail} after all retries`);
  }

  return sent;
}

/**
 * Send general email.
 * Uses direct SMTP with automatic retry (up to 3 attempts).
 */
export async function sendEmail(
  toEmail: string,
  subject: string,
  htmlBody: string,
): Promise<boolean> {
  const config = getSmtpConfig();

  if (!config) {
    console.error(`[EMAIL] ❌ Cannot send email to ${toEmail} - SMTP not configured`);
    return false;
  }

  // Direct SMTP with retry
  return sendViaDirectSmtp(config, toEmail, subject, htmlBody);
}

/**
 * Check if SMTP is configured.
 */
export function isSmtpConfigured(): boolean {
  return !!getSmtpConfig();
}

/**
 * Verify SMTP connection directly.
 */
export async function verifySmtpConnection(): Promise<{ success: boolean; error?: string }> {
  const config = getSmtpConfig();
  if (!config) return { success: false, error: 'SMTP not configured' };

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
    },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  try {
    await transporter.verify();
    await transporter.close();
    console.log(`[EMAIL] ✅ SMTP connection verified for ${config.user}@${config.host}`);
    return { success: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[EMAIL] ❌ SMTP connection failed: ${msg}`);
    try { await transporter.close(); } catch { /* ignore */ }
    return { success: false, error: msg };
  }
}
