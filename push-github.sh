#!/bin/bash
# ================================================
# NEXVO - Push to GitHub (Simple Version)
# ================================================
# 
# CARA PAKAI / HOW TO USE:
# 
# 1. Buat Personal Access Token di GitHub:
#    - Buka https://github.com/settings/tokens
#    - Klik "Generate new token (classic)"
#    - Pilih scope "repo" (full control)
#    - Copy token yang dihasilkan
#
# 2. Jalankan script ini:
#    ./push-github.sh ghp_TOKEN_ANDA
#
# ================================================

TOKEN=${1:-}
if [ -z "$TOKEN" ]; then
    echo ""
    echo "❌ Token GitHub diperlukan!"
    echo ""
    echo "Cara membuat token:"
    echo "1. Buka https://github.com/settings/tokens"
    echo "2. Klik 'Generate new token (classic)'"
    echo "3. Pilih scope 'repo'"
    echo "4. Copy token"
    echo "5. Jalankan: ./push-github.sh ghp_TOKEN_ANDA"
    echo ""
    exit 1
fi

cd /home/nexvo

# Set remote URL with token
git remote set-url origin https://${TOKEN}@github.com/ucpai-store/nexvoid.git

# Add and commit any changes
git add -A
if [ -n "$(git status --porcelain)" ]; then
    git commit -m "Backup: $(date '+%Y-%m-%d %H:%M:%S UTC')"
fi

# Push to GitHub
echo "🚀 Pushing ke GitHub..."
git push -u origin main --force

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ BERHASIL! File sudah tersimpan di GitHub!"
    echo "   Repo: https://github.com/ucpai-store/nexvoid"
    echo ""
    echo "   Kalo file hilang, tinggal ambil dari:"
    echo "   git clone https://github.com/ucpai-store/nexvoid.git"
    echo ""
else
    echo ""
    echo "❌ Gagal push. Cek token dan coba lagi."
    echo ""
fi
