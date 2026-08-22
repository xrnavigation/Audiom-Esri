#!/usr/bin/env bash
# Verify downloaded build artifacts before publishing:
#   - at least one audiom-<version> artifact is present (fails if none uploaded),
#   - each artifact is non-empty / complete,
#   - each artifact's manifest exbVersion matches the version in its folder name.
# Usage: verify-artifacts.sh <artifacts-dir>
set -euo pipefail
shopt -s nullglob

artifacts_dir="${1:?usage: verify-artifacts.sh <artifacts-dir>}"

fail() { echo "::error::$1" >&2; exit 1; }

dirs=("$artifacts_dir"/audiom-*/)
if [ "${#dirs[@]}" -eq 0 ]; then
  fail "no build artifacts found under '$artifacts_dir'; nothing was uploaded to publish"
fi

for dir in "${dirs[@]}"; do
  version="$(basename "$dir")"
  version="${version#audiom-}"
  if [ ! -s "${dir}manifest.json" ] || [ ! -s "${dir}dist/runtime/widget.js" ]; then
    ls -laR "$dir" || true
    fail "artifact '$dir' is empty or incomplete"
  fi
  mver="$(jq -r '.exbVersion' "${dir}manifest.json")"
  if [ "$mver" != "$version" ]; then
    fail "artifact '$dir' manifest exbVersion '$mver' != '$version'"
  fi
done

echo "Verified ${#dirs[@]} artifact(s) under '$artifacts_dir'."
