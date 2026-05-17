import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    // Return ALL products including inactive/stopped, sorted by price ascending
    const products = await db.product.findMany({
      orderBy: { price: 'asc' },
    });

    return NextResponse.json({ success: true, data: products });
  } catch (error) {
    console.error('Get admin products error:', error);
    return NextResponse.json({ success: true, data: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    let { name, price, duration, estimatedProfit, quota, description, banner, profitRate, isActive } = body;

    if (!name || !price || !duration || !quota) {
      return NextResponse.json({ success: false, error: 'Field wajib: name, price, duration, quota' }, { status: 400 });
    }

    // Auto-calculate: estimatedProfit = price × profitRate / 100
    const parsedPrice = parseFloat(String(price));
    const parsedProfitRate = parseFloat(String(profitRate || 0));
    if (parsedProfitRate > 0) {
      estimatedProfit = Math.floor(parsedPrice * (parsedProfitRate / 100));
    }
    if (!estimatedProfit && parsedProfitRate <= 0) {
      estimatedProfit = 0;
    }

    const product = await db.product.create({
      data: {
        name,
        price: parsedPrice,
        duration: parseInt(String(duration)),
        estimatedProfit: parseFloat(String(estimatedProfit || 0)),
        quota: parseInt(String(quota)),
        description: description || '',
        banner: banner || '',
        profitRate: parsedProfitRate,
        isActive: isActive !== undefined ? isActive : true,
        isStopped: false,
      },
    });

    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    console.error('Create product error:', error);
    return NextResponse.json({ success: false, error: 'Gagal membuat produk. Coba lagi.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, price, duration, estimatedProfit, quota, description, banner, profitRate, isActive, isStopped } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID produk wajib diisi' }, { status: 400 });
    }

    const existingProduct = await db.product.findUnique({ where: { id } });
    if (!existingProduct) {
      return NextResponse.json({ success: false, error: 'Produk tidak ditemukan' }, { status: 404 });
    }

    const data: {
      name?: string; price?: number; duration?: number; estimatedProfit?: number;
      quota?: number; description?: string; banner?: string; profitRate?: number;
      isActive?: boolean; isStopped?: boolean;
    } = {};

    if (name !== undefined) data.name = name;
    if (price !== undefined) data.price = parseFloat(String(price));
    if (duration !== undefined) data.duration = parseInt(String(duration));
    if (quota !== undefined) data.quota = parseInt(String(quota));
    if (description !== undefined) data.description = description;
    if (banner !== undefined) data.banner = banner;
    if (isActive !== undefined) data.isActive = isActive;
    if (isStopped !== undefined) data.isStopped = isStopped;

    // Auto-calculate estimatedProfit when profitRate or price changes
    if (profitRate !== undefined) {
      data.profitRate = parseFloat(String(profitRate));
    }
    // Recalculate estimatedProfit based on current or new price + profitRate
    const effectivePrice = data.price !== undefined ? data.price : existingProduct.price;
    const effectiveProfitRate = data.profitRate !== undefined ? data.profitRate : existingProduct.profitRate;
    if (effectiveProfitRate > 0) {
      data.estimatedProfit = Math.floor(effectivePrice * (effectiveProfitRate / 100));
    } else if (estimatedProfit !== undefined) {
      data.estimatedProfit = parseFloat(String(estimatedProfit));
    }

    const updatedProduct = await db.product.update({ where: { id }, data });

    return NextResponse.json({ success: true, data: updatedProduct });
  } catch (error) {
    console.error('Update product error:', error);
    return NextResponse.json({ success: false, error: 'Gagal memperbarui produk. Coba lagi.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    let id: string | null = null;
    try {
      const body = await request.json();
      id = body.id || null;
    } catch {
      const { searchParams } = new URL(request.url);
      id = searchParams.get('id');
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID produk wajib diisi' }, { status: 400 });
    }

    const existingProduct = await db.product.findUnique({ where: { id } });

    if (!existingProduct) {
      return NextResponse.json({ success: false, error: 'Produk tidak ditemukan' }, { status: 404 });
    }

    // Admin full control: delete product and all related data (cascade)
    // First delete related ProfitLogs, then Purchases, then the Product
    await db.$transaction(async (tx) => {
      // Get all purchases for this product
      const purchases = await tx.purchase.findMany({
        where: { productId: id },
        select: { id: true },
      });

      if (purchases.length > 0) {
        // Delete all profit logs for these purchases
        await tx.profitLog.deleteMany({
          where: { purchaseId: { in: purchases.map((p) => p.id) } },
        });

        // Delete all purchases for this product
        await tx.purchase.deleteMany({
          where: { productId: id },
        });
      }

      // Now delete the product itself
      await tx.product.delete({ where: { id } });
    });

    return NextResponse.json({ success: true, data: { message: 'Produk berhasil dihapus' } });
  } catch (error) {
    console.error('Delete product error:', error);
    return NextResponse.json({ success: false, error: 'Gagal menghapus produk. Coba lagi.' }, { status: 500 });
  }
}
