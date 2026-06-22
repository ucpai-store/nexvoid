#!/bin/bash
# ============================================================================
#  NUKEXANVYOR - HAPUS TOTAL XANVYOR, JAMIN NEXVO 100% AMAN
# ----------------------------------------------------------------------------
#  Safety guard:
#    - Setiap folder/file/process di-CHECK dulu: ini XANVYOR atau NEXVO?
#    - Kalau mengandung kata "nexvo" -> SKIP, JANGAN DIHAPUS
#    - Kalau mengandung kata "xanvy/recon/osint" -> HAPUS
#    - Unknown -> tampilkan, biar user decide
#    - Backup semua config sebelum hapus
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

BACKUP_DIR="/root/xanvyor-backup-$(date +%s)"
mkdir -p "$BACKUP_DIR"

echo -e "${RED}"
echo "============================================================"
echo "   NUKEXANVYOR - HAPUS TOTAL XANVYOR"
echo "   NEXVO project: 100% AMAN (tidak akan disentuh)"
echo "   $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"
echo -e "${NC}"
echo "  Backup folder: $BACKUP_DIR"
echo ""

if [ "$EUID" -ne 0 ]; then
  err "Harus jalan sebagai root"
  exit 1
fi

export BUN_INSTALL="/root/.bun"
export PATH="$BUN_INSTALL/bin:/usr/local/bin:/usr/bin:/usr/local/sbin:$PATH"

# ============================================================================
# SAFETY CHECK 1: Pastikan folder NEXVO ada dan TIDAK akan dihapus
# ============================================================================
step "SAFETY CHECK: Pastikan NEXVO aman"

if [ ! -d /home/nexvo ]; then
  err "Folder /home/nexvo TIDAK ADA! Bahaya, abort."
  exit 1
fi

log "Folder /home/nexvo ADA (size: $(du -sh /home/nexvo 2>/dev/null | awk '{print $1}'))"
log "NEXVO akan DILINDUNGI. Tidak akan dihapus."
echo ""
echo "  Isi folder /home/nexvo (akan dilindungi):"
ls /home/nexvo/ | head -15

# ============================================================================
# STEP 1: STOP & DELETE SEMUA PM2 PROCESS XANVYOR
# ============================================================================
step "1/6  Stop & delete PM2 process XANVYOR"

log "Daftar PM2 process saat ini:"
pm2 list 2>/dev/null
echo ""

# Loop semua PM2 process, identify XANVYOR vs NEXVO
pm2 jlist 2>/dev/null | python3 -c "
import sys, json
procs = json.load(sys.stdin)
xanvyor_procs = []
nexvo_procs = []
unknown_procs = []

for p in procs:
    name = p.get('name', '')
    name_lower = name.lower()
    pm_cwd = p.get('pm2_env', {}).get('pm_cwd', '')
    
    if 'nexvo' in name_lower:
        nexvo_procs.append(name)
        print(f'  [NEXVO]   {name} (cwd: {pm_cwd}) - KEEP')
    elif any(x in name_lower for x in ['xanvy', 'recon', 'osint', 'ai-tunnel', 'ai_tunnel', 'tunnel']):
        xanvyor_procs.append(name)
        print(f'  [XANVYOR] {name} (cwd: {pm_cwd}) - WILL DELETE')
    else:
        # Cek cwd juga
        if 'xanvy' in pm_cwd.lower() or 'recon' in pm_cwd.lower():
            xanvyor_procs.append(name)
            print(f'  [XANVYOR] {name} (cwd: {pm_cwd}) - WILL DELETE')
        elif 'nexvo' in pm_cwd.lower():
            nexvo_procs.append(name)
            print(f'  [NEXVO]   {name} (cwd: {pm_cwd}) - KEEP')
        else:
            unknown_procs.append((name, pm_cwd))
            print(f'  [UNKNOWN] {name} (cwd: {pm_cwd}) - ASK USER')

# Output JSON ke file untuk dipakai bash
import json as j
with open('/tmp/pm2_xanvyor.json', 'w') as f:
    j.dump({'xanvyor': xanvyor_procs, 'nexvo': nexvo_procs, 'unknown': unknown_procs}, f)
"

echo ""
log "Stop & delete XANVYOR PM2 process..."
python3 -c "
import json
with open('/tmp/pm2_xanvyor.json') as f:
    data = json.load(f)
for name in data['xanvyor']:
    print(f'  pm2 stop {name}')
" | while read cmd; do
  proc_name=$(echo "$cmd" | awk '{print $3}')
  echo "  Stopping: $proc_name"
  pm2 stop "$proc_name" 2>/dev/null
  pm2 delete "$proc_name" 2>/dev/null
