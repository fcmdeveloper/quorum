#!/bin/bash
# Reproducible Hermes compile for release builds.
#
# React Native's Xcode build calls hermesc with the absolute path of the JS bundle, and
# Hermes stores that path in the bytecode, so the same code builds to a different file on
# every machine. This wrapper compiles from the bundle's own folder with a relative name,
# so anyone who rebuilds the same commit gets the same bytes (see VALIDATORS.md).
#
# Used automatically by plugins/withReproducibleHermes.js (HERMES_CLI_PATH).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
case "$(uname -s)" in
  Darwin) HERMESC="$ROOT/node_modules/hermes-compiler/hermesc/osx-bin/hermesc" ;;
  Linux) HERMESC="$ROOT/node_modules/hermes-compiler/hermesc/linux64-bin/hermesc" ;;
  *) echo "error: unsupported OS for hermesc" >&2; exit 1 ;;
esac

# Arguments as React Native passes them: [flags…] -out <output> <input>
ARGS=("$@")
INPUT="${ARGS[${#ARGS[@]}-1]}"
unset 'ARGS[${#ARGS[@]}-1]'

OUT=""
WANT_MAP=false
FLAGS=()
i=0
while [ $i -lt ${#ARGS[@]} ]; do
  a="${ARGS[$i]}"
  if [ "$a" = "-out" ]; then
    i=$((i + 1)); OUT="${ARGS[$i]}"
  elif [ "$a" = "-output-source-map" ]; then
    WANT_MAP=true
  else
    FLAGS+=("$a")
  fi
  i=$((i + 1))
done
[ -n "$OUT" ] || { echo "error: hermesc wrapper needs -out" >&2; exit 1; }
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac

cd "$(dirname "$INPUT")"
NAME="$(basename "$INPUT")"

# The bytecode that ships: no source map flag (it changes the bytes).
"$HERMESC" "${FLAGS[@]}" -out "$OUT" "$NAME"

# If the build asked for a source map, make it in a second pass and keep only the map.
if [ "$WANT_MAP" = true ]; then
  TMP="$(mktemp -d)"
  "$HERMESC" "${FLAGS[@]}" -output-source-map -out "$TMP/out.hbc" "$NAME"
  mv "$TMP/out.hbc.map" "$OUT.map"
  rm -rf "$TMP"
fi
