#!/usr/bin/env bash
# Ralph parallel loop — coordinator pre-assigns one ready-for-agent GitHub Issue per worker,
# then launches N headless claude sessions concurrently. Each worker implements its assigned
# issue and hands off to needs-human-verify. The loop ends when all workers have exited.
#
# Pre-assignment eliminates the race condition in a serial pick-inside-worker approach:
# all issue assignments are decided upfront, before any worker starts.
#
# PORTABILITY: this script is the single source of truth bundled inside the ralph skill.
# It is scaffolded into each project as <repo>/ralph/loop-parallel.sh (a symlink to the
# skill's copy). All paths are resolved relative to the repo root (the parent of ralph/),
# so $0 may be a symlink — `dirname "$0"` is the invocation path, not the link target.
# Project specifics (branch, label) are read from <repo>/ralph/ralph.config.
#
# Usage:  bash ralph/loop-parallel.sh <N>
#         N = number of parallel workers (required; recommended 1–5)
# Stop:   touch ralph/STOP  (coordinator checks before launching; workers respect it too)

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1   # repo root

# ── Per-project config (sourced; defaults applied below) ─────────────────────
# ralph.config is a KEY=value shell file written by first-launch setup.
[ -f ralph/ralph.config ] && . ralph/ralph.config
BRANCH="${RALPH_BRANCH:-ralph}"
READY_LABEL="${RALPH_READY_LABEL:-ready-for-agent}"

# ── Args ────────────────────────────────────────────────────────────────────
N="${1:-}"
if [[ -z "$N" || ! "$N" =~ ^[0-9]+$ || "$N" -lt 1 ]]; then
  echo "Usage: bash ralph/loop-parallel.sh <N>  (N = number of workers, >= 1)" >&2
  exit 1
fi

PROMPT="ralph/PROMPT.md"
LOGDIR="ralph/logs"
mkdir -p "$LOGDIR"

ts=$(date +%Y%m%d-%H%M%S)
COORDINATOR_LOG="$LOGDIR/coordinator-$ts.log"

log() { echo "$*" | tee -a "$COORDINATOR_LOG"; }

log "=== Ralph parallel coordinator — $ts ==="
log "Requested workers: $N"
log "Branch: $BRANCH | Ready label: $READY_LABEL"

# ── STOP file check ──────────────────────────────────────────────────────────
if [[ -f ralph/STOP ]]; then
  log "STOP file found — aborting before launch. Remove ralph/STOP to run again."
  rm -f ralph/STOP
  exit 0
fi

# ── Branch guard ─────────────────────────────────────────────────────────────
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
  log "ERROR: Must run on the '$BRANCH' branch (currently on '$CURRENT_BRANCH'). Aborting."
  exit 1
fi

# ── Enumerate ready issues upfront (coordinator pre-assignment) ──────────────
log "Fetching open $READY_LABEL issues..."
ISSUES_JSON=$(gh issue list \
  --state open \
  --label "$READY_LABEL" \
  --json number \
  --jq '[.[].number]' \
  2>>"$COORDINATOR_LOG")

TOTAL_ISSUES=$(echo "$ISSUES_JSON" | jq 'length')
log "Found $TOTAL_ISSUES $READY_LABEL issue(s): $ISSUES_JSON"

if [[ "$TOTAL_ISSUES" -eq 0 ]]; then
  log "No $READY_LABEL issues — nothing for ralph to work."
  exit 0
fi

# Slice to at most N issues (no point spawning more workers than there are issues)
WORKER_COUNT=$(( N < TOTAL_ISSUES ? N : TOTAL_ISSUES ))
log "Launching $WORKER_COUNT worker(s) (capped by available issues)."

# Build array of assigned issue numbers
declare -a ASSIGNED_ISSUES
for idx in $(seq 0 $(( WORKER_COUNT - 1 ))); do
  ASSIGNED_ISSUES[$idx]=$(echo "$ISSUES_JSON" | jq ".[$idx]")
done

# ── Launch workers ────────────────────────────────────────────────────────────
declare -a WORKER_PIDS
declare -a WORKER_LOGS