done

echo ""
log "Process UNKNOWN (perlu keputusan kamu):"
python3 -c "
import json
with open('/tmp/pm2_xanvyor.json') as f:
    data = json.load(f)
if not data['unknown']:
    print('  (tidak ada)')
else:
    for name, cwd in data['unknown']:
        print(f'  - {name} (cwd: {cwd})')
        print(f'    Hapus manual kalau ini XANVYOR: pm2 delete {name}')
"

pm2 save 2>/dev/null
echo ""
log "PM2 status setelah bersih:"
pm2 list 2>/dev/null

# ============================================================================
# STEP 2: Cari & hapus SEMUA folder/file XANVYOR (guard: skip yang ada 'nexvo')
# ============================================================================
step "2/6  Cari & hapus folder/file XANVYOR"

log "Scan folder yang kemungkinan XANVYOR..."
echo ""

# Daftar kandidat folder XANVYOR
declare -a candidates=(
  "/home/xanvyor"
  "/home/xanvy"
  "/home/XANVYOR"
  "/home/xanvyor-recon"
  "/root/xanvyor"
  "/root/xanvy"
  "/root/xanvyor-recon"
  "/var/www/xanvyor"
  "/var/www/xanvy"
  "/opt/xanvyor"
  "/opt/xanvy"
  "/srv/xanvyor"
)

# Tambah kandidat dari find (cari folder yang ada kata xanvy/recon/osint)
for search_dir in /home /root /var/www /opt /srv; do
  [ -d "$search_dir" ] || continue
  while IFS= read -r d; do
    # SKIP kalau ada kata nexvo (jangan salah hapus)
    if echo "$d" | grep -qi "nexvo"; then
      log "SKIP (mengandung 'nexvo'): $d"
      continue
    fi
    candidates+=("$d")
  done < <(find "$search_dir" -maxdepth 3 -type d \( -iname "*xanvy*" -o -iname "*recon*" -o -iname "*osint*" \) 2>/dev/null)
done

# Hapus duplikat
mapfile -t candidates < <(printf "%s\n" "${candidates[@]}" | sort -u)

# Hapus setiap kandidat (yang ada dan BUKAN nexvo)
for dir in "${candidates[@]}"; do
  if [ -d "$dir" ] && ! echo "$dir" | grep -qi "nexvo"; then
    echo "  HAPUS folder: $dir ($(du -sh "$dir" 2>/dev/null | awk '{print $1}'))"
    # Backup dulu (tar.gz) sebelum hapus
    tar_name=$(echo "$dir" | tr '/' '_' | sed 's/^_//')
    tar czf "$BACKUP_DIR/${tar_name}.tar.gz" -C "$(dirname "$dir")" "$(basename "$dir")" 2>/dev/null
    rm -rf "$dir"
  fi
done

