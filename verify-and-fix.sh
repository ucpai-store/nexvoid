#!/bin/bash
# ============================================================================
#  NEXVO - VERIFY ALL SYSTEMS + FIX ADMIN ACCOUNT
# ----------------------------------------------------------------------------
#  Cek semua sistem NEXVO + fix masalah admin account
# ============================================================================
set +e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'
log()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERR]${NC} $1"; }
step() { echo -e "\n${CYAN}==== $1 ====${NC}"; }

PROJECT_DIR="/home/nexvo"

echo -e "${CYAN}"
echo "============================================================"
echo "   NEXVO SYSTEM VERIFICATION + FIX"
echo "   $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
  err "Harus jalan sebagai root"
  exit 1
fi

export BUN_INSTALL="/root/.bun"
export PATH="$BUN_INSTALL/bin:/usr/local/bin:/usr/bin:/usr/local/sbin:$PATH"

cd "$PROJECT_DIR"

# ============================================================================
# STEP 1: Cek PM2 status semua proses
# ============================================================================
step "1/8  Cek PM2 status"

pm2 list
echo ""

# Cek setiap proses kritikal
for proc in nexvo-web nexvo-cron; do
  STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p.get('name') == '$proc':
            print(p.get('pm2_env', {}).get('status', ''))
            break
except:
    print('not_found')
" 2>/dev/null)
  
  if [ "$STATUS" = "online" ]; then
    log "$proc: ONLINE"
  else
    err "$proc: $STATUS - RESTARTING..."
    if [ "$proc" = "nexvo-web" ] && [ -d .next/standalone ]; then
      cd .next/standalone
      [ -f ../.env.production ] && cp ../.env.production .env
      [ -f ../.env ] && cp ../.env .env
      pm2 delete nexvo-web 2>/dev/null
      PORT=3000 NODE_ENV=production pm2 start server.js --name nexvo-web --update-env
      sleep 5
      cd "$PROJECT_DIR"
    elif [ "$proc" = "nexvo-cron" ]; then
      pm2 delete nexvo-cron 2>/dev/null
      pm2 start "bun run cron-service.ts" --name nexvo-cron --update-env
      sleep 3
    fi
  fi
done

pm2 save
echo ""
echo "  PM2 final:"
pm2 list

# ============================================================================
# STEP 2: Cek port listeners (80, 443, 3000)
# ============================================================================
step "2/8  Cek port listeners"

echo "  Port listeners:"
ss -tlnp | grep -E ':(80|443|3000) '

PORT80=$(ss -tlnp | grep ':80 ' | head -1)
PORT443=$(ss -tlnp | grep ':443 ' | head -1)
PORT3000=$(ss -tlnp | grep ':3000 ' | head -1)

[ -n "$PORT80" ] && log "Port 80: $PORT80" || err "Port 80: TIDAK ADA listener"
[ -n "$PORT443" ] && log "Port 443: $PORT443" || warn "Port 443: TIDAK ADA (SSL belum setup)"
[ -n "$PORT3000" ] && log "Port 3000: $PORT3000" || err "Port 3000: NEXVO belum jalan"

# ============================================================================
# STEP 3: Cek HTTP response
# ============================================================================
step "3/8  Cek HTTP response"

echo "  Test port 3000 (NEXVO langsung):"
HTTP3000=$(curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ 2>&1)
echo "    HTTP $HTTP3000"

echo "  Test port 80 (via Nginx):"
HTTP80=$(curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:80/ 2>&1)
echo "    HTTP $HTTP80"

echo "  Test port 443 (HTTPS):"
HTTP443=$(curl -s -m 10 -o /dev/null -w "%{http_code}" -k https://127.0.0.1:443/ 2>&1)
echo "    HTTP $HTTP443"

if [ "$HTTP3000" = "200" ] || [ "$HTTP3000" = "307" ]; then
  log "NEXVO respond di port 3000"
else
  err "NEXVO tidak respond di port 3000. Cek log:"
  pm2 logs nexvo-web --nostream --lines 30
fi

# ============================================================================
# STEP 4: Cek database & admin account
# ============================================================================
step "4/8  Cek database & admin account"

echo "  Database files:"
find /home/z /home/nexvo -name "*.db" 2>/dev/null | while read db; do
  SIZE=$(du -h "$db" | awk '{print $1}')
  echo "    $db ($SIZE)"
done

echo ""
echo "  Cek admin account di database..."
ADMIN_CHECK=$(bunx prisma db execute --stdin << 'SQL' 2>&1
SELECT COUNT(*) as count FROM Admin;
SQL
)
echo "  Admin count: $ADMIN_CHECK"

# Cek dengan cara lain kalau pertama gagal
echo ""
echo "  Cek via Node.js script..."
cat > /tmp/check-admin.ts << 'EOF'
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const adminCount = await prisma.admin.count();
  console.log(`Admin count: ${adminCount}`);
  if (adminCount === 0) {
    console.log('NO ADMIN FOUND - will create one');
  } else {
    const admins = await prisma.admin.findMany({ select: { username: true, email: true, role: true } });
    console.log('Admins:', JSON.stringify(admins, null, 2));
  }
  const userCount = await prisma.user.count();
  console.log(`User count: ${userCount}`);
  const packageCount = await prisma.product.count();
  console.log(`Product count: ${packageCount}`);
  const settingsCount = await prisma.systemSettings.count();
  console.log(`System settings count: ${settingsCount}`);
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
EOF

bun run /tmp/check-admin.ts 2>&1

# ============================================================================
# STEP 5: FIX - Create admin account kalau belum ada
# ============================================================================
step "5/8  FIX: Create admin account"

cat > /tmp/seed-admin.ts << 'EOF'
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking admin account...');
  
  const existingAdmin = await prisma.admin.findFirst();
  if (existingAdmin) {
    console.log(`Admin already exists: ${existingAdmin.username} (${existingAdmin.email})`);
    console.log('Skipping admin creation.');
    return;
  }
  
  console.log('No admin found. Creating default admin...');
  const hashedPassword = await bcrypt.hash('Admin@2024', 8);
  
  const admin = await prisma.admin.create({
    data: {
      username: 'admin',
      email: 'admin@nexvo.id',
      password: hashedPassword,
      name: 'Super Admin',
      role: 'super_admin',
    },
  });
  
  console.log(`Admin created successfully:`);
  console.log(`  Username: ${admin.username}`);
  console.log(`  Email: ${admin.email}`);
  console.log(`  Role: ${admin.role}`);
  console.log(`  Password: Admin@2024`);
}

