import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const FALLBACK_WHATSAPP_ADMINS = [
  { id: '1', name: 'CS NEXVO', phone: '6281234567890', order: 1 },
  { id: '2', name: 'Support NEXVO', phone: '6280987654321', order: 2 },
];

// GET - Get active WhatsApp admins (public)
export async function GET() {
  try {
    const admins = await db.whatsAppAdmin.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, phone: true, order: true },
    });
    return NextResponse.json({ success: true, data: admins });
  } catch (error) {
    console.error('Get public WhatsApp admins error:', error);
    // Return fallback data when database is not available
    return NextResponse.json({ success: true, data: FALLBACK_WHATSAPP_ADMINS });
  }
}
