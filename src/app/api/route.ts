import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      name: 'NEXVO API',
      version: '1.0.0',
      description: 'Digital Asset Management Platform API',
    },
  });
}
