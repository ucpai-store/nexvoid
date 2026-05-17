/**
 * NEXVO WhatsApp Bot Service
 * 
 * Features:
 * - Pairing code connection (enter phone number → get code → link)
 * - QR code connection fallback
 * - Auto-response with complete features
 * - Balance check, product info, deposit/WD status, referral, help
 * 
 * Port: 3040
 */

import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  type WASocket,
  type ConnectionState,
  type WAMessage,
  proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import P from 'pino';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const PORT = 3040;
const DB_PATH = '/home/nexvo/prisma/custom.db';
const SESSION_DIR = join(import.meta.dir || __dirname || '.', 'sessions');
const BOT_STATE_FILE = join(SESSION_DIR, 'bot-state.json');

// ──────────── Logger ────────────
const logger = P({ level: 'silent' }); // Silent baileys internal logs

// ──────────── State ────────────
let sock: WASocket | null = null;
let connectionState: ConnectionState = { connection: 'close' };
let pairingCode: string | null = null;
let qrCode: string | null = null;
let botPhoneNumber: string | null = null;
let botConnected = false;

// ──────────── Bot Config ────────────
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
  } catch (e) {
    console.error('[Bot] Error loading config:', e);
  }
}

function saveBotConfig() {
  try {
    mkdirSync(SESSION_DIR, { recursive: true });
    writeFileSync(BOT_STATE_FILE, JSON.stringify({
      config: botConfig,
      phoneNumber: botPhoneNumber,
    }, null, 2));
  } catch (e) {
    console.error('[Bot] Error saving config:', e);
  }
}

// ──────────── SQLite Helper ────────────
function queryDb(sql: string, params: any[] = []): any[] {
  try {
    const { execSync } = require('child_process');
    const placeholders = params.map((p, i) => `--param${i}`).join(' ');
    const paramValues = params.map(p => {
      if (typeof p === 'string') return p.replace(/'/g, "''");
      return p;
    });
    
    let finalSql = sql;
    params.forEach((p, i) => {
      finalSql = finalSql.replace('?', typeof p === 'string' ? `'${p}'` : String(p));
    });
    
    const result = execSync(`sqlite3 -json "${DB_PATH}" "${finalSql}"`, { encoding: 'utf-8', timeout: 5000 });
    return result.trim() ? JSON.parse(result) : [];
  } catch (e: any) {
    console.error('[DB] Query error:', e.message?.substring(0, 100));
    return [];
  }
}

// ──────────── User Lookup ────────────
function findUserByPhone(phone: string): any | null {
  // Normalize phone number
  let normalized = phone.replace(/[^0-9]/g, '');
  if (normalized.startsWith('0')) normalized = '62' + normalized.substring(1);
  if (normalized.startsWith('+62')) normalized = '62' + normalized.substring(3);
  if (!normalized.startsWith('62')) normalized = '62' + normalized;
  
  const users = queryDb(`SELECT id, userId, name, whatsapp, mainBalance, depositBalance, totalProfit, referralCode, isVerified, isSuspended FROM User WHERE whatsapp LIKE '%${normalized.slice(-10)}%' OR whatsapp LIKE '%${normalized}%'`);
  return users.length > 0 ? users[0] : null;
}

function findUserByNxvId(nxvId: string): any | null {
  const users = queryDb(`SELECT id, userId, name, whatsapp, mainBalance, depositBalance, totalProfit, referralCode, isVerified, isSuspended FROM User WHERE userId = ?`, [nxvId]);
  return users.length > 0 ? users[0] : null;
}

// ──────────── Format Helpers ────────────
function formatRupiah(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const ts = parseInt(dateStr);
    if (!isNaN(ts) && ts > 1000000000000) {
      const d = new Date(ts);
      return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }
    return new Date(dateStr).toLocaleDateString('id-ID');
  } catch {
    return dateStr;
  }
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
  const normalizedCmd = command.toLowerCase().trim();
  
  // Find matching command
  let matchedCmd = '';
  for (const [key, cmd] of Object.entries(COMMANDS)) {
    if (cmd.aliases.includes(normalizedCmd)) {
      matchedCmd = key;
      break;
    }
  }

  // If command not recognized, show menu
  if (!matchedCmd) {
    if (['hi', 'halo', 'hai', 'hello', 'hey', 'hola'].includes(normalizedCmd)) {
      return botConfig.welcomeMessage;
    }
    return `🤖 Perintah tidak dikenali.\n\nKetik *menu* untuk melihat daftar fitur.`;
  }

  // Menu
  if (matchedCmd === 'menu') {
    return getMenuText();
  }

  // Find user for commands that need auth
  const user = findUserByPhone(phone);
  
  if (!user && matchedCmd !== 'bantuan' && matchedCmd !== 'produk' && matchedCmd !== 'deposit') {
    return `❌ Nomor WhatsApp Anda belum terdaftar di Nexvo.\n\n📱 Daftar di: https://nexvo.id\n💬 Atau hubungi CS untuk bantuan.`;
  }

  if (user?.isSuspended) {
    return `⚠️ Akun Anda ditangguhkan. Hubungi CS untuk informasi lebih lanjut.`;
  }

  switch (matchedCmd) {
    case 'saldo':
      return getSaldoText(user);
    case 'produk':
      return getProdukText();
    case 'aset':
      return getAsetText(user);
    case 'deposit':
      return getDepositText(user);
    case 'withdraw':
      return getWithdrawText(user);
    case 'referral':
      return getReferralText(user);
    case 'bonus':
      return getBonusText(user);
    case 'bantuan':
      return getBantuanText();
    default:
      return getMenuText();
  }
}

