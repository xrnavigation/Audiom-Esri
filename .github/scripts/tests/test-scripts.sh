#!/usr/bin/env bash
# Individual tests for the workflow helper scripts in ../ .
# Creates throwaway fixtures in a temp dir and asserts each script's behaviour.
# Run:  bash .github/scripts/tests/test-scripts.sh
set -uo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON:-python3}"
STAGING_URL='https://audiom-staging.herokuapp.com'
PRODUCTION_URL='https://audiom.net'
WORK="$(mktemp -d)"
SRC="$WORK/src"
MANIFEST_FILE="$WORK/manifest.json"
OUT="$WORK/out"
ARTIFACTS="$WORK/artifacts"
ARTIFACTS_COPY="$WORK/artifacts-copy"
DOCS="$WORK/docs"
PASS=0
FAIL=0

trap 'rm -rf "$WORK"' EXIT

ok()  { echo "  PASS: $1"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

# expect_success <desc> <cmd...> ; expect_failure <desc> <cmd...>
expect_success() { local DESC="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$DESC"; else bad "$DESC (expected success)"; fi; }
expect_failure() { local DESC="$1"; shift; if "$@" >/dev/null 2>&1; then bad "$DESC (expected failure)"; else ok "$DESC"; fi; }

echo "== rewrite-url.py =="
mkdir -p "$SRC/widgets/audiom/src/setting" "$SRC/shared/audiom-client"
printf "baseUrl: '%s',\n" "$STAGING_URL" > "$SRC/widgets/audiom/src/setting/configs.ts"
printf "static defaultBaseURL = '%s';\n" "$STAGING_URL" > "$SRC/shared/audiom-client/AudiomEmbedConfig.ts"
printf '\xff\xfe\x00not-utf8' > "$SRC/widgets/audiom/src/setting/bad.ts"
expect_success "replaces when matches exist" \
  env AUDIOM_ORIGINAL_URL="$STAGING_URL" AUDIOM_REPLACEMENT_URL="$PRODUCTION_URL" \
  "$PYTHON_BIN" "$SCRIPTS_DIR/rewrite-url.py" "$SRC" --require-match
if grep -rqF "$STAGING_URL" "$SRC"; then bad "no staging URL remains"; else ok "no staging URL remains"; fi
if grep -rqF "$PRODUCTION_URL" "$SRC"; then ok "replacement URL present"; else bad "replacement URL present"; fi
expect_failure "--require-match fails when nothing matches" \
  env AUDIOM_ORIGINAL_URL='https://nope.example' AUDIOM_REPLACEMENT_URL='x' \
  "$PYTHON_BIN" "$SCRIPTS_DIR/rewrite-url.py" "$SRC" --require-match
expect_failure "empty search string fails" \
  env AUDIOM_ORIGINAL_URL='' AUDIOM_REPLACEMENT_URL='x' \
  "$PYTHON_BIN" "$SCRIPTS_DIR/rewrite-url.py" "$SRC"

echo "== stamp-manifest.sh =="
printf '{ "name": "audiom", "exbVersion": "1.19" }\n' > "$MANIFEST_FILE"
expect_success "stamps manifest" bash "$SCRIPTS_DIR/stamp-manifest.sh" "$MANIFEST_FILE" "1.20"
if [ "$(jq -r '.exbVersion' "$MANIFEST_FILE")" = "1.20" ]; then ok "exbVersion updated"; else bad "exbVersion updated"; fi
expect_failure "missing manifest fails" bash "$SCRIPTS_DIR/stamp-manifest.sh" "$WORK/nope.json" "1.20"

echo "== verify-build-output.sh =="
mkdir -p "$OUT/dist/runtime" "$OUT/dist/setting"
printf '{ "exbVersion": "1.20" }\n' > "$OUT/manifest.json"
printf 'baseUrl="%s"\n' "$PRODUCTION_URL" > "$OUT/dist/runtime/widget.js"
printf 'ok\n' > "$OUT/dist/setting/setting.js"
expect_success "good output passes" bash "$SCRIPTS_DIR/verify-build-output.sh" "$OUT" "1.20" "$STAGING_URL"
expect_failure "wrong version fails" bash "$SCRIPTS_DIR/verify-build-output.sh" "$OUT" "1.19" ""
printf 'baseUrl="%s"\n' "$STAGING_URL" > "$OUT/dist/runtime/widget.js"
expect_failure "forbidden URL fails" bash "$SCRIPTS_DIR/verify-build-output.sh" "$OUT" "1.20" "$STAGING_URL"
: > "$OUT/dist/setting/setting.js"
expect_failure "empty essential file fails" bash "$SCRIPTS_DIR/verify-build-output.sh" "$OUT" "1.20" ""

echo "== verify-artifacts.sh =="
mkdir -p "$ARTIFACTS/audiom-1.18/dist/runtime" "$ARTIFACTS/audiom-1.20/dist/runtime"
printf '{ "exbVersion": "1.18" }\n' > "$ARTIFACTS/audiom-1.18/manifest.json"
printf 'x\n' > "$ARTIFACTS/audiom-1.18/dist/runtime/widget.js"
printf '{ "exbVersion": "1.20" }\n' > "$ARTIFACTS/audiom-1.20/manifest.json"
printf 'x\n' > "$ARTIFACTS/audiom-1.20/dist/runtime/widget.js"
expect_success "good artifacts pass" bash "$SCRIPTS_DIR/verify-artifacts.sh" "$ARTIFACTS"
expect_failure "no artifacts fails" bash "$SCRIPTS_DIR/verify-artifacts.sh" "$WORK/does-not-exist"
printf '{ "exbVersion": "9.9" }\n' > "$ARTIFACTS/audiom-1.20/manifest.json"
expect_failure "version mismatch fails" bash "$SCRIPTS_DIR/verify-artifacts.sh" "$ARTIFACTS"

echo "== copy-to-docs.sh =="
mkdir -p "$ARTIFACTS_COPY/audiom-1.18/dist/runtime"
printf '{ "exbVersion": "1.18" }\n' > "$ARTIFACTS_COPY/audiom-1.18/manifest.json"
printf 'x\n' > "$ARTIFACTS_COPY/audiom-1.18/dist/runtime/widget.js"
mkdir -p "$DOCS/1.18/audiom"; printf 'stale\n' > "$DOCS/1.18/audiom/STALE.txt"
expect_success "copies into docs" bash "$SCRIPTS_DIR/copy-to-docs.sh" "$ARTIFACTS_COPY" "$DOCS"
if [ -f "$DOCS/1.18/audiom/manifest.json" ]; then ok "manifest copied"; else bad "manifest copied"; fi
if [ -f "$DOCS/1.18/audiom/STALE.txt" ]; then bad "stale file removed"; else ok "stale file removed"; fi

echo
echo "TOTAL: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
