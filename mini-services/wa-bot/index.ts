/**
 * NEXVO WhatsApp Bot Service - v7.0.0
 * 
 * Dual connection: Pairing Code + QR Scan Code
 * - Pairing Code: Enter bot phone number -> get code -> enter in WhatsApp Linked Devices
 * - QR Scan: Generate QR -> scan with WhatsApp Linked Devices
 * 
 * Auto-reply commands in English
 */

import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  type WASocket,
  type ConnectionState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import P from 'pino';
import QRCode from 'qrcode';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 3040;
const DB_PATH = '/home/nexvo/prisma/custom.db';
const SESSION_DIR = join(__dirname, 'sessions');
const BOT_STATE_FILE = join(SESSION_DIR, 'bot-state.json');

process.on('uncaughtException', (err) => { console.error('[Bot] Uncaught:', err.message); });
process.on('unhandledRejection', (reason) => { console.error('[Bot] Unhandled:', reason); });

const logger = P({ level: 'silent' });

let sock: WASocket | null = null;
let connectionState: ConnectionState = { connection: 'close' };
let currentPairingCode: string | null = null;
let qrCode: string | null = null;
let qrCodeImage: string | null = null;
let botPhoneNumber: string | null = null;
let botConnected = false;
let isConnecting = false;
let reconnectAttempts = 0;
let pairingCodeRequested = false;
let pairingCodeExpiry: number = 0;
let connectionMode: 'pairing' | 'qr' = 'qr';
let shouldReconnect = false;
const MAX_RECONNECT = 5;

interface BotConfig {
  welcomeMessage: string;
  menuHeader: string;
  menuFooter: string;
  autoReply: boolean;
  onlyRegistered: boolean;
}

const defaultConfig: BotConfig = {
  welcomeMessage: '👋 Hello! I\'m *Nexvo Bot* — your digital assistant.\n\nType *menu* to see available features.',
  menuHeader: '📋 *NEXVO BOT MENU*',
  menuFooter: '💡 Type a number or command to use a feature.\n📱 Example: *balance*, *products*, *1*',
  autoReply: true,
  onlyRegistered: true,
};

let botConfig: BotConfig = { ...defaultConfig };

function loadBotConfig() {
  try {
    if (existsSync(BOT_STATE_FILE)) {
      const data = JSON.parse(readFileSync(BOT_STATE_FILE, 'utf-8'));
      botConfig = { ...defaultConfig, ...(data.config || {}) };
      botPhoneNumber = data.phoneNumber || null;
    }
  } catch (e) { console.error('[Bot] Error loading config:', e); }
}

function saveBotConfig() {
  try {
    mkdirSync(SESSION_DIR, { recursive: true });
    writeFileSync(BOT_STATE_FILE, JSON.stringify({
      config: botConfig,
      phoneNumber: botPhoneNumber,
    }, null, 2));
  } catch (e) { console.error('[Bot] Error saving config:', e); }
}

function clearSession() {
  try {
    if (existsSync(SESSION_DIR)) {
      const files = readdirSync(SESSION_DIR);
      for (const file of files) {
        if (file !== 'bot-state.json') {
          rmSync(join(SESSION_DIR, file), { recursive: true, force: true });
        }
      }
      console.log('[Bot] Session files cleared');
    }
  } catch (e) { console.error('[Bot] Error clearing session:', e); }
}

function hasValidSession(): boolean {
  return existsSync(join(SESSION_DIR, 'creds.json'));
}

function queryDb(sql: string): any[] {
  try {
    const result = execSync(`sqlite3 -json "${DB_PATH}" "${sql}"`, { encoding: 'utf-8', timeout: 5000 });
    return result.trim() ? JSON.parse(result) : [];
  } catch (e: any) {
    console.error('[DB] Query error:', e.message?.substring(0, 100));
    return [];
  }
}

