#!/bin/bash
# ============================================================================
#  NEXVO - PURGE XANVYOR + ACTIVATE NEXVO (one-shot)
# ----------------------------------------------------------------------------
#  Script ini akan:
#    1. STOP & HAPUS XANVYOR total (PM2, file, config OpenLiteSpeed)
#    2. UPDATE NEXVO dari GitHub (versi premium terbaru)
#    3. BUILD + START NEXVO via PM2
#    4. CONFIGURE OpenLiteSpeed reverse proxy (port 80 -> 3000)
#    5. TEST aplikasi
#
#  CARA PAKAI (di Browser Terminal Hostinger sebagai root):
#    bash purge-and-activate.sh
#
#  Atau langsung dari GitHub:
#    curl -fsSL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/purge-and-activate.sh | bash
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
DOMAIN="nexvo.id"

echo -e "${CYAN}"
echo "============================================================"
echo "   PURGE XANVYOR + ACTIVATE NEXVO"
echo "   $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
  err "Harus jalan sebagai root. Pakai: sudo bash purge-and-activate.sh"
  exit 1
fi

export BUN_INSTALL="/root/.bun"
export PATH="$BUN_INSTALL/bin:/usr/local/bin:/usr/bin:/usr/local/sbin:/usr/local/lsws/bin:$PATH"

# ============================================================================
# STEP 1: STOP & KILL semua process XANVYOR + NEXVO lama
# ============================================================================
step "1/8  Stop & kill semua process lama"

log "Stop PM2..."
pm2 kill 2>/dev/null
sleep 2

log "Kill process yang listen di port 3000, 3001, 8080, 8081 (XANVYOR kemungkinan di situ)..."
for port in 3000 3001 8080 8081 8888; do
  pids=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | sort -u)
  if [ -n "$pids" ]; then
    echo "  Port $port dikuasai PID: $pids - killing..."
    for pid in $pids; do
      kill -9 $pid 2>/dev/null
    done
  fi
done

