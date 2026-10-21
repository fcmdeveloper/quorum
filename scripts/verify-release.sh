#!/bin/bash
# Rebuild Quorum's app code from source and print its fingerprint.
#
#   scripts/verify-release.sh                  # the code in this folder, as it is (iOS)
#   scripts/verify-release.sh v1.0.0           # a tag or commit, in a clean copy (iOS)
#   scripts/verify-release.sh v1.0.3 android   # the Android build of that tag
#   scripts/verify-release.sh android          # this folder, Android
#
# iOS and Android share the version number but are different builds with different
# fingerprints: each one is registered and attested separately ("platform" in the memo).
#
# The printed "app code" hash must equal the one the app shows in Settings > About >
# Verify this version, and the one registered on the XRP Ledger for that release.
# See VALIDATORS.md.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REF=""
PLATFORM="ios"
for arg in "$@"; do
  case "$arg" in
    ios|android) PLATFORM="$arg" ;;
    -*) echo "error: unknown option $arg" >&2; exit 1 ;;
    *) if [ -n "$REF" ]; then echo "error: usage: scripts/verify-release.sh [tag-or-commit] [ios|android]" >&2; exit 1; fi; REF="$arg" ;;
  esac
done
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

# the file name inside the app: main.jsbundle in the iOS app, index.android.bundle in the APK
if [ "$PLATFORM" = "android" ]; then BUNDLE="index.android.bundle"; else BUNDLE="main.jsbundle"; fi

echo "› Bundling the app code (same settings as the $PLATFORM release build)"
ENTRY="$(node -e "require('expo/scripts/resolveAppEntry')" "$WORK" "$PLATFORM" absolute | tail -n 1)"
npx expo export:embed --entry-file "$ENTRY" --platform "$PLATFORM" --dev false --minify false --reset-cache \
  --bundle-output "$OUT/js/$BUNDLE" --assets-dest "$OUT/app" >/dev/null

echo "› Compiling to Hermes bytecode"
"$WORK/scripts/hermesc-reproducible.sh" -emit-binary -max-diagnostic-width=80 -O -out "$OUT/app/$BUNDLE" "$OUT/js/$BUNDLE"

sha() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
VERSION="$(node -p "require('./app.json').expo.version")"
if [ "$PLATFORM" = "android" ]; then
  BUILD="$(node -p "require('./app.json').expo.android.versionCode || ''")"
  LABEL="Android"
else
  BUILD="$(node -p "require('./app.json').expo.ios.buildNumber")"
  LABEL="iOS"
fi

echo
echo "Quorum $VERSION ($BUILD) $LABEL"
echo "platform  $PLATFORM"
echo "commit    $COMMIT$DIRTY"
echo "app code  sha256:$(sha "$OUT/app/$BUNDLE")"
echo "js source sha256:$(sha "$OUT/js/$BUNDLE")"
