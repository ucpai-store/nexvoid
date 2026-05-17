#!/bin/bash
# Nexvo - Push to GitHub Backup Script
# Usage: ./push-to-github.sh

cd /home/nexvo

# Check if there are changes to commit
if [ -n "$(git status --porcelain)" ]; then
    echo "Committing changes..."
    git add -A
    git commit -m "Update: $(date '+%Y-%m-%d %H:%M:%S')"
fi

# Push
echo "Pushing to GitHub..."
git push -u origin main --force
echo "Done!"
