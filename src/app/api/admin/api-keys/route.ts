import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';
import { generateApiKeyRaw } from '@/lib/api-key';
import bcrypt from 'bcryptjs';

/* ───────── Helpers ───────── */
async function hashAndGenerate(): Promise<{ rawKey: string; keyHash: string; keyPrefix: string }> {
  const rawKey = generateApiKeyRaw();
  const keyHash = await bcrypt.hash(rawKey, 10);
  const keyPrefix = rawKey.substring(0, 12) + '...';
  return { rawKey, keyHash, keyPrefix };
}

/* ───────── GET - List all API keys ───────── */
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const keys = await db.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: keys });
  } catch (error) {
    console.error('List API keys error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

/* ───────── POST - Generate new API key ───────── */
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { name, customKey } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Nama API key wajib diisi' }, { status: 400 });
    }

    // Support custom API key or auto-generate one
    let rawKey: string;
    let keyHash: string;
    let keyPrefix: string;

    if (customKey && typeof customKey === 'string' && customKey.trim().length >= 20) {
      // Use the custom API key provided by admin
      rawKey = customKey.trim();
      keyHash = await bcrypt.hash(rawKey, 10);
      keyPrefix = rawKey.substring(0, 12) + '...';
    } else {
      // Auto-generate an API key
      const generated = await hashAndGenerate();
      rawKey = generated.rawKey;
      keyHash = generated.keyHash;
      keyPrefix = generated.keyPrefix;
    }

    const apiKey = await db.apiKey.create({
      data: {
        name: name.trim(),
        keyHash,
        keyPrefix,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    await logAdminAction(admin.id, 'CREATE_API_KEY', `Created API key: ${name.trim()}`);

    return NextResponse.json({
      success: true,
      data: {
        ...apiKey,
        key: rawKey, // Full key — only returned once!
      },
    });
  } catch (error) {
    console.error('Create API key error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

/* ───────── PUT - Toggle active/inactive ───────── */
export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { id, isActive } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID API key wajib diisi' }, { status: 400 });
    }

    const existing = await db.apiKey.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'API key tidak ditemukan' }, { status: 404 });
    }

    const updated = await db.apiKey.update({
      where: { id },
      data: isActive !== undefined ? { isActive } : {},
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await logAdminAction(admin.id, 'TOGGLE_API_KEY', `${isActive ? 'Activated' : 'Deactivated'} API key: ${existing.name}`);

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update API key error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

/* ───────── DELETE - Revoke/delete API key ───────── */
export async function DELETE(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID API key wajib diisi' }, { status: 400 });
    }

    const existing = await db.apiKey.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'API key tidak ditemukan' }, { status: 404 });
    }

    await db.apiKey.delete({ where: { id } });

    await logAdminAction(admin.id, 'DELETE_API_KEY', `Deleted API key: ${existing.name}`);

    return NextResponse.json({ success: true, data: { message: 'API key berhasil dihapus' } });
  } catch (error) {
    console.error('Delete API key error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