log "Cari & kill process XANVYOR berdasarkan nama..."
for proc_name in xanvyor xanvy XANVYOR; do
  pids=$(pgrep -if "$proc_name" 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "  Kill $proc_name PID: $pids"
    for pid in $pids; do
      kill -9 $pid 2>/dev/null
    done
  fi
done

log "Kill node/bun process yang jalan dari folder XANVYOR..."
ps aux | grep -iE "xanvy|recon|osint" | grep -v grep | awk '{print $2}' | while read pid; do
  echo "  Kill PID $pid (XANVYOR related)"
  kill -9 $pid 2>/dev/null
done

sleep 2
log "Cek port setelah kill:"
ss -tlnp 2>/dev/null | grep -E ':(80|3000|3001|8080|8090) ' | head -10

# ============================================================================
# STEP 2: HAPUS file XANVYOR total
# ============================================================================
step "2/8  Hapus file XANVYOR total"

# Cari folder XANVYOR di berbagai lokasi
XANVYOR_DIRS=()
for candidate in \
  "/home/xanvyor" \
  "/home/xanvy" \
  "/home/XANVYOR" \
  "/root/xanvyor" \
  "/root/xanvy" \
  "/var/www/xanvyor" \
  "/var/www/xanvy" \
  "/usr/local/lsws/Example/html/xanvyor" \
  "/home/xanvyor-recon" \
  "/root/xanvyor-recon" \
  "/opt/xanvyor"; do
  if [ -d "$candidate" ]; then
    XANVYOR_DIRS+=("$candidate")
  fi
done

# Cari folder yang ada kata "xanvy" atau "recon"
for dir in /home /root /var/www /opt; do
  if [ -d "$dir" ]; then
    find "$dir" -maxdepth 2 -type d -iname "*xanvy*" 2>/dev/null | while read d; do
      [ -d "$d" ] && XANVYOR_DIRS+=("$d")
    done
    find "$dir" -maxdepth 2 -type d -iname "*recon*" 2>/dev/null | while read d; do
      [ -d "$d" ] && XANVYOR_DIRS+=("$d")
    done
  fi
done

# Hapus semua folder XANVYOR yang ditemukan
if [ ${#XANVYOR_DIRS[@]} -gt 0 ]; then
  for dir in "${XANVYOR_DIRS[@]}"; do
    if [ -d "$dir" ]; then
      echo "  Hapus folder: $dir ($(du -sh $dir 2>/dev/null | awk '{print $1}'))"
      rm -rf "$dir"
    fi
  done
  log "Semua folder XANVYOR dihapus"
else
  warn "Folder XANVYOR tidak ditemukan di lokasi umum"
fi

# Cari file XANVYOR di public_html CyberPanel
log "Cari & hapus file XANVYOR di CyberPanel public_html..."
find /home -name "index.html" -path "*/public_html/*" 2>/dev/null | while read f; do
  if grep -qiE "xanvyor|recon|osint" "$f" 2>/dev/null; then
    echo "  Hapus file XANVYOR: $f"
    rm -f "$f"
    # Hapus folder sekitar juga
    parent_dir=$(dirname "$f")
    rm -rf "$parent_dir"/*xanvy* "$parent_dir"/*recon* 2>/dev/null
  fi
done

log "Cari & hapus service XANVYOR di systemd..."
for svc in xanvyor xanvy recon; do
  if systemctl list-units --all 2>/dev/null | grep -q "$svc"; then
    systemctl stop "$svc" 2>/dev/null
    systemctl disable "$svc" 2>/dev/null
    rm -f "/etc/systemd/system/${svc}.service"
    echo "  Hapus systemd service: $svc"
  fi
done
systemctl daemon-reload 2>/dev/null

# ============================================================================
# STEP 3: HAPUS config XANVYOR di OpenLiteSpeed
# ============================================================================
step "3/8  Hapus config XANVYOR di OpenLiteSpeed"

# Cari vhost XANVYOR di OpenLiteSpeed
log "Cari vhost XANVYOR di OpenLiteSpeed..."
VHOST_CONF="/usr/local/lsws/conf/httpd_config.conf"
if [ -f "$VHOST_CONF" ]; then
  # Backup dulu
  cp "$VHOST_CONF" "${VHOST_CONF}.bak.$(date +%s)"
  
  # Hapus blok vhost XANVYOR (kalau ada)
  if grep -qi "xanvyor\|xanvy" "$VHOST_CONF"; then
    warn "Ditemukan config XANVYOR di httpd_config.conf, hapus..."
    # Buat file baru tanpa baris yang mengandung xanvyor
    sed -i '/[Xx]anvy/ba; d; ba;' "$VHOST_CONF" 2>/dev/null || true
    log "Config XANVYOR dihapus dari httpd_config.conf"
  else
    log "Tidak ada config XANVYOR di httpd_config.conf"
  fi
fi

# Cari & hapus vhost folder XANVYOR
find /usr/local/lsws/conf/vhosts -maxdepth 1 -type d -iname "*xanvy*" 2>/dev/null | while read d; do
  echo "  Hapus vhost: $d"
  rm -rf "$d"
done

# Cek CyberPanel websites
log "Cek websites di CyberPanel..."
if [ -f /usr/local/CyberCP/cyberPanel.py ]; then
  warn "CyberPanel terdeteksi. Cek daftar websites via CLI..."
  python3 /usr/local/CyberCP/plogical/virtualHostUtilities.py listWebsite 2>/dev/null | head -10 || true
fi

# ============================================================================
# STEP 4: Update NEXVO dari GitHub (versi premium terbaru)
# ============================================================================
step "4/8  Update NEXVO dari GitHub"

if [ ! -d "$PROJECT_DIR" ]; then
  log "Folder $PROJECT_DIR tidak ada, clone dari GitHub..."
  git clone -b main "https://github.com/ucpai-store/nexvoid.git" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
else
  log "Update existing repo di $PROJECT_DIR..."
  cd "$PROJECT_DIR"
  
  # Backup .env dan database lokal
  [ -f .env ] && cp .env .env.backup.$(date +%s)
  [ -f .env.production ] && cp .env.production .env.production.backup.$(date +%s)
  
  # Reset git config kalau ada masalah
  git config --global --add safe.directory "$PROJECT_DIR" 2>/dev/null
  
  # Cek apakah ini repo NEXVO atau XANVYOR
  if ! git remote -v | grep -q "nexvo"; then
    warn "Folder /home/nexvo bukan repo NEXVO! Re-clone..."
    cd /home
    mv nexvo nexvo.old.$(date +%s) 2>/dev/null
    git clone -b main "https://github.com/ucpai-store/nexvoid.git" "$PROJECT_DIR"
    cd "$PROJECT_DIR"
  else
    # Fetch & reset ke latest
    git fetch origin main
    git reset --hard origin/main
    git pull origin main 2>/dev/null || true
  fi
  
  # Restore .env.production dari backup kalau ada
  ls -t .env.production.backup.* 2>/dev/null | head -1 | xargs -I{} cp {} .env.production 2>/dev/null
fi

log "Git log (latest commits):"
git log --oneline -5
log "NEXVO code updated to latest premium version"

# ============================================================================
# STEP 5: Install Node, Bun, PM2 (kalau belum ada)
# ============================================================================
step "5/8  Cek & install Node, Bun, PM2"

if ! command -v node &> /dev/null; then
  err "Node.js belum terinstall!"
  echo ""
  echo "  Install Node.js 20 LTS di AlmaLinux/RHEL:"
  echo "    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -"
  echo "    yum install -y nodejs"
  echo "  Setelah itu jalankan script ini lagi."
  exit 1
fi
log "Node: $(node -v)"

if ! command -v bun &> /dev/null; then
  warn "Bun belum terinstall, install..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="/root/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi
ln -sf /root/.bun/bin/bun /usr/local/bin/bun 2>/dev/null
log "Bun: $(bun --version 2>/dev/null)"

if ! command -v pm2 &> /dev/null; then
  warn "PM2 belum terinstall, install..."
  npm install -g pm2
fi
log "PM2: $(pm2 --version 2>/dev/null)"

# ============================================================================
# STEP 6: Install deps + build NEXVO
# ============================================================================
step "6/8  Install deps + build NEXVO"
cd "$PROJECT_DIR"

log "bun install..."
bun install 2>&1 | tail -5

log "prisma generate..."
bunx prisma generate 2>&1 | tail -3

log "prisma db push (KEEP data lama, sync schema)..."
bunx prisma db push --accept-data-loss 2>&1 | tail -5

log "next build..."
bun run build 2>&1 | tail -10

log "Copy static assets ke standalone..."
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/ 2>/dev/null
cp -r public .next/standalone/public 2>/dev/null

# Pastikan .env ada
[ -f .env.production ] && cp .env.production .env
log "Build selesai"

# ============================================================================
# STEP 7: Start PM2 + configure OpenLiteSpeed reverse proxy
# ============================================================================
step "7/8  Start PM2 + configure reverse proxy"

cd "$PROJECT_DIR/.next/standalone"
pm2 delete nexvo-web 2>/dev/null
pm2 delete nexvo-cron 2>/dev/null

PORT=$APP_PORT NODE_ENV=production pm2 start server.js --name nexvo-web --update-env
sleep 3

cd "$PROJECT_DIR"
pm2 start "bun run cron-service.ts" --name nexvo-cron --update-env 2>/dev/null || warn "cron-service opsional"

pm2 save
log "PM2 status:"
pm2 list

# Setup auto-start on boot
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root 2>&1 | grep "systemctl\|sudo" | bash 2>/dev/null
pm2 save
systemctl enable pm2-root 2>/dev/null || true

# Configure OpenLiteSpeed reverse proxy untuk nexvo.id -> 3000
log "Configure OpenLiteSpeed reverse proxy (port 80 -> 3000)..."
if [ -d /usr/local/lsws ]; then
  # Pastikan OpenLiteSpeed jalan
  /usr/local/lsws/bin/lswsctrl status 2>/dev/null | head -3
  /usr/local/lsws/bin/lswsctrl start 2>/dev/null
  sleep 2
  
  # Cek vhost nexvo.id di CyberPanel
  VHOST_DIR="/usr/local/lsws/conf/vhosts"
  if [ -d "$VHOST_DIR" ]; then
    log "Daftar vhost OpenLiteSpeed:"
    ls -la "$VHOST_DIR" | head -20
    
    # Cari vhost untuk nexvo.id
    for vhost in "$VHOST_DIR"/*/; do
      vhost_name=$(basename "$vhost")
      log "  Vhost: $vhost_name"
      
      # Edit vhost conf untuk add reverse proxy ke 3000
      VHCONF="$vhost/vhconf.conf"
      if [ -f "$VHCONF" ]; then
        # Backup
        cp "$VHCONF" "${VHCONF}.bak.$(date +%s)"
        
        # Cek apakah sudah ada context proxy
        if ! grep -q "127.0.0.1:3000" "$VHCONF"; then
          log "  Tambah reverse proxy ke $VHCONF"
          
          # Tambah context proxy di akhir file
          cat >> "$VHCONF" << 'PROXY_EOF'

extprocessor nexvoapp {
  type                      proxy
  address                   127.0.0.1:3000
  maxConns                  100
  initTimeout               60
  retryTimeout              0
  respBuffer                0
}

context / {
  type                      proxy
  handler                   nexvoapp
  addDefaultCharset         off
}
PROXY_EOF
          log "  Reverse proxy ditambahkan"
        else
          log "  Reverse proxy sudah ada"
        fi
      fi
    done
  fi
  
  # Test config & restart OpenLiteSpeed
  /usr/local/lsws/bin/lswsctrl restart 2>&1 | tail -3
  sleep 3
  log "OpenLiteSpeed restarted"
fi

# ============================================================================
# STEP 8: Test & verify
# ============================================================================
step "8/8  Test & verify"

echo ""
echo "  Port listeners:"
ss -tlnp 2>/dev/null | grep -E ':(80|3000|3001|8090) ' | head -10

echo ""
echo "  Test port 3000 (NEXVO langsung):"
HTTP3000=$(curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ 2>&1)
echo "    HTTP $HTTP3000"

echo "  Test port 80 (via OpenLiteSpeed):"
HTTP80=$(curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:80/ 2>&1)
echo "    HTTP $HTTP80"

echo "  Test domain nexvo.id (dari VPS):"
HTTPDOMAIN=$(curl -s -m 10 -o /dev/null -w "%{http_code}" -H "Host: nexvo.id" http://127.0.0.1:80/ 2>&1)
echo "    HTTP $HTTPDOMAIN"

echo ""
echo "  PM2 logs (last 20 lines):"
pm2 logs nexvo-web --nostream --lines 20 2>&1 | tail -25

# ============================================================================
# DONE
# ============================================================================
echo -e "${GREEN}"
echo "============================================================"
echo "   PURGE XANVYOR + ACTIVATE NEXVO SELESAI!"
echo "============================================================"
echo -e "${NC}"
echo ""
echo "  XANVYOR: DIHAPUS TOTAL (file + process + config)"
echo "  NEXVO  : AKTIF (PM2 + OpenLiteSpeed reverse proxy)"
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
echo "  Kalau masih ada masalah, jalankan:"
echo "    pm2 logs nexvo-web --lines 50"
echo "    ss -tlnp | grep -E ':80|:3000'"
echo "    curl -v http://127.0.0.1:3000"
echo ""
echo "  Kalau XANVYOR masih muncul, kemungkinan ada di:"
echo "    - CyberPanel website lain (cek di https://76.13.198.125:8090)"
echo "    - Cache browser (coba incognito / clear cache)"
echo "    - DNS cache (coba ganti DNS ke 8.8.8.8)"
echo ""
echo "============================================================"
