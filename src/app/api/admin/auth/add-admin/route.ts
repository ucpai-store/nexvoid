import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    // Only super_admin can add new admins
    if (admin.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Hanya Super Admin yang bisa menambah admin baru' }, { status: 403 });
    }

    const body = await request.json();
    const { username, email, password, name } = body;

    if (!username || !email || !password || !name) {
      return NextResponse.json({ success: false, error: 'Semua field wajib diisi' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ success: false, error: 'Password minimal 6 karakter' }, { status: 400 });
    }

    // Check if username or email already exists
    const existingAdmin = await db.admin.findFirst({
      where: {
        OR: [{ username }, { email }],
      },
    });

    if (existingAdmin) {
      return NextResponse.json({ 
        success: false, 
        error: existingAdmin.username === username ? 'Username sudah digunakan' : 'Email sudah digunakan' 
      }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 8);
    const newAdmin = await db.admin.create({
      data: {
        username,
        email,
        password: hashedPassword,
        name,
        role: 'admin',
      },
    });

    await logAdminAction(admin.id, 'ADD_ADMIN', `Created new admin: ${username} (${email})`);

    return NextResponse.json({
      success: true,
      data: {
        id: newAdmin.id,
        username: newAdmin.username,
        email: newAdmin.email,
        name: newAdmin.name,
        role: newAdmin.role,
      },
    });
  } catch (error) {
    console.error('Add admin error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    if (admin.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Hanya Super Admin yang bisa mengubah admin' }, { status: 403 });
    }

    const body = await request.json();
    const { id, action } = body;

    if (!id || !action) {
      return NextResponse.json({ success: false, error: 'ID dan action wajib diisi' }, { status: 400 });
    }

    if (action === 'unlock') {
      const targetAdmin = await db.admin.findUnique({ where: { id } });
      if (!targetAdmin) {
        return NextResponse.json({ success: false, error: 'Admin tidak ditemukan' }, { status: 404 });
      }

      await db.admin.update({
        where: { id },
        data: { lockedUntil: null, loginAttempts: 0 },
      });

      await logAdminAction(admin.id, 'UNLOCK_ADMIN', `Unlocked admin: ${targetAdmin.username}`);

      return NextResponse.json({ success: true, message: `Admin ${targetAdmin.username} berhasil di-unlock` });
    }

    return NextResponse.json({ success: false, error: 'Action tidak valid' }, { status: 400 });
  } catch (error) {
    console.error('Update admin error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    if (admin.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Hanya Super Admin yang bisa menghapus admin' }, { status: 403 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID admin wajib diisi' }, { status: 400 });
    }

    if (id === admin.id) {
      return NextResponse.json({ success: false, error: 'Tidak bisa menghapus akun sendiri' }, { status: 400 });
    }

    const targetAdmin = await db.admin.findUnique({ where: { id } });
    if (!targetAdmin) {
      return NextResponse.json({ success: false, error: 'Admin tidak ditemukan' }, { status: 404 });
    }

    await db.admin.delete({ where: { id } });

    await logAdminAction(admin.id, 'DELETE_ADMIN', `Deleted admin: ${targetAdmin.username} (${targetAdmin.email})`);

    return NextResponse.json({ success: true, message: `Admin ${targetAdmin.username} berhasil dihapus` });
  } catch (error) {
    console.error('Delete admin error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
