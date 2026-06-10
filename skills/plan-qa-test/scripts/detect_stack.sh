#!/usr/bin/env bash
# detect_stack.sh — deterministic codebase sniff for the plan-qa-test skill.
# Prints a human + machine-readable report of stack, surfaces, AI-loop signals,
# existing test tiers, and a SUGGESTED risk band (B0–B3). The band is a starting
# point, not a verdict — the skill confirms it and applies proportionality.
#
# Usage:  bash detect_stack.sh [repo_root]   (defaults to cwd)
# No dependencies beyond coreutils + grep/find. Safe to run anywhere; read-only.

set -uo pipefail
ROOT="${1:-$PWD}"
cd "$ROOT" 2>/dev/null || { echo "cannot cd to $ROOT"; exit 1; }

have()    { command -v "$1" >/dev/null 2>&1; }
exists()  { [ -e "$1" ]; }
# grep repo for a pattern in source-ish files; quiet, bounded, ignores vendored dirs.
# Case-INSENSITIVE: SQL/keywords vary in case (e.g. "row level security" vs "ROW LEVEL SECURITY").
hits() {
  grep -rIliE "$1" . \
    --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
    --include='*.py' --include='*.go' --include='*.rb' --include='*.java' --include='*.sql' \
    2>/dev/null \
    | grep -vE '(^|/)(node_modules|\.git|dist|build|\.next|vendor|target|\.venv)/' \
    | head -1
}
# $1 already includes surrounding quotes, e.g. pkg_has '"next"' — match it verbatim in package.json
pkg_has() { [ -f package.json ] && grep -qE "$1" package.json 2>/dev/null; }

emit() { printf '%s\n' "$1"; }     # human line
kv()   { printf '  %s: %s\n' "$1" "$2"; }

emit "=== plan-qa-test :: codebase sniff ==="
kv "root" "$ROOT"

