#!/usr/bin/env bash
# Print the Audiom widget production output directory.
# ExB 1.13's build:prod sets OUTPUT_FOLDER=./dist-prod; later versions write to dist.
# Prefers dist when both exist so leftover dist-prod does not shadow a current build.
# Usage: resolve-widget-output.sh [client-dir]
set -euo pipefail

CLIENT="${1:-ArcGIS/client}"
WIDGET="widgets/audiom"

fail() { echo "::error::$1" >&2; exit 1; }

for FOLDER in dist dist-prod; do
  CANDIDATE="${CLIENT}/${FOLDER}/${WIDGET}"
  if [ -s "${CANDIDATE}/manifest.json" ]; then
    echo "$CANDIDATE"
    exit 0
  fi
done

ls -la "${CLIENT}" 2>/dev/null || true
fail "missing widget build output under ${CLIENT}/dist or ${CLIENT}/dist-prod (${WIDGET})"