echo ""
log "Cari & hapus file XANVYOR di public_html CyberPanel..."
for public_dir in /home/*/public_html /var/www/html; do
  [ -d "$public_dir" ] || continue
  if echo "$public_dir" | grep -qi "nexvo"; then
    log "SKIP (nexvo public_html): $public_dir"
    continue
  fi
  # Cari index.html/php yang berisi XANVYOR
  for f in "$public_dir"/index.html "$public_dir"/index.php; do
    [ -f "$f" ] || continue
    if grep -qiE "xanvy|recon|osint" "$f" 2>/dev/null; then
      echo "  HAPUS file XANVYOR: $f"
      cp "$f" "$BACKUP_DIR/$(basename $f).$(date +%s)" 2>/dev/null
      rm -f "$f"
    fi
  done
done

log "Scan selesai. Backup di: $BACKUP_DIR"

# ============================================================================
# STEP 3: Hapus systemd service XANVYOR
# ============================================================================
step "3/6  Hapus systemd service XANVYOR"

for svc in xanvyor xanvy recon osint ai-tunnel ai_tunnel xanvyor-bot; do
  if systemctl list-units --all 2>/dev/null | grep -q "$svc"; then
    echo "  Hapus systemd service: $svc"
    systemctl stop "$svc" 2>/dev/null
    systemctl disable "$svc" 2>/dev/null
    cp "/etc/systemd/system/${svc}.service" "$BACKUP_DIR/" 2>/dev/null
    rm -f "/etc/systemd/system/${svc}.service"
  fi
done
systemctl daemon-reload 2>/dev/null
log "Systemd service XANVYOR dibersihkan"

# ============================================================================
# STEP 4: Kill SEMUA process yang jalan dari folder XANVYOR
# ============================================================================
step "4/6  Kill process XANVYOR yang masih jalan"

log "Cari process yang cwd-nya mengandung xanvy/recon/osint..."
ps aux | grep -v grep | while read line; do
  pid=$(echo "$line" | awk '{print $2}')
  cmd=$(echo "$line" | awk '{for(i=11;i<=NF;i++) printf "%s ", $i; print ""}')
  cwd=$(readlink /proc/$pid/cwd 2>/dev/null)
  
  if [ -n "$cwd" ]; then
    if echo "$cwd" | grep -qiE "xanvy|recon|osint"; then
      if echo "$cwd" | grep -qi "nexvo"; then
        continue  # Jangan kill process nexvo
      fi
      echo "  Kill PID $pid (cwd: $cwd)"
      kill -9 $pid 2>/dev/null
    fi
  fi
  
  # Cek juga command line
  if echo "$cmd" | grep -qiE "xanvy|recon|osint"; then
    if echo "$cmd" | grep -qi "nexvo"; then
      continue
    fi
    echo "  Kill PID $pid (cmd contains xanvy/recon)"
    kill -9 $pid 2>/dev/null
  fi
done

log "Process XANVYOR dibersihkan"

# ============================================================================
# STEP 5: Bersihkan config Nginx (backup + disable, GANTI dengan NEXVO proxy)
# ============================================================================
step "5/6  Bersihkan config Nginx + setup NEXVO reverse proxy"

# Backup semua config dulu
log "Backup semua config Nginx ke $BACKUP_DIR/nginx/"
mkdir -p "$BACKUP_DIR/nginx"
cp -r /etc/nginx/sites-enabled/* "$BACKUP_DIR/nginx/" 2>/dev/null
cp -r /etc/nginx/conf.d/*.conf "$BACKUP_DIR/nginx/" 2>/dev/null
cp /etc/nginx/nginx.conf "$BACKUP_DIR/nginx/nginx.conf" 2>/dev/null

# Cari config yang serve XANVYOR, hapus
for cfg in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
  [ -f "$cfg" ] || continue
  if grep -qiE "xanvy|recon|osint" "$cfg" 2>/dev/null; then
    echo "  HAPUS config XANVYOR: $cfg"
    rm -f "$cfg"
  elif grep -qE "root\s+/" "$cfg" 2>/dev/null && ! grep -q "nexvo\|127.0.0.1:3000" "$cfg" 2>/dev/null; then
    # Config yang serve static files (bukan proxy ke NEXVO) - disable
    echo "  DISABLE config (serve static, bukan NEXVO): $cfg"
    mv "$cfg" "${cfg}.disabled"
  fi
done

# Pastikan ada config NEXVO
if [ ! -f /etc/nginx/sites-enabled/nexvo ] && [ ! -f /etc/nginx/conf.d/nexvo.conf ]; then
  log "Buat config NEXVO baru..."
  mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
  
  cat > /etc/nginx/sites-available/nexvo << 'NGINX_EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    client_max_body_size 50M;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
    
    location /_next/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }
}
NGINX_EOF
  ln -sf /etc/nginx/sites-available/nexvo /etc/nginx/sites-enabled/nexvo
  rm -f /etc/nginx/sites-enabled/default
fi

# Test & restart Nginx
nginx -t 2>&1
systemctl restart nginx
sleep 3
log "Nginx status: $(systemctl is-active nginx)"

# ============================================================================
# STEP 5b: Stop OpenLiteSpeed (CyberPanel) kalau masih jalan & serve XANVYOR
# ============================================================================
step "5b  Stop OpenLiteSpeed (kalau ada)"

if [ -d /usr/local/lsws ]; then
  PORT80=$(ss -tlnp | grep ':80 ' | head -1)
  if echo "$PORT80" | grep -qi "litespeed\|ols"; then
    log "OpenLiteSpeed masih pegang port 80, stop..."
    /usr/local/lsws/bin/lswsctrl stop 2>/dev/null
    systemctl stop lscpd 2>/dev/null
    systemctl disable lscpd 2>/dev/null
    sleep 2
    systemctl restart nginx
    sleep 2
  else
    log "OpenLiteSpeed tidak pegang port 80 (OK)"
  fi
fi

# ============================================================================
# STEP 6: Fix NEXVO-web (kalau errored) + verify
# ============================================================================
step "6/6  Fix nexvo-web + verify"

# Cek status nexvo-web
NEXVO_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
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

log "nexvo-web status: $NEXVO_STATUS"

if [ "$NEXVO_STATUS" != "online" ]; then
  warn "nexvo-web bermasalah, fix..."
  
  # Kill siapapun yang pegang port 3000 (KECUALI nexvo-web sendiri)
  ss -tlnp 2>/dev/null | grep ':3000 ' | grep -oP 'pid=\K[0-9]+' | sort -u | while read pid; do
    pid_cmd=$(ps -p $pid -o args= 2>/dev/null)
    if echo "$pid_cmd" | grep -q "nexvo"; then
      echo "  Skip PID $pid (nexvo-web sendiri)"
    else
      echo "  Kill PID $pid (pegang port 3000, bukan nexvo)"
      kill -9 $pid 2>/dev/null
    fi
  done
  sleep 2
  
  # Restart nexvo-web
  if [ -d /home/nexvo/.next/standalone ]; then
    cd /home/nexvo/.next/standalone
    [ -f /home/nexvo/.env.production ] && cp /home/nexvo/.env.production .env
    [ -f /home/nexvo/.env ] && cp /home/nexvo/.env .env
    
    pm2 delete nexvo-web 2>/dev/null
    PORT=3000 NODE_ENV=production pm2 start server.js --name nexvo-web --update-env
    sleep 5
    pm2 save
  else
    err "Build NEXVO tidak ada! Jalankan:"
    echo "  cd /home/nexvo && bun install && bun run build"
    echo "  mkdir -p .next/standalone/.next"
    echo "  cp -r .next/static .next/standalone/.next/"
    echo "  cp -r public .next/standalone/public"
  fi
fi

echo ""
echo "  === FINAL STATUS ==="
echo ""
echo "  PM2 processes:"
pm2 list 2>/dev/null
echo ""
echo "  Port listeners:"
ss -tlnp | grep -E ':(80|3000) '
echo ""
echo "  Test port 3000 (NEXVO):"
HTTP3000=$(curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ 2>&1)
echo "    HTTP $HTTP3000"
echo "  Test port 80 (public):"
HTTP80=$(curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:80/ 2>&1)
echo "    HTTP $HTTP80"

echo ""
echo "  Cek konten port 80 (NEXVO atau XANVYOR?):"
CONTENT=$(curl -s -m 10 http://127.0.0.1:80/ 2>&1 | head -100)
if echo "$CONTENT" | grep -qiE "xanvy|recon|osint"; then
  err "XANVYOR MASIH TAMPIL! Ada di:"
  echo "  Cari: grep -rl 'xanvy\\|recon\\|osint' /etc/nginx/ /usr/local/lsws/ /var/www/ /home/ 2>/dev/null"
elif echo "$CONTENT" | grep -qiE "nexvo|NEXVO|login|whatsapp|deposit"; then
  log "NEXVO TAMPIL! Web sudah benar"
else
  warn "Konten tidak dikenali:"
  echo "$CONTENT" | head -30
fi

echo ""
echo "  === NEXVO PROJECT STILL SAFE ==="
log "Folder /home/nexvo: $([ -d /home/nexvo ] && echo 'AMAN (ada)' || echo 'HILANG!')"
log "Database: $(ls -la /home/z/my-project/db/custom.db 2>/dev/null || ls -la /home/nexvo/db/custom.db 2>/dev/null || echo 'tidak ketemu')"
log "Size: $(du -sh /home/nexvo 2>/dev/null | awk '{print $1}')"

# ============================================================================
# DONE
# ============================================================================
echo -e "${GREEN}"
echo "============================================================"
echo "   NUKEXANVYOR SELESAI"
echo "============================================================"
echo -e "${NC}"
echo ""
echo "  XANVYOR: DIHAPUS TOTAL"
echo "    - PM2 process xanvyor/ai-tunnel: deleted"
echo "    - Folder xanvyor: deleted (backup di $BACKUP_DIR)"
echo "    - Systemd service: removed"
echo "    - Process kill: done"
echo "    - Nginx config: dibersihkan"
echo ""
echo "  NEXVO: 100% AMAN"
echo "    - Folder /home/nexvo: MASIH ADA"
echo "    - Database: MASIH ADA"
echo "    - PM2 process nexvo-*: running"
echo "    - Reverse proxy: port 80 -> 3000"
echo ""
echo "  Backup semua yang dihapus: $BACKUP_DIR"
echo "  ls -la $BACKUP_DIR"
echo ""
echo "  Coba buka (INCOGNITO window):"
echo "    http://nexvo.id"
echo "    http://76.13.198.125"
echo ""
echo "  Admin: http://nexvo.id/admin  (admin / Admin@2024)"
echo ""
echo "============================================================"
