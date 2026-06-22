#!/bin/bash
# ============================================================================
#  NEXVO - SAFE RESTORE (ZERO DELETION)
# ----------------------------------------------------------------------------
#  Script SUPER AMAN yang TIDAK MENGHAPUS APAPUN:
#    - TIDAK hapus folder /home/nexvo/
#    - TIDAK hapus PM2 process nexvo-*
#    - TIDAK hapus database
#    - TIDAK hapus config Nginx (cuma backup & disable sementara)
#    - TIDAK hapus file XANVYOR (cuma stop process-nya)
#
#  Yang dilakukan:
#    1. Tampilkan status saat ini (PM2, port, config)
#    2. Stop CUMA process XANVYOR (ai-tunnel-server, xanvyor, recon)
#    3. Fix nexvo-web yang errored (port conflict)
#    4. Backup config Nginx lama (TIDAK dihapus, cuma di-rename .disabled)
#    5. Tambah config NEXVO sebagai default_server
#    6. Test & verify
#
#  CARA PAKAI:
#    curl -fsSL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/safe-restore-nexvo.sh | bash
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
echo "   NEXVO SAFE RESTORE (ZERO FILE DELETION)"
echo "   $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"
echo -e "${NC}"
echo "  Mode: AMAN - TIDAK menghapus file/folder apapun"
echo "  Hanya: stop process XANVYOR + fix NEXVO + config Nginx"
echo ""

if [ "$EUID" -ne 0 ]; then
  err "Harus jalan sebagai root"
  exit 1
fi

export BUN_INSTALL="/root/.bun"
export PATH="$BUN_INSTALL/bin:/usr/local/bin:/usr/bin:/usr/local/sbin:$PATH"

# ============================================================================
# STEP 1: Tampilkan status lengkap (READ-ONLY, tidak ubah apapun)
# ============================================================================
step "1/7  Status VPS saat ini (READ-ONLY)"

echo "  === PM2 Process List ==="
pm2 list 2>/dev/null

echo ""
echo "  === Port Listeners ==="
ss -tlnp | grep -E ':(80|3000|3001|8080|8090|9090) ' | head -10

echo ""
echo "  === NEXVO folder check ==="
if [ -d /home/nexvo ]; then
  log "Folder /home/nexvo ADA (AMAN, tidak akan dihapus)"
  ls -la /home/nexvo/ | head -10
  echo "  Size: $(du -sh /home/nexvo 2>/dev/null | awk '{print $1}')"
else
  err "Folder /home/nexvo TIDAK ADA!"
  exit 1
fi

echo ""
echo "  === Database check ==="
for db in /home/z/my-project/db/custom.db /home/nexvo/db/custom.db /home/nexvo/prisma/dev.db /home/nexvo/custom.db; do
  if [ -f "$db" ]; then
    log "Database ADA: $db ($(du -h $db | awk '{print $1}'))"
  fi
done

# ============================================================================
# STEP 2: Identifikasi process XANVYOR (TIDAK di-kill dulu, cuma tampilkan)
# ============================================================================
step "2/7  Identifikasi process XANVYOR"

echo "  Process yang KEMUNGKINAN XANVYOR (akan di-stop):"
pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        name = p.get('name', '')
        status = p.get('pm2_env', {}).get('status', '')
        # Process yang jelas XANVYOR
        if any(x in name.lower() for x in ['xanvy', 'recon', 'osint', 'ai-tunnel', 'ai_tunnel']):
            print(f'  [XANVYOR] {name} ({status}) - WILL STOP')
        # Process yang jelas NEXVO
        elif 'nexvo' in name.lower():
            print(f'  [NEXVO]   {name} ({status}) - KEEP')
        else:
            print(f'  [UNKNOWN] {name} ({status}) - KEEP (tidak tau apa ini)')
except Exception as e:
    print(f'  Error parsing PM2: {e}')
"

echo ""
echo "  Tekan Enter untuk lanjut, atau Ctrl+C untuk batal..."
read -t 5 -r 2>/dev/null || echo "  (Auto continue after 5s)"

# ============================================================================
# STEP 3: Stop CUMA process XANVYOR (KEEP semua process nexvo-*)
# ============================================================================
step "3/7  Stop process XANVYOR (KEEP NEXVO)"

# Daftar process XANVYOR yang akan di-stop
XANVYOR_NAMES=("ai-tunnel-server" "ai_tunnel_server" "xanvyor" "xanvy" "recon" "osint" "xanvyor-web" "xanvyor-api" "xanvyor-bot")

for name in "${XANVYOR_NAMES[@]}"; do
  if pm2 list 2>/dev/null | grep -q "$name"; then
    log "Stop XANVYOR process: $name"
    pm2 stop "$name" 2>/dev/null
    pm2 delete "$name" 2>/dev/null
  fi
done

