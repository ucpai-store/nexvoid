#!/bin/bash
# ============================================================================
#  NEXVO - ACTIVATE SCRIPT
#  Untuk VPS yang sudah di-restore dari backup (AlmaLinux + CyberPanel)
# ============================================================================
set +e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'
log()  { echo -e "${GREEN}[NEXVO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERR]${NC} $1"; }
step() { echo -e "\n${CYAN}==== $1 ====${NC}"; }

PROJECT_DIR="/home/nexvo"
APP_PORT=3000

echo -e "${CYAN}"
echo "============================================================"
echo "   NEXVO ACTIVATE  -  $(date '+%Y-%m-%d %H:%M:%S')"
echo "   Untuk VPS restore (CyberPanel/AlmaLinux)"
echo "============================================================"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
  err "Harus jalan sebagai root. Pakai: sudo bash activate-nexvo.sh"
  exit 1
fi

export BUN_INSTALL="/root/.bun"
export PATH="$BUN_INSTALL/bin:/usr/local/bin:/usr/bin:/usr/local/sbin:$PATH"

# ============================================================================
# STEP 1: Cek file NEXVO
# ============================================================================
step "1/7  Cek file NEXVO di /home/nexvo"
if [ ! -d "$PROJECT_DIR" ]; then
  err "Folder $PROJECT_DIR tidak ada! Backup mungkin tidak lengkap."
  echo ""
  echo "  Cek lokasi lain:"
  echo "    ls /home/"
  echo "    find / -name 'package.json' -path '*nexvo*' 2>/dev/null"
  exit 1
fi

if [ ! -f "$PROJECT_DIR/package.json" ]; then
  err "package.json tidak ada di $PROJECT_DIR. Folder tidak valid."
  exit 1
fi

log "File NEXVO ditemukan di $PROJECT_DIR"
log "  - package.json: OK"
log "  - .next/standalone: $([ -d $PROJECT_DIR/.next/standalone ] && echo 'OK' || echo 'MISSING')"
log "  - node_modules: $([ -d $PROJECT_DIR/node_modules ] && echo 'OK' || echo 'MISSING')"

DB_FOUND=""
for db_path in "/home/z/my-project/db/custom.db" "$PROJECT_DIR/db/custom.db" "$PROJECT_DIR/prisma/dev.db" "$PROJECT_DIR/custom.db"; do
  if [ -f "$db_path" ]; then
    DB_SIZE=$(du -h "$db_path" 2>/dev/null | awk '{print $1}')
    log "  - Database: $db_path ($DB_SIZE)"
    DB_FOUND="$db_path"
    break
  fi
done
[ -z "$DB_FOUND" ] && warn "  - Database tidak ditemukan, akan dibuat baru"

NEED_BUILD=0
[ ! -d "$PROJECT_DIR/.next/standalone" ] && NEED_BUILD=1
[ ! -d "$PROJECT_DIR/node_modules" ] && NEED_BUILD=1

# ============================================================================
# STEP 2: Cek & install Node.js
# ============================================================================
step "2/7  Cek Node.js"
if ! command -v node &> /dev/null; then
  err "Node.js belum terinstall!"
  echo ""
  echo "  Install Node.js 20 LTS di AlmaLinux/RHEL/CentOS:"
  echo "    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -"
  echo "    yum install -y nodejs"
  echo ""
  echo "  Setelah itu jalankan script ini lagi."
  exit 1
fi
log "Node: $(node -v)"
log "npm:  $(npm -v)"

# ============================================================================
# STEP 3: Cek & install Bun + PM2
# ============================================================================
step "3/7  Cek Bun & PM2"

if ! command -v bun &> /dev/null; then
  warn "Bun belum terinstall, install sekarang..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="/root/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi
ln -sf /root/.bun/bin/bun /usr/local/bin/bun 2>/dev/null
log "Bun: $(bun --version 2>/dev/null || echo 'failed')"

if ! command -v pm2 &> /dev/null; then
  warn "PM2 belum terinstall, install sekarang..."
  npm install -g pm2
fi
log "PM2: $(pm2 --version 2>/dev/null || echo 'failed')"

# ============================================================================
# STEP 4: Install deps + build kalau perlu
# ============================================================================
step "4/7  Install dependencies & build (kalau perlu)"
cd "$PROJECT_DIR"