main()
  .catch(e => { console.error('Error:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
EOF

bun run /tmp/seed-admin.ts 2>&1

# ============================================================================
# STEP 6: Seed system settings + products kalau belum ada
# ============================================================================
step "6/8  Seed system settings & products (kalau belum ada)"

# Cek & seed system settings
cat > /tmp/seed-settings.ts << 'EOF'
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const settingsCount = await prisma.systemSettings.count();
  console.log(`System settings count: ${settingsCount}`);
  
  if (settingsCount === 0) {
    console.log('Creating default system settings...');
    const defaultSettings = [
      { key: 'deposit_fee', value: '500' },
      { key: 'min_withdraw', value: '50000' },
      { key: 'withdraw_fee', value: '10' },
      { key: 'work_start', value: '08:00' },
      { key: 'work_end', value: '17:00' },
      { key: 'referral_bonus', value: '10000' },
      { key: 'cashback', value: '0' },
      { key: 'total_members', value: '0' },
      { key: 'total_transactions', value: '0' },
      { key: 'uptime', value: '99.9' },
      { key: 'satisfaction', value: '98' },
      { key: 'qris_image', value: '' },
      { key: 'auto_payment', value: 'false' },
      { key: 'apk_link', value: '' },
      { key: 'apk_version', value: '1.0.0' },
      { key: 'site_name', value: 'NEXVO' },
    ];
    
    for (const s of defaultSettings) {
      await prisma.systemSettings.create({ data: s });
    }
    console.log(`Created ${defaultSettings.length} system settings`);
  } else {
    console.log('System settings already exist, skip');
  }
  
  // Cek products
  const productCount = await prisma.product.count();
  console.log(`Product count: ${productCount}`);
  
  if (productCount === 0) {
    console.log('No products found. Run full seed: bun run prisma/seed.ts');
  }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
EOF

bun run /tmp/seed-settings.ts 2>&1

# ============================================================================
# STEP 7: Cek cron jobs (apakah jalan)
# ============================================================================
step "7/8  Cek cron jobs"

echo "  Cron service status:"
pm2 logs nexvo-cron --nostream --lines 15 2>&1 | tail -20

echo ""
echo "  Test cron API endpoint:"
CRON_HTTP=$(curl -s -m 10 -o /dev/null -w "%{http_code}" "http://127.0.0.1:3000/api/cron/status" 2>&1)
echo "    /api/cron/status -> HTTP $CRON_HTTP"

if [ "$CRON_HTTP" = "200" ]; then
  log "Cron API respond OK"
  echo "  Response body:"
  curl -s -m 10 "http://127.0.0.1:3000/api/cron/status" 2>&1 | head -10
else
  warn "Cron API tidak respond (mungkin endpoint beda)"
fi

# ============================================================================
# STEP 8: Restart semua service + final test
# ============================================================================
step "8/8  Restart semua + final test"

log "Restart PM2..."
pm2 restart nexvo-web --update-env 2>/dev/null
sleep 3
pm2 restart nexvo-cron --update-env 2>/dev/null
sleep 3
pm2 save

# Setup auto-start
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root 2>&1 | grep "systemctl\|sudo" | bash 2>/dev/null
pm2 save
systemctl enable pm2-root 2>/dev/null || true

echo ""
echo "  === FINAL STATUS ==="
echo ""
echo "  PM2 processes:"
pm2 list
echo ""
echo "  Port listeners:"
ss -tlnp | grep -E ':(80|443|3000) '
echo ""
echo "  HTTP tests:"
echo "    Port 3000 (NEXVO): $(curl -s -m 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/)"
echo "    Port 80 (HTTP):    $(curl -s -m 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:80/)"
echo "    Port 443 (HTTPS):  $(curl -s -m 10 -o /dev/null -w '%{http_code}' -k https://127.0.0.1:443/)"
echo ""
echo "  Nginx status: $(systemctl is-active nginx)"
echo "  PM2 startup: $(systemctl is-enabled pm2-root 2>/dev/null)"

# Test login admin via API
echo ""
echo "  Test login admin via API:"
LOGIN_RESP=$(curl -s -m 10 -X POST http://127.0.0.1:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@2024"}' 2>&1)
echo "    Response: $(echo $LOGIN_RESP | head -c 200)"

# ============================================================================
# DONE
# ============================================================================
echo -e "${GREEN}"
echo "============================================================"
echo "   VERIFICATION + FIX SELESAI"
echo "============================================================"
echo -e "${NC}"
echo ""
echo "  Login admin:"
echo "    URL: https://nexvo.id/#admin-login"
echo "    User: admin"
echo "    Pass: Admin@2024"
echo ""
echo "  Coba login lagi di browser (refresh halaman + incognito)"
echo ""
echo "============================================================"
