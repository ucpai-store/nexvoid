import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { signToken, logAdminAction } from '@/lib/auth';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({
        success: false,
        error: 'Username/Email dan password wajib diisi'
      }, { status: 400 });
    }

    // Find admin by username or email
    const admin = await db.admin.findFirst({
      where: {
        OR: [
          { username: username },
          { email: username },
        ],
      },
    });

    if (!admin) {
      return NextResponse.json({
        success: false,
        error: 'Akun admin tidak ditemukan'
      }, { status: 401 });
    }

    // Check if account is locked
    if (admin.lockedUntil && new Date(admin.lockedUntil) > new Date()) {
      const remainingMin = Math.ceil((new Date(admin.lockedUntil).getTime() - Date.now()) / 60000);
      return NextResponse.json({
        success: false,
        error: `Akun terkunci. Coba lagi dalam ${remainingMin} menit.`
      }, { status: 423 });
    }

    // Verify password
    let isValidPassword = false;
    try {
      isValidPassword = await bcrypt.compare(password, admin.password);
    } catch (e) {
      console.error('Bcrypt error:', e);
      return NextResponse.json({ success: false, error: 'Terjadi kesalahan verifikasi' }, { status: 500 });
    }

    if (!isValidPassword) {
      // Increment login attempts
      const newAttempts = admin.loginAttempts + 1;
      const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS;

      await db.admin.update({
        where: { id: admin.id },
        data: {
          loginAttempts: newAttempts,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60000) : admin.lockedUntil,
        },
      });

      // Log failed attempt
      await logAdminAction(admin.id, 'LOGIN_FAILED', `Attempt ${newAttempts}/${MAX_LOGIN_ATTEMPTS}`);

      if (shouldLock) {
        return NextResponse.json({
          success: false,
          error: `Akun terkunci selama ${LOCK_DURATION_MINUTES} menit karena terlalu banyak percobaan gagal.`
        }, { status: 423 });
      }

      const remaining = MAX_LOGIN_ATTEMPTS - newAttempts;
      return NextResponse.json({
        success: false,
        error: `Password salah. Sisa percobaan: ${remaining}`
      }, { status: 401 });
    }

    // Check role - accept both 'super_admin' and 'superadmin' (legacy) and 'admin'
    const validRoles = ['admin', 'super_admin', 'superadmin'];
    if (!validRoles.includes(admin.role)) {
      return NextResponse.json({
        success: false,
        error: 'Akses ditolak. Role tidak valid.'
      }, { status: 403 });
    }

    // Normalize role to 'super_admin' if it's the legacy 'superadmin'
    const normalizedRole = admin.role === 'superadmin' ? 'super_admin' : admin.role;

    // Reset login attempts and update last login
    await db.admin.update({
      where: { id: admin.id },
      data: {
        loginAttempts: 0,
        lockedUntil: null,
        lastLogin: new Date(),
        ...(admin.role === 'superadmin' ? { role: 'super_admin' } : {}),
      },
    });

    // Log successful login
    await logAdminAction(admin.id, 'LOGIN_SUCCESS', 'Admin logged in successfully');

    const token = signToken({
      userId: admin.id,
      type: 'admin',
      role: normalizedRole,
    });

    return NextResponse.json({
      success: true,
      data: {
        token,
        admin: {
          id: admin.id,
          username: admin.username,
          email: admin.email,
          name: admin.name,
          role: normalizedRole,
          lastLogin: admin.lastLogin,
        },
      },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json({
      success: false,
      error: 'Database belum tersedia. Silakan hubungi admin.'
    }, { status: 503 });
  }
}

