# Ralph — how scaffolding & portability work

This skill is portable: download it once, run it in any project. It carries its own
machinery and scaffolds a per-project runtime on first use.

## The two halves

| Half | Lives in | Travels with the skill? |
|---|---|---|
| **Mechanism** — coordinator script, prompt template, default agents | the skill folder (`scripts/`, `assets/`) | yes (source of truth) |
| **Project runtime** — filled prompt, config, logs, the per-repo script symlink | `<repo>/ralph/` | no — scaffolded per project |

The mechanism is generic. The runtime is project-specific (repo slug, gate commands,
branch, labels) and is created the first time you run ralph in a project.

## First-launch scaffolding (Phase A in SKILL.md)

When `ralph/ralph.config` is absent, setup creates, in the project root:

```
<repo>/ralph/
├── loop-parallel.sh     # symlink → <skill>/scripts/loop-parallel.sh
├── PROMPT.md            # copy of assets/PROMPT.template.md with placeholders filled
├── ralph.config         # copy of assets/ralph.config.template with real values
└── logs/
```

and, if the project lacks them, copies default subagents into `<repo>/.claude/agents/`:
`planner.md`, `implementer.md`. Existing agents are **never** overwritten.

## Why the script symlink works through a symlink

`loop-parallel.sh` finds the repo root with:

```bash
cd "$(dirname "$0")/.." || exit 1
```

`$0` is the **invocation path** (`ralph/loop-parallel.sh`), not the symlink's target.
So `dirname "$0"` is `ralph`, and `cd ralph/..` lands at the repo root — regardless of
where the symlink points. This lets every project share one source-of-truth script
while still resolving its own `ralph/PROMPT.md`, `ralph/logs`, and `ralph/STOP`.

## Config (`ralph/ralph.config`)

Sourced by `loop-parallel.sh`. Keys:

- `RALPH_BRANCH` (default `ralph`) — the only branch the loop runs on / pushes.
- `RALPH_READY_LABEL` (default `ready-for-agent`) — issues to pick up.
- `RALPH_GH_REPO` — `owner/name`, detected via `gh repo view` at setup.
- `RALPH_PLANNER` / `RALPH_IMPLEMENTER` — subagent names (must exist in `.claude/agents/`).
- `RALPH_AGENTS_SCAFFOLDED` — `true` once defaults were copied in.

Gate commands (lint/typecheck/test) are **not** in the config — they live in
`ralph/PROMPT.md` under the `Code gate` block, filled interactively at setup because
they are stack-specific and cannot be defaulted.

## Distribution model

The canonical skill lives in `Projects/.claude/skills/ralph/`. Other locations
(global `~/.claude/skills/ralph`, sub-projects) **symlink** to it, so bundled updates
to `scripts/` and `assets/` propagate automatically. Each project still keeps its own
independent `<repo>/ralph/` runtime.

## Already-scaffolded projects

A project that already has a working `ralph/` (e.g. an existing setup) is the
"already scaffolded" case: setup is skipped because `ralph/ralph.config` is present.
To converge such a project onto the shared source of truth, replace its
`ralph/loop-parallel.sh` with a symlink to the skill's `scripts/loop-parallel.sh` and
add a `ralph/ralph.config` recording its real branch/label/repo.
