#!/usr/bin/env bash
# Set a widget manifest's exbVersion field to the given value.
# Usage: stamp-manifest.sh <manifest-path> <exb-version>
set -euo pipefail

MANIFEST="${1:?usage: stamp-manifest.sh <manifest-path> <exb-version>}"
VERSION="${2:?usage: stamp-manifest.sh <manifest-path> <exb-version>}"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

if [ ! -f "$MANIFEST" ]; then
  echo "::error::manifest not found: $MANIFEST" >&2
  exit 1
fi

jq --arg v "$VERSION" '.exbVersion = $v' "$MANIFEST" > "$TMP"
mv "$TMP" "$MANIFEST"

GOT="$(jq -r '.exbVersion' "$MANIFEST")"
if [ "$GOT" != "$VERSION" ]; then
  echo "::error::failed to stamp exbVersion (got '$GOT', expected '$VERSION')" >&2
  exit 1
fi

echo "Stamped $MANIFEST with exbVersion=$VERSION"