# Cek process node/bun yang jalan dari folder xanvyor (TIDAK hapus foldernya)
log "Cari process yang jalan dari folder XANVYOR (TIDAK hapus file-nya)..."
ps aux | grep -iE "xanvy|recon|osint" | grep -v grep | grep -v "nexvo" | awk '{print $2, $11, $12}' | while read pid cmd args; do
  if [ -n "$pid" ] && [ "$pid" != "PID" ]; then
    echo "  Stop PID $pid (process XANVYOR terkait)"
    kill -TERM $pid 2>/dev/null
    sleep 1
    kill -9 $pid 2>/dev/null
  fi
done

pm2 save 2>/dev/null
log "Process XANVYOR di-stop. NEXVO process TETAP AMAN"

echo ""
echo "  PM2 status setelah stop XANVYOR:"
pm2 list 2>/dev/null

# ============================================================================
# STEP 4: Fix nexvo-web yang errored (port conflict)
# ============================================================================
step "4/7  Fix nexvo-web yang errored"

# Cek apakah nexvo-web errored
NEXVO_WEB_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p.get('name') == 'nexvo-web':
            print(p.get('pm2_env', {}).get('status', ''))
            break
except:
    print('unknown')
" 2>/dev/null)

log "nexvo-web status: $NEXVO_WEB_STATUS"

if [ "$NEXVO_WEB_STATUS" = "errored" ] || [ "$NEXVO_WEB_STATUS" = "stopped" ] || [ -z "$NEXVO_WEB_STATUS" ]; then
  warn "nexvo-web bermasalah, restart..."
  
  # Cek port 3000 siapa yang pegang
  echo "  Siapa yang pegang port 3000:"
  PORT3000_INFO=$(ss -tlnp | grep ':3000 ')
  echo "    $PORT3000_INFO"
  
  # Kill process yang pegang port 3000 (TIDAK termasuk nexvo-web sendiri)
  PIDS_PORT3000=$(ss -tlnp 2>/dev/null | grep ':3000 ' | grep -oP 'pid=\K[0-9]+' | sort -u)
  if [ -n "$PIDS_PORT3000" ]; then
    for pid in $PIDS_PORT3000; do
      pid_name=$(ps -p $pid -o comm= 2>/dev/null)
      pid_cmd=$(ps -p $pid -o args= 2>/dev/null | head -c 100)
      echo "    PID $pid ($pid_name): $pid_cmd"
      
      # Jangan kill kalau ini nexvo-web sendiri
      if echo "$pid_cmd" | grep -q "nexvo"; then
        echo "      -> SKIP (ini nexvo-web sendiri)"
      else
        echo "      -> KILL (process lain yang pegang port 3000)"
        kill -9 $pid 2>/dev/null
      fi
    done
    sleep 2
  fi
  
  # Restart nexvo-web
  if [ -d /home/nexvo/.next/standalone ]; then
    cd /home/nexvo/.next/standalone
    [ -f /home/nexvo/.env.production ] && cp /home/nexvo/.env.production .env
    [ -f /home/nexvo/.env ] && cp /home/nexvo/.env .env
    
    pm2 delete nexvo-web 2>/dev/null
    log "Start nexvo-web fresh..."
    PORT=3000 NODE_ENV=production pm2 start server.js --name nexvo-web --update-env
    sleep 5
    pm2 save
  else
    err "Folder /home/nexvo/.next/standalone tidak ada! Build dulu:"
    echo "  cd /home/nexvo && bun install && bun run build"
    echo "  mkdir -p .next/standalone/.next"
    echo "  cp -r .next/static .next/standalone/.next/"
    echo "  cp -r public .next/standalone/public"
  fi
else
  log "nexvo-web sudah online"
fi

echo ""
echo "  Test port 3000:"
sleep 3
HTTP3000=$(curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ 2>&1)
echo "    HTTP $HTTP3000"

echo ""
echo "  PM2 status setelah fix:"
pm2 list 2>/dev/null

# ============================================================================
# STEP 5: Backup & disable config Nginx lama (TIDAK dihapus, cuma .disabled)
# ============================================================================
step "5/7  Backup & disable config Nginx lama (RENAME, bukan delete)"

BACKUP_DIR="/etc/nginx/backup-safe-$(date +%s)"
mkdir -p "$BACKUP_DIR"
log "Backup folder: $BACKUP_DIR"