function findUserByPhone(phone: string): any | null {
  let n = phone.replace(/[^0-9]/g, '');
  if (n.startsWith('0')) n = '62' + n.substring(1);
  if (n.startsWith('+62')) n = '62' + n.substring(3);
  if (!n.startsWith('62')) n = '62' + n;
  const users = queryDb(`SELECT id, userId, name, whatsapp, mainBalance, depositBalance, totalProfit, referralCode, isVerified, isSuspended FROM User WHERE whatsapp LIKE '%${n.slice(-10)}%'`);
  return users.length > 0 ? users[0] : null;
}

function formatRupiah(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}

function getAdminNumber(): string {
  const setting = queryDb("SELECT value FROM SystemSettings WHERE key = 'bot_admin_number'");
  return setting.length > 0 ? setting[0].value : '6281234567890';
}

function getDepositAdminNumber(): string {
  const setting = queryDb("SELECT value FROM SystemSettings WHERE key = 'deposit_admin_number'");
  return setting.length > 0 ? setting[0].value : getAdminNumber();
}

function getCSNumbers(): Array<{name: string; phone: string}> {
  const admins = queryDb("SELECT name, phone FROM WhatsAppAdmin WHERE isActive = 1 ORDER BY `order` ASC");
  return admins.length > 0 ? admins : [{ name: 'CS NEXVO', phone: getAdminNumber() }];
}

// ═══════════════════════════════════════════════════════════
//  BOT COMMANDS
// ═══════════════════════════════════════════════════════════

const COMMANDS: Record<string, { name: string; description: string; aliases: string[] }> = {
  menu: { name: '📋 Menu', description: 'Show main menu', aliases: ['menu', 'm', '0'] },
  balance: { name: '💰 Check Balance', description: 'Check your account balance', aliases: ['balance', 'saldo', '1'] },
  products: { name: '📦 Products', description: 'View investment products', aliases: ['products', 'produk', '2'] },
  assets: { name: '📊 My Assets', description: 'View active investments', aliases: ['assets', 'aset', '3'] },
  deposit: { name: '💸 Deposit', description: 'How to add deposit', aliases: ['deposit', 'dep', 'topup', '4'] },
  withdraw: { name: '🏦 Withdraw', description: 'How to withdraw', aliases: ['withdraw', 'wd', '5'] },
  referral: { name: '🔗 Referral', description: 'View referral code & link', aliases: ['referral', 'ref', '6'] },
  bonus: { name: '🎁 My Bonuses', description: 'View bonus history', aliases: ['bonus', '7'] },
  help: { name: '❓ Help', description: 'Contact customer service', aliases: ['help', 'bantuan', 'cs', '8'] },
};

function getMenuText(): string {
  let text = botConfig.menuHeader + '\n\n';
  Object.entries(COMMANDS).forEach(([key, cmd], idx) => {
    if (key === 'menu') return;
    text += `${cmd.name.split(' ')[0]} *${idx}.* ${cmd.name.substring(cmd.name.indexOf(' ') + 1)}\n   _${cmd.description}_\n\n`;
  });
  text += '\n' + botConfig.menuFooter;
  return text;
}

