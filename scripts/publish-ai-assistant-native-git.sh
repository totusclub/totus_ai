#!/usr/bin/env bash
# Publishes @tosmedia/ai-assistant-native to git branch `pkg/ai-assistant-native`
# Install:
#   npm i github:tosmedia/totus_ai_v2#pkg/ai-assistant-native
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$ROOT/packages/ai-assistant-native"
BRANCH="pkg/ai-assistant-native"
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
git -c user.email='release@totus.club' -c user.name='totus-ai-release' commit -q -m "release @tosmedia/ai-assistant-native@$VERSION"
git remote add origin "$REMOTE_URL"
git push -f origin "HEAD:refs/heads/$BRANCH"

echo ""
echo "OK. Install with:"
echo "  npm install github:tosmedia/totus_ai_v2#$BRANCH"
