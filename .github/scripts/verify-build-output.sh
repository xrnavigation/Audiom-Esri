#!/usr/bin/env bash
# Verify a built widget output directory:
#   - essential files exist and are non-empty (guards against an empty build),
#   - the manifest is stamped with the expected exbVersion,
#   - (optional) a forbidden string is absent from the output (e.g. a staging URL),
#   - the runtime tree-shaking report, when present, is under its byte ceiling
#     and does not eagerly reach a forbidden package.
# Usage: verify-build-output.sh <output-dir> <expected-exb-version> [forbidden-string] [treeshake-report]
set -euo pipefail

OUT="${1:?usage: verify-build-output.sh <output-dir> <expected-exb-version> [forbidden-string]}"
EXPECTED_VERSION="${2:?usage: verify-build-output.sh <output-dir> <expected-exb-version> [forbidden-string]}"
FORBIDDEN="${3:-}"
REPORT="${4:-}"

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
if [ -n "$REPORT" ]; then
  if [ ! -s "$REPORT" ]; then
    fail "missing tree-shaking report: $REPORT"
  fi
  BYTES="$(jq -r '.eagerMinifiedBytes' "$REPORT")"
  CEILING="$(jq -r '.ceilingBytes' "$REPORT")"
  if [ "$BYTES" = "null" ] || [ "$CEILING" = "null" ]; then
    fail "tree-shaking report '$REPORT' is missing eagerMinifiedBytes or ceilingBytes"
  fi
  if [ "$BYTES" -gt "$CEILING" ]; then
    fail "tree-shaking ceiling breached: $BYTES bytes > $CEILING"
  fi
  FORBIDDEN_HITS="$(jq -r '.forbiddenReached // [] | length' "$REPORT")"
  if [ "$FORBIDDEN_HITS" != "0" ]; then
    jq -r '.forbiddenReached[]' "$REPORT" >&2 || true
    fail "tree-shaking report reached forbidden packages"
  fi
fi


echo "Build output at '$OUT' verified (exbVersion=$BUILT)."
