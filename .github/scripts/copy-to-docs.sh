#!/usr/bin/env bash
# Copy each audiom-<version> artifact into <docs-base>/<version>/audiom, replacing
# any existing content so stale files are removed.
# Usage: copy-to-docs.sh <artifacts-dir> <docs-base-dir>
set -euo pipefail
shopt -s nullglob

artifacts_dir="${1:?usage: copy-to-docs.sh <artifacts-dir> <docs-base-dir>}"
docs_base="${2:?usage: copy-to-docs.sh <artifacts-dir> <docs-base-dir>}"

dirs=("$artifacts_dir"/audiom-*/)
if [ "${#dirs[@]}" -eq 0 ]; then
  echo "::error::no artifacts found under '$artifacts_dir'" >&2
  exit 1
fi

for dir in "${dirs[@]}"; do
  version="$(basename "$dir")"
  version="${version#audiom-}"
  target="${docs_base}/${version}/audiom"
  echo "Updating ${target} from ${dir}"
  rm -rf "$target"
  mkdir -p "$target"
  cp -R "${dir}." "$target/"
done

echo "Copied ${#dirs[@]} build(s) into '$docs_base'."