if [ "$NEED_BUILD" = "1" ]; then
  log "Install dependencies..."
  bun install 2>&1 | tail -5

  log "Generate Prisma client..."
  bunx prisma generate 2>&1 | tail -3

  log "Push database schema (KEEP existing data)..."
  bunx prisma db push --accept-data-loss 2>&1 | tail -5

  log "Build Next.js..."
  bun run build 2>&1 | tail -10

  log "Copy static assets ke standalone..."
  mkdir -p .next/standalone/.next
  cp -r .next/static .next/standalone/.next/ 2>/dev/null
  cp -r public .next/standalone/public 2>/dev/null
else
  log "Dependencies & build sudah ada, skip"
  bunx prisma generate 2>&1 | tail -2
fi

if [ -f "$PROJECT_DIR/.env.production" ]; then
  cp "$PROJECT_DIR/.env.production" "$PROJECT_DIR/.env"
  log ".env disalin dari .env.production"
fi

# ============================================================================
# STEP 5: Start PM2
# ============================================================================
step "5/7  Start PM2 (nexvo-web + nexvo-cron)"

cd "$PROJECT_DIR/.next/standalone"
pm2 delete nexvo-web 2>/dev/null
pm2 delete nexvo-cron 2>/dev/null

PORT=$APP_PORT NODE_ENV=production pm2 start server.js --name nexvo-web --update-env
sleep 3

cd "$PROJECT_DIR"
pm2 start "bun run cron-service.ts" --name nexvo-cron --update-env 2>/dev/null || warn "cron-service opsional (skip)"

pm2 save
log "PM2 status:"
pm2 list

log "Setup PM2 auto-start on boot..."
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root 2>&1 | grep "systemctl\|sudo" | bash 2>/dev/null
pm2 save
systemctl enable pm2-root 2>/dev/null || true

# ============================================================================
# STEP 6: Cek Web Server
# ============================================================================
step "6/7  Cek Web Server"

PORT80=$(ss -tlnp 2>/dev/null | grep ":80 " | head -1)
log "Port 80 listener: $PORT80"

PORT3000=$(ss -tlnp 2>/dev/null | grep ":3000 " | head -1)
log "Port 3000 listener: $PORT3000"

if echo "$PORT80" | grep -q "litespeed\|ols"; then
  log "OpenLiteSpeed jalan di port 80"
  warn "Kalau web belum muncul, cek di CyberPanel https://76.13.198.125:8090"
  echo "  Websites -> nexvo.id -> Konfigurasi -> Reverse Proxy"
  echo "  Tambahkan: proxy 127.0.0.1:3000"
elif echo "$PORT80" | grep -q "nginx"; then
  log "Nginx jalan di port 80"
  nginx -t 2>&1
  systemctl restart nginx
elif [ -z "$PORT80" ]; then
  warn "Tidak ada yang listen di port 80!"
  warn "Coba start OpenLiteSpeed..."
  systemctl start lscpd 2>/dev/null
  /usr/local/lsws/bin/lswsctrl start 2>/dev/null
  sleep 2
  ss -tlnp 2>/dev/null | grep ":80 " | head -1
fi

# ============================================================================
# STEP 7: Test
# ============================================================================
step "7/7  Test aplikasi"

echo ""
echo "  Test port 3000 (NEXVO langsung):"
HTTP3000=$(curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ 2>&1)
echo "    HTTP $HTTP3000"

echo "  Test port 80 (via web server):"
HTTP80=$(curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:80/ 2>&1)
echo "    HTTP $HTTP80"

echo ""
echo "  PM2 logs (last 15 lines):"
pm2 logs nexvo-web --nostream --lines 15 2>&1 | tail -20

echo -e "${GREEN}"
echo "============================================================"
echo "   AKTIVASI SELESAI"
echo "============================================================"
echo -e "${NC}"
echo ""
echo "  Coba buka di browser:"
echo "    http://nexvo.id"
echo "    http://76.13.198.125"
echo ""
echo "  Admin panel:"
echo "    http://nexvo.id/admin"
echo "    User: admin"
echo "    Pass: Admin@2024"
echo ""
echo "  Data user lama sudah kembali (dari backup)"
echo ""
echo "  Kalau web masih belum muncul, jalankan untuk cek error:"
echo "    pm2 logs nexvo-web --lines 50"
echo "    curl -v http://127.0.0.1:3000"
echo "    ss -tlnp | grep -E ':80|:3000'"
echo ""
echo "  CyberPanel (kalau perlu config reverse proxy):"
echo "    https://76.13.198.125:8090"
echo ""
echo "============================================================"