for idx in $(seq 0 $(( WORKER_COUNT - 1 ))); do
  ISSUE_NUM="${ASSIGNED_ISSUES[$idx]}"
  WORKER_ID=$(( idx + 1 ))
  WORKER_LOG="$LOGDIR/worker-$WORKER_ID-issue-$ISSUE_NUM-$ts.log"
  WORKER_LOGS[$idx]="$WORKER_LOG"

  log "Spawning worker $WORKER_ID → issue #$ISSUE_NUM (log: $WORKER_LOG)"

  # Export the pre-assigned issue so PROMPT.md can read it via $RALPH_ISSUE
  (
    export RALPH_ISSUE="$ISSUE_NUM"
    export RALPH_WORKER_ID="$WORKER_ID"

    echo "=== Worker $WORKER_ID | Issue #$ISSUE_NUM | $ts ===" | tee "$WORKER_LOG"

    claude -p "$(cat "$PROMPT")" \
        --model sonnet \
        --dangerously-skip-permissions \
        2>&1 | tee -a "$WORKER_LOG"

    # Rate-limit guard: detect session/usage limit hit
    if grep -qi "hit your session limit\|usage limit" "$WORKER_LOG"; then
      echo "RATE_LIMITED — session/usage limit reached for worker $WORKER_ID." \
        | tee -a "$WORKER_LOG"
      grep -io "resets[^.]*" "$WORKER_LOG" | head -1 | tee -a "$WORKER_LOG"
    fi

    # Push this worker's commit so CI runs on it independently.
    # ONLY the configured branch is ever pushed — never main.
    git push origin "$BRANCH" 2>&1 | tee -a "$WORKER_LOG" \
      || echo "WARN: git push origin $BRANCH failed for worker $WORKER_ID — CI will not run." \
           | tee -a "$WORKER_LOG"

  ) &

  WORKER_PIDS[$idx]=$!
  log "Worker $WORKER_ID PID: ${WORKER_PIDS[$idx]}"
done

# ── Wait for all workers ──────────────────────────────────────────────────────
log "All $WORKER_COUNT worker(s) launched. Waiting for completion..."

FAILURES=0
RATE_LIMITED=0

for idx in $(seq 0 $(( WORKER_COUNT - 1 ))); do
  WORKER_ID=$(( idx + 1 ))
  PID="${WORKER_PIDS[$idx]}"
  ISSUE_NUM="${ASSIGNED_ISSUES[$idx]}"
  WLOG="${WORKER_LOGS[$idx]}"

  wait "$PID"
  EXIT_CODE=$?

  if [[ "$EXIT_CODE" -ne 0 ]]; then
    (( FAILURES++ )) || true
    log "Worker $WORKER_ID (issue #$ISSUE_NUM) FAILED — exit code $EXIT_CODE"
  else
    log "Worker $WORKER_ID (issue #$ISSUE_NUM) finished — exit code 0"
  fi

  if [[ -f "$WLOG" ]] && grep -qi "RATE_LIMITED" "$WLOG"; then
    (( RATE_LIMITED++ )) || true
    log "Worker $WORKER_ID was rate-limited."
  fi

  if [[ -f "$WLOG" ]] && grep -q "<promise>NO_WORK</promise>" "$WLOG"; then
    log "Worker $WORKER_ID reported NO_WORK (issue #$ISSUE_NUM may have been reclaimed)."
  fi
done

# ── Summary ───────────────────────────────────────────────────────────────────
SUCCESSES=$(( WORKER_COUNT - FAILURES ))
log ""
log "=== Ralph parallel run complete ==="
log "Workers: $WORKER_COUNT | Succeeded: $SUCCESSES | Failed: $FAILURES | Rate-limited: $RATE_LIMITED"
log "Review needs-human-verify issues: gh issue list --label needs-human-verify"
log "Coordinator log: $COORDINATOR_LOG"

if [[ "$RATE_LIMITED" -gt 0 ]]; then
  log "NOTE: $RATE_LIMITED worker(s) hit the session/usage limit. Re-launch after the limit resets."
fi

if [[ "$FAILURES" -gt 0 ]]; then
  exit 1
fi

exit 0
