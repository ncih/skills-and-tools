---
name: ralph
description: "Parallel TDD coding loop for any project. USE THIS SKILL when the user says \"run ralph\", \"start ralph\", \"launch the coding loop\", \"kick off the agents\", \"start the workers\", or wants to implement GitHub Issues in parallel. Self-contained and portable: on first use in a project it scaffolds a per-project ralph/ runtime (and default planner/implementer agents if missing). Then validates pre-conditions (must be on the ralph branch, open ready-for-agent issues must exist), prompts for N parallel workers, launches the loop, monitors logs, reports results, and hands off needs-human-verify issues for UAT. Stop workers any time with ralph/STOP."
---

# Ralph — parallel TDD coding loop

This skill is **self-contained**. The machinery lives inside the skill folder:

- `scripts/loop-parallel.sh` — the parallel coordinator (source of truth)
- `assets/PROMPT.template.md` — the per-worker agent prompt (placeholders)
- `assets/ralph.config.template` — per-project config template
- `assets/agents/{planner,implementer}.md` — default subagents

`SKILL_DIR` below means the directory this `SKILL.md` lives in. Resolve it once:

```bash
# When invoked, locate the skill dir (works whether the skill is real or symlinked
# into .claude/skills). Adjust the glob if your skills root differs.
SKILL_DIR=$(cd "$(dirname "$(readlink -f .claude/skills/ralph/SKILL.md 2>/dev/null || echo ~/.claude/skills/ralph/SKILL.md)")" && pwd)
```

If that resolution is awkward in your environment, just read the bundled files by
their path under the skill folder — the orchestrator runs from the **project root**
(the repo you want ralph to work on), and all runtime paths below are relative to
that project root.

---

## Trigger

User runs `/ralph` or asks to "run ralph" / "start ralph" / "launch the coding loop".

---

## Phase A — First-launch setup (run ONLY if `ralph/ralph.config` is absent)

**Detect existing state first — never clobber a pre-existing setup:**

1. If `ralph/ralph.config` already exists → this project is scaffolded; **skip to Phase B**.
2. If `ralph/ralph.config` is absent **but** `ralph/` already exists and contains
   runtime files (`PROMPT.md`, `loop.sh`, `loop-parallel.sh`, or similar), this is a
   **foreign or legacy ralph setup** (a different variant lives here). **STOP. Do not
   scaffold.** Tell the user what you found and ask how to proceed:
   > "This project already has a `ralph/` setup without a `ralph.config` (found:
   > `<files>`). I won't overwrite it. Options: (a) adopt it — I'll write a
   > `ralph.config` pointing at the existing files without changing them; (b) leave it
   > and run it as-is; (c) cancel."
   Only on explicit choice (a) do you write `ralph/ralph.config` — and even then you
   **never** overwrite an existing `PROMPT.md` or script.
3. Otherwise (`ralph/` absent or empty) → scaffold a fresh per-project runtime:

1. **Create the runtime dir:**
   ```bash
   mkdir -p ralph/logs
   ```

2. **Symlink the coordinator** from the skill (single source of truth), only if
   absent. The script resolves the repo root via `dirname "$0"/..`, which works
   through a symlink because `$0` is the invocation path `ralph/loop-parallel.sh`:
   ```bash
   [ -e ralph/loop-parallel.sh ] || ln -s "$SKILL_DIR/scripts/loop-parallel.sh" ralph/loop-parallel.sh
   ```
   (If symlinking across filesystems is undesirable, `cp` it instead.)

3. **Detect the repo slug:**
   ```bash
   gh repo view --json nameWithOwner -q .nameWithOwner
   ```
   If this fails (no GitHub remote), ask the user for `owner/name` or note that
   ralph needs a GitHub repo to operate.

4. **Ask the user for the gate commands** for this project's stack — lint,
   typecheck, and test. These are inherently project-specific and cannot be
   defaulted. Capture them as the lines that will fill the `Code gate` block, e.g.:
   ```
   npm run lint
   npm run typecheck
   npm test
   ```
   If the user doesn't know yet, leave a clearly-marked `# TODO: fill gate commands`
   placeholder and tell them ralph can't safely hand off until it's filled.

