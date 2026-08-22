#!/usr/bin/env bash
# Copy each audiom-<version> artifact into <docs-base>/<version>/audiom, replacing
# any existing content so stale files are removed.
# Usage: copy-to-docs.sh <artifacts-dir> <docs-base-dir>
set -euo pipefail
shopt -s nullglob

ARTIFACTS_DIR="${1:?usage: copy-to-docs.sh <artifacts-dir> <docs-base-dir>}"
DOCS_BASE="${2:?usage: copy-to-docs.sh <artifacts-dir> <docs-base-dir>}"
DIRS=("$ARTIFACTS_DIR"/audiom-*/)

if [ "${#DIRS[@]}" -eq 0 ]; then
  echo "::error::no artifacts found under '$ARTIFACTS_DIR'" >&2
  exit 1
fi

for DIR in "${DIRS[@]}"; do
  VERSION="$(basename "$DIR")"
  VERSION="${VERSION#audiom-}"
  TARGET="${DOCS_BASE}/${VERSION}/audiom"
  echo "Updating ${TARGET} from ${DIR}"
  rm -rf "$TARGET"
  mkdir -p "$TARGET"
  cp -R "${DIR}." "$TARGET/"
done

echo "Copied ${#DIRS[@]} build(s) into '$DOCS_BASE'."
