#!/bin/bash
# ============================================================================
#  NEXVO - FIX ADMIN v2 (No sqlite3 CLI needed)
# ----------------------------------------------------------------------------
#  Versi ini pakai Prisma Client langsung (lebih reliable)
# ============================================================================
set +e

PROJECT="/home/nexvo"

echo "╔══════════════════════════════════════════════════════╗"
echo "║   NEXVO - FIX ADMIN v2 (via Prisma)                 ║"
echo "╚══════════════════════════════════════════════════════╝"

[ "$EUID" -ne 0 ] && { echo "Run as root: sudo bash $0"; exit 1; }

export PATH="/root/.bun/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" 2>/dev/null

cd "$PROJECT" 2>/dev/null || { echo "✗ $PROJECT tidak ada!"; exit 1; }

# Cari database file
echo ""
echo "=== Cari database ==="
DB=$(find /home/nexvo -name "*.db" -type f 2>/dev/null | head -1)
if [ -z "$DB" ]; then
  echo "Database belum ada. Running prisma db push..."
  bunx prisma db push --accept-data-loss 2>&1 | tail -5
  DB=$(find /home/nexvo -name "*.db" -type f 2>/dev/null | head -1)
fi
[ -z "$DB" ] && { echo "✗ Database tidak ditemukan"; exit 1; }
echo "✓ Database: $DB"
echo "  Size: $(du -h "$DB" | cut -f1)"

# Pastikan .env ada dengan DATABASE_URL yang benar
echo ""
echo "=== Cek .env ==="
if [ ! -f ".env" ]; then
  if [ -f ".env.production" ]; then
    cp .env.production .env
    echo "✓ Copy .env.production ke .env"
  else
    # Buat .env default
    echo "DATABASE_URL=\"file:$DB\"" > .env
    echo "JWT_SECRET=\"nexvo-jwt-secret-$(date +%s)\"" >> .env
    echo "✓ Buat .env default"
  fi
else
  echo "✓ .env sudah ada"
fi

# Pastikan DATABASE_URL di .env menunjuk ke file yang benar
echo ""
echo "=== Verifikasi DATABASE_URL ==="
DB_URL=$(grep "^DATABASE_URL" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
echo "  DATABASE_URL = $DB_URL"

# Extract path dari DATABASE_URL
DB_PATH_IN_ENV=$(echo "$DB_URL" | sed 's|^file:||')
if [ ! -f "$DB_PATH_IN_ENV" ]; then
  echo "  ⚠ Path di DATABASE_URL tidak match dengan file DB yang ditemukan"
  echo "  Update DATABASE_URL ke: file:$DB"
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"file:$DB\"|" .env
  echo "  ✓ .env diupdate"
fi

# Generate prisma client
echo ""
echo "=== Generate Prisma Client ==="
bunx prisma generate 2>&1 | tail -3

# Cek bcryptjs terinstall
echo ""
echo "=== Cek dependencies ==="
if [ ! -d "node_modules/bcryptjs" ]; then
  echo "Install bcryptjs..."
  bun add bcryptjs 2>&1 | tail -3
fi
echo "✓ Dependencies OK"

# Download create-admin.js dari GitHub
echo ""
echo "=== Download create-admin.js ==="
curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/create-admin.js" -o create-admin.js
chmod +x create-admin.js
[ -f "create-admin.js" ] && echo "✓ create-admin.js ready" || { echo "✗ Gagal download"; exit 1; }

# Run create-admin.js dengan bun
echo ""
echo "=== Jalankan create-admin.js ==="
bun run create-admin.js 2>&1

# Jika bun gagal, coba dengan node
if [ $? -ne 0 ]; then
  echo ""
  echo "Bun gagal, coba dengan node..."
  node create-admin.js 2>&1
fi

# Restart PM2 untuk clear cache
echo ""
echo "=== Restart PM2 ==="
pm2 restart nexvo-web --update-env 2>/dev/null
sleep 5

# Verify PM2 status
WEB_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p.get('name') == 'nexvo-web':
            print(p.get('pm2_env', {}).get('status', ''))
            break
except:
    print('error')
" 2>/dev/null)
echo "✓ nexvo-web: $WEB_STATUS"

# Test login via API
echo ""
echo "=== Test login via API (lokal) ==="
sleep 3

RESPONSE=$(curl -s -X POST http://127.0.0.1:3000/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@2024"}' \
  --max-time 15 2>&1)

echo "Response:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  ✅ LOGIN ADMIN BERHASIL!                            ║"
  echo "╠══════════════════════════════════════════════════════╣"
  echo "║  URL:      https://nexvo.id/#admin-login             ║"
  echo "║  Username: admin                                     ║"
  echo "║  Password: Admin@2024                                ║"
  echo "╚══════════════════════════════════════════════════════╝"
else
  echo "⚠ Login masih gagal. Debug:"
  echo "  1. Cek log: pm2 logs nexvo-web --lines 50"
  echo "  2. Cek DB: bun run create-admin.js (lihat output)"
  echo "  3. Cek .env: cat .env | grep DATABASE_URL"
fi
