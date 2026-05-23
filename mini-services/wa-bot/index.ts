/**
 * NEXVO WhatsApp Bot Service - v10.0.0
 * 
 * DUAL MODE BOT:
 * - OWNER/ADMIN: Full control (balance, products, assets, withdraw, referral, bonus, etc.)
 * - REGULAR USER: Limited features only (help, cara register, deposit info, greetings)
 * - MENU with NEXVO AI Assistant logo + interactive buttons
 * - Auto-notification to REAL owner account for deposits, registrations, etc.
 * - Polling SystemSettings for pending notifications
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
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import P from 'pino';
import QRCode from 'qrcode';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
} from 'fs';
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
const MENU_IMAGE_PATH = join(__dirname, 'nexvo-bot-logo.png');

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
let connectionMode: 'pairing' | 'qr' = 'pairing';
let shouldReconnect = false;
let notificationPollingTimer: ReturnType<typeof setInterval> | null = null;
const MAX_RECONNECT = 3;

// ═══════════════════════════════════════════════════════════
//  BOT CONFIG
// ═══════════════════════════════════════════════════════════

interface BotConfig {
  autoReply: boolean;
  ownerNumber: string;  // REAL owner WhatsApp number (receives notifications)
}

const defaultConfig: BotConfig = {
  autoReply: true,
  ownerNumber: '',
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
        if (file !== 'bot-state.json') rmSync(join(SESSION_DIR, file), { recursive: true, force: true });
      }
      console.log('[Bot] Session files cleared');
    }
  } catch (e) { console.error('[Bot] Error clearing session:', e); }
}

function hasValidSession(): boolean {
  return existsSync(join(SESSION_DIR, 'creds.json'));
}

// ═══════════════════════════════════════════════════════════
//  DATABASE HELPERS
// ═══════════════════════════════════════════════════════════

function queryDb(sql: string): any[] {
  try {
    const result = execSync(`sqlite3 -json "${DB_PATH}" "${sql}"`, { encoding: 'utf-8', timeout: 5000 });
    return result.trim() ? JSON.parse(result) : [];
  } catch (e: any) { return []; }
}

function execDb(sql: string): void {
  try { execSync(`sqlite3 "${DB_PATH}" "${sql}"`, { timeout: 5000 }); } catch {}
}

function findUserByPhone(phone: string): any | null {
  let n = phone.replace(/[^0-9]/g, '');
  if (n.startsWith('0')) n = '62' + n.substring(1);
  if (n.startsWith('+62')) n = '62' + n.substring(3);
  if (!n.startsWith('62')) n = '62' + n;
  const users = queryDb(`SELECT id, userId, name, whatsapp, mainBalance, depositBalance, totalProfit, totalDeposit, totalWithdraw, referralCode, isVerified, isSuspended, level FROM User WHERE whatsapp LIKE '%${n.slice(-10)}%'`);
  return users.length > 0 ? users[0] : null;
}

function formatRupiah(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}

// ═══════════════════════════════════════════════════════════
//  OWNER NUMBER - THE REAL ACCOUNT
//  This is where notifications go. NOT the bot number.
// ═══════════════════════════════════════════════════════════

function getOwnerNumber(): string {
  // Priority: ownerNumber from config > bot_admin_number from DB
  if (botConfig.ownerNumber) return botConfig.ownerNumber;
  const setting = queryDb("SELECT value FROM SystemSettings WHERE key = 'bot_admin_number'");
  return setting.length > 0 ? setting[0].value : '';
}

function isOwner(phone: string): boolean {
  const owner = getOwnerNumber();
  if (!owner) return false;
  const p = phone.replace(/[^0-9]/g, '');
  const o = owner.replace(/[^0-9]/g, '');
  return p === o || p.endsWith(o.slice(-10)) || o.endsWith(p.slice(-10));
}

function getCSNumbers(): Array<{ name: string; phone: string }> {
  const admins = queryDb("SELECT name, phone FROM WhatsAppAdmin WHERE isActive = 1 ORDER BY `order` ASC");
  return admins.length > 0 ? admins : [{ name: 'CS NEXVO', phone: getOwnerNumber() }];
}

// ═══════════════════════════════════════════════════════════
//  MENU IMAGE
// ═══════════════════════════════════════════════════════════

let menuImageBuffer: Buffer | null = null;

function loadMenuImage() {
  try {
    if (existsSync(MENU_IMAGE_PATH)) {
      menuImageBuffer = readFileSync(MENU_IMAGE_PATH);
      console.log('[Bot] ✅ Menu image loaded');
    } else {
      console.log('[Bot] ⚠️ Menu image not found');
    }
  } catch (e) { console.error('[Bot] Error loading menu image:', e); }
}

// ═══════════════════════════════════════════════════════════
//  COMMAND RESULT TYPE
// ═══════════════════════════════════════════════════════════

interface CommandResult {
  text: string;
  image?: Buffer;
  buttons?: Array<{ buttonText: string; id: string }>;
  footer?: string;
}

// ═══════════════════════════════════════════════════════════
//  DUAL MODE COMMAND HANDLER
//  OWNER = Full Control
//  USER  = Limited (help, register, deposit, greetings)
// ═══════════════════════════════════════════════════════════

function handleCommand(command: string, phone: string): CommandResult {
  const c = command.toLowerCase().trim();
  const owner = isOwner(phone);

  // ── GREETINGS (same for both) ──
  const greetings = ['hi', 'halo', 'hai', 'hello', 'hey', 'hola', 'start', 'mulai'];
  if (greetings.includes(c)) {
    if (owner) {
      return {
        text: '👋 Hello *Owner*! I\'m *Nexvo AI Assistant*.\n\nType *menu* to access full control panel.',
        image: menuImageBuffer || undefined,
        buttons: [
          { buttonText: '📋 Admin Menu', id: 'menu' },
          { buttonText: '📊 Dashboard', id: 'dashboard' },
        ],
        footer: '🔒 NEXVO Admin Mode',
      };
    }
    return {
      text: '👋 Hello! I\'m *Nexvo AI Assistant* — your digital investment companion.\n\nType *menu* to see available features.',
      image: menuImageBuffer || undefined,
      buttons: [
        { buttonText: '📋 Menu', id: 'menu' },
        { buttonText: '📝 Cara Register', id: 'register' },
        { buttonText: '❓ Bantuan', id: 'help' },
      ],
      footer: 'NEXVO AI Assistant',
    };
  }

  // ── MENU command ──
  if (c === 'menu' || c === 'm' || c === '0') {
    if (owner) return getAdminMenu();
    return getUserMenu();
  }

  // ═══════════════════════════════════════════════════
  //  ADMIN-ONLY COMMANDS
  // ═══════════════════════════════════════════════════
  if (owner) {
    // Dashboard overview
    if (c === 'dashboard' || c === 'd') return handleDashboard();
    if (c === 'balance' || c === 'saldo' || c === '1') return handleOwnerBalance();
    if (c === 'products' || c === 'produk' || c === '2') return handleProducts();
    if (c === 'users' || c === '3') return handleUsersList();
    if (c === 'deposits' || c === '4') return handlePendingDeposits();
    if (c === 'withdrawals' || c === '5') return handlePendingWithdrawals();
    if (c === 'broadcast' || c === '6') return handleBroadcastInfo();
    if (c === 'help' || c === 'bantuan' || c === 'cs' || c === '8') return handleHelp();

    // Unrecognized admin command
    return {
      text: `🤖 Command not recognized.\n\nType *menu* to see admin features.`,
      buttons: [{ buttonText: '📋 Admin Menu', id: 'menu' }],
      footer: '🔒 NEXVO Admin Mode',
    };
  }

  // ═══════════════════════════════════════════════════
  //  USER-ONLY COMMANDS (LIMITED)
  // ═══════════════════════════════════════════════════
  if (c === 'help' || c === 'bantuan' || c === 'cs' || c === '8') return handleUserHelp(phone);
  if (c === 'register' || c === 'daftar' || c === 'reg' || c === '1') return handleUserRegister();
  if (c === 'deposit' || c === 'dep' || c === 'topup' || c === '2') return handleUserDeposit(phone);
  if (c === 'info' || c === '3') return handleUserInfo();

  // Unrecognized user command
  return {
    text: `🤖 Command not recognized.\n\nType *menu* to see available features.`,
    buttons: [
      { buttonText: '📋 Menu', id: 'menu' },
      { buttonText: '❓ Bantuan', id: 'help' },
    ],
    footer: 'NEXVO AI Assistant',
  };
}

// ═══════════════════════════════════════════════════════════
//  ADMIN MENU (FULL CONTROL)
// ═══════════════════════════════════════════════════════════

function getAdminMenu(): CommandResult {
  return {
    text: `📋 *NEXVO ADMIN PANEL*\n\n🔒 *Full Control Mode*\n\n1️⃣ 📊 Dashboard — System overview\n2️⃣ 💰 Balance — Platform balance\n3️⃣ 📦 Products — Manage products\n4️⃣ 👥 Users — Pending registrations\n5️⃣ 💸 Deposits — Pending deposits\n6️⃣ 🏦 Withdrawals — Pending WD\n7️⃣ 📢 Broadcast — Send to all users\n8️⃣ ❓ Help — Support\n\n💡 Tap a button or type the number.`,
    image: menuImageBuffer || undefined,
    buttons: [
      { buttonText: '📊 Dashboard', id: 'dashboard' },
      { buttonText: '💰 Balance', id: 'balance' },
      { buttonText: '👥 Users', id: 'users' },
      { buttonText: '💸 Deposits', id: 'deposits' },
      { buttonText: '🏦 Withdrawals', id: 'withdrawals' },
      { buttonText: '📢 Broadcast', id: 'broadcast' },
      { buttonText: '❓ Help', id: 'help' },
    ],
    footer: '🔒 NEXVO Admin Panel',
  };
}

function handleDashboard(): CommandResult {
  const totalUsers = queryDb('SELECT COUNT(*) as cnt FROM User')[0]?.cnt || 0;
  const activeInv = queryDb("SELECT COUNT(*) as cnt FROM Investment WHERE status = 'active'")[0]?.cnt || 0;
  const pendingDep = queryDb("SELECT COUNT(*) as cnt FROM Deposit WHERE status = 'pending'")[0]?.cnt || 0;
  const pendingWd = queryDb("SELECT COUNT(*) as cnt FROM Withdrawal WHERE status = 'pending'")[0]?.cnt || 0;
  const totalDep = queryDb('SELECT SUM(amount) as total FROM Deposit WHERE status = \'approved\'')[0]?.total || 0;
  const totalWd = queryDb('SELECT SUM(amount) as total FROM Withdrawal WHERE status = \'approved\'')[0]?.total || 0;
  const activeProducts = queryDb("SELECT COUNT(*) as cnt FROM Product WHERE isActive = 1 AND isStopped = 0")[0]?.cnt || 0;

  return {
    text: `📊 *DASHBOARD OVERVIEW*\n\n👥 Total Users: *${totalUsers}*\n📦 Active Products: *${activeProducts}*\n📈 Active Investments: *${activeInv}*\n\n💸 Pending Deposits: *${pendingDep}*\n🏦 Pending Withdrawals: *${pendingWd}*\n\n💰 Total Deposits: ${formatRupiah(totalDep)}\n💸 Total Withdrawals: ${formatRupiah(totalWd)}\n💵 Net: ${formatRupiah(totalDep - totalWd)}`,
    buttons: [
      { buttonText: '💸 Deposits', id: 'deposits' },
      { buttonText: '🏦 Withdrawals', id: 'withdrawals' },
      { buttonText: '📋 Menu', id: 'menu' },
    ],
    footer: '🔒 NEXVO Admin Panel',
  };
}

function handleOwnerBalance(): CommandResult {
  const totalDep = queryDb("SELECT SUM(amount) as total FROM Deposit WHERE status = 'approved'")[0]?.total || 0;
  const totalWd = queryDb("SELECT SUM(amount) as total FROM Withdrawal WHERE status = 'approved'")[0]?.total || 0;
  const totalProfit = queryDb('SELECT SUM(totalProfit) as total FROM User')[0]?.total || 0;
  const totalDepBal = queryDb('SELECT SUM(depositBalance) as total FROM User')[0]?.total || 0;
  const totalMainBal = queryDb('SELECT SUM(mainBalance) as total FROM User')[0]?.total || 0;

  return {
    text: `💰 *PLATFORM BALANCE*\n\n💵 Total User Main Balance: ${formatRupiah(totalMainBal)}\n🏦 Total User Deposit Balance: ${formatRupiah(totalDepBal)}\n📈 Total Profit Distributed: ${formatRupiah(totalProfit)}\n\n💸 Total Deposits In: ${formatRupiah(totalDep)}\n💸 Total Withdrawals Out: ${formatRupiah(totalWd)}\n💵 Net Flow: ${formatRupiah(totalDep - totalWd)}`,
    buttons: [
      { buttonText: '📊 Dashboard', id: 'dashboard' },
      { buttonText: '📋 Menu', id: 'menu' },
    ],
    footer: '🔒 NEXVO Admin Panel',
  };
}

function handleProducts(): CommandResult {
  const products = queryDb('SELECT name, price, profitRate, duration, quota, quotaUsed, isActive, isStopped FROM Product ORDER BY price ASC');
  if (!products.length) {
    return {
      text: `📦 *PRODUCTS*\n\nNo products available.`,
      buttons: [{ buttonText: '📋 Menu', id: 'menu' }],
      footer: '🔒 NEXVO Admin Panel',
    };
  }
  let text = `📦 *PRODUCTS*\n\n`;
  products.forEach((p: any, i: number) => {
    const status = p.isStopped ? '🛑 Stopped' : (p.isActive ? '✅ Active' : '❌ Inactive');
    const pct = p.quota > 0 ? Math.round(p.quotaUsed / p.quota * 100) : 0;
    text += `*${i + 1}. ${p.name}*\n💰 Price: ${formatRupiah(p.price)}\n📈 Profit: ${p.profitRate}%/day\n⏰ Duration: ${p.duration} days\n📊 Quota: ${pct}%\n🏷️ ${status}\n\n`;
  });
  return {
    text,
    buttons: [{ buttonText: '📋 Menu', id: 'menu' }],
    footer: '🔒 NEXVO Admin Panel',
  };
}

function handleUsersList(): CommandResult {
  const users = queryDb('SELECT userId, name, whatsapp, isVerified, isSuspended, mainBalance, depositBalance, createdAt FROM User ORDER BY createdAt DESC LIMIT 10');
  const total = queryDb('SELECT COUNT(*) as cnt FROM User')[0]?.cnt || 0;
  if (!users.length) {
    return {
      text: `👥 *USERS*\n\nNo users registered yet.`,
      buttons: [{ buttonText: '📋 Menu', id: 'menu' }],
      footer: '🔒 NEXVO Admin Panel',
    };
  }
  let text = `👥 *RECENT USERS* (showing 10 of ${total})\n\n`;
  users.forEach((u: any) => {
    const status = u.isSuspended ? '🛑' : (u.isVerified ? '✅' : '⏳');
    text += `${status} *${u.name || u.userId}*\n🆔 ${u.userId} | 📱 ${u.whatsapp}\n💰 ${formatRupiah(u.mainBalance)} | 🏦 ${formatRupiah(u.depositBalance)}\n\n`;
  });
  return {
    text,
    buttons: [{ buttonText: '📋 Menu', id: 'menu' }],
    footer: '🔒 NEXVO Admin Panel',
  };
}

function handlePendingDeposits(): CommandResult {
  const deps = queryDb("SELECT d.depositId, d.amount, d.status, d.paymentName, d.createdAt, u.name, u.userId FROM Deposit d LEFT JOIN User u ON d.userId = u.id WHERE d.status = 'pending' ORDER BY d.createdAt DESC LIMIT 10");
  const pending = queryDb("SELECT COUNT(*) as cnt, SUM(amount) as total FROM Deposit WHERE status = 'pending'")[0];
  if (!deps.length) {
    return {
      text: `💸 *PENDING DEPOSITS*\n\n✅ No pending deposits!`,
      buttons: [{ buttonText: '📋 Menu', id: 'menu' }],
      footer: '🔒 NEXVO Admin Panel',
    };
  }
  let text = `💸 *PENDING DEPOSITS* (${pending?.cnt || 0} total)\n💵 Total: ${formatRupiah(pending?.total || 0)}\n\n`;
  deps.forEach((d: any) => {
    const time = new Date(d.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    text += `📌 *${d.depositId}*\n👤 ${d.name || d.userId}\n💰 ${formatRupiah(d.amount)}\n💳 ${d.paymentName || '-'}\n⏰ ${time}\n\n`;
  });
  text += `💡 Approve/reject via admin panel: https://nexvo.id`;
  return {
    text,
    buttons: [
      { buttonText: '🏦 Withdrawals', id: 'withdrawals' },
      { buttonText: '📋 Menu', id: 'menu' },
    ],
    footer: '🔒 NEXVO Admin Panel',
  };
}

function handlePendingWithdrawals(): CommandResult {
  const wds = queryDb("SELECT w.id, w.amount, w.fee, w.netAmount, w.bankName, w.accountNo, w.holderName, w.status, w.createdAt, u.name, u.userId FROM Withdrawal w LEFT JOIN User u ON w.userId = u.id WHERE w.status = 'pending' ORDER BY w.createdAt DESC LIMIT 10");
  const pending = queryDb("SELECT COUNT(*) as cnt, SUM(amount) as total FROM Withdrawal WHERE status = 'pending'")[0];
  if (!wds.length) {
    return {
      text: `🏦 *PENDING WITHDRAWALS*\n\n✅ No pending withdrawals!`,
      buttons: [{ buttonText: '📋 Menu', id: 'menu' }],
      footer: '🔒 NEXVO Admin Panel',
    };
  }
  let text = `🏦 *PENDING WITHDRAWALS* (${pending?.cnt || 0} total)\n💵 Total: ${formatRupiah(pending?.total || 0)}\n\n`;
  wds.forEach((w: any) => {
    const time = new Date(w.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    text += `📌 *${w.userId}*\n👤 ${w.name}\n💰 ${formatRupiah(w.amount)} (Fee: ${formatRupiah(w.fee)})\n💵 Net: ${formatRupiah(w.netAmount)}\n🏦 ${w.bankName} - ${w.accountNo}\n👤 ${w.holderName}\n⏰ ${time}\n\n`;
  });
  text += `💡 Approve/reject via admin panel: https://nexvo.id`;
  return {
    text,
    buttons: [
      { buttonText: '💸 Deposits', id: 'deposits' },
      { buttonText: '📋 Menu', id: 'menu' },
    ],
    footer: '🔒 NEXVO Admin Panel',
  };
}

function handleBroadcastInfo(): CommandResult {
  const totalUsers = queryDb('SELECT COUNT(*) as cnt FROM User WHERE isSuspended = 0')[0]?.cnt || 0;
  return {
    text: `📢 *BROADCAST*\n\n👥 Total active users: *${totalUsers}*\n\nTo send a broadcast message, use the admin panel at:\n🔗 https://nexvo.id\n\nOr use API:\n\`POST /api/broadcast\`\n\`{"message": "Your message"}\``,
    buttons: [{ buttonText: '📋 Menu', id: 'menu' }],
    footer: '🔒 NEXVO Admin Panel',
  };
}

function handleHelp(): CommandResult {
  return {
    text: `❓ *ADMIN HELP*\n\n🔒 You have full control access.\n\n📋 *Commands:*\n• *menu* — Admin control panel\n• *dashboard* — System overview\n• *balance* — Platform balance\n• *users* — Recent users\n• *deposits* — Pending deposits\n• *withdrawals* — Pending WD\n• *broadcast* — Mass message info\n\n🌐 Admin Panel: https://nexvo.id\n📧 Email: adminnexvo@nexvo.id`,
    buttons: [{ buttonText: '📋 Admin Menu', id: 'menu' }],
    footer: '🔒 NEXVO Admin Panel',
  };
}

// ═══════════════════════════════════════════════════════════
//  USER MENU (LIMITED FEATURES ONLY)
// ═══════════════════════════════════════════════════════════

function getUserMenu(): CommandResult {
  return {
    text: `📋 *NEXVO AI ASSISTANT*\n\n👋 Welcome! How can I help you?\n\n1️⃣ 📝 *Cara Register* — How to create account\n2️⃣ 💸 *Deposit* — How to add deposit\n3️⃣ ℹ️ *Info* — About Nexvo\n8️⃣ ❓ *Bantuan* — Contact CS\n\n💡 Tap a button or type the number.`,
    image: menuImageBuffer || undefined,
    buttons: [
      { buttonText: '📝 Cara Register', id: 'register' },
      { buttonText: '💸 Deposit', id: 'deposit' },
      { buttonText: 'ℹ️ Info', id: 'info' },
      { buttonText: '❓ Bantuan', id: 'help' },
    ],
    footer: 'NEXVO AI Assistant',
  };
}

function handleUserRegister(): CommandResult {
  return {
    text: `📝 *CARA REGISTER DI NEXVO*\n\nIkuti langkah-langkah berikut:\n\n1️⃣ Buka website Nexvo:\n🔗 https://nexvo.id\n\n2️⃣ Klik tombol *Register*\n\n3️⃣ Isi formulir pendaftaran:\n• 📱 Nomor WhatsApp (aktif)\n• 📧 Email aktif\n• 🔑 Password\n• 🏷️ Kode Referral (jika ada)\n\n4️⃣ Verifikasi OTP WhatsApp\n\n5️⃣ Selesai! Akun Anda aktif 🎉\n\n⚠️ *Penting:*\n• Gunakan nomor WhatsApp yang aktif\n• Simpan password dengan aman\n• 1 nomor WhatsApp = 1 akun\n\n💬 Butuh bantuan? Ketik *help*`,
    buttons: [
      { buttonText: '💸 Deposit', id: 'deposit' },
      { buttonText: '❓ Bantuan', id: 'help' },
      { buttonText: '📋 Menu', id: 'menu' },
    ],
    footer: 'NEXVO AI Assistant',
  };
}

function handleUserDeposit(phone: string): CommandResult {
  const user = findUserByPhone(phone);
  const csList = getCSNumbers();
  let text = `💸 *DEPOSIT / TOP UP*\n\n`;

  if (user) {
    text += `👤 Akun: ${user.name || user.userId}\n🆔 ID: *${user.userId}*\n🏦 Saldo Deposit: ${formatRupiah(user.depositBalance || 0)}\n\n`;
  }

  text += `📌 *Cara Deposit:*\n1️⃣ Login ke akun Nexvo\n2️⃣ Buka Wallet → Deposit\n3️⃣ Masukkan jumlah & pilih metode bayar\n4️⃣ Upload bukti pembayaran\n5️⃣ Tunggu konfirmasi admin\n\n`;

  if (user) {
    text += `⚠️ *Penting:* Sertakan ID *${user.userId}* di catatan transfer.\n\n`;
  }

  text += `🔗 Deposit di: https://nexvo.id`;

  if (csList.length > 0) {
    text += `\n\n💬 Butuh bantuan? Hubungi:`;
    csList.forEach(cs => { text += `\n👤 ${cs.name}: wa.me/${cs.phone}`; });
  }

  return {
    text,
    buttons: [
      { buttonText: '📝 Cara Register', id: 'register' },
      { buttonText: '❓ Bantuan', id: 'help' },
      { buttonText: '📋 Menu', id: 'menu' },
    ],
    footer: 'NEXVO AI Assistant',
  };
}

function handleUserInfo(): CommandResult {
  return {
    text: `ℹ️ *TENTANG NEXVO*\n\n🚀 Nexvo adalah platform investasi digital yang memberikan profit harian dari produk-produk pilihan.\n\n✨ *Keunggulan:*\n• 📈 Profit harian stabil\n• 🔒 Aman & terpercaya\n• 💰 Mulai dari modal kecil\n• 🤝 Bonus referral hingga 5 level\n• ⚡ Deposit & WD cepat\n\n🌐 Website: https://nexvo.id\n📱 Hubungi CS untuk info lebih lanjut`,
    buttons: [
      { buttonText: '📝 Cara Register', id: 'register' },
      { buttonText: '💸 Deposit', id: 'deposit' },
      { buttonText: '❓ Bantuan', id: 'help' },
    ],
    footer: 'NEXVO AI Assistant',
  };
}

function handleUserHelp(phone: string): CommandResult {
  const csList = getCSNumbers();
  let text = `❓ *BANTUAN & SUPPORT*\n\n📞 Hubungi Customer Service kami:\n\n`;
  csList.forEach(cs => { text += `👤 ${cs.name}\n📱 wa.me/${cs.phone}\n\n`; });
  text += `🌐 Website: https://nexvo.id\n📧 Email: adminnexvo@nexvo.id\n\n💡 *Perintah yang tersedia:*\n• *menu* — Menu utama\n• *register* — Cara daftar\n• *deposit* — Cara deposit\n• *help* — Bantuan CS`;
  return {
    text,
    buttons: [
      { buttonText: '📋 Menu', id: 'menu' },
      { buttonText: '📝 Cara Register', id: 'register' },
      { buttonText: '💸 Deposit', id: 'deposit' },
    ],
    footer: 'NEXVO AI Assistant',
  };
}

// ═══════════════════════════════════════════════════════════
//  SEND MESSAGE WITH IMAGE + BUTTONS
// ═══════════════════════════════════════════════════════════

async function sendBotMessage(jid: string, result: CommandResult, quoted?: WAMessage) {
  if (!sock) return;

  try {
    if (result.image) {
      // Step 1: Send image with caption
      try {
        await sock.sendMessage(jid, { image: result.image, caption: result.text }, { quoted });
      } catch (imgErr) {
        console.error('[Bot] Image send error, sending text only');
      }

      // Step 2: Send buttons separately (more reliable)
      if (result.buttons && result.buttons.length > 0) {
        const templateButtons = result.buttons.map((btn, idx) => ({
          index: idx + 1,
          quickReplyButton: { displayText: btn.buttonText, id: btn.id },
        }));
        try {
          await sock.sendMessage(jid, {
            text: '👆 Tap a button to continue:',
            footer: result.footer || 'NEXVO AI Assistant',
            templateButtons,
          });
        } catch (btnErr) {
          console.error('[Bot] Buttons send error:', btnErr);
        }
      }
    } else if (result.buttons && result.buttons.length > 0) {
      const templateButtons = result.buttons.map((btn, idx) => ({
        index: idx + 1,
        quickReplyButton: { displayText: btn.buttonText, id: btn.id },
      }));
      await sock.sendMessage(jid, {
        text: result.text,
        footer: result.footer || 'NEXVO AI Assistant',
        templateButtons,
      }, { quoted });
    } else {
      await sock.sendMessage(jid, { text: result.text }, { quoted });
    }
  } catch (e) {
    console.error('[Bot] Send error:', e);
    try { await sock.sendMessage(jid, { text: result.text }, { quoted }); } catch {}
  }
}

// ═══════════════════════════════════════════════════════════
//  NOTIFICATION SYSTEM — SENDS TO REAL OWNER ACCOUNT
// ═══════════════════════════════════════════════════════════

function startNotificationPolling() {
  if (notificationPollingTimer) clearInterval(notificationPollingTimer);
  console.log('[Bot] 📡 Starting notification polling...');
  notificationPollingTimer = setInterval(pollNotifications, 5000);
}

function stopNotificationPolling() {
  if (notificationPollingTimer) {
    clearInterval(notificationPollingTimer);
    notificationPollingTimer = null;
    console.log('[Bot] Notification polling stopped');
  }
}

async function pollNotifications() {
  if (!sock || !botConnected) return;
  try {
    const notifications = queryDb(`SELECT key, value FROM SystemSettings WHERE key LIKE 'bot_notify_%' LIMIT 20`);
    const keysToDelete: string[] = [];

    for (const notif of notifications) {
      try {
        const payload = JSON.parse(notif.value);
        if (payload.read) { keysToDelete.push(notif.key); continue; }

        // Send notification to REAL OWNER account
        await sendOwnerNotification(payload);
        keysToDelete.push(notif.key);
      } catch {
        keysToDelete.push(notif.key);
      }
    }

    // Clean up old notifications
    const oneHourAgo = Date.now() - 3600000;
    const allNotifs = queryDb(`SELECT key, value FROM SystemSettings WHERE key LIKE 'bot_notify_%'`);
    for (const n of allNotifs) {
      if (!keysToDelete.includes(n.key)) {
        try {
          const p = JSON.parse(n.value);
          if (p.read || new Date(p.createdAt).getTime() < oneHourAgo) keysToDelete.push(n.key);
        } catch { keysToDelete.push(n.key); }
      }
    }

    for (const key of keysToDelete) {
      execDb(`DELETE FROM SystemSettings WHERE key = '${key}'`);
    }
  } catch {}
}

async function sendOwnerNotification(payload: any) {
  if (!sock || !botConnected) return;

  // SEND TO REAL OWNER NUMBER — not the bot number!
  const ownerNum = getOwnerNumber();
  if (!ownerNum) {
    console.log('[Bot] ⚠️ No REAL owner number set for notifications');
    return;
  }

  const jid = ownerNum.includes('@') ? ownerNum : ownerNum + '@s.whatsapp.net';
  let text = '';

  switch (payload.event) {
    case 'deposit_pending': {
      const d = payload.data;
      text = `🔔 *DEPOSIT BARU!*\n\n👤 User: ${d.userName || 'Unknown'}\n🆔 ID: ${d.userId || '-'}\n📱 WhatsApp: ${d.whatsapp || '-'}\n💰 Amount: ${formatRupiah(Number(d.amount) || 0)}\n💳 Payment: ${d.paymentMethod || '-'}\n📊 Status: *${d.status || 'pending'}*\n\n⏰ ${new Date(payload.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`;
      break;
    }
    case 'withdraw_pending': {
      const d = payload.data;
      text = `🔔 *WITHDRAWAL BARU!*\n\n👤 User: ${d.userName || 'Unknown'}\n🆔 ID: ${d.userId || '-'}\n📱 WhatsApp: ${d.whatsapp || '-'}\n💰 Amount: ${formatRupiah(Number(d.amount) || 0)}\n🏦 Fee: ${formatRupiah(Number(d.fee) || 0)}\n💵 Net: ${formatRupiah(Number(d.netAmount) || 0)}\n🏦 Bank: ${d.bankName || '-'}\n📋 Account: ${d.accountNo || '-'}\n👤 Holder: ${d.holderName || '-'}\n📊 Status: *${d.status || 'pending'}*\n\n⏰ ${new Date(payload.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`;
      break;
    }
    case 'register': {
      const d = payload.data;
      text = `🔔 *USER BARU DAFTAR!*\n\n👤 Name: ${d.userName || 'Unknown'}\n🆔 ID: ${d.userId || '-'}\n📱 WhatsApp: ${d.whatsapp || '-'}\n📧 Email: ${d.email || '-'}\n\n⏰ ${new Date(payload.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`;
      break;
    }
    case 'otp_requested': {
      const d = payload.data;
      text = `🔐 *OTP REQUESTED*\n\n👤 User: ${d.userName || 'Unknown'}\n📱 WhatsApp: ${d.whatsapp || '-'}\n🔑 OTP: *${d.otp || '-'}*\n\n⏰ ${new Date(payload.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`;
      break;
    }
    default: {
      text = `🔔 *NOTIFICATION*\n\n${JSON.stringify(payload.data)}\n\n⏰ ${new Date(payload.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
    }
  }

  try {
    await sock.sendMessage(jid, {
      text,
      footer: '🔔 NEXVO Bot Notification',
      templateButtons: [
        { index: 1, quickReplyButton: { displayText: '📋 Admin Menu', id: 'menu' } },
        { index: 2, quickReplyButton: { displayText: '💸 Deposits', id: 'deposits' } },
      ],
    });
    console.log(`[Bot] ✅ Notification sent to REAL owner: ${payload.event}`);
  } catch (e) {
    console.error('[Bot] Failed to send notification:', e);
  }
}

// ═══════════════════════════════════════════════════════════
//  QR CODE GENERATOR
// ═══════════════════════════════════════════════════════════

async function generateQRImage(data: string): Promise<string> {
  try {
    return await QRCode.toDataURL(data, { width: 512, margin: 2, color: { dark: '#000000', light: '#FFFFFF' }, errorCorrectionLevel: 'M' });
  } catch (e) { return ''; }
}

// ═══════════════════════════════════════════════════════════
//  WHATSAPP CONNECTION
// ═══════════════════════════════════════════════════════════

async function connectToWhatsApp(phoneNumber?: string, mode: 'pairing' | 'qr' = 'pairing') {
  if (isConnecting) { console.log('[Bot] Already connecting...'); return; }
  isConnecting = true;
  reconnectAttempts = 0;
  connectionMode = mode;
  shouldReconnect = true;

  try {
    const { version } = await fetchLatestBaileysVersion();
    console.log(`[Bot] WA web version: ${version.join('.')}`);

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    currentPairingCode = null;
    qrCode = null;
    qrCodeImage = null;
    pairingCodeRequested = false;

    const browserIdent = Browsers.windows('Chrome');
    console.log(`[Bot] Browser: ${browserIdent.join(' / ')}`);

    sock = makeWASocket({
      version, logger, auth: state, browser: browserIdent,
      printQRInTerminal: false, markOnlineOnConnect: true,
      generateHighQualityLinkPreview: false, syncFullHistory: false,
      connectTimeoutMs: 120_000, keepAliveIntervalMs: 25_000,
      defaultQueryTimeoutMs: 60_000, retryRequestDelayMs: 2000, qrTimeout: 120_000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      connectionState = update;

      if (qr) {
        if (mode === 'pairing' && pairingCodeRequested) return;
        qrCode = qr;
        qrCodeImage = await generateQRImage(qr);
        console.log('[Bot] QR Code generated');

        if (mode === 'pairing' && phoneNumber && !pairingCodeRequested) {
          pairingCodeRequested = true;
          try {
            const code = await sock!.requestPairingCode(phoneNumber);
            if (code) {
              currentPairingCode = code;
              pairingCodeExpiry = Date.now() + 5 * 60 * 1000;
              botPhoneNumber = phoneNumber;
              saveBotConfig();
              console.log(`[Bot] ✅ Pairing code: ${code}`);
            } else { pairingCodeRequested = false; }
          } catch (e: any) { console.error('[Bot] Pairing code error:', e.message?.substring(0, 200)); pairingCodeRequested = false; }
        }
      }

      if (connection === 'close') {
        botConnected = false;
        isConnecting = false;
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        console.log(`[Bot] Connection closed. Code: ${statusCode}`);

        if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
          clearSession(); currentPairingCode = null; qrCode = null; qrCodeImage = null;
          pairingCodeRequested = false; stopNotificationPolling(); return;
        }
        if (statusCode === 428) return;
        if (statusCode === 408) {
          clearSession(); currentPairingCode = null; qrCode = null; qrCodeImage = null;
          pairingCodeRequested = false; stopNotificationPolling(); return;
        }
        if (shouldReconnect && reconnectAttempts < MAX_RECONNECT) {
          reconnectAttempts++;
          setTimeout(() => { if (shouldReconnect) connectToWhatsApp(phoneNumber || botPhoneNumber || undefined, connectionMode); }, 3000);
        }
      }

      if (connection === 'open') {
        botConnected = true; qrCode = null; qrCodeImage = null;
        currentPairingCode = null; pairingCodeRequested = false;
        isConnecting = false; reconnectAttempts = 0;
        console.log('[Bot] ✅✅✅ CONNECTED to WhatsApp!');
        saveBotConfig();

        try {
          const meId = sock?.user?.id;
          if (meId) { botPhoneNumber = meId.split('@')[0]; saveBotConfig(); console.log(`[Bot] Bot number: ${botPhoneNumber}`); }
        } catch {}

        startNotificationPolling();

        // Notify REAL owner that bot is online
        try {
          const ownerNum = getOwnerNumber();
          if (ownerNum) {
            const ownerJid = ownerNum.includes('@') ? ownerNum : ownerNum + '@s.whatsapp.net';
            await sock.sendMessage(ownerJid, {
              text: `✅ *NEXVO Bot Online!*\n\n🤖 Bot is connected and ready.\n📡 Auto-notifications: ACTIVE\n📋 Type *menu* for admin panel.`,
              footer: '🔒 NEXVO Admin',
              templateButtons: [{ index: 1, quickReplyButton: { displayText: '📋 Admin Menu', id: 'menu' } }],
            });
          }
        } catch {}
      }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;
        const from = msg.key.remoteJid || '';
        if (from.includes('@g.us')) continue;

        const phone = from.replace('@s.whatsapp.net', '');
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || '';
        const buttonId = msg.message?.templateButtonReplyMessage?.selectedId || msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId || '';
        const commandText = buttonId || text;
        if (!commandText.trim()) continue;

        console.log(`[Bot] Message from ${phone} ${isOwner(phone) ? '(OWNER)' : '(USER)'}: ${commandText.substring(0, 50)}`);

        if (botConfig.autoReply) {
          const result = handleCommand(commandText, phone);
          await sendBotMessage(from, result, msg);
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

  if (url.pathname === '/') {
    json({
      service: 'NEXVO WhatsApp Bot', version: '10.0.0',
      status: botConnected ? 'connected' : (currentPairingCode ? 'pairing' : (qrCode ? 'qr_ready' : (isConnecting ? 'connecting' : 'disconnected'))),
      phoneNumber: botPhoneNumber, pairingCode: currentPairingCode,
      pairingCodeExpiry: pairingCodeExpiry ? new Date(pairingCodeExpiry).toISOString() : null,
      hasQR: !!qrCode, hasQRImage: !!qrCodeImage, connectionMode,
      autoReply: botConfig.autoReply,
      ownerNumber: getOwnerNumber(),
      notificationsActive: !!notificationPollingTimer,
      dualMode: true,  // Admin + User modes
    });
    return;
  }

  if (url.pathname === '/api/connect' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const phone = body.phoneNumber?.replace(/[^0-9]/g, '');
      const mode: 'pairing' | 'qr' = body.mode === 'qr' ? 'qr' : 'pairing';
      if (mode === 'pairing' && !phone) { json({ success: false, error: 'Phone number required for pairing' }, 400); return; }

      let fPhone = phone || '';
      if (fPhone.startsWith('0')) fPhone = '62' + fPhone.substring(1);
      if (fPhone && !fPhone.startsWith('62')) fPhone = '62' + fPhone;
      botPhoneNumber = fPhone || botPhoneNumber;

      shouldReconnect = false; stopNotificationPolling();
      if (sock) { try { sock.end(undefined); } catch {} sock = null; }
      await new Promise(r => setTimeout(r, 1000));

      botConnected = false; currentPairingCode = null; qrCode = null; qrCodeImage = null;
      isConnecting = false; pairingCodeRequested = false; reconnectAttempts = MAX_RECONNECT;

      clearSession(); await new Promise(r => setTimeout(r, 1500));
      await connectToWhatsApp(fPhone || undefined, mode);

      if (mode === 'pairing') {
        for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 1000)); if (currentPairingCode || botConnected) break; }
      } else {
        for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 1000)); if (qrCode || botConnected) break; }
      }

      if (fPhone) {
        try { execDb(`INSERT OR REPLACE INTO SystemSettings (id, key, value, updatedAt) VALUES ('bot_admin_number_auto', 'bot_admin_number', '${fPhone}', ${Date.now()})`); } catch {}
      }

      json({
        success: true,
        message: botConnected ? 'Bot connected!' : currentPairingCode ? `Pairing code: ${currentPairingCode}` : qrCode ? 'QR Code ready' : 'Connecting...',
        phoneNumber: fPhone, pairingCode: currentPairingCode,
        hasQR: !!qrCode, hasQRImage: !!qrCodeImage, connected: botConnected, mode,
      });
    } catch (e: any) { json({ success: false, error: e.message }, 500); }
    return;
  }

  if (url.pathname === '/api/pairing-code') {
    json({ success: true, pairingCode: currentPairingCode, phoneNumber: botPhoneNumber, connected: botConnected, expired: pairingCodeExpiry ? Date.now() > pairingCodeExpiry : false });
    return;
  }

  if (url.pathname === '/api/qr') { json(qrCode ? { success: true, qr: qrCode } : { success: false, error: 'QR not available' }, qrCode ? 200 : 404); return; }
  if (url.pathname === '/api/qr-image') { json(qrCodeImage ? { success: true, image: qrCodeImage } : { success: false, error: 'QR image not available' }, qrCodeImage ? 200 : 404); return; }
  if (url.pathname === '/api/qr-png') { if (!qrCodeImage) { res.writeHead(404, cors); res.end('QR not available'); return; } img(qrCodeImage); return; }

  if (url.pathname === '/api/disconnect' && req.method === 'POST') {
    shouldReconnect = false; stopNotificationPolling();
    if (sock) { try { sock.end(undefined); } catch {} sock = null; }
    botConnected = false; currentPairingCode = null; qrCode = null; qrCodeImage = null;
    isConnecting = false; pairingCodeRequested = false; reconnectAttempts = MAX_RECONNECT;
    clearSession(); saveBotConfig();
    json({ success: true, message: 'Bot disconnected' }); return;
  }

  if (url.pathname === '/api/config' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      if (body.autoReply !== undefined) botConfig.autoReply = body.autoReply;
      if (body.ownerNumber) botConfig.ownerNumber = body.ownerNumber;
      saveBotConfig(); json({ success: true, config: botConfig });
    } catch (e: any) { json({ success: false, error: e.message }, 500); }
    return;
  }
  if (url.pathname === '/api/config') { json({ success: true, config: botConfig }); return; }

  if (url.pathname === '/api/send' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      if (!body.phone || !body.message) { json({ success: false, error: 'Phone and message required' }, 400); return; }
      if (!sock || !botConnected) { json({ success: false, error: 'Bot not connected' }, 400); return; }
      let jid = body.phone.replace(/[^0-9]/g, ''); if (!jid.includes('@')) jid += '@s.whatsapp.net';
      await sock.sendMessage(jid, { text: body.message }); json({ success: true });
    } catch (e: any) { json({ success: false, error: e.message }, 500); }
    return;
  }

  if (url.pathname === '/api/notify' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      if (!body.event) { json({ success: false, error: 'Event required' }, 400); return; }
      if (!sock || !botConnected) { json({ success: false, error: 'Bot not connected' }, 400); return; }
      await sendOwnerNotification({ event: body.event, data: body.data || {}, createdAt: new Date().toISOString(), read: false });
      json({ success: true });
    } catch (e: any) { json({ success: false, error: e.message }, 500); }
    return;
  }

  if (url.pathname === '/api/broadcast' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      if (!body.message) { json({ success: false, error: 'Message required' }, 400); return; }
      if (!sock || !botConnected) { json({ success: false, error: 'Bot not connected' }, 400); return; }
      let phones: string[] = body.phones && Array.isArray(body.phones) ? body.phones : queryDb('SELECT whatsapp FROM User WHERE isSuspended = 0').map((u: any) => u.whatsapp).filter(Boolean);
      let sent = 0;
      for (const phone of phones) {
        try {
          let jid = phone.replace(/[^0-9]/g, ''); if (!jid.startsWith('62')) continue;
          jid += '@s.whatsapp.net';
          await sock.sendMessage(jid, { text: body.message }); sent++;
          await new Promise(r => setTimeout(r, 1000));
        } catch {}
      }
      json({ success: true, sent, total: phones.length });
    } catch (e: any) { json({ success: false, error: e.message }, 500); }
    return;
  }

  // Set owner number via API
  if (url.pathname === '/api/set-owner' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      if (!body.ownerNumber) { json({ success: false, error: 'ownerNumber required' }, 400); return; }
      botConfig.ownerNumber = body.ownerNumber;
      saveBotConfig();
      // Also save to DB
      execDb(`INSERT OR REPLACE INTO SystemSettings (id, key, value, updatedAt) VALUES ('bot_admin_number', 'bot_admin_number', '${body.ownerNumber}', ${Date.now()})`);
      json({ success: true, ownerNumber: botConfig.ownerNumber });
    } catch (e: any) { json({ success: false, error: e.message }, 500); }
    return;
  }

  json({ error: 'Not found' }, 404);
});

server.listen(PORT, () => {
  loadBotConfig();
  loadMenuImage();
  console.log(`[WA Bot] v10.0.0 DUAL MODE running on port ${PORT}`);
  console.log(`[WA Bot] 🔒 Owner: ${getOwnerNumber() || 'NOT SET'}`);
  console.log(`[WA Bot] 👤 User features: Help, Register, Deposit, Info`);
  console.log(`[WA Bot] 🔑 Admin features: Full Control Panel`);
  console.log(`[WA Bot] Menu image: ${existsSync(MENU_IMAGE_PATH) ? 'LOADED' : 'NOT FOUND'}`);

  if (hasValidSession()) {
    console.log('[WA Bot] Found saved session, reconnecting...');
    connectToWhatsApp(botPhoneNumber || undefined, connectionMode).catch(console.error);
  } else {
    console.log('[WA Bot] No saved session. Use /api/connect to start.');
  }
});
