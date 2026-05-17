#!/bin/bash
# Build script for Vercel deployment
# Switches Prisma schema to PostgreSQL, pushes to Neon, then builds

echo "🔧 Switching Prisma schema to PostgreSQL..."
# Remove any existing relationMode line
sed -i '/relationMode/d' prisma/schema.prisma
# Replace sqlite with postgresql
sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
# Add relationMode after the url line
sed -i '/url\s*=.*DATABASE_URL/a\  relationMode = "prisma"' prisma/schema.prisma

echo "🔧 Current schema datasource:"
grep -A 4 "datasource db" prisma/schema.prisma

echo "🔧 Generating Prisma client for PostgreSQL..."
npx prisma generate

echo "🔧 Pushing database schema to Neon PostgreSQL..."
# Use the non-pooled URL for schema migrations if available
if [ -n "$DATABASE_URL_UNPOOLED" ]; then
  echo "Using DATABASE_URL_UNPOOLED for schema push..."
  DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma db push --accept-data-loss || echo "⚠️ Database push failed. Continuing build..."
else
  npx prisma db push --accept-data-loss || echo "⚠️ Database push failed. Continuing build..."
fi

echo "🔧 Seeding admin user if not exists..."
node -e "
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function seed() {
  try {
    const admin = await db.admin.findFirst();
    if (!admin) {
      const hashedPassword = await bcrypt.hash('Admin@2024', 8);
      await db.admin.create({
        data: {
          username: 'admin',
          email: 'admin@nexvo.id',
          password: hashedPassword,
          name: 'Super Admin',
          role: 'super_admin',
        },
      });
      console.log('✅ Admin user created');
    } else {
      console.log('ℹ️ Admin user already exists');
    }
    const settings = await db.systemSettings.count();
    if (settings === 0) {
      const defaultSettings = [
        { key: 'site_name', value: 'NEXVO' },
        { key: 'deposit_fee', value: '500' },
        { key: 'min_withdraw', value: '50000' },
        { key: 'withdraw_fee', value: '10' },
        { key: 'withdraw_open_hour', value: '08' },
        { key: 'withdraw_close_hour', value: '20' },
        { key: 'site_logo', value: '/nexvo-logo.png' },
      ];
      for (const s of defaultSettings) {
        await db.systemSettings.create({ data: s });
      }
      console.log('✅ System settings seeded');
    }
    await db.\$disconnect();
  } catch (e) {
    console.error('Seed error:', e.message);
  }
}
seed();
" || echo "⚠️ Seeding failed, continuing..."

echo "🔧 Building Next.js app..."
npx next build
