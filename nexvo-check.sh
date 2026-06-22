#!/bin/bash
# ============================================================================
#  NEXVO - FULL SYSTEM CHECK + AUTO-FIX + ENSURE RUNNING
# ----------------------------------------------------------------------------
#  Script ini akan:
#  1. Cek apakah restore-nexvo.sh masih berjalan
#  2. Cek semua sistem (PM2, Nginx, port, database, SSL)
#  3. Auto-fix semua masalah yang ditemukan
#  4. Jika NEXVO belum di-deploy, jalankan restore dari awal
#  5. Output laporan status akhir
# ============================================================================
set +e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓ OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[! WARN]${NC} $1"; }
err()  { echo -e "${RED}[✗ ERR]${NC} $1"; }
step() { echo -e "\n${CYAN}${BOLD}══════ $1 ══════${NC}"; }

PROJECT_DIR="/home/nexvo"
GITHUB_REPO="https://github.com/ucpai-store/nexvoid.git"
# Token diambil dari env atau diisi manual
GITHUB_TOKEN="${GITHUB_TOKEN:-your_token_here}"

echo -e "${CYAN}${BOLD}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     NEXVO FULL SYSTEM CHECK + AUTO-FIX                      ║"
echo "║     $(date '+%Y-%m-%d %H:%M:%S UTC')                            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Must be root
if [ "$EUID" -ne 0 ]; then
  err "Script ini harus dijalankan sebagai root!"
  err "Jalankan: sudo bash nexvo-check.sh"
  exit 1
fi

# Setup PATH
export BUN_INSTALL="/root/.bun"
export PATH="$BUN_INSTALL/bin:/usr/local/bin:/usr/bin:/usr/local/sbin:/usr/bin:/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" 2>/dev/null

# ============================================================================
# STEP 0: Cek apakah restore masih berjalan
# ============================================================================
step "0/10  Cek apakah restore-nexvo.sh masih berjalan"

RESTORE_RUNNING=$(ps aux | grep -E 'restore-nexvo|next build|bun install|prisma' | grep -v grep | head -3)
if [ -n "$RESTORE_RUNNING" ]; then
  warn "Restore/build script masih berjalan:"
  echo "$RESTORE_RUNNING"
  echo ""
  warn "Tunggu sampai selesai. Cek progress:"
  echo "  tail -f /var/log/nexvo-restore.log (jika ada)"
  echo "  atau tail -f /root/restore-nexvo.log"
  echo ""
  echo -e "${YELLOW}Script lain sedang berjalan. Keluar...${NC}"
  exit 0
else
  log "Tidak ada restore/build yang sedang berjalan"
fi

# ============================================================================
# STEP 1: Cek apakah NEXVO project ada
# ============================================================================
step "1/10  Cek NEXVO project directory"

if [ ! -d "$PROJECT_DIR" ]; then
  err "Directory $PROJECT_DIR tidak ditemukan!"
  err "NEXVO belum di-deploy. Menjalankan restore dari awal..."
  echo ""
  
  step "AUTO-RESTORE: Download dan jalankan restore-nexvo.sh"
  cd /root
  if [ -f restore-nexvo.sh ]; then
    log "restore-nexvo.sh sudah ada di /root/"
  else
    warn "Download restore-nexvo.sh dari GitHub..."
    curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/restore-nexvo.sh" \
      -o restore-nexvo.sh
    chmod +x restore-nexvo.sh
  fi
  
  if [ -f restore-nexvo.sh ]; then
    log "Menjalankan restore-nexvo.sh..."
    echo "  Ini akan memakan 10-15 menit. Mohon tunggu..."
    bash restore-nexvo.sh 2>&1 | tee /root/restore-output.log
    echo ""
    log "Restore selesai! Lanjut verifikasi..."
  else
    err "Gagal download restore-nexvo.sh!"
    err "Download manual dari: https://github.com/ucpai-store/nexvoid"
    exit 1
  fi
else
  log "Directory $PROJECT_DIR ditemukan"
  ls -la "$PROJECT_DIR" | head -10
fi

cd "$PROJECT_DIR" 2>/dev/null || { err "Tidak bisa cd ke $PROJECT_DIR"; exit 1; }

# ============================================================================
# STEP 2: Cek tools yang terinstall
# ============================================================================
step "2/10  Cek tools (Node, Bun, PM2, Nginx)"

# Node.js
NODE_VER=$(node -v 2>/dev/null)
if [ -n "$NODE_VER" ]; then
  log "Node.js: $NODE_VER"
else
  err "Node.js tidak ditemukan! Installing..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  NODE_VER=$(node -v 2>/dev/null)
  [ -n "$NODE_VER" ] && log "Node.js terinstall: $NODE_VER" || { err "Gagal install Node.js"; exit 1; }
fi

