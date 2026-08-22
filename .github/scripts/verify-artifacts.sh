#!/usr/bin/env bash
# Verify downloaded build artifacts before publishing:
#   - at least one audiom-<version> artifact is present (fails if none uploaded),
#   - each artifact is non-empty / complete,
#   - each artifact's manifest exbVersion matches the version in its folder name.
# Usage: verify-artifacts.sh <artifacts-dir>
set -euo pipefail
shopt -s nullglob

ARTIFACTS_DIR="${1:?usage: verify-artifacts.sh <artifacts-dir>}"
DIRS=("$ARTIFACTS_DIR"/audiom-*/)

fail() { echo "::error::$1" >&2; exit 1; }

if [ "${#DIRS[@]}" -eq 0 ]; then
  fail "no build artifacts found under '$ARTIFACTS_DIR'; nothing was uploaded to publish"
fi

for DIR in "${DIRS[@]}"; do
  VERSION="$(basename "$DIR")"
  VERSION="${VERSION#audiom-}"
  if [ ! -s "${DIR}manifest.json" ] || [ ! -s "${DIR}dist/runtime/widget.js" ]; then
    ls -laR "$DIR" || true
    fail "artifact '$DIR' is empty or incomplete"
  fi
  MVER="$(jq -r '.exbVersion' "${DIR}manifest.json")"
  if [ "$MVER" != "$VERSION" ]; then
    fail "artifact '$DIR' manifest exbVersion '$MVER' != '$VERSION'"
  fi
done

echo "Verified ${#DIRS[@]} artifact(s) under '$ARTIFACTS_DIR'."
