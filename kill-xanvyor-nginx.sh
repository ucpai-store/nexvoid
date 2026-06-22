#!/bin/bash
# ============================================================================
#  NEXVO - KILL XANVYOR DI NGINX (definitive fix)
# ----------------------------------------------------------------------------
#  XANVYOR masih tampil di nexvo.id karena Nginx serve file XANVYOR langsung
#  Script ini:
#    1. Cari SEMUA config Nginx yang ada
#    2. Disable SEMUA config yang serve XANVYOR / file static
#    3. Buat 1 config tunggal: nexvo.id -> 127.0.0.1:3000 (NEXVO)
#    4. Restart Nginx
#    5. Test
#
#  CARA PAKAI:
#    curl -fsSL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/kill-xanvyor-nginx.sh | bash
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

echo -e "${CYAN}"
echo "============================================================"
echo "   KILL XANVYOR DI NGINX - DEFINITIVE FIX"
echo "   $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
  err "Harus jalan sebagai root"
  exit 1
fi

# ============================================================================
# STEP 1: Pastikan NEXVO jalan di port 3000 dulu
# ============================================================================
step "1/6  Pastikan NEXVO jalan di port 3000"

# Cek port 3000
if ! ss -tlnp | grep -q ':3000 '; then
  warn "Port 3000 belum listen! Start NEXVO dulu..."
  
  if [ -d /home/nexvo/.next/standalone ]; then
    cd /home/nexvo/.next/standalone
    [ -f /home/nexvo/.env.production ] && cp /home/nexvo/.env.production .env
    [ -f /home/nexvo/.env ] && cp /home/nexvo/.env .env
    
    pm2 delete nexvo-web 2>/dev/null
    PORT=3000 NODE_ENV=production pm2 start server.js --name nexvo-web --update-env
    sleep 5
  else
    err "NEXVO belum di-build! Jalankan dulu:"
    echo "  cd /home/nexvo && bun install && bun run build"
    echo "  mkdir -p .next/standalone/.next"
    echo "  cp -r .next/static .next/standalone/.next/"
    echo "  cp -r public .next/standalone/public"
    exit 1
  fi
fi

echo "  Port 3000 listener:"
ss -tlnp | grep ':3000 '
echo ""
echo "  Test HTTP 3000:"
curl -s -m 5 -o /dev/null -w "    HTTP %{http_code}\n" http://127.0.0.1:3000/

# ============================================================================
# STEP 2: Cari SEMUA config Nginx
# ============================================================================
step "2/6  Audit semua config Nginx"

echo "  === /etc/nginx/sites-enabled/ ==="
ls -la /etc/nginx/sites-enabled/ 2>/dev/null

echo ""
echo "  === /etc/nginx/conf.d/ ==="
ls -la /etc/nginx/conf.d/ 2>/dev/null

echo ""
echo "  === /etc/nginx/nginx.conf (http block) ==="
grep -E "include|server" /etc/nginx/nginx.conf 2>/dev/null | head -20

echo ""
echo "  === Cari config yang serve XANVYOR / file static ==="
for cfg in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
  [ -f "$cfg" ] || continue
  echo ""
  echo "  --- $cfg ---"
  grep -nE "root|proxy_pass|server_name|location" "$cfg" 2>/dev/null | head -15
done

# ============================================================================
# STEP 3: DISABLE SEMUA config lama (backup dulu)
# ============================================================================
step "3/6  Disable SEMUA config Nginx lama"

BACKUP_DIR="/etc/nginx/backup-$(date +%s)"
mkdir -p "$BACKUP_DIR"
log "Backup semua config ke: $BACKUP_DIR"

