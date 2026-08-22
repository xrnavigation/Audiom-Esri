#!/usr/bin/env bash
# Verify a built widget output directory:
#   - essential files exist and are non-empty (guards against an empty build),
#   - the manifest is stamped with the expected exbVersion,
#   - (optional) a forbidden string is absent from the output (e.g. a staging URL).
# Usage: verify-build-output.sh <output-dir> <expected-exb-version> [forbidden-string]
set -euo pipefail

OUT="${1:?usage: verify-build-output.sh <output-dir> <expected-exb-version> [forbidden-string]}"
EXPECTED_VERSION="${2:?usage: verify-build-output.sh <output-dir> <expected-exb-version> [forbidden-string]}"
FORBIDDEN="${3:-}"

fail() { echo "::error::$1" >&2; exit 1; }

for FILE in "manifest.json" "dist/runtime/widget.js" "dist/setting/setting.js"; do
  if [ ! -s "$OUT/$FILE" ]; then
    ls -laR "$OUT" 2>/dev/null || true
    fail "missing or empty build output: $OUT/$FILE"
  fi
done

BUILT="$(jq -r '.exbVersion' "$OUT/manifest.json")"
if [ "$BUILT" != "$EXPECTED_VERSION" ]; then
  fail "manifest exbVersion is '$BUILT', expected '$EXPECTED_VERSION'"
fi

if [ -n "$FORBIDDEN" ] && grep -rqF -- "$FORBIDDEN" "$OUT"; then
  echo "Files still containing '$FORBIDDEN':" >&2
  grep -rlF -- "$FORBIDDEN" "$OUT" >&2 || true
  fail "forbidden string '$FORBIDDEN' found in build output"
fi

echo "Build output at '$OUT' verified (exbVersion=$BUILT)."
