#!/bin/sh
# Build (stamps sha), add recordings from rec/ under /rec/, deploy static assets to Cloudflare Workers.
set -e
cd "$(dirname "$0")/.."
SHA=$(scripts/build.sh)
[ -d rec ] && mkdir -p dist/rec && cp rec/*.webm dist/rec/ 2>/dev/null || true
../../s03e03/sched-prod-api/node_modules/.bin/wrangler deploy
echo "deployed $SHA"