# Backup & disable semua di sites-enabled
for cfg in /etc/nginx/sites-enabled/*; do
  [ -f "$cfg" ] || continue
  cfg_name=$(basename "$cfg")
  cp "$cfg" "$BACKUP_DIR/sites-enabled-$cfg_name"
  echo "  Disable: $cfg"
  rm -f "$cfg"
done

# Backup & disable semua di conf.d
for cfg in /etc/nginx/conf.d/*.conf; do
  [ -f "$cfg" ] || continue
  cfg_name=$(basename "$cfg")
  cp "$cfg" "$BACKUP_DIR/conf.d-$cfg_name"
  echo "  Disable: $cfg"
  rm -f "$cfg"
done

# Cek juga folder cyberpanel nginx config
for cybercfg in /etc/nginx/conf.d/* /usr/local/lsws/conf/* ; do
  [ -f "$cybercfg" ] || continue
  if grep -qiE "xanvy|recon|osint" "$cybercfg" 2>/dev/null; then
    warn "Hapus config XANVYOR: $cybercfg"
    cp "$cybercfg" "$BACKUP_DIR/xanvyor-$(basename $cybercfg)" 2>/dev/null
    rm -f "$cybercfg"
  fi
done

log "Semua config lama di-disable"

# ============================================================================
# STEP 4: Buat 1 config tunggal - NEXVO reverse proxy
# ============================================================================
step "4/6  Buat config tunggal NEXVO (port 80 -> 3000)"

# Pastikan folder ada
mkdir -p /etc/nginx/sites-enabled /etc/nginx/conf.d

# Config utama - pastikan TIDAK ada config lain yang konflik
cat > /etc/nginx/sites-available/nexvo << 'NGINX_EOF'
# ============================================================================
# NEXVO - Reverse Proxy Configuration
# Semua request ke port 80 -> 127.0.0.1:3000 (NEXVO Next.js)
# ============================================================================
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 50M;

    # Logs
    access_log /var/log/nginx/nexvo-access.log;
    error_log /var/log/nginx/nexvo-error.log;

    # Reverse proxy ke NEXVO (port 3000)
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
        proxy_connect_timeout 60s;
    }

    # Static files dari Next.js (lewat proxy juga, no direct serve)
    location /_next/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support (kalau ada)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
NGINX_EOF

# Enable config NEXVO
ln -sf /etc/nginx/sites-available/nexvo /etc/nginx/sites-enabled/nexvo

# Hapus default config kalau ada
rm -f /etc/nginx/sites-enabled/default

log "Config NEXVO dibuat di /etc/nginx/sites-available/nexvo"

# ============================================================================
# STEP 5: Test config & restart Nginx
# ============================================================================
step "5/6  Test config & restart Nginx"

echo "  nginx -t:"
nginx -t 2>&1

echo ""
echo "  Restart Nginx..."
systemctl stop nginx 2>/dev/null
sleep 2
systemctl start nginx
sleep 3
systemctl status nginx --no-pager 2>&1 | head -10

echo ""
echo "  Port 80 listener sekarang:"
ss -tlnp | grep ':80 '

# ============================================================================
# STEP 6: Test dari VPS
# ============================================================================
step "6/6  Test dari VPS"

echo ""
echo "  Test HTTP 127.0.0.1:80 (harusnya NEXVO, bukan XANVYOR):"
HTTP80=$(curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:80/ 2>&1)
echo "    HTTP $HTTP80"

echo ""
echo "  Cek konten yang dilayani port 80 (apakah NEXVO atau XANVYOR):"
CONTENT=$(curl -s -m 10 http://127.0.0.1:80/ 2>&1 | head -50)
if echo "$CONTENT" | grep -qiE "xanvy|recon|osint"; then
  err "XANVYOR MASIH TAMPIL! Ada config lain yang belum di-disable"
  echo ""
  echo "  Cari config yang masih serve XANVYOR:"
  grep -rl "xanvy\|recon" /etc/nginx/ 2>/dev/null
  echo ""
  echo "  Cek OpenLiteSpeed (kalau ada):"
  ss -tlnp | grep ':80 '
  echo ""
  echo "  Mungkin OpenLiteSpeed yang serve, bukan Nginx. Stop OpenLiteSpeed:"
  echo "    /usr/local/lsws/bin/lswsctrl stop"
  echo "    systemctl stop lscpd"
  echo "    systemctl disable lscpd"
elif echo "$CONTENT" | grep -qiE "nexvo\|NEXVO\|login\|deposit"; then
  log "NEXVO TAMPIL! Web sudah benar"
else
  warn "Konten tidak dikenali. Tampilkan 50 baris pertama:"
  echo "$CONTENT" | head -50
fi

echo ""
echo "  Test HTTP 3000 (NEXVO langsung):"
HTTP3000=$(curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ 2>&1)
echo "    HTTP $HTTP3000"

echo ""
echo "  PM2 status:"
pm2 list 2>/dev/null

# ============================================================================
# DONE
# ============================================================================
echo -e "${GREEN}"
echo "============================================================"
echo "   SELESAI"
echo "============================================================"
echo -e "${NC}"
echo ""
echo "  Backup config lama: $BACKUP_DIR"
echo "  Config NEXVO      : /etc/nginx/sites-available/nexvo"
echo ""
echo "  Coba buka (pakai INCOGNITO/Private window biar bypass cache):"
echo "    http://nexvo.id"
echo "    http://76.13.198.125"
echo ""
echo "  Kalau XANVYOR masih tampil, kemungkinan OpenLiteSpeed yang serve."
echo "  Jalankan command ini untuk STOP OpenLiteSpeed permanently:"
echo ""
echo "    /usr/local/lsws/bin/lswsctrl stop"
echo "    systemctl stop lscpd"
echo "    systemctl disable lscpd"
echo "    systemctl restart nginx"
echo ""
echo "  Lalu test lagi: curl -I http://127.0.0.1:80/"
echo ""
echo "============================================================"
