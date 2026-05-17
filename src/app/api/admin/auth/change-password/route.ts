import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';

export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { oldPassword, newPassword } = body;

    if (!oldPassword || !newPassword) {
      return NextResponse.json({ success: false, error: 'Password lama dan baru wajib diisi' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ success: false, error: 'Password baru minimal 6 karakter' }, { status: 400 });
    }

    const adminData = await db.admin.findUnique({ where: { id: admin.id } });
    if (!adminData) {
      return NextResponse.json({ success: false, error: 'Admin tidak ditemukan' }, { status: 404 });
    }

    const isValid = await bcrypt.compare(oldPassword, adminData.password);
    if (!isValid) {
      return NextResponse.json({ success: false, error: 'Password lama salah' }, { status: 401 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 8);
    await db.admin.update({
      where: { id: admin.id },
      data: { password: hashedPassword },
    });

    await logAdminAction(admin.id, 'CHANGE_PASSWORD', 'Admin changed their password');

    return NextResponse.json({ success: true, data: { message: 'Password berhasil diubah' } });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
