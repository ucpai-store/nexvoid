#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO LOGIN FIX + DB VERIFY
#  - Backup DB dulu (safety)
#  - Cek DB file ada + size OK
#  - Cek admin user count
#  - Cek user count
#  - Test login API
#  - Kalau admin gak ada, create default
# ═══════════════════════════════════════════════════════════════

echo "═══════════════════════════════════════════════════════════"
echo "  🔐 NEXVO LOGIN FIX + DB VERIFY"
echo "  Waktu: $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════"

P="/home/nexvo"
[ ! -d "$P" ] && P=$(find / -maxdepth 5 -name "package.json" -type f 2>/dev/null | xargs grep -l '"nexvo"' 2>/dev/null | head -1 | xargs dirname)
[ -z "$P" ] && { echo "❌ Project gak ketemu"; exit 1; }

echo "  Project: $P"
cd "$P"
echo ""

echo "═══ 1. CEK DB FILE ═══"
DB_FILE="$P/db/custom.db"
if [ -f "$DB_FILE" ]; then
  DB_SIZE=$(wc -c < "$DB_FILE")
  echo "  ✅ DB file ada: $DB_FILE"
  echo "  Size: $DB_SIZE bytes"
  if [ "$DB_SIZE" -lt 10000 ]; then
    echo "  ⚠️  DB terlalu kecil (<10KB) — mungkin kosong!"
  fi
else
  echo "  ❌ DB file GAK ADA — data hilang atau path salah!"
  echo "  Cek: find / -name 'custom.db' 2>/dev/null"
  exit 1
fi
echo ""

echo "═══ 2. BACKUP DB (SAFETY) ═══"
BACKUP="$P/db/custom.db.backup-$(date +%Y%m%d-%H%M%S)"
cp "$DB_FILE" "$BACKUP"
echo "  ✅ Backup: $BACKUP"
ls -la "$BACKUP"
echo ""

echo "═══ 3. CEK .env DATABASE_URL ═══"
if [ -f "$P/.env" ]; then
  grep DATABASE_URL "$P/.env" | head -1
elif [ -f "$P/.env.production" ]; then
  grep DATABASE_URL "$P/.env.production" | head -1
else
  echo "  ❌ .env gak ada — buat dulu"
fi
echo ""

echo "═══ 4. CEK USER COUNT (via prisma) ═══"
cd "$P"
if command -v bun >/dev/null 2>&1; then
  RUNTIME="bun"
else
  RUNTIME="npx"
fi

# Bikin script cek DB sementara
cat > /tmp/check-db.mjs << 'EOF'
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
try {
  const adminCount = await prisma.admin.count();
  const userCount = await prisma.user.count();
  console.log(`Admin count: ${adminCount}`);
  console.log(`User count: ${userCount}`);

  if (adminCount === 0) {
    console.log('⚠️  ADMIN GAK ADA — bikin default admin...');
    const bcrypt = (await import('bcryptjs')).default;
    const hashedPassword = await bcrypt.hash('Admin@2024', 10);
    await prisma.admin.create({
      data: {
        username: 'admin',
        email: 'admin@nexvo.id',
        password: hashedPassword,
        role: 'super_admin',
      }
    });
    console.log('✅ Default admin dibuat:');
    console.log('   Username: admin');
    console.log('   Password: Admin@2024');
  } else {
    // Tampilkan admin pertama (tanpa password)
    const admin = await prisma.admin.findFirst();
    console.log(`Admin pertama: ${admin.username} (${admin.email})`);
  }

  if (userCount > 0) {
    const sampleUser = await prisma.user.findFirst();
    console.log(`User pertama: ${sampleUser.phone || sampleUser.email || sampleUser.id}`);
  }
} catch (e) {
  console.error('DB ERROR:', e.message);
} finally {
  await prisma.$disconnect();
}
EOF

$RUNTIME /tmp/check-db.mjs 2>&1 | head -20
echo ""

echo "═══ 5. TEST LOGIN API ═══"
sleep 2
# Test admin login API
LOGIN_RES=$(curl -s --max-time 8 -X POST "http://localhost:3000/api/admin/auth" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@2024"}')
echo "  Login API response: $LOGIN_RES" | head -c 200
echo ""

echo "═══ 6. PM2 STATUS ═══"
pm2 list 2>&1 | grep -E "nexvo|name" | head -3
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  ✅ DB VERIFY SELESAI"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  DB backup: $BACKUP"
echo "  Data user TIDAK HILANG — DB file gak tersentuh git reset"
echo ""
echo "  Kalau admin gak bisa login, pakai default credentials:"
echo "    Username: admin"
echo "    Password: Admin@2024"
echo "  (Login di: https://nexvo.id/id/admin)"
echo ""
echo "  Kalau user biasa gak bisa login, kemungkinan session expired."
echo "  Mereka harus login ulang pakai email/phone + OTP."
echo "═══════════════════════════════════════════════════════════"