#!/usr/bin/env bash
# Verify a built widget output directory:
#   - essential files exist and are non-empty (guards against an empty build),
#   - the manifest is stamped with the expected exbVersion,
#   - (optional) a forbidden string is absent from the output (e.g. a staging URL).
# Usage: verify-build-output.sh <output-dir> <expected-exb-version> [forbidden-string]
set -euo pipefail

out="${1:?usage: verify-build-output.sh <output-dir> <expected-exb-version> [forbidden-string]}"
expected_version="${2:?usage: verify-build-output.sh <output-dir> <expected-exb-version> [forbidden-string]}"
forbidden="${3:-}"

fail() { echo "::error::$1" >&2; exit 1; }

for f in "manifest.json" "dist/runtime/widget.js" "dist/setting/setting.js"; do
  if [ ! -s "$out/$f" ]; then
    ls -laR "$out" 2>/dev/null || true
    fail "missing or empty build output: $out/$f"
  fi
done

built="$(jq -r '.exbVersion' "$out/manifest.json")"
if [ "$built" != "$expected_version" ]; then
  fail "manifest exbVersion is '$built', expected '$expected_version'"
fi

if [ -n "$forbidden" ] && grep -rqF -- "$forbidden" "$out"; then
  echo "Files still containing '$forbidden':" >&2
  grep -rlF -- "$forbidden" "$out" >&2 || true
  fail "forbidden string '$forbidden' found in build output"
fi

echo "Build output at '$out' verified (exbVersion=$built)."
