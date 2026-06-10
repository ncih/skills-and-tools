# skills-and-tools

A collection of Claude Code skills, scripts, and tools built around a personal AI operating system. Clone this into any `.claude/` folder, run `setup.sh`, and every skill is available in Claude Code.

---

## What's inside

```
.claude/
├── skills/              ← skill library (one folder per skill)
├── graphify-repo/       ← git submodule → github.com/safishamsi/graphify
├── setup.sh             ← one-time setup for a new machine
└── settings.local.json  ← local settings, not committed
```

The `graphify-repo` folder is a git submodule pointing at [safishamsi/graphify](https://github.com/safishamsi/graphify) — a Python tool for turning codebases into interactive knowledge graphs. The `graphify` skill in this repo wraps it.

---

## Installation

### Prerequisites

- [Claude Code](https://claude.ai/code) installed
- Git
- Python 3.10+ (for `graphify` and `youtube-research`)

### Steps

```bash
# 1. Clone into a workspace directory
git clone https://github.com/ncih/skills-and-tools ~/.claude   # global install
# or
git clone https://github.com/ncih/skills-and-tools /path/to/your/projects/.claude   # project-scoped

# 2. Pull the graphify submodule
git submodule update --init --recursive

# 3. Run setup — patches paths and symlinks skills globally
./setup.sh
```

`setup.sh` takes an optional argument for your workspace root if it differs from the parent of `.claude/`:

```bash
./setup.sh /Users/yourname/Projects
```

### What setup.sh does

1. **Patches `install-skill/SKILL.md`** — rewrites the hardcoded `MAIN_DIR` and script paths to match your machine
2. **Initialises the graphify submodule** — pulls `safishamsi/graphify`
3. **Symlinks all skills into `~/.claude/skills/`** — makes every skill available across all projects

### After setup

Open a new Claude Code session. Skills are invoked with `/skill-name`, e.g. `/diagnose`, `/triage`, `/ship`.

---

## Skills reference

| Skill | What it does |
|---|---|
| `check-needs-human-verify` | Reviews GitHub issues labelled `needs-human-verify` — re-runs checks, tells you exactly what to confirm before closing |
| `current-session-path` | Returns the JSONL path for the current Claude Code session (useful for passing sessions between chats) |
| `diagnose` | Disciplined debug loop: reproduce → minimise → hypothesise → instrument → fix → regression-test |
| `graphify` | Turns any codebase or folder into an interactive knowledge graph with community detection and query tools (wraps `graphify-repo`) |
| `grill-with-docs` | Stress-tests a plan against your domain model and ADRs, updating docs inline as decisions crystallise |
| `improve-codebase-architecture` | Surfaces refactoring opportunities — turns shallow modules into deep ones for better testability and AI-navigability |
| `install-skill` | Installs a Claude Code skill from a GitHub URL, then optionally symlinks it globally or into sub-projects |
| `notebooklm` | Full programmatic access to Google NotebookLM — create notebooks, add sources, generate audio overviews |
| `pipeline-case-study` | Converts sprint session logs + chat transcripts into a polished, shareable case study |
| `product-brainstorming` | Sharp PM thinking partner — explores problem spaces, challenges assumptions, generates ideas before converging |
| `productivity/handoff` | Compacts the current conversation into a handoff document for another agent session to pick up |
| `productivity/write-a-skill` | Creates new skills with proper structure, progressive disclosure, and bundled resources |
| `prototype` | Builds throwaway prototypes — terminal app for logic/state questions, or multiple UI variations for design questions |
| `ralph-retro` | Retrospective on completed Ralph loop runs — evaluates against a rubric, spots patterns, proposes concrete improvements |
| `setup-ai-os` | End-to-end setup of an AI OS combining Obsidian (knowledge), Claude Code (engine), and GitHub (version control) |
| `setup-matt-pocock-skills` | Configures per-repo context: issue tracker type, triage labels, and domain doc locations |
| `ship` | PR and merge lifecycle — pre-ship checklist, conflict resolution, code review, post-ship cleanup |
| `tdd` | Test-driven development with red-green-refactor loop, focused on behaviour through public interfaces |
| `to-inbox` | Captures a feedback idea or bug observation as a GitHub issue labelled `feedback` |
| `to-issues` | Breaks a plan, spec, or PRD into independently-grabbable implementation issues (tracer-bullet vertical slices) |
| `to-prd` | Synthesises conversation context into a PRD and publishes it as a GitHub issue |
| `triage` | Moves issues through a triage state machine (needs-triage → scoped → ready-for-agent → needs-human-verify) |
| `workshop-feedback` | Runs a product feedback workshop — reads the `feedback` inbox, prioritises with you, converges on a scope doc |
| `youtube-research` | Searches YouTube and extracts native transcripts into structured markdown files. No API key needed |
| `zoom-out` | Maps all relevant modules and callers around an unfamiliar area of code, using the project's domain vocabulary |

---

## Per-skill configuration notes

Most skills work out of the box after `setup.sh`. A few have per-project requirements:

### `install-skill`
`SKILL.md` contains your `MAIN_DIR` (workspace root) and absolute script paths. `setup.sh` patches these automatically. If you move the `.claude/` folder, re-run `setup.sh`.

### `setup-matt-pocock-skills` / `triage` / `to-issues` / `triage` / `ship`
These read a `skill-config.json` from the project's `.claude/` folder to find the issue tracker, triage labels, and scope directory. Run `/setup-matt-pocock-skills` once in a new project to scaffold this.

### `graphify`
Requires Python 3.10+ and the `graphify` package from `graphify-repo`. Install with:
```bash
cd graphify-repo
pip install -e .
```

### `notebooklm`
Requires `notebooklm-py`:
```bash
pip install "notebooklm-py[browser]"
```
On Python < 3.13 also install cookies support:
```bash
pip install "notebooklm-py[cookies]"
```

### `youtube-research`
Auto-installs its own dependencies (`youtube-transcript-api`, `yt-dlp`) on first run.

---

## Adding a new skill

```bash
# 1. Create the skill folder under skills/
mkdir skills/my-skill

# 2. Add SKILL.md with frontmatter (name, description, model if needed)
# 3. Run setup.sh again to pick up the new symlink
./setup.sh
```

See `productivity/write-a-skill` for a guided skill-creation workflow inside Claude Code.

---

## Symlinking into a project

After global install, you can also symlink individual skills into a specific project:

```bash
bash skills/install-skill/scripts/link.sh skills/triage /path/to/your/project
```

Or use the `/install-skill` skill from inside Claude Code.