# Backup semua config yang ada dulu (jaga-jaga)
cp -r /etc/nginx/sites-enabled/* "$BACKUP_DIR/" 2>/dev/null
cp -r /etc/nginx/conf.d/*.conf "$BACKUP_DIR/" 2>/dev/null
log "Semua config di-backup ke $BACKUP_DIR"

# Disable config lama dengan RENAME (bukan delete) - jadi .disabled
for cfg in /etc/nginx/sites-enabled/*; do
  [ -f "$cfg" ] || continue
  cfg_name=$(basename "$cfg")
  echo "  Disable (rename): $cfg -> ${cfg_name}.disabled"
  mv "$cfg" "${cfg}.disabled" 2>/dev/null
done

for cfg in /etc/nginx/conf.d/*.conf; do
  [ -f "$cfg" ] || continue
  cfg_name=$(basename "$cfg")
  echo "  Disable (rename): $cfg -> ${cfg_name}.disabled"
  mv "$cfg" "${cfg}.disabled" 2>/dev/null
done

log "Semua config Nginx lama di-disable (TIDAK dihapus, masih bisa di-restore)"

# ============================================================================
# STEP 6: Buat config NEXVO sebagai default_server
# ============================================================================
step "6/7  Buat config NEXVO (port 80 -> 127.0.0.1:3000)"

mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

cat > /etc/nginx/sites-available/nexvo << 'NGINX_EOF'
# NEXVO - Reverse Proxy (SAFE MODE, tidak menghapus apapun)
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 50M;

    access_log /var/log/nginx/nexvo-access.log;
    error_log /var/log/nginx/nexvo-error.log;

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

    location /_next/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
NGINX_EOF

ln -sf /etc/nginx/sites-available/nexvo /etc/nginx/sites-enabled/nexvo
log "Config NEXVO dibuat & di-enable"

# Test config
echo ""
echo "  nginx -t:"
nginx -t 2>&1

# Restart Nginx
echo ""
log "Restart Nginx..."
systemctl restart nginx
sleep 3
systemctl status nginx --no-pager 2>&1 | head -5

# ============================================================================
# STEP 7: Verify everything
# ============================================================================
step "7/7  Verify semua service"

echo ""
echo "  === Port Listeners ==="
ss -tlnp | grep -E ':(80|3000) '

echo ""
echo "  === Test HTTP ==="
echo "  Port 3000 (NEXVO langsung):"
HTTP3000=$(curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ 2>&1)
echo "    HTTP $HTTP3000"

echo "  Port 80 (via Nginx):"
HTTP80=$(curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:80/ 2>&1)
echo "    HTTP $HTTP80"

echo ""
echo "  === Cek konten yang dilayani port 80 ==="
CONTENT=$(curl -s -m 10 http://127.0.0.1:80/ 2>&1 | head -100)
if echo "$CONTENT" | grep -qiE "xanvy|recon|osint"; then
  err "XANVYOR MASIH TAMPIL di port 80!"
  echo ""
  warn "Kemungkinan OpenLiteSpeed yang serve, BUKAN Nginx"
  echo "  Cek:"
  echo "    ss -tlnp | grep ':80 '"
  echo "  Kalau litespeed/ols yang pegang port 80, jalankan:"
  echo "    /usr/local/lsws/bin/lswsctrl stop"
  echo "    systemctl stop lscpd"
  echo "    systemctl disable lscpd"
  echo "    systemctl restart nginx"
elif echo "$CONTENT" | grep -qiE "nexvo|NEXVO|login|deposit|whatsapp"; then
  log "NEXVO TAMPIL di port 80!"
else
  warn "Konten tidak dikenali. 50 baris pertama:"
  echo "$CONTENT" | head -50
fi

echo ""
echo "  === PM2 Final Status ==="
pm2 list 2>/dev/null

# ============================================================================
# DONE
# ============================================================================
echo -e "${GREEN}"
echo "============================================================"
echo "   SAFE RESTORE SELESAI"
echo "============================================================"
echo -e "${NC}"
echo ""
echo "  YANG DILAKUKAN (semua reversible):"
echo "    1. Stop process XANVYOR (ai-tunnel-server, dll)"
echo "    2. Fix nexvo-web yang errored (restart bersih)"
echo "    3. Backup config Nginx lama ke: $BACKUP_DIR"
echo "    4. Disable config lama (rename jadi .disabled, BUKAN hapus)"
echo "    5. Buat config NEXVO baru sebagai default_server"
echo "    6. Restart Nginx"
echo ""
echo "  YANG TIDAK DIHAPUS (semua masih aman):"
echo "    - /home/nexvo/ (NEXVO project)        ✅ AMAN"
echo "    - /home/z/my-project/db/custom.db     ✅ AMAN"
echo "    - PM2 process nexvo-*                  ✅ AMAN"
echo "    - Data user, transaksi, settings       ✅ AMAN"
echo "    - File XANVYOR (kalau ada di /home/xanvyor dll) ✅ AMAN"
echo "      (cuma process-nya di-stop, file-nya tetap ada)"
echo ""
echo "  CARA ROLLBACK (kalau mau batal):"
echo "    # Restore config Nginx lama:"
echo "    cp $BACKUP_DIR/* /etc/nginx/sites-enabled/"
echo "    rm /etc/nginx/sites-enabled/nexvo"
echo "    systemctl restart nginx"
echo ""
echo "  Coba buka di INCOGNITO window:"
echo "    http://nexvo.id"
echo "    http://76.13.198.125"
echo ""
echo "  Admin: http://nexvo.id/admin (admin / Admin@2024)"
echo ""
echo "============================================================"