function getSaldoText(user: any): string {
  const totalBalance = (user.mainBalance || 0) + (user.depositBalance || 0);
  return `💰 *SALDO AKUN*\n\n` +
    `👤 Nama: ${user.name || user.userId}\n` +
    `🆔 ID: ${user.userId}\n\n` +
    `💵 Saldo Utama: ${formatRupiah(user.mainBalance || 0)}\n` +
    `🏦 Saldo Deposit: ${formatRupiah(user.depositBalance || 0)}\n` +
    `📊 Total Saldo: *${formatRupiah(totalBalance)}*\n\n` +
    `📈 Total Profit: ${formatRupiah(user.totalProfit || 0)}`;
}

function getProdukText(): string {
  const products = queryDb(`SELECT name, price, profitRate, duration, quota, quotaUsed FROM Product WHERE isActive = 1 AND isStopped = 0 ORDER BY price ASC`);
  
  if (products.length === 0) {
    return `📦 *PRODUK INVESTASI*\n\nMaaf, belum ada produk tersedia saat ini.`;
  }

  let text = `📦 *PRODUK INVESTASI*\n\n`;
  products.forEach((p: any, i: number) => {
    const dailyProfit = Math.floor((p.price || 0) * ((p.profitRate || 0) / 100));
    text += `*${i + 1}. ${p.name}*\n`;
    text += `   💰 Harga: ${formatRupiah(p.price)}\n`;
    text += `   📈 Profit: ${p.profitRate}%/hari (${formatRupiah(dailyProfit)}/hari)\n`;
    text += `   ⏰ Durasi: ${p.duration} hari\n`;
    const remaining = (p.quota || 0) - (p.quotaUsed || 0);
    text += `   🎯 Sisa kuota: ${remaining}\n\n`;
  });

  text += `💡 Beli produk di: https://nexvo.id/#paket`;
  return text;
}

function getAsetText(user: any): string {
  const investments = queryDb(`SELECT i.amount, i.dailyProfit, i.totalProfitEarned, i.status, i.startDate, p.name as pkgName FROM Investment i LEFT JOIN InvestmentPackage p ON i.packageId = p.id WHERE i.userId = '${user.id}' AND i.status = 'active' ORDER BY i.createdAt DESC`);
  
  if (investments.length === 0) {
    return `📊 *ASET SAYA*\n\nAnda belum memiliki aset investasi aktif.\n\n💡 Beli produk di: https://nexvo.id/#paket`;
  }

  let text = `📊 *ASET SAYA*\n\n`;
  let totalAmount = 0;
  let totalDaily = 0;
  let totalProfit = 0;
  
  investments.forEach((inv: any, i: number) => {
    text += `*${i + 1}. ${inv.pkgName || 'Paket Investasi'}*\n`;
    text += `   💰 Modal: ${formatRupiah(inv.amount)}\n`;
    text += `   📈 Profit/hari: +${formatRupiah(inv.dailyProfit)}\n`;
    text += `   💵 Total profit: ${formatRupiah(inv.totalProfitEarned)}\n\n`;
    totalAmount += inv.amount || 0;
    totalDaily += inv.dailyProfit || 0;
    totalProfit += inv.totalProfitEarned || 0;
  });

  text += `──────────────\n`;
  text += `💰 Total Modal: ${formatRupiah(totalAmount)}\n`;
  text += `📈 Total Profit/Hari: +${formatRupiah(totalDaily)}\n`;
  text += `💵 Total Profit: ${formatRupiah(totalProfit)}`;
  return text;
}

