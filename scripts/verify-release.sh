#!/bin/bash
# Rebuild Quorum's app code from source and print its fingerprint.
#
#   scripts/verify-release.sh            # the code in this folder, as it is
#   scripts/verify-release.sh v1.0.0     # a tag or commit, in a clean copy
#
# The printed "app code" hash must equal the one the app shows in Settings > About >
# Verify this version, and the one registered on the XRP Ledger for that release.
# See VALIDATORS.md.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REF="${1:-}"
WORK="$REPO"
CLEAN=""

if [ -n "$REF" ]; then
  WORK="$(mktemp -d)/quorum"
  CLEAN="$(dirname "$WORK")"
  echo "› Checking out $REF into a clean folder"
  git -C "$REPO" worktree add --detach "$WORK" "$REF" >/dev/null
  trap 'git -C "$REPO" worktree remove --force "$WORK" >/dev/null 2>&1 || true; rm -rf "$CLEAN"' EXIT
fi

cd "$WORK"
COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
DIRTY=""
if [ -z "$REF" ] && [ -n "$(git status --porcelain 2>/dev/null)" ]; then DIRTY=" (with uncommitted changes)"; fi

if [ -n "$REF" ]; then
  echo "› Installing exact dependencies (npm ci)"
  npm ci --no-audit --no-fund --loglevel=error >/dev/null
elif [ ! -d node_modules ]; then
  echo "error: run npm ci first (or pass a tag/commit to build a clean copy)" >&2; exit 1
fi

OUT="$WORK/.verify"
rm -rf "$OUT" && mkdir -p "$OUT/js" "$OUT/app"

echo "› Bundling the app code (same settings as the iOS release build)"
ENTRY="$(node -e "require('expo/scripts/resolveAppEntry')" "$WORK" ios absolute | tail -n 1)"
npx expo export:embed --entry-file "$ENTRY" --platform ios --dev false --minify false --reset-cache \
  --bundle-output "$OUT/js/main.jsbundle" --assets-dest "$OUT/app" >/dev/null

echo "› Compiling to Hermes bytecode"
"$WORK/scripts/hermesc-reproducible.sh" -emit-binary -max-diagnostic-width=80 -O -out "$OUT/app/main.jsbundle" "$OUT/js/main.jsbundle"

sha() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
VERSION="$(node -p "require('./app.json').expo.version")"
BUILD="$(node -p "require('./app.json').expo.ios.buildNumber")"

echo
echo "Quorum $VERSION ($BUILD)"
echo "commit    $COMMIT$DIRTY"
echo "app code  sha256:$(sha "$OUT/app/main.jsbundle")"
echo "js source sha256:$(sha "$OUT/js/main.jsbundle")"
