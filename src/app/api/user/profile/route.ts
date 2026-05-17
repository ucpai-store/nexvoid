import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

const USER_SELECT = {
  id: true,
  userId: true,
  whatsapp: true,
  email: true,
  name: true,
  avatar: true,
  referralCode: true,
  level: true,
  mainBalance: true,
  depositBalance: true,
  profitBalance: true,
  totalDeposit: true,
  totalWithdraw: true,
  totalProfit: true,
  isSuspended: true,
  isVerified: true,
  createdAt: true,
};

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Tidak terautentikasi' },
        { status: 401 }
      );
    }

    // Get full user data
    const fullUser = await db.user.findUnique({
      where: { id: user.id },
      select: USER_SELECT,
    });

    if (!fullUser) {
      return NextResponse.json(
        { success: false, error: 'User tidak ditemukan' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: fullUser });
  } catch (error) {
    console.error('Get user profile error:', error);
    return NextResponse.json(
      { success: false, error: 'Database belum tersedia. Silakan hubungi admin.' },
      { status: 503 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Tidak terautentikasi' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, whatsapp, password, oldPassword, avatar } = body;

    // Build update data object
    const updateData: Record<string, unknown> = {};

    // --- Name update ---
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return NextResponse.json(
          { success: false, error: 'Nama tidak boleh kosong' },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }

    // --- WhatsApp update ---
    if (whatsapp !== undefined) {
      if (typeof whatsapp !== 'string' || !whatsapp.trim()) {
        return NextResponse.json(
          { success: false, error: 'WhatsApp tidak boleh kosong' },
          { status: 400 }
        );
      }
      const trimmedWhatsapp = whatsapp.trim();

      // Check uniqueness if whatsapp is being changed
      if (trimmedWhatsapp !== user.whatsapp) {
        const existing = await db.user.findUnique({
          where: { whatsapp: trimmedWhatsapp },
        });
        if (existing) {
          return NextResponse.json(
            { success: false, error: 'Nomor WhatsApp sudah terdaftar' },
            { status: 409 }
          );
        }
      }
      updateData.whatsapp = trimmedWhatsapp;
    }

    // --- Password update ---
    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < 6) {
        return NextResponse.json(
          { success: false, error: 'Password baru minimal 6 karakter' },
          { status: 400 }
        );
      }
      // Verify old password is provided
      if (!oldPassword) {
        return NextResponse.json(
          { success: false, error: 'Password lama wajib diisi' },
          { status: 400 }
        );
      }
      // Verify old password is correct
      const userData = await db.user.findUnique({
        where: { id: user.id },
        select: { password: true },
      });
      if (!userData) {
        return NextResponse.json(
          { success: false, error: 'User tidak ditemukan' },
          { status: 404 }
        );
      }
      const isValid = await bcrypt.compare(oldPassword, userData.password);
      if (!isValid) {
        return NextResponse.json(
          { success: false, error: 'Password lama salah' },
          { status: 401 }
        );
      }
      // Hash and set new password
      updateData.password = await bcrypt.hash(password, 8);
    }

    // --- Avatar update ---
    if (avatar !== undefined) {
      if (typeof avatar !== 'string') {
        return NextResponse.json(
          { success: false, error: 'Avatar tidak valid' },
          { status: 400 }
        );
      }
      updateData.avatar = avatar;
    }

    // Ensure at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'Tidak ada data yang diperbarui' },
        { status: 400 }
      );
    }

    // Update user record
    await db.user.update({
      where: { id: user.id },
      data: updateData,
    });

    // Return the updated user profile (same format as GET)
    const updatedUser = await db.user.findUnique({
      where: { id: user.id },
      select: USER_SELECT,
    });

    return NextResponse.json({ success: true, data: updatedUser });
  } catch (error) {
    console.error('Update user profile error:', error);
    return NextResponse.json(
      { success: false, error: 'Database belum tersedia. Silakan hubungi admin.' },
      { status: 503 }
    );
  }
}
