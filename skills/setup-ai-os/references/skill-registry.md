# Skill Registry

Populate `01_Wiki/Operations/Skills_and_Workflows.md` from this reference.
Tailor to the user's confirmed workflow loops from Decision 8.

---

## Skills to BUILD (create new .claude/skills or .claude/agents files)

| Skill | Purpose | Key design notes |
|---|---|---|
| `/wiki-ingest` | `00_Raw/` → `01_Wiki/` | Routes by content type; enforces YAML; updates Index.md + Decisions.md; asks before archiving |
| `/wiki-update` | Workspace initiative → `01_Wiki/` | Reads scope/prd/qa from initiative folder; updates Product, Engineering, Decisions, Index; mandatory pre-archive, optional mid-initiative |
| `/wiki-lint` | Validate + repair `01_Wiki/` health | Checks: broken wikilinks, missing YAML fields, stale status, orphaned files (no inbound links), Index gaps |
| `/scope-session` | Brain → queryable scope artifact | Syncs GitHub Issues first; uses /brainstorming + /grill-with-docs; creates initiative folder in 03_Workspace/Active/ |
| `/qa-issues` | QA `needs-human-verify` issues | Runs lint/typecheck/test; checks acceptance criteria; writes qa-report.md; produces human testing plan; never closes issues |
| `/yt-playlist-ingest` | YouTube playlist → `00_Raw/` | Batch-pulls transcripts; names files with YYYY-MM-DD-HHMM_ prefix convention |

---

## Files to MIGRATE (adapt from existing project — splitlah-mvp or similar)

| File | Source | What to adapt |
|---|---|---|
| `ralph/loop.sh` | `splitlah-mvp/ralph/loop.sh` | Stack commands (lint, typecheck, test), repo name, branch names |
| `ralph/PROMPT.md` | `splitlah-mvp/ralph/PROMPT.md` | Stack, repo, integration gate commands, ADR references |
| `.github/workflows/ralph-gate.yml` | `splitlah-mvp/.github/workflows/` | CI commands for new stack |

---

## Skills to USE AS-IS (invoke globally, no project file needed)

| Skill | Invocation | Purpose |
|---|---|---|
| `/brainstorming` | `superpowers:brainstorming` | Workshop product goals with structured divergent thinking |
| `/grill-with-docs` | `grill-with-docs` | Interview to sharpen scope/design decisions |
| `/to-prd` | `to-prd` | Convert scoped goal → full PRD |
| `/to-issues` | `to-issues` | Convert PRD → GitHub Issues |
| `/triage` | `triage` | Prioritise and label issue backlog |
| `/ralph-loop` | `ralph-loop:ralph-loop` | Run autonomous TDD coding loop |
| `/ralph-retro` | `ralph-loop:ralph-retro` | Review ralph run logs, improve loop |
| `/session-retro` | `anthropic-skills:session-retro` | Evaluate current session, improve skill/process |
| `/youtube-research` | `youtube-research` | Research a topic via YouTube sources |
| `/deep-research` | `deep-research` | Multi-source web + YT + NotebookLM → `00_Raw/` |
| `/notebooklm` | `notebooklm` | Deep dive a topic in NotebookLM |
| `/workshop-feedback` | `workshop-feedback` | Structured feedback on a document or plan |
| `/commit` | `commit-commands:commit` | Git commit with message |
| `/commit-push-pr` | `commit-commands:commit-push-pr` | Commit + push + open PR |
| `/ship` | `ship` | Full PR lifecycle: checklist → conflict resolution → PR + review → merge + cleanup |

---

## Workflow loops (reference)

### Autonomous coding loop
```
01_Wiki → /brainstorming → /scope-session → /grill-with-docs
→ /to-prd → /to-issues → /triage → /ralph-loop
→ /qa-issues → /ship → /wiki-update
→ /session-retro or /ralph-retro
```

Issues: local `issues.md` + GitHub mirror. Sync from GitHub before planning.
Labels: `ready-for-agent` → `in-progress` → `needs-human-verify` (human closes)
Ralph branch: always `ralph`, never `main`

### Research loop
```
YouTube / web → /yt-playlist-ingest or /deep-research → 00_Raw/
→ /wiki-ingest → 01_Wiki/Research/
```
`/deep-research` outputs to `00_Raw/` first — never directly to `01_Wiki/`.

### Maintenance loop
```
/wiki-lint → validate + repair 01_Wiki/
/wiki-ingest → process new 00_Raw/ on demand
```
