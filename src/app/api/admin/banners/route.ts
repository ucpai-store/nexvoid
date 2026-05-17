import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const banners = await db.banner.findMany({
      orderBy: { order: 'asc' },
    });

    return NextResponse.json({ success: true, data: banners });
  } catch (error) {
    console.error('Get banners error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { title, subtitle, description, ctaText, ctaLink, image, order, isActive } = body;

    if (!title) {
      return NextResponse.json({ success: false, error: 'Title wajib diisi' }, { status: 400 });
    }

    const banner = await db.banner.create({
      data: {
        title,
        subtitle: subtitle || '',
        description: description || '',
        ctaText: ctaText || '',
        ctaLink: ctaLink || '',
        image,
        order: order || 0,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    return NextResponse.json({ success: true, data: banner });
  } catch (error) {
    console.error('Create banner error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { id, title, subtitle, description, ctaText, ctaLink, image, order, isActive } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID banner wajib diisi' }, { status: 400 });
    }

    const existingBanner = await db.banner.findUnique({ where: { id } });
    if (!existingBanner) {
      return NextResponse.json({ success: false, error: 'Banner tidak ditemukan' }, { status: 404 });
    }

    const data: {
      title?: string; subtitle?: string; description?: string;
      ctaText?: string; ctaLink?: string; image?: string;
      order?: number; isActive?: boolean;
    } = {};

    if (title !== undefined) data.title = title;
    if (subtitle !== undefined) data.subtitle = subtitle;
    if (description !== undefined) data.description = description;
    if (ctaText !== undefined) data.ctaText = ctaText;
    if (ctaLink !== undefined) data.ctaLink = ctaLink;
    if (image !== undefined) data.image = image;
    if (order !== undefined) data.order = parseInt(String(order));
    if (isActive !== undefined) data.isActive = isActive;

    const updatedBanner = await db.banner.update({ where: { id }, data });

    return NextResponse.json({ success: true, data: updatedBanner });
  } catch (error) {
    console.error('Update banner error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    // Read id from JSON body (client sends it in body)
    let id: string | null = null;
    try {
      const body = await request.json();
      id = body.id || null;
    } catch {
      // Body is not JSON, try searchParams as fallback
    }
    if (!id) {
      const { searchParams } = new URL(request.url);
      id = searchParams.get('id');
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID banner wajib diisi' }, { status: 400 });
    }

    const existingBanner = await db.banner.findUnique({ where: { id } });
    if (!existingBanner) {
      return NextResponse.json({ success: false, error: 'Banner tidak ditemukan' }, { status: 404 });
    }

    await db.banner.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { message: 'Banner berhasil dihapus' } });
  } catch (error) {
    console.error('Delete banner error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
