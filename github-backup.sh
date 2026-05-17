#!/bin/bash
# ============================================================
# NEXVO - GitHub Backup Script
# ============================================================
# Usage:
#   ./github-backup.sh <GITHUB_TOKEN>
#
# To create a token:
#   1. Go to https://github.com/settings/tokens
#   2. Click "Generate new token (classic)"
#   3. Select "repo" scope (full control of private repositories)
#   4. Generate and copy the token
#   5. Run: ./github-backup.sh ghp_your_token_here
# ============================================================

TOKEN=${1:-}
if [ -z "$TOKEN" ]; then
    echo "❌ Error: GitHub token required!"
    echo ""
    echo "Usage: ./github-backup.sh <GITHUB_TOKEN>"
    echo ""
    echo "Create a token at: https://github.com/settings/tokens"
    exit 1
fi

cd /home/nexvo

# Set remote with token
git remote set-url origin https://${TOKEN}@github.com/ucpai-store/nexvoid.git

# Add and commit any changes
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 Committing changes..."
    git add -A
    git commit -m "Backup: $(date '+%Y-%m-%d %H:%M:%S UTC')"
fi

# Push to GitHub
echo "🚀 Pushing to GitHub..."
git push -u origin main --force

if [ $? -eq 0 ]; then
    echo "✅ Successfully pushed to GitHub!"
    echo "   Repo: https://github.com/ucpai-store/nexvoid"
else
    echo "❌ Push failed. Check your token and try again."
fi