function getDepositText(user: any): string {
  const settings = queryDb(`SELECT key, value FROM SystemSettings WHERE key IN ('deposit_fee', 'qris_image')`);
  const feeSetting = settings.find((s: any) => s.key === 'deposit_fee');
  const fee = feeSetting ? parseFloat(feeSetting.value) || 0 : 0;
  
  let text = `💸 *DEPOSIT*\n\n`;
  if (user) {
    text += `👤 Saldo Deposit: ${formatRupiah(user.depositBalance || 0)}\n`;
    text += `💵 Saldo Utama: ${formatRupiah(user.mainBalance || 0)}\n\n`;
  }
  text += `📌 *Cara Deposit:*\n`;
  text += `1. Buka aplikasi Nexvo\n`;
  text += `2. Pilih menu Wallet → Deposit\n`;
  text += `3. Masukkan jumlah deposit\n`;
  text += `4. Scan QRIS & bayar\n`;
  text += `5. Tunggu konfirmasi admin\n\n`;
  if (fee > 0) {
    text += `💸 Biaya admin deposit: ${formatRupiah(fee)}\n\n`;
  } else {
    text += `✅ Tanpa biaya admin deposit!\n\n`;
  }
  text += `🔗 Deposit di: https://nexvo.id/#wallet`;
  return text;
}

function getWithdrawText(user: any): string {
  const settings = queryDb(`SELECT key, value FROM SystemSettings WHERE key = 'withdraw_fee'`);
  const feeSetting = settings.find((s: any) => s.key === 'withdraw_fee');
  const fee = feeSetting ? parseFloat(feeSetting.value) || 0 : 0;

  let text = `🏦 *WITHDRAW*\n\n`;
  if (user) {
    text += `💵 Saldo tersedia: ${formatRupiah(user.mainBalance || 0)}\n\n`;
  }
  text += `📌 *Cara Withdraw:*\n`;
  text += `1. Buka aplikasi Nexvo\n`;
  text += `2. Pilih menu Wallet → Withdraw\n`;
  text += `3. Masukkan jumlah & pilih bank\n`;
  text += `4. Tunggu persetujuan admin\n\n`;
  if (fee > 0) {
    text += `💸 Biaya admin WD: ${fee}%\n\n`;
  }
  text += `⏰ Jam WD: 09:00 - 16:00 WIB\n`;
  text += `❌ WD offline: Sabtu & Minggu\n\n`;
  text += `🔗 Withdraw di: https://nexvo.id/#wallet`;
  return text;
}

function getReferralText(user: any): string {
  const code = user.referralCode || '-';
  const link = `https://nexvo.id?ref=${code}`;
  
  // Count referrals
  const refs = queryDb(`SELECT COUNT(*) as cnt FROM Referral WHERE referrerId = '${user.id}' AND level = 1`);
  const totalRefs = refs[0]?.cnt || 0;
  
  // Get referral bonus total
  const bonuses = queryDb(`SELECT SUM(amount) as total FROM BonusLog WHERE userId = '${user.id}' AND type = 'referral'`);
  const totalBonus = bonuses[0]?.total || 0;

  return `🔗 *REFERRAL*\n\n` +
    `👤 Nama: ${user.name || user.userId}\n` +
    `🏷️ Kode Referral: *${code}*\n` +
    `🔗 Link: ${link}\n\n` +
    `👥 Total Undangan (L1): ${totalRefs} orang\n` +
    `🎁 Bonus Referral: ${formatRupiah(totalBonus)}\n\n` +
    `📊 *Rate Bonus:*\n` +
    `L1: 10% | L2: 5% | L3: 4%\n` +
    `L4: 3% | L5: 2%\n\n` +
    `💡 Bagikan link untuk mendapat bonus!`;
}

