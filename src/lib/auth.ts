import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { db } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'nexvo-secret-key-2024';

export interface JWTPayload {
  userId: string;
  type: 'user' | 'admin';
  role?: string;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

export async function getUserFromRequest(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  
  const payload = verifyToken(token);
  if (!payload || payload.type !== 'user') return null;
  
  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true, userId: true, whatsapp: true, name: true, avatar: true,
      referralCode: true, level: true, mainBalance: true, depositBalance: true, profitBalance: true,
      totalDeposit: true, totalWithdraw: true, totalProfit: true, isSuspended: true,
      isVerified: true, email: true,
      createdAt: true,
    },
  });
  
  return user;
}

export async function getAdminFromRequest(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  
  const payload = verifyToken(token);
  if (!payload || payload.type !== 'admin') return null;
  
  const admin = await db.admin.findUnique({
    where: { id: payload.userId },
    select: { id: true, username: true, email: true, name: true, role: true, lastLogin: true },
  });
  
  return admin;
}

export async function logAdminAction(adminId: string, action: string, detail: string = '', ip: string = '') {
  try {
    await db.adminLog.create({
      data: { adminId, action, detail, ip },
    });
  } catch (error) {
    console.error('Failed to log admin action:', error);
  }
}

export function generateUserId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'NXV-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function maskWhatsApp(number: string | null | undefined): string {
  if (!number) return '-';
  if (number.length < 6) return number;
  return number.substring(0, 4) + '****' + number.substring(number.length - 3);
}

export function formatRupiah(amount: number | undefined | null): string {
  if (amount == null || isNaN(amount)) return 'Rp0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('id-ID').format(num);
}

export function timeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}h yang lalu`;
  if (hours > 0) return `${hours}j yang lalu`;
  if (minutes > 0) return `${minutes}m yang lalu`;
  return `${seconds}d yang lalu`;
}