# Bun
BUN_VER=$(bun --version 2>/dev/null)
if [ -n "$BUN_VER" ]; then
  log "Bun: $BUN_VER"
else
  warn "Bun tidak ditemukan. Installing..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="/root/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  BUN_VER=$(bun --version 2>/dev/null)
  [ -n "$BUN_VER" ] && log "Bun terinstall: $BUN_VER" || warn "Bun gagal install, akan pakai npm"
fi

# PM2
PM2_VER=$(pm2 --version 2>/dev/null)
if [ -n "$PM2_VER" ]; then
  log "PM2: $PM2_VER"
else
  warn "PM2 tidak ditemukan. Installing..."
  npm install -g pm2
  PM2_VER=$(pm2 --version 2>/dev/null)
  [ -n "$PM2_VER" ] && log "PM2 terinstall: $PM2_VER" || { err "Gagal install PM2"; exit 1; }
fi

# Nginx
NGINX_VER=$(nginx -v 2>&1)
if echo "$NGINX_VER" | grep -q "nginx version"; then
  log "Nginx: $NGINX_VER"
else
  warn "Nginx tidak ditemukan. Installing..."
  apt-get update -qq && apt-get install -y nginx
  systemctl enable nginx
  systemctl start nginx
  log "Nginx terinstall dan dijalankan"
fi

# ============================================================================
# STEP 3: Cek dependencies terinstall
# ============================================================================
step "3/10  Cek dependencies (node_modules)"

if [ -d "node_modules" ]; then
  log "node_modules ditemukan"
else
  err "node_modules tidak ada! Running bun install..."
  bun install 2>&1 | tail -5
  [ -d "node_modules" ] && log "bun install selesai" || { err "Gagal bun install"; exit 1; }
fi

# Cek prisma client
if [ -d "node_modules/.prisma" ]; then
  log "Prisma client ada"
else
  warn "Prisma client tidak ada. Running prisma generate..."
  bunx prisma generate 2>&1 | tail -3
fi

# ============================================================================
# STEP 4: Cek .env file
# ============================================================================
step "4/10  Cek .env file"

if [ -f ".env" ]; then
  log ".env ditemukan"
  # Cek isi minimal
  if grep -q "DATABASE_URL" .env; then
    log "DATABASE_URL ada di .env"
  else
    err "DATABASE_URL tidak ada di .env!"
  fi
elif [ -f ".env.production" ]; then
  warn ".env tidak ada, copy dari .env.production"
  cp .env.production .env
  log ".env dibuat dari .env.production"
else
  err ".env dan .env.production tidak ada! Membuat .env default..."
  cat > .env << 'EOF'
DATABASE_URL="file:/home/nexvo/db/custom.db"
JWT_SECRET="GENERATE_RANDOM_SECRET"
CRON_SECRET="GENERATE_RANDOM_SECRET"
SMTP_HOST="smtp.hostinger.com"
SMTP_PORT="465"
SMTP_USER="adminnexvo@nexvo.id"
SMTP_PASS="CHANGE_ME"
NEXTAUTH_URL="https://nexvo.id"
NEXTAUTH_SECRET="GENERATE_RANDOM_SECRET"
EOF
  log ".env default dibuat"
fi

# ============================================================================
# STEP 5: Cek database
# ============================================================================
step "5/10  Cek database"

DB_PATH="/home/nexvo/db/custom.db"
if [ -f "$DB_PATH" ]; then
  DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
  log "Database ada: $DB_PATH ($DB_SIZE)"
  
  # Cek tabel users
  USERS_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
  log "Jumlah users: $USERS_COUNT"
  
  # Cek admin ada
  ADMIN_EXISTS=$(sqlite3 "$DB_PATH" "SELECT username FROM users WHERE role='ADMIN' LIMIT 1;" 2>/dev/null)
  if [ -n "$ADMIN_EXISTS" ]; then
    log "Admin account ada: $ADMIN_EXISTS"
  else
    warn "Admin account tidak ada! Running seed..."
    bunx prisma db seed 2>&1 | tail -3
  fi
else
  err "Database tidak ada! Running prisma db push + seed..."
  mkdir -p /home/nexvo/db
  bunx prisma db push --force-reset 2>&1 | tail -5
  bunx prisma db seed 2>&1 | tail -3
  [ -f "$DB_PATH" ] && log "Database dibuat" || err "Gagal buat database"
fi

# ============================================================================
# STEP 6: Cek build (next build)
# ============================================================================
step "6/10  Cek Next.js build"

if [ -d ".next" ] && [ -d ".next/standalone" ]; then
  log "Next.js build ada (.next/standalone)"
  
  if [ -f ".next/standalone/server.js" ]; then
    log "server.js ada di .next/standalone/"
  else
    err "server.js tidak ada! Build tidak lengkap"
    warn "Running next build ulang..."
    bun run build 2>&1 | tail -10
  fi
