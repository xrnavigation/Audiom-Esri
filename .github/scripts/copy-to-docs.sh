#!/usr/bin/env bash
# Copy each audiom-<version> artifact into <docs-base>/<version>/audiom, replacing
# any existing content so stale files are removed. A sibling chunks folder, when
# the artifact contains one, is copied to <docs-base>/<version>/chunks so lazy
# import() chunks deploy beside the widget.
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
  if [ -d "${DIR}chunks" ]; then
    CHUNKS="${DOCS_BASE}/${VERSION}/chunks"
    echo "Updating ${CHUNKS} from ${DIR}chunks"
    rm -rf "$CHUNKS"
    mkdir -p "$CHUNKS"
    cp -R "${DIR}chunks/." "$CHUNKS/"
  fi
done

echo "Copied ${#DIRS[@]} build(s) into '$DOCS_BASE'."
