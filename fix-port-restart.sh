#!/bin/bash
# ============================================================================
#  NEXVO - FIX PORT CONFLICT + CLEAN RESTART
# ----------------------------------------------------------------------------
#  Masalah: EADDRINUSE port 3000 (ada process lain yang pegang port 3000)
#  Solusi: Kill semua process di port 3000, restart PM2 bersih, test
#
#  CARA PAKAI:
#    curl -fsSL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/fix-port-restart.sh | bash
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

echo -e "${CYAN}"
echo "============================================================"
echo "   NEXVO - FIX PORT CONFLICT + CLEAN RESTART"
echo "   $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
  err "Harus jalan sebagai root"
  exit 1
fi

export BUN_INSTALL="/root/.bun"
export PATH="$BUN_INSTALL/bin:/usr/local/bin:/usr/bin:/usr/local/sbin:$PATH"

# ============================================================================
# STEP 1: Lihat siapa yang pegang port 3000 sebelum kill
# ============================================================================
step "1/5  Cek siapa yang pegang port 3000"
echo "  Process yang listen di port 3000:"
ss -tlnp | grep ':3000 '
echo ""
echo "  Semua process node/bun yang jalan:"
ps aux | grep -E "node|bun|next|nexvo" | grep -v grep | head -20

# ============================================================================
# STEP 2: Kill SEMUA process di port 3000 + semua node/bun process
# ============================================================================
step "2/5  Kill semua process yang pegang port 3000"

# Kill process yang listen di port 3000
PIDS_PORT=$(ss -tlnp 2>/dev/null | grep ':3000 ' | grep -oP 'pid=\K[0-9]+' | sort -u)
if [ -n "$PIDS_PORT" ]; then
  log "Kill PID di port 3000: $PIDS_PORT"
  for pid in $PIDS_PORT; do
    kill -9 $pid 2>/dev/null
  done
fi

# Kill semua PM2 process
log "Stop PM2..."
pm2 kill 2>/dev/null
sleep 2

# Kill semua node process yang related ke nexvo (kecuali PM2 daemon sendiri)
log "Kill node/next process yang relate ke nexvo..."
ps aux | grep -E "node.*nexvo|next.*start|nexvo.*server" | grep -v grep | grep -v "PM2" | awk '{print $2}' | while read pid; do
  echo "  Kill PID $pid"
  kill -9 $pid 2>/dev/null
done

# Kill semua bun process yang relate ke nexvo
ps aux | grep -E "bun.*nexvo|nexvo.*bun" | grep -v grep | awk '{print $2}' | while read pid; do
  echo "  Kill PID $pid"
  kill -9 $pid 2>/dev/null
done

sleep 2

# Cek lagi port 3000
echo ""
echo "  Port 3000 setelah kill:"
ss -tlnp | grep ':3000 '
if ss -tlnp | grep -q ':3000 '; then
  err "Port 3000 masih dipakai! Process:"
  ss -tlnp | grep ':3000 '
  # Force kill lagi
  ss -tlnp 2>/dev/null | grep ':3000 ' | grep -oP 'pid=\K[0-9]+' | sort -u | while read pid; do
    warn "Force kill PID $pid"
    kill -9 $pid 2>/dev/null
    fuser -k 3000/tcp 2>/dev/null
  done
  sleep 2
fi

log "Port 3000 sudah bersih"

# ============================================================================
# STEP 3: Start PM2 fresh
# ============================================================================
step "3/5  Start PM2 fresh (nexvo-web + nexvo-cron)"

if [ ! -d "$PROJECT_DIR/.next/standalone" ]; then
  err "Folder $PROJECT_DIR/.next/standalone tidak ada!"
  echo "  Jalankan dulu:"
  echo "    cd /home/nexvo && bun install && bun run build"
  echo "  Lalu copy static:"
  echo "    mkdir -p .next/standalone/.next"
  echo "    cp -r .next/static .next/standalone/.next/"
  echo "    cp -r public .next/standalone/public"
  exit 1
fi

cd "$PROJECT_DIR/.next/standalone"

# Pastikan .env ada di standalone
if [ -f "$PROJECT_DIR/.env" ]; then
  cp "$PROJECT_DIR/.env" .env
fi
if [ -f "$PROJECT_DIR/.env.production" ]; then
  cp "$PROJECT_DIR/.env.production" .env
fi

# Start nexvo-web
log "Start nexvo-web..."
PORT=3000 NODE_ENV=production pm2 start server.js --name nexvo-web --update-env
sleep 5

# Start nexvo-cron
cd "$PROJECT_DIR"
log "Start nexvo-cron..."
pm2 start "bun run cron-service.ts" --name nexvo-cron --update-env 2>/dev/null || warn "cron-service opsional"

pm2 save

# Setup auto-start
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root 2>&1 | grep "systemctl\|sudo" | bash 2>/dev/null
pm2 save
systemctl enable pm2-root 2>/dev/null || true