else
  err "Next.js build tidak ada atau tidak lengkap!"
  warn "Running next build (5-10 menit)..."
  bun run build 2>&1 | tail -10
  
  if [ -d ".next/standalone" ]; then
    log "Build selesai"
  else
    err "Build gagal! Coba: bun run build"
    err "Cek error di atas"
    exit 1
  fi
fi

# Copy .env ke standalone
[ -f .env ] && cp .env .next/standalone/.env 2>/dev/null
[ -f .env.production ] && cp .env.production .next/standalone/.env.production 2>/dev/null

# ============================================================================
# STEP 7: Cek PM2 proses
# ============================================================================
step "7/10  Cek PM2 proses"

pm2 list 2>/dev/null
echo ""

# Cek nexvo-web
WEB_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p.get('name') == 'nexvo-web':
            print(p.get('pm2_env', {}).get('status', ''))
            break
except:
    print('not_found')
" 2>/dev/null)

if [ "$WEB_STATUS" = "online" ]; then
  log "nexvo-web: ONLINE"
else
  err "nexvo-web: $WEB_STATUS - Restarting..."
  pm2 delete nexvo-web 2>/dev/null
  
  cd .next/standalone
  [ -f ../.env ] && cp ../.env .env 2>/dev/null
  PORT=3000 NODE_ENV=production pm2 start server.js --name nexvo-web --update-env
  sleep 5
  cd "$PROJECT_DIR"
  
  WEB_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p.get('name') == 'nexvo-web':
            print(p.get('pm2_env', {}).get('status', ''))
            break
except:
    print('not_found')
" 2>/dev/null)
  
  [ "$WEB_STATUS" = "online" ] && log "nexvo-web: ONLINE (fixed)" || err "nexvo-web masih bermasalah"
fi

# Cek nexvo-cron
CRON_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p.get('name') == 'nexvo-cron':
            print(p.get('pm2_env', {}).get('status', ''))
            break
except:
    print('not_found')
" 2>/dev/null)

if [ "$CRON_STATUS" = "online" ]; then
  log "nexvo-cron: ONLINE"
else
  warn "nexvo-cron: $CRON_STATUS - Starting..."
  pm2 delete nexvo-cron 2>/dev/null
  pm2 start "bun run cron-service.ts" --name nexvo-cron --update-env 2>/dev/null
  sleep 3
  log "nexvo-cron: started"
fi

# Save PM2
pm2 save 2>/dev/null
pm2 startup 2>/dev/null | tail -2

# ============================================================================
# STEP 8: Cek port listeners
# ============================================================================
step "8/10  Cek port listeners (80, 3000)"

echo "  Active listeners:"
ss -tlnp | grep -E ':(80|443|3000) ' 2>/dev/null || echo "  (none found)"
echo ""

PORT3000=$(ss -tlnp | grep ':3000 ' | head -1)
PORT80=$(ss -tlnp | grep ':80 ' | head -1)

[ -n "$PORT3000" ] && log "Port 3000: LISTENING ($PORT3000)" || err "Port 3000: TIDAK ADA listener!"
[ -n "$PORT80" ] && log "Port 80: LISTENING" || warn "Port 80: TIDAK ADA (Nginx belum jalan?)"

# ============================================================================
# STEP 9: Cek Nginx config
# ============================================================================
step "9/10  Cek Nginx config untuk NEXVO"

NGINX_NEXVO=$(ls /etc/nginx/sites-enabled/ 2>/dev/null | grep -i nexvo)
NGINX_DEFAULT=$(ls /etc/nginx/sites-enabled/ 2>/dev/null | grep -i default)

if [ -n "$NGINX_NEXVO" ] || [ -n "$NGINX_DEFAULT" ]; then
  log "Nginx config ditemukan: ${NGINX_NEXVO}${NGINX_DEFAULT}"
else
  warn "Nginx config untuk NEXVO tidak ada. Membuat..."
  
  cat > /etc/nginx/sites-available/nexvo << 'NGINXEOF'
server {
    listen 80;
    listen [::]:80;
    server_name nexvo.id www.nexvo.id _;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}
NGINXEOF

  ln -sf /etc/nginx/sites-available/nexvo /etc/nginx/sites-enabled/nexvo
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null
  
  nginx -t 2>&1
  systemctl restart nginx
  systemctl enable nginx
  log "Nginx config dibuat dan Nginx direstart"
fi

# Test Nginx
nginx -t 2>&1 && log "Nginx config valid" || err "Nginx config error!"
systemctl restart nginx 2>/dev/null

# ============================================================================
# STEP 10: Cek SSL (HTTPS)
# ============================================================================
step "10/10  Cek SSL Certificate"