# ---- Stack ---------------------------------------------------------------
LANGS=""; FRAMEWORK="unknown"; RUNNERS=""; PKGMGR="unknown"; BUILD="unknown"
[ -f package.json ] && LANGS="$LANGS node"
{ exists tsconfig.json || ls ./*.ts >/dev/null 2>&1; } && LANGS="$LANGS typescript"
{ exists pyproject.toml || exists requirements.txt || exists setup.py; } && LANGS="$LANGS python"
exists go.mod && LANGS="$LANGS go"
{ exists Gemfile; } && LANGS="$LANGS ruby"
{ exists pom.xml || exists build.gradle; } && LANGS="$LANGS jvm"

pkg_has '"next"'    && FRAMEWORK="next.js"
pkg_has '"react"'   && [ "$FRAMEWORK" = "unknown" ] && FRAMEWORK="react"
pkg_has '"vue"'     && FRAMEWORK="vue"
pkg_has '"svelte"'  && FRAMEWORK="svelte"
pkg_has '"express"' && [ "$FRAMEWORK" = "unknown" ] && FRAMEWORK="express"
{ exists manage.py || (exists requirements.txt && grep -qiE 'django' requirements.txt 2>/dev/null); } && FRAMEWORK="django"
{ grep -qiE 'fastapi' requirements.txt pyproject.toml 2>/dev/null; } && FRAMEWORK="fastapi"

pkg_has '"vitest"'      && RUNNERS="$RUNNERS vitest"
pkg_has '"jest"'        && RUNNERS="$RUNNERS jest"
pkg_has '"@playwright/test"' && RUNNERS="$RUNNERS playwright"
pkg_has '"cypress"'     && RUNNERS="$RUNNERS cypress"
{ exists pytest.ini || grep -qiE 'pytest' pyproject.toml requirements.txt 2>/dev/null; } && RUNNERS="$RUNNERS pytest"
[ -z "$RUNNERS" ] && exists go.mod && RUNNERS="$RUNNERS go-test"

[ -f package-lock.json ] && PKGMGR="npm"
[ -f pnpm-lock.yaml ]    && PKGMGR="pnpm"
[ -f yarn.lock ]         && PKGMGR="yarn"
[ -f bun.lockb ]         && PKGMGR="bun"
[ -f poetry.lock ]       && PKGMGR="poetry"

pkg_has '"next"' && BUILD="next build"
[ "$BUILD" = "unknown" ] && pkg_has '"build"' && BUILD="npm run build"

emit "stack:"
kv "languages"  "${LANGS:- none-detected}"
kv "framework"  "$FRAMEWORK"
kv "runners"    "${RUNNERS:- none}"
kv "pkg_mgr"    "$PKGMGR"
kv "build"      "$BUILD"

# ---- Surfaces (these create failure classes) -----------------------------
SURF=""
DB=no; { exists supabase || ls supabase/migrations >/dev/null 2>&1 || exists prisma/schema.prisma \
        || ls migrations >/dev/null 2>&1 || ls db/migrate >/dev/null 2>&1 \
        || [ -n "$(hits 'CREATE TABLE|ALTER TABLE')" ]; } && { DB=yes; SURF="$SURF db/migrations"; }
MOBILE=no; { pkg_has '"next-pwa"' || exists public/manifest.json || exists public/manifest.webmanifest \
        || exists public/sw.js || [ -n "$(hits 'serviceWorker|inputMode=|hasTouch')" ]; } && { MOBILE=yes; SURF="$SURF mobile/pwa/device"; }
EXTAPI=no; { [ -n "$(hits 'fetch\(|axios|httpx|requests\.(get|post)|openai|anthropic|stripe|twilio')" ]; } && { EXTAPI=yes; SURF="$SURF external-api"; }
AUTH=no; { [ -n "$(hits 'ROW LEVEL SECURITY|auth\.uid\(\)|getUser\(|next-auth|passport|jwt')" ]; } && { AUTH=yes; SURF="$SURF auth/rls"; }
MONEY=no; { [ -n "$(hits 'cents|amount|price|invoice|charge|payment|refund')" ]; } && { MONEY=yes; SURF="$SURF money/side-effects"; }

emit "surfaces:"
kv "db_migrations" "$DB"; kv "mobile_pwa_device" "$MOBILE"; kv "external_api" "$EXTAPI"
kv "auth_rls" "$AUTH"; kv "money_irreversible" "$MONEY"

# ---- AI-loop signals (flip evaluator-isolation to HARD) -------------------
AGENTLOOP=no; { exists AGENTS.md || exists ralph || ls .github/workflows 2>/dev/null | grep -qiE 'ralph|agent' \
        || exists CLAUDE.md; } && { AGENTLOOP=yes; }
AIJUDGE=no; { exists evals || ls -d eval* 2>/dev/null | head -1 >/dev/null 2>&1 \
        || [ -n "$(hits 'llm.?as.?a?.?judge|evaluate.*completion|openai|anthropic|gemini')" ]; } && { AIJUDGE=yes; }
emit "ai_loop:"
kv "agent_loop"  "$AGENTLOOP"; kv "ai_judged_outputs" "$AIJUDGE"

# ---- Existing test reality ----------------------------------------------
emit "existing_tests:"
for f in vitest.config.* vitest.integration.config.* vitest.ocr.config.* jest.config.* \
         playwright.config.* cypress.config.* pytest.ini; do
  ls $f >/dev/null 2>&1 && kv "config" "$(ls $f 2>/dev/null | tr '\n' ' ')"
done
TESTFILES=$(find . -type f \( -name '*.test.*' -o -name '*.spec.*' -o -name 'test_*.py' \) 2>/dev/null \
  | grep -vE '(^|/)(node_modules|\.git|dist|build|\.next|vendor|target)/' | wc -l | tr -d ' ')
kv "test_files" "$TESTFILES"
exists docs/testing/qa-plan.md && kv "qa_plan" "PRESENT → EVALUATE-AND-IMPROVE mode" || kv "qa_plan" "absent → GREENFIELD mode"

# ---- Suggested risk band -------------------------------------------------
BAND=0
[ "$DB" = yes ] && BAND=1
{ [ "$MOBILE" = yes ] || [ "$EXTAPI" = yes ] || [ "$MONEY" = yes ]; } && BAND=2
{ [ "$AGENTLOOP" = yes ] || [ "$AIJUDGE" = yes ]; } && BAND=3
emit "suggested_band: B$BAND  (B0 trivial · B1 one-DB app · B2 multi-surface · B3 agentic/high-stakes)"
emit "NOTE: band is a STARTING POINT — confirm it, apply proportionality, and let escaped bugs earn upgrades."
emit "=== end sniff ==="
