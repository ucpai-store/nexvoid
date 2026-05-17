import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';

// GET - List all WhatsApp admins
export async function GET(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const admins = await db.whatsAppAdmin.findMany({
      orderBy: { order: 'asc' },
    });

    return NextResponse.json({ success: true, data: admins });
  } catch (error) {
    console.error('Get WhatsApp admins error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST - Create new WhatsApp admin
export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await req.json();
    const { name, phone, isActive, order } = body;

    if (!name || !phone) {
      return NextResponse.json({ success: false, error: 'Nama dan nomor telepon wajib diisi' }, { status: 400 });
    }

    const wa = await db.whatsAppAdmin.create({
      data: {
        name,
        phone,
        isActive: isActive !== undefined ? isActive : true,
        order: order || 0,
      },
    });

    return NextResponse.json({ success: true, data: wa });
  } catch (error) {
    console.error('Create WhatsApp admin error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT - Update WhatsApp admin
export async function PUT(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await req.json();
    const { id, name, phone, isActive, order } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID wajib diisi' }, { status: 400 });
    }

    const existing = await db.whatsAppAdmin.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'WhatsApp admin tidak ditemukan' }, { status: 404 });
    }

    const data: {
      name?: string; phone?: string; isActive?: boolean; order?: number;
    } = {};

    if (name !== undefined) data.name = name;
    if (phone !== undefined) data.phone = phone;
    if (isActive !== undefined) data.isActive = isActive;
    if (order !== undefined) data.order = order;

    const wa = await db.whatsAppAdmin.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, data: wa });
  } catch (error) {
    console.error('Update WhatsApp admin error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE - Delete WhatsApp admin
export async function DELETE(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    let id: string | null = null;
    try {
      const body = await req.json();
      id = body.id || null;
    } catch {
      // Body is not JSON, try searchParams as fallback
    }
    if (!id) {
      const { searchParams } = new URL(req.url);
      id = searchParams.get('id');
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID wajib diisi' }, { status: 400 });
    }

    const existing = await db.whatsAppAdmin.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'WhatsApp admin tidak ditemukan' }, { status: 404 });
    }

    await db.whatsAppAdmin.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { message: 'WhatsApp admin berhasil dihapus' } });
  } catch (error) {
    console.error('Delete WhatsApp admin error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