function handleCommand(command: string, phone: string): string {
  const c = command.toLowerCase().trim();
  let matchedCmd = '';
  for (const [key, cmd] of Object.entries(COMMANDS)) {
    if (cmd.aliases.includes(c)) { matchedCmd = key; break; }
  }
  if (!matchedCmd) {
    if (['hi', 'halo', 'hai', 'hello', 'hey', 'hola'].includes(c)) return botConfig.welcomeMessage;
    return `🤖 Command not recognized.\n\nType *menu* to see available features.`;
  }
  if (matchedCmd === 'menu') return getMenuText();
  const user = findUserByPhone(phone);
  if (!user && matchedCmd !== 'help' && matchedCmd !== 'products' && matchedCmd !== 'deposit') {
    return `❌ Your WhatsApp number is not registered on Nexvo.\n\n📱 Register at: https://nexvo.id\n💬 Or contact CS for help.`;
  }
  if (user?.isSuspended) return `⚠️ Your account has been suspended. Contact CS for more info.`;

  switch (matchedCmd) {
    case 'balance': {
      const total = (user.mainBalance || 0) + (user.depositBalance || 0);
      return `💰 *ACCOUNT BALANCE*\n\n👤 Name: ${user.name || user.userId}\n🆔 ID: ${user.userId}\n\n💵 Main Balance: ${formatRupiah(user.mainBalance || 0)}\n🏦 Deposit Balance: ${formatRupiah(user.depositBalance || 0)}\n📊 Total Balance: *${formatRupiah(total)}*\n\n📈 Total Profit: ${formatRupiah(user.totalProfit || 0)}`;
    }
    case 'products': {
      const products = queryDb(`SELECT name, price, profitRate, duration, quota, quotaUsed FROM Product WHERE isActive = 1 AND isStopped = 0 ORDER BY price ASC`);
      if (!products.length) return `📦 *INVESTMENT PRODUCTS*\n\nSorry, no products available at the moment.`;
      let text = `📦 *INVESTMENT PRODUCTS*\n\n`;
      products.forEach((p: any, i: number) => {
        const pct = p.quota > 0 ? Math.round(p.quotaUsed / p.quota * 100) : 0;
        text += `*${i + 1}. ${p.name}*\n💰 Price: ${formatRupiah(p.price)}\n📈 Profit: ${p.profitRate}%/day\n⏰ Duration: ${p.duration} days\n📊 Quota: ${pct}% filled\n\n`;
      });
      text += `💡 Buy products at: https://nexvo.id`;
      return text;
    }
    case 'assets': {
      const invs = queryDb(`SELECT i.amount, i.dailyProfit, i.totalProfitEarned, p.name as pkgName FROM Investment i LEFT JOIN InvestmentPackage p ON i.packageId = p.id WHERE i.userId = '${user.id}' AND i.status = 'active' ORDER BY i.createdAt DESC`);
      if (!invs.length) return `📊 *MY ASSETS*\n\nYou don't have any active investments.\n\n💡 Buy products at: https://nexvo.id`;
      let text = `📊 *MY ASSETS*\n\n`;
      let totalDaily = 0;
      invs.forEach((inv: any, i: number) => {
        text += `*${i + 1}. ${inv.pkgName || 'Package'}*\n💰 Capital: ${formatRupiah(inv.amount)}\n📈 +${formatRupiah(inv.dailyProfit)}/day\n💵 Profit: ${formatRupiah(inv.totalProfitEarned)}\n\n`;
        totalDaily += inv.dailyProfit || 0;
      });
      text += `💵 *Total Daily Profit: ${formatRupiah(totalDaily)}*`;
      return text;
    }
    case 'deposit': {
      const csList = getCSNumbers();
      let text = `💸 *DEPOSIT*\n\n`;
      if (user) text += `💵 Deposit Balance: ${formatRupiah(user.depositBalance || 0)}\n🆔 Your ID: *${user.userId}*\n\n`;
      text += `📌 *How to Deposit:*\n1. Open Nexvo app\n2. Go to Wallet → Deposit\n3. Enter amount & select payment\n4. Upload payment proof\n5. Wait for admin confirmation\n\n`;
      text += `⚠️ *Important:* Include your Deposit ID *${user?.userId || 'NXV-XXXXX'}* in the payment notes.\n\n`;
      text += `🔗 Deposit at: https://nexvo.id`;
      if (csList.length > 0) {
        text += `\n\n💬 Need help? Contact:`;
        csList.forEach(cs => { text += `\n👤 ${cs.name}: wa.me/${cs.phone}`; });
      }
      return text;
    }
    case 'withdraw': {
      return `🏦 *WITHDRAW*\n\n💵 Available Balance: ${formatRupiah(user.mainBalance || 0)}\n\n📌 *How to Withdraw:*\n1. Open Nexvo app\n2. Go to Wallet → Withdraw\n3. Enter amount & bank details\n4. Wait for admin approval\n\n⏰ WD Hours: 09:00-16:00 WIB (Mon-Fri)\n🔗 Withdraw at: https://nexvo.id`;
    }
    case 'referral': {
      const code = user.referralCode || '-';
      const link = `https://nexvo.id?ref=${code}`;
      const refCount = queryDb(`SELECT COUNT(*) as cnt FROM Referral WHERE referrerId = '${user.id}' AND level = 1`)[0]?.cnt || 0;
      return `🔗 *REFERRAL*\n\n🏷️ Code: *${code}*\n🔗 Link: ${link}\n👥 Downlines: ${refCount} people\n\n📊 Referral Bonus Rates:\nL1: 10% | L2: 5% | L3: 4%\nL4: 3% | L5: 2%\n\n📊 M.Profit Rates:\nL1: 5% | L2: 4% | L3: 3%\nL4: 2% | L5: 1%\n\n💡 Share your link to earn bonuses!`;
    }
    case 'bonus': {
      const bonuses = queryDb(`SELECT type, SUM(amount) as total, COUNT(*) as cnt FROM BonusLog WHERE userId = '${user.id}' GROUP BY type`);
      if (!bonuses.length) return `🎁 *MY BONUSES*\n\nNo bonuses received yet.`;
      let text = `🎁 *MY BONUSES*\n\n`;
      const labels: Record<string, string> = { referral: '🤝 Referral', matching: '🔄 M.Profit', profit: '💰 Profit', salary: '🏆 Salary' };
      let grand = 0;
      bonuses.forEach((b: any) => { text += `${labels[b.type] || b.type}: ${formatRupiah(b.total)} (${b.cnt}x)\n`; grand += b.total || 0; });
      text += `\n💵 *Total: ${formatRupiah(grand)}*`;
      return text;
    }
    case 'help': {
      const csList = getCSNumbers();
      let text = `❓ *HELP & SUPPORT*\n\nContact us:\n\n`;
      csList.forEach(cs => { text += `👤 ${cs.name}\n📱 wa.me/${cs.phone}\n\n`; });
      text += `🌐 Website: https://nexvo.id\n📧 Email: adminnexvo@nexvo.id`;
      return text;
    }
    default: return getMenuText();
  }
}

