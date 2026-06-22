import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';

// GET - List all WhatsApp admins
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const admins = await db.whatsAppAdmin.findMany({
      orderBy: { order: 'asc' },
    });

    return NextResponse.json({ success: true, data: admins });
  } catch (error) {
    console.error('Get WhatsApp admins error:', error);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}

// POST - Create a new WhatsApp admin
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { name, phone, isActive, order } = body;

    if (!name || !phone) {
      return NextResponse.json({ success: false, error: 'Nama dan nomor telepon wajib diisi' }, { status: 400 });
    }

    const waAdmin = await db.whatsAppAdmin.create({
      data: {
        name,
        phone,
        isActive: isActive !== undefined ? isActive : true,
        order: order || 0,
      },
    });

    return NextResponse.json({ success: true, data: waAdmin });
  } catch (error) {
    console.error('Create WhatsApp admin error:', error);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}

// PUT - Update a WhatsApp admin
export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, phone, isActive, order } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID wajib diisi' }, { status: 400 });
    }

    const existing = await db.whatsAppAdmin.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Admin tidak ditemukan' }, { status: 404 });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (order !== undefined) updateData.order = order;

    const updated = await db.whatsAppAdmin.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update WhatsApp admin error:', error);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}

// DELETE - Remove a WhatsApp admin
export async function DELETE(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID wajib diisi' }, { status: 400 });
    }

    const existing = await db.whatsAppAdmin.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Admin tidak ditemukan' }, { status: 404 });
    }

    await db.whatsAppAdmin.delete({ where: { id } });

    return NextResponse.json({ success: true, message: 'Admin dihapus' });
  } catch (error) {
    console.error('Delete WhatsApp admin error:', error);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}