echo ""
log "PM2 status:"
pm2 list

# ============================================================================
# STEP 4: Test port 3000 (NEXVO langsung)
# ============================================================================
step "4/5  Test NEXVO di port 3000"

sleep 3
echo "  Port 3000 listener:"
ss -tlnp | grep ':3000 '

echo ""
echo "  Test HTTP 127.0.0.1:3000:"
HTTP3000=$(curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ 2>&1)
echo "    HTTP $HTTP3000"

if [ "$HTTP3000" = "200" ] || [ "$HTTP3000" = "307" ] || [ "$HTTP3000" = "302" ]; then
  log "NEXVO BERJALAN di port 3000!"
else
  err "NEXVO belum respond di port 3000. Cek log:"
  pm2 logs nexvo-web --nostream --lines 30
fi

# ============================================================================
# STEP 5: Cek port 80 (Nginx) & test domain
# ============================================================================
step "5/5  Cek port 80 (Nginx) & test reverse proxy"

echo "  Port 80 listener:"
PORT80=$(ss -tlnp | grep ':80 ' | head -1)
echo "    $PORT80"

if echo "$PORT80" | grep -q "nginx"; then
  log "Nginx jalan di port 80"
  echo "  Test reverse proxy 127.0.0.1:80 -> 3000:"
  HTTP80=$(curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:80/ 2>&1)
  echo "    HTTP $HTTP80"
  
  if [ "$HTTP80" = "200" ] || [ "$HTTP80" = "307" ] || [ "$HTTP80" = "302" ]; then
    log "Reverse proxy Nginx -> NEXVO BERJALAN!"
  else
    warn "Nginx ada tapi proxy belum work. Setup ulang config..."
    
    # Buat config Nginx untuk NEXVO
    cat > /etc/nginx/sites-available/nexvo << 'NGINX_EOF'
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
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
NGINX_EOF
    
    mkdir -p /etc/nginx/sites-enabled
    ln -sf /etc/nginx/sites-available/nexvo /etc/nginx/sites-enabled/nexvo
    rm -f /etc/nginx/sites-enabled/default
    
    # Cek juga kalau ada config nginx lain yang konflik
    echo "  Config Nginx yang aktif:"
    ls -la /etc/nginx/sites-enabled/ 2>/dev/null
    ls -la /etc/nginx/conf.d/*.conf 2>/dev/null
    
    # Disable config xanvyor kalau ada
    for cfg in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
      [ -f "$cfg" ] || continue
      if grep -qiE "xanvy|recon|osint" "$cfg" 2>/dev/null; then
        warn "Disable config XANVYOR: $cfg"
        mv "$cfg" "${cfg}.disabled"
      fi
    done
    
    nginx -t 2>&1
    systemctl restart nginx
    sleep 2
    
    echo "  Test lagi HTTP 80:"
    HTTP80=$(curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:80/ 2>&1)
    echo "    HTTP $HTTP80"
  fi
elif echo "$PORT80" | grep -q "litespeed\|ols"; then
  log "OpenLiteSpeed jalan di port 80"
  warn "Reverse proxy OpenLiteSpeed perlu config manual di CyberPanel"
  echo "  Atau install Nginx: yum install -y nginx && systemctl enable nginx"
else
  warn "Tidak ada yang listen di port 80! Install Nginx..."
  yum install -y nginx 2>/dev/null || dnf install -y nginx 2>/dev/null || apt install -y nginx 2>/dev/null
  cat > /etc/nginx/conf.d/nexvo.conf << 'NGINX_EOF'
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
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
NGINX_EOF
  nginx -t 2>&1
  systemctl enable nginx
  systemctl restart nginx
  sleep 2
  HTTP80=$(curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:80/ 2>&1)
  echo "  Test HTTP 80: $HTTP80"
fi

# ============================================================================
# DONE
# ============================================================================
echo -e "${GREEN}"
echo "============================================================"
echo "   FIX SELESAI"
echo "============================================================"
echo -e "${NC}"
echo ""
echo "  Status:"
echo "    Port 3000 (NEXVO) : $HTTP3000"
echo "    Port 80 (Web)     : $HTTP80"
echo "    PM2 processes     : $(pm2 list 2>/dev/null | grep -c nexvo)"
echo ""
echo "  Coba buka di browser (pakai incognito/private):"
echo "    http://nexvo.id"
echo "    http://76.13.198.125"
echo ""
echo "  Admin: http://nexvo.id/admin  (admin / Admin@2024)"
echo ""
echo "  Kalau masih ada masalah, jalankan & kirim output ke AI:"
echo "    pm2 logs nexvo-web --nostream --lines 30"
echo "    ss -tlnp | grep -E ':80|:3000'"
echo "    curl -I http://127.0.0.1:3000"
echo "    curl -I http://127.0.0.1:80"
echo ""
echo "============================================================"
