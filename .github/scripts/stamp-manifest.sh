#!/usr/bin/env bash
# Set a widget manifest's exbVersion field to the given value.
# Usage: stamp-manifest.sh <manifest-path> <exb-version>
set -euo pipefail

manifest="${1:?usage: stamp-manifest.sh <manifest-path> <exb-version>}"
version="${2:?usage: stamp-manifest.sh <manifest-path> <exb-version>}"

if [ ! -f "$manifest" ]; then
  echo "::error::manifest not found: $manifest" >&2
  exit 1
fi

tmp="$(mktemp)"
jq --arg v "$version" '.exbVersion = $v' "$manifest" > "$tmp"
mv "$tmp" "$manifest"

got="$(jq -r '.exbVersion' "$manifest")"
if [ "$got" != "$version" ]; then
  echo "::error::failed to stamp exbVersion (got '$got', expected '$version')" >&2
  exit 1
fi

echo "Stamped $manifest with exbVersion=$version"
