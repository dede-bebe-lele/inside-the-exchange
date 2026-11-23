#!/bin/sh
# Build the site and publish dist/ to the gh-pages branch (served by GitHub Pages).
set -e
cd "$(dirname "$0")/.."
NAME="$(git config user.name)"
EMAIL="$(git config user.email)"
REMOTE="$(git remote get-url origin)"
npm test
npm run build
touch dist/.nojekyll
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="$NAME" -c user.email="$EMAIL" commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%MZ)"
git push -q -f "$REMOTE" gh-pages
rm -rf .git
echo "Deployed to gh-pages."
