#!/usr/bin/env bash
# Individual tests for the workflow helper scripts in ../ .
# Creates throwaway fixtures in a temp dir and asserts each script's behaviour.
# Run:  bash .github/scripts/tests/test-scripts.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${PYTHON:-python3}"
STAGING='https://audiom-staging.herokuapp.com'
PROD='https://audiom.net'

pass=0
fail=0
ok()  { echo "  PASS: $1"; pass=$((pass + 1)); }
bad() { echo "  FAIL: $1"; fail=$((fail + 1)); }

# expect_success <desc> <cmd...> ; expect_failure <desc> <cmd...>
expect_success() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else bad "$d (expected success)"; fi; }
expect_failure() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then bad "$d (expected failure)"; else ok "$d"; fi; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "== rewrite-url.py =="
src="$work/src"
mkdir -p "$src/widgets/audiom/src/setting" "$src/shared/audiom-client"
printf "baseUrl: '%s',\n" "$STAGING" > "$src/widgets/audiom/src/setting/configs.ts"
printf "static defaultBaseURL = '%s';\n" "$STAGING" > "$src/shared/audiom-client/AudiomEmbedConfig.ts"
printf '\xff\xfe\x00not-utf8' > "$src/widgets/audiom/src/setting/bad.ts"
expect_success "replaces when matches exist" \
  env AUDIOM_ORIGINAL_URL="$STAGING" AUDIOM_REPLACEMENT_URL="$PROD" \
  "$PY" "$SCRIPT_DIR/rewrite-url.py" "$src" --require-match
if grep -rqF "$STAGING" "$src"; then bad "no staging URL remains"; else ok "no staging URL remains"; fi
if grep -rqF "$PROD" "$src"; then ok "replacement URL present"; else bad "replacement URL present"; fi
expect_failure "--require-match fails when nothing matches" \
  env AUDIOM_ORIGINAL_URL='https://nope.example' AUDIOM_REPLACEMENT_URL='x' \
  "$PY" "$SCRIPT_DIR/rewrite-url.py" "$src" --require-match
expect_failure "empty search string fails" \
  env AUDIOM_ORIGINAL_URL='' AUDIOM_REPLACEMENT_URL='x' \
  "$PY" "$SCRIPT_DIR/rewrite-url.py" "$src"

echo "== stamp-manifest.sh =="
man="$work/manifest.json"
printf '{ "name": "audiom", "exbVersion": "1.19" }\n' > "$man"
expect_success "stamps manifest" bash "$SCRIPT_DIR/stamp-manifest.sh" "$man" "1.20"
if [ "$(jq -r '.exbVersion' "$man")" = "1.20" ]; then ok "exbVersion updated"; else bad "exbVersion updated"; fi
expect_failure "missing manifest fails" bash "$SCRIPT_DIR/stamp-manifest.sh" "$work/nope.json" "1.20"

echo "== verify-build-output.sh =="
out="$work/out"
mkdir -p "$out/dist/runtime" "$out/dist/setting"
printf '{ "exbVersion": "1.20" }\n' > "$out/manifest.json"
printf 'baseUrl="%s"\n' "$PROD" > "$out/dist/runtime/widget.js"
printf 'ok\n' > "$out/dist/setting/setting.js"
expect_success "good output passes" bash "$SCRIPT_DIR/verify-build-output.sh" "$out" "1.20" "$STAGING"
expect_failure "wrong version fails" bash "$SCRIPT_DIR/verify-build-output.sh" "$out" "1.19" ""
printf 'baseUrl="%s"\n' "$STAGING" > "$out/dist/runtime/widget.js"
expect_failure "forbidden URL fails" bash "$SCRIPT_DIR/verify-build-output.sh" "$out" "1.20" "$STAGING"
: > "$out/dist/setting/setting.js"
expect_failure "empty essential file fails" bash "$SCRIPT_DIR/verify-build-output.sh" "$out" "1.20" ""

echo "== verify-artifacts.sh =="
arts="$work/artifacts"
mkdir -p "$arts/audiom-1.18/dist/runtime" "$arts/audiom-1.20/dist/runtime"
printf '{ "exbVersion": "1.18" }\n' > "$arts/audiom-1.18/manifest.json"
printf 'x\n' > "$arts/audiom-1.18/dist/runtime/widget.js"
printf '{ "exbVersion": "1.20" }\n' > "$arts/audiom-1.20/manifest.json"
printf 'x\n' > "$arts/audiom-1.20/dist/runtime/widget.js"
expect_success "good artifacts pass" bash "$SCRIPT_DIR/verify-artifacts.sh" "$arts"
expect_failure "no artifacts fails" bash "$SCRIPT_DIR/verify-artifacts.sh" "$work/does-not-exist"
printf '{ "exbVersion": "9.9" }\n' > "$arts/audiom-1.20/manifest.json"
expect_failure "version mismatch fails" bash "$SCRIPT_DIR/verify-artifacts.sh" "$arts"

echo "== copy-to-docs.sh =="
arts2="$work/artifacts2"; docs="$work/docs"
mkdir -p "$arts2/audiom-1.18/dist/runtime"
printf '{ "exbVersion": "1.18" }\n' > "$arts2/audiom-1.18/manifest.json"
printf 'x\n' > "$arts2/audiom-1.18/dist/runtime/widget.js"
mkdir -p "$docs/1.18/audiom"; printf 'stale\n' > "$docs/1.18/audiom/STALE.txt"
expect_success "copies into docs" bash "$SCRIPT_DIR/copy-to-docs.sh" "$arts2" "$docs"
if [ -f "$docs/1.18/audiom/manifest.json" ]; then ok "manifest copied"; else bad "manifest copied"; fi
if [ -f "$docs/1.18/audiom/STALE.txt" ]; then bad "stale file removed"; else ok "stale file removed"; fi

echo
echo "TOTAL: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