if [ -d "/etc/letsencrypt/live/nexvo.id" ]; then
  log "SSL certificate ada untuk nexvo.id"
  
  # Cek expiry
  EXPIRY=$(openssl x509 -enddate -noout -in /etc/letsencrypt/live/nexvo.id/fullchain.pem 2>/dev/null | cut -d= -f2)
  [ -n "$EXPIRY" ] && log "SSL expiry: $EXPIRY"
else
  warn "SSL certificate belum ada. Setup SSL..."
  
  # Pastikan port 80 bisa diakses dulu
  systemctl stop nginx 2>/dev/null
  
  # Install certbot jika belum ada
  if ! command -v certbot &> /dev/null; then
    apt-get install -y certbot python3-certbot-nginx 2>&1 | tail -3
  fi
  
  systemctl start nginx 2>/dev/null
  sleep 2
  
  # Dapatkan SSL cert
  certbot --nginx -d nexvo.id -d www.nexvo.id \
    --non-interactive --agree-tos --register-unsafely-without-email \
    --redirect 2>&1 | tail -10
  
  if [ -d "/etc/letsencrypt/live/nexvo.id" ]; then
    log "SSL berhasil didapatkan!"
  else
    warn "SSL gagal. Website tetap bisa diakses via http://nexvo.id"
    warn "Setup SSL manual nanti: certbot --nginx -d nexvo.id"
  fi
fi

# ============================================================================
# FINAL: Test lokal
# ============================================================================
step "FINAL TEST - Akses lokal"

echo "  Test port 3000 (NEXVO langsung):"
curl -s -o /dev/null -w "  HTTP Status: %{http_code}\n" --max-time 5 http://127.0.0.1:3000/ 2>&1

echo ""
echo "  Test port 80 (via Nginx):"
curl -s -o /dev/null -w "  HTTP Status: %{http_code}\n" --max-time 5 http://127.0.0.1:80/ 2>&1

echo ""
echo "  Test HTTPS (jika ada SSL):"
curl -sk -o /dev/null -w "  HTTP Status: %{http_code}\n" --max-time 5 https://127.0.0.1/ 2>&1

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo -e "${CYAN}${BOLD}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                  STATUS RINGKAS NEXVO                        ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo -e "${NC}"

# PM2 status
FINAL_WEB=$(pm2 jlist 2>/dev/null | python3 -c "
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

FINAL_CRON=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p.get('name') == 'nexvo-cron':
            print(p.get('pm2_env', {}).get('status', ''))
            break
except:
    print('error')
" 2>/dev/null)

NGINX_ACTIVE=$(systemctl is-active nginx 2>/dev/null)
HTTP_3000=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3000/ 2>/dev/null)
HTTP_80=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:80/ 2>/dev/null)

echo -e "  nexvo-web (PM2):    ${GREEN}${FINAL_WEB}${NC}"
echo -e "  nexvo-cron (PM2):   ${GREEN}${FINAL_CRON}${NC}"
echo -e "  Nginx:              ${GREEN}${NGINX_ACTIVE}${NC}"
echo -e "  Port 3000 (NEXVO):  ${GREEN}HTTP $HTTP_3000${NC}"
echo -e "  Port 80 (Nginx):    ${GREEN}HTTP $HTTP_80${NC}"

if [ -d "/etc/letsencrypt/live/nexvo.id" ]; then
  echo -e "  SSL (HTTPS):        ${GREEN}ACTIVE${NC}"
else
  echo -e "  SSL (HTTPS):        ${YELLOW}NOT SET${NC}"
fi

echo ""
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo ""

if [ "$FINAL_WEB" = "online" ] && [ "$NGINX_ACTIVE" = "active" ] && [ "$HTTP_3000" = "200" ]; then
  echo -e "${GREEN}${BOLD}✓ NEXVO BERJALAN NORMAL!${NC}"
  echo ""
  echo "  Akses website:"
  echo "    http://nexvo.id"
  echo "    http://76.13.198.125"
  [ -d "/etc/letsencrypt/live/nexvo.id" ] && echo "    https://nexvo.id"
  echo ""
  echo "  Admin login:"
  echo "    Username: admin"
  echo "    Password: (lihat di database / .env)"
  echo ""
  echo "  PM2 monitor: pm2 monit"
  echo "  PM2 logs:    pm2 logs nexvo-web --lines 50"
else
  echo -e "${YELLOW}${BOLD}! Beberapa sistem butuh perhatian${NC}"
  echo ""
  echo "  Cek log untuk detail:"
  echo "    pm2 logs nexvo-web --lines 50"
  echo "    pm2 logs nexvo-cron --lines 20"
  echo "    tail -50 /var/log/nginx/error.log"
  echo ""
  echo "  Jalankan ulang script ini setelah fix:"
  echo "    bash nexvo-check.sh"
fi

echo ""
echo -e "${CYAN}Selesai: $(date '+%Y-%m-%d %H:%M:%S UTC')${NC}"
