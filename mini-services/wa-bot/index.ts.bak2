/**
 * NEXVO WhatsApp Bot Service
 * 
 * Features:
 * - Pairing code connection (enter phone number → get code → link)
 * - QR code connection fallback
 * - Auto-response with complete features
 * - Auto-clear session on 401/logout
 * 
 * Port: 3040
 * Runtime: Node.js (tsx)
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
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 3040;
const DB_PATH = '/home/nexvo/prisma/custom.db';
const SESSION_DIR = join(__dirname, 'sessions');
const BOT_STATE_FILE = join(SESSION_DIR, 'bot-state.json');

const logger = P({ level: 'silent' });

let sock: WASocket | null = null;
let connectionState: ConnectionState = { connection: 'close' };
let pairingCode: string | null = null;
let qrCode: string | null = null;
let botPhoneNumber: string | null = null;
let botConnected = false;
let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT = 3;

interface BotConfig {
  welcomeMessage: string;
  menuHeader: string;
  menuFooter: string;
  autoReply: boolean;
  onlyRegistered: boolean;
}

const defaultConfig: BotConfig = {
  welcomeMessage: '👋 Halo! Saya *Nexvo Bot* — asisten digital Anda.\n\nKetik *menu* untuk melihat daftar fitur yang tersedia.',
  menuHeader: '📋 *MENU NEXVO BOT*',
  menuFooter: '💡 Ketik nomor atau perintah untuk menggunakan fitur.\n📱 Contoh: *saldo*, *produk*, *1*',
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
    writeFileSync(BOT_STATE_FILE, JSON.stringify({ config: botConfig, phoneNumber: botPhoneNumber }, null, 2));
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
      console.log('[Bot] 🗑️ Session cleared');
    }
  } catch (e) { console.error('[Bot] Error clearing session:', e); }
}

function hasValidSession(): boolean {
  return existsSync(join(SESSION_DIR, 'creds.json'));
}

function queryDb(sql: string): any[] {
  try {
    const { execSync } = require('child_process');
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

// ──────────── Bot Commands ────────────
const COMMANDS: Record<string, { name: string; description: string; aliases: string[] }> = {
  menu: { name: '📋 Menu', description: 'Tampilkan menu utama', aliases: ['menu', 'm', '0'] },
  saldo: { name: '💰 Cek Saldo', description: 'Cek saldo & balance akun', aliases: ['saldo', 'balance', '1'] },
  produk: { name: '📦 Info Produk', description: 'Lihat daftar produk investasi', aliases: ['produk', 'product', '2'] },
  aset: { name: '📊 Aset Saya', description: 'Lihat aset investasi aktif', aliases: ['aset', 'assets', '3'] },
  deposit: { name: '💸 Deposit', description: 'Info cara deposit', aliases: ['deposit', 'dep', 'topup', '4'] },
  withdraw: { name: '🏦 Withdraw', description: 'Info cara withdraw', aliases: ['withdraw', 'wd', 'tarik', '5'] },
  referral: { name: '🔗 Referral', description: 'Lihat kode & link referral', aliases: ['referral', 'ref', 'invite', '6'] },
  bonus: { name: '🎁 Bonus Saya', description: 'Lihat riwayat bonus', aliases: ['bonus', '7'] },
  bantuan: { name: '❓ Bantuan', description: 'Hubungi customer service', aliases: ['bantuan', 'help', 'cs', '8'] },
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
    return `🤖 Perintah tidak dikenali.\n\nKetik *menu* untuk melihat daftar fitur.`;
  }
  if (matchedCmd === 'menu') return getMenuText();
  const user = findUserByPhone(phone);
  if (!user && matchedCmd !== 'bantuan' && matchedCmd !== 'produk' && matchedCmd !== 'deposit') {
    return `❌ Nomor WhatsApp Anda belum terdaftar di Nexvo.\n\n📱 Daftar di: https://nexvo.id\n💬 Atau hubungi CS untuk bantuan.`;
  }
  if (user?.isSuspended) return `⚠️ Akun Anda ditangguhkan. Hubungi CS untuk informasi lebih lanjut.`;

  switch (matchedCmd) {
    case 'saldo': {
      const total = (user.mainBalance || 0) + (user.depositBalance || 0);
      return `💰 *SALDO AKUN*\n\n👤 Nama: ${user.name || user.userId}\n🆔 ID: ${user.userId}\n\n💵 Saldo Utama: ${formatRupiah(user.mainBalance || 0)}\n🏦 Saldo Deposit: ${formatRupiah(user.depositBalance || 0)}\n📊 Total Saldo: *${formatRupiah(total)}*\n\n📈 Total Profit: ${formatRupiah(user.totalProfit || 0)}`;
    }
    case 'produk': {
      const products = queryDb(`SELECT name, price, profitRate, duration, quota, quotaUsed FROM Product WHERE isActive = 1 AND isStopped = 0 ORDER BY price ASC`);
      if (!products.length) return `📦 *PRODUK INVESTASI*\n\nMaaf, belum ada produk tersedia saat ini.`;
      let text = `📦 *PRODUK INVESTASI*\n\n`;
      products.forEach((p: any, i: number) => {
        text += `*${i + 1}. ${p.name}*\n💰 Harga: ${formatRupiah(p.price)}\n📈 Profit: ${p.profitRate}%/hari\n⏰ Durasi: ${p.duration} hari\n\n`;
      });
      text += `💡 Beli produk di: https://nexvo.id/#paket`;
      return text;
    }
    case 'aset': {
      const invs = queryDb(`SELECT i.amount, i.dailyProfit, i.totalProfitEarned, p.name as pkgName FROM Investment i LEFT JOIN InvestmentPackage p ON i.packageId = p.id WHERE i.userId = '${user.id}' AND i.status = 'active' ORDER BY i.createdAt DESC`);
      if (!invs.length) return `📊 *ASET SAYA*\n\nAnda belum memiliki aset aktif.\n\n💡 Beli produk di: https://nexvo.id/#paket`;
      let text = `📊 *ASET SAYA*\n\n`;
      invs.forEach((inv: any, i: number) => {
        text += `*${i + 1}. ${inv.pkgName || 'Paket'}*\n💰 Modal: ${formatRupiah(inv.amount)}\n📈 +${formatRupiah(inv.dailyProfit)}/hari\n💵 Profit: ${formatRupiah(inv.totalProfitEarned)}\n\n`;
      });
      return text;
    }
    case 'deposit': {
      let text = `💸 *DEPOSIT*\n\n`;
      if (user) text += `💵 Saldo Deposit: ${formatRupiah(user.depositBalance || 0)}\n\n`;
      text += `📌 *Cara Deposit:*\n1. Buka aplikasi Nexvo\n2. Pilih Wallet → Deposit\n3. Scan QRIS & bayar\n4. Tunggu konfirmasi admin\n\n🔗 Deposit di: https://nexvo.id/#wallet`;
      return text;
    }
    case 'withdraw': {
      let text = `🏦 *WITHDRAW*\n\n💵 Saldo tersedia: ${formatRupiah(user.mainBalance || 0)}\n\n📌 *Cara Withdraw:*\n1. Buka aplikasi Nexvo\n2. Pilih Wallet → Withdraw\n3. Masukkan jumlah & bank\n4. Tunggu persetujuan admin\n\n⏰ Jam WD: 09:00-16:00 WIB (Sen-Jum)\n🔗 Withdraw di: https://nexvo.id/#wallet`;
      return text;
    }
    case 'referral': {
      const code = user.referralCode || '-';
      const link = `https://nexvo.id?ref=${code}`;
      return `🔗 *REFERRAL*\n\n🏷️ Kode: *${code}*\n🔗 Link: ${link}\n\n📊 Rate Bonus:\nL1: 10% | L2: 5% | L3: 4%\nL4: 3% | L5: 2%\n\n💡 Bagikan link untuk mendapat bonus!`;
    }
    case 'bonus': {
      const bonuses = queryDb(`SELECT type, SUM(amount) as total, COUNT(*) as cnt FROM BonusLog WHERE userId = '${user.id}' GROUP BY type`);
      if (!bonuses.length) return `🎁 *BONUS SAYA*\n\nBelum ada bonus yang diterima.`;
      let text = `🎁 *BONUS SAYA*\n\n`;
      const labels: Record<string, string> = { referral: '🤝 Referral', matching: '🔄 M.Profit', profit: '💰 Profit', salary: '🏆 Gaji' };
      let grand = 0;
      bonuses.forEach((b: any) => { text += `${labels[b.type] || b.type}: ${formatRupiah(b.total)} (${b.cnt}x)\n`; grand += b.total || 0; });
      text += `\n💵 *Total: ${formatRupiah(grand)}*`;
      return text;
    }
    case 'bantuan': {
      const admins = queryDb(`SELECT name, phone FROM WhatsAppAdmin WHERE isActive = 1 ORDER BY \`order\` ASC`);
      let text = `❓ *BANTUAN*\n\nHubungi:\n\n`;
      if (admins.length) admins.forEach((a: any) => { text += `👤 ${a.name}\n📱 wa.me/${a.phone}\n\n`; });
      else text += `👤 CS NEXVO\n📱 wa.me/6281234567890\n\n`;
      text += `🌐 Website: https://nexvo.id`;
      return text;
    }
    default: return getMenuText();
  }
}

// ──────────── WhatsApp Connection ────────────
async function connectToWhatsApp(phoneNumber?: string) {
  if (isConnecting) {
    console.log('[Bot] Already connecting, skipping...');
    return;
  }
  isConnecting = true;
  reconnectAttempts = 0;

  try {
    const { version } = await fetchLatestBaileysVersion();
    console.log(`[Bot] WA web version: ${version.join('.')}`);

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const needsPairingCode = phoneNumber && !state.creds.registered;

    sock = makeWASocket({
      version,
      logger,
      auth: state,
      browser: Browsers.ubuntu('Desktop'),
      printQRInTerminal: false,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      connectTimeoutMs: 60_000,     // 60s timeout for initial connection
      keepAliveIntervalMs: 25_000,   // keep-alive ping
      defaultQueryTimeoutMs: 60_000, // 60s for queries
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      connectionState = update;

      if (qr) {
        qrCode = qr;
        console.log('[Bot] 📱 QR Code generated');

        // Request pairing code immediately when QR is available (WebSocket is connected)
        if (needsPairingCode && phoneNumber) {
          try {
            console.log(`[Bot] 🔗 Requesting pairing code for ${phoneNumber}...`);
            const code = await sock!.requestPairingCode(phoneNumber);
            pairingCode = code;
            botPhoneNumber = phoneNumber;
            saveBotConfig();
            console.log(`[Bot] ✅ Pairing code: ${code}`);
            console.log(`[Bot] 📱 Enter this code in WhatsApp: Settings > Linked Devices > Link with phone number`);
          } catch (e: any) {
            console.error('[Bot] ❌ Pairing code error:', e.message?.substring(0, 200));
          }
        }
      }

      if (connection === 'close') {
        botConnected = false;
        isConnecting = false;
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        console.log(`[Bot] ❌ Connection closed. Code: ${statusCode}`);
        
        // 401/403 = session invalid, need fresh start
        if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
          console.log('[Bot] 🗑️ Session invalid. Clearing...');
          clearSession();
          return; // Don't auto-reconnect, wait for manual trigger
        }

        // 408 = timeout (no one entered pairing code / scanned QR)
        // 428 = connection closed
        // 515 = restart required
        // For these, we can try to reconnect a few times
        if (reconnectAttempts < MAX_RECONNECT) {
          reconnectAttempts++;
          const delay = statusCode === 408 ? 10000 : 5000; // Longer delay for timeout
          console.log(`[Bot] 🔄 Reconnecting in ${delay/1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT})...`);
          setTimeout(() => connectToWhatsApp(phoneNumber || botPhoneNumber || undefined), delay);
        } else {
          console.log('[Bot] ❌ Max reconnect attempts reached. Use /api/connect to retry.');
        }
      }

      if (connection === 'open') {
        botConnected = true;
        qrCode = null;
        pairingCode = null; // Clear pairing code after successful connection
        isConnecting = false;
        reconnectAttempts = 0;
        console.log('[Bot] ✅ CONNECTED to WhatsApp!');
        
        try {
          const meId = sock?.user?.id;
          if (meId) {
            const num = meId.split('@')[0];
            botPhoneNumber = num;
            saveBotConfig();
            console.log(`[Bot] 📱 Bot number: ${num}`);
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
        console.log(`[Bot] 📩 ${phone}: ${text.substring(0, 50)}`);
        if (botConfig.autoReply && text.trim()) {
          const reply = handleCommand(text, phone);
          try { await sock!.sendMessage(from, { text: reply }, { quoted: msg }); } catch (e) { console.error('[Bot] Reply error:', e); }
        }
      }
    });

  } catch (e) {
    console.error('[Bot] Connection error:', e);
    isConnecting = false;
  }
}

// ──────────── HTTP API ────────────
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

  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

  // Status
  if (url.pathname === '/') {
    json({
      service: 'NEXVO WhatsApp Bot',
      status: botConnected ? 'connected' : 'disconnected',
      phoneNumber: botPhoneNumber,
      pairingCode,
      hasQR: !!qrCode,
      autoReply: botConfig.autoReply,
    });
    return;
  }

  // Connect
  if (url.pathname === '/api/connect' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const phone = body.phoneNumber?.replace(/[^0-9]/g, '');
      if (!phone) { json({ success: false, error: 'Nomor telepon wajib diisi' }, 400); return; }

      let fPhone = phone;
      if (fPhone.startsWith('0')) fPhone = '62' + fPhone.substring(1);
      if (!fPhone.startsWith('62')) fPhone = '62' + fPhone;

      botPhoneNumber = fPhone;
      saveBotConfig();

      // Clean up existing connection
      console.log('[Bot] 🔄 Fresh pairing code connection...');
      if (sock) { try { sock.end(undefined); } catch {} sock = null; }
      botConnected = false;
      pairingCode = null;
      qrCode = null;
      isConnecting = false;
      reconnectAttempts = MAX_RECONNECT; // Prevent auto-reconnect from old connection
      clearSession();

      await new Promise(r => setTimeout(r, 1500));

      // Start new connection
      await connectToWhatsApp(fPhone);

      // Wait for pairing code (up to 10 seconds)
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1000));
        if (pairingCode || botConnected) break;
      }

      json({
        success: true,
        message: botConnected ? 'Bot terkoneksi!' : 'Kode pairing siap. Masukkan kode di WhatsApp Anda.',
        phoneNumber: fPhone,
        pairingCode,
        connected: botConnected,
      });
    } catch (e: any) {
      json({ success: false, error: e.message }, 500);
    }
    return;
  }

  // Get pairing code
  if (url.pathname === '/api/pairing-code') {
    json({ success: true, pairingCode, phoneNumber: botPhoneNumber, connected: botConnected });
    return;
  }

  // Get QR code
  if (url.pathname === '/api/qr') {
    if (!qrCode) { json({ success: false, error: 'QR code belum tersedia' }, 404); return; }
    json({ success: true, qr: qrCode });
    return;
  }

  // Disconnect
  if (url.pathname === '/api/disconnect' && req.method === 'POST') {
    if (sock) { try { sock.end(undefined); } catch {} sock = null; }
    botConnected = false;
    pairingCode = null;
    qrCode = null;
    isConnecting = false;
    reconnectAttempts = MAX_RECONNECT;
    clearSession();
    json({ success: true, message: 'Bot disconnected, session cleared' });
    return;
  }

  // Update config
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

  // Get config
  if (url.pathname === '/api/config') {
    json({ success: true, config: botConfig });
    return;
  }

  // Send message
  if (url.pathname === '/api/send' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      if (!body.phone || !body.message) { json({ success: false, error: 'Phone dan message wajib diisi' }, 400); return; }
      if (!sock || !botConnected) { json({ success: false, error: 'Bot belum terkoneksi' }, 400); return; }
      let jid = body.phone.replace(/[^0-9]/g, '');
      if (!jid.includes('@')) jid += '@s.whatsapp.net';
      await sock.sendMessage(jid, { text: body.message });
      json({ success: true, message: 'Pesan terkirim' });
    } catch (e: any) { json({ success: false, error: e.message }, 500); }
    return;
  }

  json({ error: 'Not found' }, 404);
});

server.listen(PORT, () => {
  loadBotConfig();
  console.log(`[WA Bot] 🚀 Running on port ${PORT} (Node.js)`);
  console.log(`[WA Bot] Auto-reply: ${botConfig.autoReply}`);

  if (hasValidSession()) {
    console.log('[WA Bot] Found saved session, reconnecting...');
    connectToWhatsApp();
  } else {
    console.log('[WA Bot] No saved session. Use /api/connect with phone number to start pairing.');
  }
});

