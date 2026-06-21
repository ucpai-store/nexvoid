#!/bin/bash
# ============================================================================
#  NEXVO - ONE-SHOT RESTORE SCRIPT (fresh Ubuntu 22.04 VPS)
# ----------------------------------------------------------------------------
#  Ini script lengkap yang:
#    1. Install Node.js 20, Bun, PM2, Git, Nginx, Certbot
#    2. Clone NEXVO dari GitHub
#    3. Setup .env, install deps, build, push DB + seed
#    4. Konfigurasi Nginx reverse proxy (80 -> 3000)
#    5. Setup PM2 auto-start on boot
#    6. SSL certificate untuk nexvo.id (Let's Encrypt)
#    7. Start semua service
#
#  CARA PAKAI (di Browser Terminal Hostinger sebagai root):
#    curl -fsSL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/restore-nexvo.sh | bash
#
#  Kalau GitHub raw belum sync, bisa juga:
#    bash restore-nexvo.sh
# ============================================================================
set -e

# ----- warna -----
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
REPO_URL="https://github.com/ucpai-store/nexvoid.git"
BRANCH="main"
NODE_VERSION="20"
APP_PORT=3000
DOMAIN="nexvo.id"
ADMIN_USER="admin"
ADMIN_PASS="Admin@2024"

# root check
if [ "$EUID" -ne 0 ]; then
  err "Harus jalan sebagai root. Pakai: sudo bash restore-nexvo.sh"
  exit 1
fi

echo -e "${CYAN}"
echo "============================================================"
echo "   NEXVO ONE-SHOT RESTORE  -  $(date '+%Y-%m-%d %H:%M:%S')"
echo "   VPS fresh Ubuntu 22.04 -> NEXVO live di https://nexvo.id"
echo "============================================================"
echo -e "${NC}"

# ============================================================================
# STEP 1: System packages
# ============================================================================
step "1/9  Update system & install base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl wget git build-essential ca-certificates gnupg lsb-release \
                   software-properties-common ufw nginx unzip cron
log "Base packages OK"

