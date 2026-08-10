#!/usr/bin/env bash
# Publishes @tosmedia/ai-assistant to git branch `pkg/ai-assistant`
# so kedam-WEB can install with:
#   npm i git+https://github.com/tosmedia/totus_ai_v2.git#pkg/ai-assistant
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$ROOT/packages/ai-assistant"
BRANCH="pkg/ai-assistant"
REMOTE_URL="$(git -C "$ROOT" remote get-url origin)"
VERSION="$(node -p "require('$PKG/package.json').version")"
TMP="$(mktemp -d)"

cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

echo "== build package =="
npm --prefix "$PKG" run build

echo "== stage installable package root =="
mkdir -p "$TMP/pkg"
cp "$PKG/package.json" "$PKG/README.md" "$TMP/pkg/"
cp -R "$PKG/dist" "$TMP/pkg/dist"

node -e "
const fs = require('fs');
const p = process.argv[1];
const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
delete pkg.scripts;
delete pkg.devDependencies;
delete pkg.publishConfig;
fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
" "$TMP/pkg/package.json"

echo "== push branch $BRANCH (v$VERSION) =="
cd "$TMP/pkg"
git init -q
git checkout -q -b "$BRANCH"
git add -A
git -c user.email='release@totus.club' -c user.name='totus-ai-release' commit -q -m "release @tosmedia/ai-assistant@$VERSION"
git remote add origin "$REMOTE_URL"
git push -f origin "HEAD:refs/heads/$BRANCH"

echo ""
echo "OK. Install in kedam-WEB with:"
echo "  npm install git+https://github.com/tosmedia/totus_ai_v2.git#$BRANCH"
echo "or:"
echo "  npm install github:tosmedia/totus_ai_v2#$BRANCH"
