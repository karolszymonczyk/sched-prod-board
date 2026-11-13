#!/bin/sh
# Copies app/ to dist/ and stamps the git sha (R6). Refuses a dirty tree so the sha names what ships.
set -e
cd "$(dirname "$0")/.."
if [ -n "$(git status --porcelain -- app)" ]; then echo "app/ has uncommitted changes" >&2; exit 1; fi
SHA=$(git rev-parse HEAD)
rm -rf dist && cp -R app dist
sed -i '' "s/__BUILD_SHA__/$SHA/g" dist/index.html
echo "$SHA"