// ═══════════════════════════════════════════════════════════
//  QR CODE IMAGE GENERATOR
// ═══════════════════════════════════════════════════════════

async function generateQRImage(data: string): Promise<string> {
  try {
    const base64 = await QRCode.toDataURL(data, {
      width: 512,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    });
    return base64;
  } catch (e) {
    console.error('[Bot] QR generation error:', e);
    return '';
  }
}

// ═══════════════════════════════════════════════════════════
//  WHATSAPP CONNECTION
// ═══════════════════════════════════════════════════════════

async function connectToWhatsApp(phoneNumber?: string, mode: 'pairing' | 'qr' = 'qr') {
  if (isConnecting) {
    console.log('[Bot] Already connecting, skipping...');
    return;
  }
  isConnecting = true;
  reconnectAttempts = 0;
  connectionMode = mode;
  shouldReconnect = true;

  try {
    const { version } = await fetchLatestBaileysVersion();
    console.log(`[Bot] WA web version: ${version.join('.')}`);

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    // Reset per-connection state
    currentPairingCode = null;
    qrCode = null;
    qrCodeImage = null;
    pairingCodeRequested = false;

    sock = makeWASocket({
      version,
      logger,
      auth: state,
      browser: Browsers.ubuntu('Desktop'),
      printQRInTerminal: false,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      connectTimeoutMs: 120_000,  // 2 minutes - give more time for user to scan/enter code
      keepAliveIntervalMs: 25_000,
      defaultQueryTimeoutMs: 60_000,
      retryRequestDelayMs: 2000,
      qrTimeout: 120_000,  // QR code valid for 2 minutes
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      connectionState = update;

      if (qr) {
        qrCode = qr;
        qrCodeImage = await generateQRImage(qr);
        console.log('[Bot] QR Code generated - ready for scan');

        // In pairing mode: request pairing code ONCE after first QR appears
        if (mode === 'pairing' && phoneNumber && !pairingCodeRequested) {
          pairingCodeRequested = true;
          try {
            console.log(`[Bot] Requesting pairing code for ${phoneNumber}...`);
            const code = await sock!.requestPairingCode(phoneNumber);
            if (code) {
              currentPairingCode = code;
              pairingCodeExpiry = Date.now() + (5 * 60 * 1000);
              botPhoneNumber = phoneNumber;
              saveBotConfig();
              console.log(`[Bot] Pairing code from WhatsApp: ${code}`);
              console.log(`[Bot] >>> ENTER THIS CODE IN WHATSAPP: Settings > Linked Devices > Link with phone number <<<`);
            } else {
              console.error('[Bot] Pairing code returned null');
              pairingCodeRequested = false;
            }
          } catch (e: any) {
            console.error('[Bot] Pairing code error:', e.message?.substring(0, 200));
            pairingCodeRequested = false;
          }
        }
      }

      if (connection === 'close') {
        botConnected = false;
        isConnecting = false;
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        console.log(`[Bot] Connection closed. Code: ${statusCode}`);

        // 401/403/loggedOut = session truly invalid, must start fresh
        if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
          console.log('[Bot] Session invalid/expired. Clearing session...');
          clearSession();
          currentPairingCode = null;
          qrCode = null;
          qrCodeImage = null;
          pairingCodeRequested = false;
          // Don't auto-reconnect - user must manually reconnect
          return;
        }

        // 408 = timeout (user didn't scan/enter code in time)
        // 428 = connection replaced
        // 440 = stale session
        // 515 = restart required
        // For these, try to reconnect
        if (shouldReconnect && reconnectAttempts < MAX_RECONNECT) {
          reconnectAttempts++;
          const delay = statusCode === 408 ? 5000 : (statusCode === 515 ? 3000 : 5000);
          console.log(`[Bot] Reconnecting in ${delay/1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT})...`);
          
          // For 408, clear the invalid session and start fresh
          if (statusCode === 408) {
            console.log('[Bot] Connection timed out - starting fresh...');
            clearSession();
            currentPairingCode = null;
            qrCode = null;
            qrCodeImage = null;
            pairingCodeRequested = false;
          }
          
          setTimeout(() => {
            if (shouldReconnect) {
              connectToWhatsApp(phoneNumber || botPhoneNumber || undefined, connectionMode);
            }
          }, delay);
        } else {
          console.log('[Bot] Max reconnect attempts reached or stopped. Use /api/connect to retry.');
        }
      }

      if (connection === 'open') {
        botConnected = true;
        qrCode = null;
        qrCodeImage = null;
        currentPairingCode = null;
        pairingCodeRequested = false;
        isConnecting = false;
        reconnectAttempts = 0;
        console.log('[Bot] ✅ CONNECTED to WhatsApp!');
        saveBotConfig();

        try {
          const meId = sock?.user?.id;
          if (meId) {
            const num = meId.split('@')[0];
            botPhoneNumber = num;
            saveBotConfig();
            console.log(`[Bot] Bot number: ${num}`);
          }
        } catch {}
      }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;
        const from = msg.key.remoteJid || '';
        const phone = from.replace('@s.whatsapp.net', '');
        const text = msg.message?.conversation ||
                     msg.message?.extendedTextMessage?.text ||
                     msg.message?.imageMessage?.caption || '';
        if (!text) continue;
        console.log(`[Bot] Message from ${phone}: ${text.substring(0, 50)}`);
        if (botConfig.autoReply && text.trim()) {
          const reply = handleCommand(text, phone);
          try { await sock!.sendMessage(from, { text: reply }, { quoted: msg }); } catch (e) { console.error('[Bot] Reply error:', e); }
        }
      }
    });

  } catch (e) {
    console.error('[Bot] Connection error:', e);
    isConnecting = false;
    pairingCodeRequested = false;
  }
}

