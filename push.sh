#!/usr/bin/env bash
set -euo pipefail

# Make sure .env is ignored
echo -e "\n# Env\n.env\n.env.*" >> .gitignore
git rm --cached .env 2>/dev/null || true

# Ensure branch is 'main'
CURRENT_BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || echo '')"
if [ -z "$CURRENT_BRANCH" ]; then
  git checkout -b main
elif [ "$CURRENT_BRANCH" = "master" ]; then
  git branch -M main
fi

# Stage and commit
git add -A
git commit -m "baseline commit from Replit" || echo "No changes to commit"

# Push to GitHub, set upstream if needed
git push -u origin main
