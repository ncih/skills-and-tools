# CLAUDE.md Template

Replace `[VaultName]`, `[project-name]`, and `[org]` with actual values.

---

```markdown
# [Project Name] — Operating Rules for Claude Code

You are the core intelligence managing both the codebase and the knowledge graph for [Project Name].
For the full system design see [[System_Architecture]]. For the complete skill list see [[Skills_and_Workflows]].

## Workspace Layout

\```
[project-name]/
├── CLAUDE.md
├── src/                   ← application codebase (Claude Code primary)
├── .claude/
│   ├── skills/            ← SYMLINK → [VaultName]/04_Workforce/Skills/
│   └── agents/            ← SYMLINK → [VaultName]/04_Workforce/Agents/
└── [VaultName]/     ← real folder (canonical); sync mirror symlinks here
    ├── 00_Raw/            ← IMMUTABLE human inbox — never delete or modify
    │   └── Archive/       ← processed raw files (permanent record)
    ├── 01_Wiki/
    │   ├── Index.md       ← auto-maintained file map
    │   ├── Decisions.md   ← append-only decision log
    │   ├── People/
    │   ├── Companies/
    │   ├── Product/
    │   ├── Market/
    │   ├── Engineering/
    │   ├── Operations/
    │   └── Research/
    ├── 02_Templates/      ← structural templates for all file types
    ├── 03_Workspace/      ← working artifacts per initiative
    │   ├── Active/        ← YYYY-MM-DD_Initiative_Name/
    │   ├── Archive/       ← completed initiatives
    │   └── Index.md
    └── 04_Workforce/      ← canonical home for agents + skills
        ├── Agents/
        ├── Skills/
        └── Main_Agent.md  ← symlink → CLAUDE.md
\```

## Team Access Model

- Humans write only to `00_Raw/` (captures, meeting notes, raw ideas)
- Claude Code is the sole writer to `01_Wiki/`
- `src/` written by Claude Code; reviewed and merged by humans via GitHub PRs

## Templates

When creating any file in `01_Wiki/`, use the matching template from `02_Templates/`:

| Namespace | Template |
|---|---|
| `People/` | `Person.md` |
| `Companies/` | `Company.md` |
| `Product/` | `Feature.md` |
| `Market/` | `Market_Note.md` |
| `Engineering/` | `Engineering_Decision.md` |
| `Operations/` | `SOP.md` |
| `Research/` | `Research_Note.md` |

Workspace artifacts in `03_Workspace/Active/YYYY-MM-DD_Initiative_Name/`:

| Artifact | Template |
|---|---|
| `scope.md` | `Workspace_Scope.md` |
| `qa-report.md` | `Workspace_QA_Report.md` |
| `session-notes.md` | `Workspace_Session_Notes.md` |

Fill known fields; leave unknowns blank — never invent values.

## Rule 1: Vault Maintenance

- **NEVER** delete or modify files in `00_Raw/`. It is the immutable human inbox.
- All `01_Wiki/` files must use wikilinks (`[[Exact File Name]]`) to connect related concepts.
- If a wikilinked file does not exist, create a stub immediately.
- All `01_Wiki/` files must have YAML frontmatter (schema below).

### YAML Frontmatter Schema

\```yaml
---
type:         # concept | entity | source | decision | feature | sop | research | moc | system
summary:      # ONE sentence — relevance distillation the AI reads before opening the file
status:       # active | draft | superseded | archived
tags: []      # MAX 3, controlled vocabulary (namespace + optional type/state)
related: []   # [[wikilinks]] to associated notes
sources: []   # [[provenance]] — the 00_Raw capture this was compiled from
aliases: []
date_created: YYYY-MM-DD
date_modified: YYYY-MM-DD
supersedes: ""
---
\```

### Naming Conventions

- `00_Raw/`: `YYYY-MM-DD-HHMM_Brief_Topic.md`
- `01_Wiki/`: `Concept_Or_Feature_Name.md` — no timestamps
- `03_Workspace/Active/`: `YYYY-MM-DD_Initiative_Name/`

## Rule 2: Knowledge Compilation & Conflict Resolution

When processing `00_Raw/` (via `/wiki-ingest`):
1. Read files in chronological order (filename timestamp).
2. Route to the correct `01_Wiki/` subfolder:
   - Individuals → `People/`
   - Organisations → `Companies/`
   - Features, specs, roadmap, product decisions → `Product/`
   - GTM, pricing, ICP, positioning → `Market/`
   - Architecture, schemas, technical decisions → `Engineering/`
   - SOPs, hiring, finance, team rituals → `Operations/`
   - External frameworks, field research, AI patterns → `Research/`
3. **Conflict resolution:** update the canonical file, move overridden logic to
   `## Superseded History`, update `date_modified`. If fully invalidated: set
   `status: superseded`, create new file, link with `supersedes:`.
4. Append decisions to `Decisions.md`.
5. Update `Index.md` — one-line entry per new/updated file.
6. Ask user before moving processed files to `00_Raw/Archive/`.

## Rule 3: Code Execution

- All application code lives in `src/`.
- Before writing or refactoring code, read `01_Wiki/Engineering/` and `01_Wiki/Product/`.
- Code must conform to schemas and patterns documented in Engineering.
- Ralph loop: TDD enforced (red→green→refactor). Never push to `main`. Never close issues.
  See [[Skills_and_Workflows]] for the full autonomous coding loop.
```