// ═══════════════════════════════════════════════════════════
//  HTTP API
// ═══════════════════════════════════════════════════════════

function parseBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c: any) => d += c);
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
  const json = (data: any, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', ...cors }); res.end(JSON.stringify(data)); };
  const img = (data: string, status = 200) => { res.writeHead(status, { 'Content-Type': 'image/png', ...cors }); res.end(Buffer.from(data.split(',')[1], 'base64')); };

  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

  // ── Status ──
  if (url.pathname === '/') {
    json({
      service: 'NEXVO WhatsApp Bot',
      version: '7.0.0',
      status: botConnected ? 'connected' : (currentPairingCode ? 'pairing' : (qrCode ? 'qr_ready' : (isConnecting ? 'connecting' : 'disconnected'))),
      phoneNumber: botPhoneNumber,
      pairingCode: currentPairingCode,
      pairingCodeExpiry: pairingCodeExpiry ? new Date(pairingCodeExpiry).toISOString() : null,
      hasQR: !!qrCode,
      hasQRImage: !!qrCodeImage,
      connectionMode,
      autoReply: botConfig.autoReply,
    });
    return;
  }

  // ── Connect ──
  if (url.pathname === '/api/connect' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const phone = body.phoneNumber?.replace(/[^0-9]/g, '');
      const mode: 'pairing' | 'qr' = body.mode === 'qr' ? 'qr' : 'pairing';

      if (mode === 'pairing' && !phone) {
        json({ success: false, error: 'Phone number is required for pairing code mode' }, 400);
        return;
      }

      let fPhone = phone || '';
      if (fPhone.startsWith('0')) fPhone = '62' + fPhone.substring(1);
      if (fPhone && !fPhone.startsWith('62')) fPhone = '62' + fPhone;

      botPhoneNumber = fPhone || botPhoneNumber;

      console.log(`[Bot] Starting ${mode} connection for ${fPhone || 'QR scan'}...`);

      // Stop existing connection
      shouldReconnect = false;
      if (sock) {
        try { sock.end(undefined); } catch {}
        sock = null;
      }
      await new Promise(r => setTimeout(r, 1000));

      // Clear state
      botConnected = false;
      currentPairingCode = null;
      qrCode = null;
      qrCodeImage = null;
      isConnecting = false;
      pairingCodeRequested = false;
      reconnectAttempts = MAX_RECONNECT;

      // Always clear old session for a fresh connection attempt
      clearSession();
      await new Promise(r => setTimeout(r, 1500));

      // Start new connection
      await connectToWhatsApp(fPhone || undefined, mode);

      // Wait for result
      if (mode === 'pairing') {
        console.log('[Bot] Waiting for pairing code from WhatsApp...');
        for (let i = 0; i < 60; i++) {
          await new Promise(r => setTimeout(r, 1000));
          if (currentPairingCode) {
            console.log('[Bot] Pairing code received:', currentPairingCode);
            break;
          }
          if (botConnected) {
            console.log('[Bot] Bot connected via pairing code!');
            break;
          }
        }
      } else {
        console.log('[Bot] Waiting for QR code...');
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          if (qrCode) {
            console.log('[Bot] QR Code ready for scanning');
            break;
          }
          if (botConnected) {
            console.log('[Bot] Bot connected via QR scan!');
            break;
          }
        }
      }

      // Save admin number to DB
      if (fPhone) {
        try {
          const nowMs = Date.now();
          execSync(`sqlite3 "${DB_PATH}" "INSERT OR REPLACE INTO SystemSettings (id, key, value, updatedAt) VALUES ('bot_admin_number_auto', 'bot_admin_number', '${fPhone}', ${nowMs})"`, { timeout: 3000 });
        } catch (e: any) {
          console.error('[Bot] DB save error:', e.message?.substring(0, 100));
        }
      }

      json({
        success: true,
        message: botConnected
          ? 'Bot connected successfully!'
          : currentPairingCode
            ? `Pairing code generated: ${currentPairingCode}. Open WhatsApp on your phone > Settings > Linked Devices > Link with phone number > Enter this code`
            : qrCode
              ? 'QR Code ready. Open WhatsApp > Settings > Linked Devices > Link a device > Scan the QR code'
              : 'Connecting... Check status endpoint for updates',
        phoneNumber: fPhone,
        pairingCode: currentPairingCode,
        hasQR: !!qrCode,
        hasQRImage: !!qrCodeImage,
        connected: botConnected,
        mode,
      });
    } catch (e: any) {
      json({ success: false, error: e.message }, 500);
    }
    return;
  }

  // ── Pairing Code ──
  if (url.pathname === '/api/pairing-code') {
    json({
      success: true,
      pairingCode: currentPairingCode,
      phoneNumber: botPhoneNumber,
      connected: botConnected,
      expired: pairingCodeExpiry ? Date.now() > pairingCodeExpiry : false,
    });
    return;
  }

  // ── QR String ──
  if (url.pathname === '/api/qr') {
    if (!qrCode) { json({ success: false, error: 'QR code not available. Start a connection first.' }, 404); return; }
    json({ success: true, qr: qrCode });
    return;
  }

  // ── QR Image (base64) ──
  if (url.pathname === '/api/qr-image') {
    if (!qrCodeImage) { json({ success: false, error: 'QR image not available. Start a QR connection first.' }, 404); return; }
    json({ success: true, image: qrCodeImage });
    return;
  }

  // ── QR PNG direct ──
  if (url.pathname === '/api/qr-png') {
    if (!qrCodeImage) {
      res.writeHead(404, { 'Content-Type': 'text/plain', ...cors });
      res.end('QR not available');
      return;
    }
    img(qrCodeImage);
    return;
  }

  // ── Disconnect ──
  if (url.pathname === '/api/disconnect' && req.method === 'POST') {
    shouldReconnect = false;
    if (sock) { try { sock.end(undefined); } catch {} sock = null; }
    botConnected = false;
    currentPairingCode = null;
    qrCode = null;
    qrCodeImage = null;
    isConnecting = false;
    pairingCodeRequested = false;
    reconnectAttempts = MAX_RECONNECT;
    clearSession();
    saveBotConfig();
    json({ success: true, message: 'Bot disconnected, session cleared' });
    return;
  }

  // ── Config ──
  if (url.pathname === '/api/config' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      if (body.autoReply !== undefined) botConfig.autoReply = body.autoReply;
      if (body.onlyRegistered !== undefined) botConfig.onlyRegistered = body.onlyRegistered;
      if (body.welcomeMessage) botConfig.welcomeMessage = body.welcomeMessage;
      if (body.menuHeader) botConfig.menuHeader = body.menuHeader;
      if (body.menuFooter) botConfig.menuFooter = body.menuFooter;
      saveBotConfig();
      json({ success: true, config: botConfig });
    } catch (e: any) { json({ success: false, error: e.message }, 500); }
    return;
  }

  if (url.pathname === '/api/config') {
    json({ success: true, config: botConfig });
    return;
  }

  // ── Send Message ──
  if (url.pathname === '/api/send' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      if (!body.phone || !body.message) { json({ success: false, error: 'Phone and message are required' }, 400); return; }
      if (!sock || !botConnected) { json({ success: false, error: 'Bot is not connected' }, 400); return; }
      let jid = body.phone.replace(/[^0-9]/g, '');
      if (!jid.includes('@')) jid += '@s.whatsapp.net';
      await sock.sendMessage(jid, { text: body.message });
      json({ success: true, message: 'Message sent' });
    } catch (e: any) { json({ success: false, error: e.message }, 500); }
    return;
  }

  json({ error: 'Not found' }, 404);
});

server.listen(PORT, () => {
  loadBotConfig();
  console.log(`[WA Bot] v7.0.0 running on port ${PORT}`);
  console.log(`[WA Bot] Connection modes: Pairing Code + QR Scan`);
  console.log(`[WA Bot] Auto-reply: ${botConfig.autoReply}`);

  // Try to reconnect with saved session
  if (hasValidSession()) {
    console.log('[WA Bot] Found saved session, reconnecting...');
    connectToWhatsApp(botPhoneNumber || undefined, connectionMode).catch(console.error);
  } else {
    console.log('[WA Bot] No saved session. Use /api/connect to start.');
  }
});