# ============================================================================
# STEP 2: Node.js 20 LTS via NodeSource
# ============================================================================
step "2/9  Install Node.js ${NODE_VERSION} LTS"
if ! command -v node &> /dev/null || [[ "$(node -v)" != v${NODE_VERSION}* ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
fi
log "Node $(node -v)  |  npm $(npm -v)"

# ============================================================================
# STEP 3: Bun + PM2 global
# ============================================================================
step "3/9  Install Bun & PM2"
if ! command -v bun &> /dev/null; then
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  # persist for all shells
  grep -q 'BUN_INSTALL' /etc/profile || echo 'export BUN_INSTALL="$HOME/.bun"' >> /etc/profile
  grep -q 'BUN_INSTALL/bin' /etc/profile || echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> /etc/profile
fi
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

npm install -g pm2
log "Bun $(bun --version)  |  PM2 $(pm2 --version)"

# ============================================================================
# STEP 4: Clone / update NEXVO repo
# ============================================================================
step "4/9  Clone NEXVO dari GitHub"
if [ -d "$PROJECT_DIR/.git" ]; then
  cd "$PROJECT_DIR"
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
  log "Repo di-update di $PROJECT_DIR"
else
  rm -rf "$PROJECT_DIR"
  git clone -b "$BRANCH" "$REPO_URL" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
  log "Repo baru di-clone ke $PROJECT_DIR"
fi

# ============================================================================
# STEP 5: .env.production
# ============================================================================
step "5/9  Setup .env.production"
mkdir -p /home/z/my-project/db
cat > "$PROJECT_DIR/.env.production" <<'EOF'
# NEXVO Production Environment
DATABASE_URL=file:/home/z/my-project/db/custom.db
JWT_SECRET=N3xV0_S3cur3_JWT_T0k3n_K3y_2024_Pr0d
CRON_SECRET=nexvo-cron-secret-2024
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=adminnexvo@nexvo.id
SMTP_PASS="3R#~tv=7D"
SMTP_FROM_EMAIL=adminnexvo@nexvo.id
SMTP_FROM_NAME=NEXVO
NODE_ENV=production
PORT=3000
EOF
# also copy as .env for build
cp "$PROJECT_DIR/.env.production" "$PROJECT_DIR/.env"
log ".env.production dibuat"

# ============================================================================
# STEP 6: Install deps + build + DB
# ============================================================================
step "6/9  Install deps, build, push & seed database"
cd "$PROJECT_DIR"

log "bun install ..."
bun install --frozen-lockfile 2>/dev/null || bun install

log "prisma generate ..."
bunx prisma generate

log "prisma db push (create tables) ..."
bunx prisma db push --accept-data-loss

log "seed database (admin + settings + packages) ..."
bunx prisma db seed 2>/dev/null || bun run prisma/seed.ts 2>/dev/null || node -e "require('./prisma/seed.ts')" 2>/dev/null || warn "Seed manual mungkin perlu, tapi DB sudah ada"

log "next build ..."
bun run build

log "Copy static assets ke standalone ..."
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
cp -r public .next/standalone/public 2>/dev/null || true

# ============================================================================
# STEP 7: PM2 start + auto-start on boot
# ============================================================================
step "7/9  Start PM2 + enable startup"
cd "$PROJECT_DIR/.next/standalone"
pm2 delete nexvo-web 2>/dev/null || true
pm2 delete nexvo-cron 2>/dev/null || true
PORT=$APP_PORT NODE_ENV=production pm2 start server.js --name nexvo-web --update-env
cd "$PROJECT_DIR"
pm2 start "bun run cron-service.ts" --name nexvo-cron --update-env 2>/dev/null || warn "cron-service opsional"
pm2 save

# auto-start PM2 on boot
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -1 | bash 2>/dev/null || warn "PM2 startup mungkin perlu confirm"
systemctl enable pm2-root 2>/dev/null || true
log "PM2 running:"
pm2 list

# ============================================================================
# STEP 8: Nginx reverse proxy 80 -> 3000
# ============================================================================
step "8/9  Konfigurasi Nginx reverse proxy"
cat > /etc/nginx/sites-available/nexvo <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name nexvo.id www.nexvo.id _;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
EOF
ln -sf /etc/nginx/sites-available/nexvo /etc/nginx/sites-enabled/nexvo
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
systemctl enable nginx
log "Nginx OK (80 -> 127.0.0.1:${APP_PORT})"

# ============================================================================
# STEP 9: SSL Let's Encrypt + Firewall
# ============================================================================
step "9/9  SSL certificate & firewall"
# Certbot
if ! command -v certbot &> /dev/null; then
  apt-get install -y certbot python3-certbot-nginx
fi
# coba SSL (kalau domain sudah resolve ke VPS)
if host "$DOMAIN" &> /dev/null; then
  certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos -m adminnexvo@nexvo.id --redirect 2>&1 || warn "SSL gagal (mungkin DNS belum resolve). Bisa ulang nanti: certbot --nginx -d nexvo.id"
else
  warn "Domain $DOMAIN belum resolve. Skip SSL. Jalankan nanti: certbot --nginx -d nexvo.id"
fi

# Firewall (allow SSH, HTTP, HTTPS)
ufw allow OpenSSH 2>/dev/null || ufw allow 22/tcp
ufw allow 'Nginx Full' 2>/dev/null || { ufw allow 80/tcp; ufw allow 443/tcp; }
echo "y" | ufw enable 2>/dev/null || true
log "Firewall: SSH + 80 + 443 open"

# ============================================================================
# DONE
# ============================================================================
echo -e "${GREEN}"
echo "============================================================"
echo "   NEXVO RESTORE SELESAI!"
echo "============================================================"
echo -e "${NC}"
echo ""
echo "   Web        : http://${DOMAIN}  (SSL auto dalam 1-2 menit)"
echo "   Admin URL  : http://${DOMAIN}/admin"
echo "   Username   : ${ADMIN_USER}"
echo "   Password   : ${ADMIN_PASS}"
echo ""
echo "   PM2 status : pm2 list"
echo "   PM2 logs   : pm2 logs nexvo-web"
echo "   Restart    : pm2 restart nexvo-web"
echo "   Nginx      : systemctl status nginx"
echo ""
echo "   NOTE: Semua user lama sudah hilang (VPS di-recreate)."
echo "         Database fresh - siap untuk akun real."
echo ""
echo "============================================================"