function getBonusText(user: any): string {
  const bonuses = queryDb(`SELECT type, SUM(amount) as total, COUNT(*) as cnt FROM BonusLog WHERE userId = '${user.id}' GROUP BY type`);
  
  if (bonuses.length === 0) {
    return `🎁 *BONUS SAYA*\n\nBelum ada bonus yang diterima.`;
  }

  let text = `🎁 *BONUS SAYA*\n\n`;
  let grandTotal = 0;
  
  const typeLabels: Record<string, string> = {
    referral: '🤝 Referral',
    matching: '🔄 M.Profit',
    profit: '💰 Profit',
    salary: '🏆 Gaji',
  };

  bonuses.forEach((b: any) => {
    const label = typeLabels[b.type] || b.type;
    text += `${label}: ${formatRupiah(b.total)} (${b.cnt}x)\n`;
    grandTotal += b.total || 0;
  });

  text += `\n💵 *Total Bonus: ${formatRupiah(grandTotal)}*`;
  return text;
}

function getBantuanText(): string {
  const admins = queryDb(`SELECT name, phone FROM WhatsAppAdmin WHERE isActive = 1 ORDER BY \`order\` ASC`);
  
  let text = `❓ *BANTUAN*\n\n`;
  text += `Jika membutuhkan bantuan, hubungi:\n\n`;
  
  if (admins.length > 0) {
    admins.forEach((a: any) => {
      text += `👤 ${a.name}\n📱 wa.me/${a.phone}\n\n`;
    });
  } else {
    text += `👤 CS NEXVO\n📱 wa.me/6281234567890\n\n`;
  }

  text += `🌐 Website: https://nexvo.id`;
  return text;
}

// ──────────── WhatsApp Connection ────────────
async function connectToWhatsApp(phoneNumber?: string) {
  const { version } = await fetchLatestBaileysVersion();
  console.log(`[Bot] Using WA web version: ${version.join('.')}`);

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  sock = makeWASocket({
    version,
    logger,
    auth: state,
    browser: Browsers.ubuntu('Desktop'),
    printQRInTerminal: false,
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  // Save credentials on update
  sock.ev.on('creds.update', saveCreds);

  // Connection events
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    connectionState = update;

    if (qr) {
      qrCode = qr;
      pairingCode = null;
      console.log('[Bot] 📱 QR Code generated. Scan with WhatsApp.');
    }

    if (connection === 'close') {
      botConnected = false;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(`[Bot] Connection closed. Status: ${statusCode}. Reconnect: ${shouldReconnect}`);
      
      if (shouldReconnect) {
        setTimeout(() => connectToWhatsApp(), 3000);
      }
    }

    if (connection === 'open') {
      botConnected = true;
      qrCode = null;
      pairingCode = null;
      console.log('[Bot] ✅ Connected to WhatsApp!');
    }
  });

  // Request pairing code if phone number provided
  if (phoneNumber && !state.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        pairingCode = code;
        botPhoneNumber = phoneNumber;
        saveBotConfig();
        console.log(`[Bot] 🔗 Pairing code for ${phoneNumber}: ${code}`);
      } catch (e) {
        console.error('[Bot] Error requesting pairing code:', e);
      }
    }, 3000);
  }

  // Message handler
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      const from = msg.key.remoteJid || '';
      const phone = from.replace('@s.whatsapp.net', '');
      
      // Get text content
      const text = msg.message?.conversation || 
                   msg.message?.extendedTextMessage?.text || 
                   msg.message?.imageMessage?.caption || '';
      
      if (!text) continue;

      console.log(`[Bot] 📩 Message from ${phone}: ${text.substring(0, 50)}`);

      // Process command
      if (botConfig.autoReply && text.trim()) {
        const reply = handleCommand(text, phone);
        
        try {
          await sock!.sendMessage(from, { text: reply }, { quoted: msg });
        } catch (e) {
          console.error('[Bot] Error sending reply:', e);
        }
      }
    }
  });
}