5. **Write `ralph/PROMPT.md`** from `assets/PROMPT.template.md` — **only if it does
   not already exist** (never overwrite a project's own prompt). Substitute:
   - `{{GH_REPO}}` → detected slug
   - `{{GATE_COMMANDS}}` → the gate commands from step 4
   - `{{BRANCH}}` → the branch (default `ralph`)
   - `{{READY_LABEL}}` → the ready label (default `ready-for-agent`)
   - `{{PLANNER}}` / `{{IMPLEMENTER}}` → agent names (default `planner` / `implementer`)

6. **Write `ralph/ralph.config`** from `assets/ralph.config.template` with the
   detected/entered values (`RALPH_GH_REPO`, `RALPH_BRANCH`, `RALPH_READY_LABEL`,
   `RALPH_PLANNER`, `RALPH_IMPLEMENTER`).

7. **Scaffold default agents (never overwrite).** Determine the project's agents
   dir (`.claude/agents/`). For each of `planner` and `implementer`: if
   `.claude/agents/<name>.md` does **not** exist, copy the bundled default:
   ```bash
   mkdir -p .claude/agents
   [ -f .claude/agents/planner.md ]     || cp "$SKILL_DIR/assets/agents/planner.md"     .claude/agents/planner.md
   [ -f .claude/agents/implementer.md ] || cp "$SKILL_DIR/assets/agents/implementer.md" .claude/agents/implementer.md
   ```
   Then set `RALPH_AGENTS_SCAFFOLDED=true` in `ralph/ralph.config` if you copied any.
   **Never overwrite an agent the project already defines.**

8. **Report what was scaffolded.** Tell the user:
   - the files created (`ralph/loop-parallel.sh`, `ralph/PROMPT.md`, `ralph/ralph.config`, any agents),
   - that they should review `ralph/PROMPT.md` (gate commands) and the agents before the first run,
   - that they must be on the configured branch with `ready-for-agent` issues to run.

Then continue to Phase B (or stop here if the user only wanted setup).

---

## Phase B — Run

Read config (`. ralph/ralph.config`) so you use the project's branch/label/repo.

### Pre-condition checks (run before anything else)

**1. Branch check**
```bash
git branch --show-current
```
Must equal `$RALPH_BRANCH` (default `ralph`). Otherwise stop and tell the user:
> "Ralph must run on the `<branch>` branch, not `<current>`. Switch first: `git checkout <branch>`"

**2. Issue count check**
```bash
gh issue list --label "$RALPH_READY_LABEL" --state open --json number | jq length
```
If `0`, stop and tell the user:
> "No `<ready-label>` issues — nothing for ralph to work. Label some issues and try again."

### Worker count

Ask the user:
> "How many parallel workers? (1–5 recommended — more workers = more API cost and more concurrent commits on the branch)"

Wait for their answer. Call it N. Validate: if N < 1 or N > 10, warn and ask again.

### Confirmation

Before launching, show:
> "Launching N workers on the `<branch>` branch. Each worker claims one pre-assigned issue. This runs headless — monitor `ralph/logs/` for live output. Proceed? (y/n)"

If the user says no, abort gracefully.

### Launch

```bash
bash ralph/loop-parallel.sh N
```

Capture the exit code. While it runs, remind the user they can:
- `touch ralph/STOP` to halt all workers cleanly
- `tail -f ralph/logs/<file>.log` to watch a worker live

### Post-completion report

After the script exits, report:

1. How many workers exited 0 (success) vs non-zero (error or rate-limited).
2. Any RATE_LIMITED or STOP file detected (the script logs these).
3. Remind the user:

> "Check `gh issue list --label needs-human-verify` — any issues there are ready for your UAT. Ralph never closes issues; that's your call after verifying in the app."

---

## Rules

- Never run on `main`. The branch pre-condition check is mandatory.
- Never close issues on behalf of the user.
- First-launch setup **never overwrites** an existing agent or an existing `ralph/PROMPT.md` / `ralph.config`.
- If the script fails to launch (e.g. `loop-parallel.sh` not found), surface the raw error and tell the user to check that `ralph/loop-parallel.sh` exists and is executable.
- This skill is a thin orchestrator. All real work happens inside `ralph/loop-parallel.sh` and the agent prompt at `ralph/PROMPT.md`. See `references/setup.md` for how scaffolding and portability work.