// ──────────── HTTP API ────────────
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Status
    if (url.pathname === '/') {
      return Response.json({
        service: 'NEXVO WhatsApp Bot',
        status: botConnected ? 'connected' : 'disconnected',
        phoneNumber: botPhoneNumber,
        pairingCode,
        hasQR: !!qrCode,
        autoReply: botConfig.autoReply,
      }, { headers: corsHeaders });
    }

    // Connect with pairing code
    if (url.pathname === '/api/connect' && req.method === 'POST') {
      try {
        const body = await req.json() as { phoneNumber?: string };
        const phone = body.phoneNumber?.replace(/[^0-9]/g, '');
        
        if (!phone) {
          return Response.json({ success: false, error: 'Nomor telepon wajib diisi' }, { headers: corsHeaders });
        }

        // Format phone number (remove leading 0, add 62)
        let formattedPhone = phone;
        if (formattedPhone.startsWith('0')) formattedPhone = '62' + formattedPhone.substring(1);
        if (!formattedPhone.startsWith('62')) formattedPhone = '62' + formattedPhone;

        botPhoneNumber = formattedPhone;
        saveBotConfig();

        // Reconnect with the phone number
        if (sock) {
          try { sock.end(undefined); } catch {}
        }

        await connectToWhatsApp(formattedPhone);

        return Response.json({
          success: true,
          message: 'Kode pairing sedang dibuat...',
          phoneNumber: formattedPhone,
        }, { headers: corsHeaders });
      } catch (e: any) {
        return Response.json({ success: false, error: e.message }, { headers: corsHeaders });
      }
    }

    // Get pairing code
    if (url.pathname === '/api/pairing-code') {
      return Response.json({
        success: true,
        pairingCode,
        phoneNumber: botPhoneNumber,
        connected: botConnected,
      }, { headers: corsHeaders });
    }

    // Get QR code
    if (url.pathname === '/api/qr') {
      if (!qrCode) {
        return Response.json({ success: false, error: 'QR code belum tersedia' }, { headers: corsHeaders });
      }
      return Response.json({ success: true, qr: qrCode }, { headers: corsHeaders });
    }

    // Disconnect
    if (url.pathname === '/api/disconnect' && req.method === 'POST') {
      if (sock) {
        try { sock.end(undefined); } catch {}
        sock = null;
      }
      botConnected = false;
      pairingCode = null;
      qrCode = null;
      return Response.json({ success: true, message: 'Bot disconnected' }, { headers: corsHeaders });
    }

    // Update config
    if (url.pathname === '/api/config' && req.method === 'POST') {
      try {
        const body = await req.json() as Partial<BotConfig>;
        if (body.autoReply !== undefined) botConfig.autoReply = body.autoReply;
        if (body.onlyRegistered !== undefined) botConfig.onlyRegistered = body.onlyRegistered;
        if (body.welcomeMessage) botConfig.welcomeMessage = body.welcomeMessage;
        if (body.menuHeader) botConfig.menuHeader = body.menuHeader;
        if (body.menuFooter) botConfig.menuFooter = body.menuFooter;
        saveBotConfig();
        return Response.json({ success: true, config: botConfig }, { headers: corsHeaders });
      } catch (e: any) {
        return Response.json({ success: false, error: e.message }, { headers: corsHeaders });
      }
    }

    // Get config
    if (url.pathname === '/api/config') {
      return Response.json({ success: true, config: botConfig }, { headers: corsHeaders });
    }

    // Send message (for admin to send custom messages)
    if (url.pathname === '/api/send' && req.method === 'POST') {
      try {
        const body = await req.json() as { phone: string; message: string };
        if (!body.phone || !body.message) {
          return Response.json({ success: false, error: 'Phone dan message wajib diisi' }, { headers: corsHeaders });
        }
        if (!sock || !botConnected) {
          return Response.json({ success: false, error: 'Bot belum terkoneksi' }, { headers: corsHeaders });
        }
        
        let jid = body.phone.replace(/[^0-9]/g, '');
        if (!jid.includes('@')) jid += '@s.whatsapp.net';
        
        await sock.sendMessage(jid, { text: body.message });
        return Response.json({ success: true, message: 'Pesan terkirim' }, { headers: corsHeaders });
      } catch (e: any) {
        return Response.json({ success: false, error: e.message }, { headers: corsHeaders });
      }
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  },
});

// ──────────── Start ────────────
loadBotConfig();
console.log(`[WA Bot] 🚀 Running on port ${PORT}`);
console.log(`[WA Bot] Auto-reply: ${botConfig.autoReply}`);

// Auto-connect if there's a saved session
if (existsSync(join(SESSION_DIR, 'creds.json'))) {
  console.log('[WA Bot] Found saved session, reconnecting...');
  connectToWhatsApp();
} else {
  console.log('[WA Bot] No saved session. Use API /api/connect to connect with pairing code.');
}
