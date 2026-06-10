# qa-plan-artifact — spec for `docs/testing/qa-plan.md`

> **Table of contents**
> 1. [Purpose and model](#1-purpose-and-model)
> 2. [Section-by-section spec](#2-section-by-section-spec)
> 3. [Environment Matrix in depth](#3-environment-matrix-in-depth)
> 4. [Scaling by risk band (B0–B3)](#4-scaling-by-risk-band-b0b3)
> 5. [Sync discipline and drift prevention](#5-sync-discipline-and-drift-prevention)

---

## 1. Purpose and model

`docs/testing/qa-plan.md` is the **living, AI-legible, cheap-to-read** single source of truth for what the codebase tests, where, and why. The coding loop reads it on every run before touching test files or declaring a gate "green." If a bug escaped, the plan explains *which tier should have caught it and why it couldn't.* If it drifted, it becomes misleading context — worse than nothing.

### The layered docs-as-code model

Three layers; none duplicates the others:

| Layer | File(s) | Contents |
|---|---|---|
| **Strategy index** | `docs/testing/qa-plan.md` | Shape rationale; tier ladder; Environment Matrix; log stubs; AC classification index; pointers |
| **Per-feature ACs** | `specs/NNN-*/spec.md` (or inline in issues/PRs) | Given/When/Then or EARS `SHALL` statements, each carrying inline env tag `[LOCAL]` / `[DB]` / `[DEVICE]` / `[PROD-ONLY]` and a determinism tag |
| **Executable commands + hard rules** | `AGENTS.md` / `CLAUDE.md` | Exact runnable commands (`pytest -v --cov-fail-under=80`), framework + version, canonical test-file pointers, hard "never" rules (e.g. "never delete a failing test — fix or escalate") |

**Never duplicate across layers.** Strategy lives in `qa-plan.md`; commands live in `AGENTS.md`; behavioral specs live in the feature specs. Cross-link, don't copy. A reader of `qa-plan.md` should find pointers, not the commands themselves.

---

## 2. Section-by-section spec

### 2.1 Strategy header

Five lines, always present, always current:

- **Risk band**: `B0 | B1 | B2 | B3` + one phrase naming the surfaces that drove it (DB / mobile / external-API / money / agent-loop / AI-judged).
- **Stack**: language · framework · test runner(s) · build.
- **Test shape**: `pyramid | honeycomb | trophy | hybrid` + one sentence on *why* (where complexity lives). Shape is determined by architecture, not dogma — pick the shape whose center of gravity matches where failures concentrate.
- **AI-loop / evaluator isolation**: `required` (autonomous coding loop or AI-judged outputs detected) | `recommended` | `n/a`.
- **`date_modified`**: kept current; used by the drift lint gate.

### 2.2 Tier ladder

One row per earned tier; three columns: command class, what it **catches**, what it is **blind to**. The blind-to column is as important as the catches column — it names the gap that forces the *next* tier to exist.

Only include tiers the risk band has earned (principle 4). Every rung listed must have a real command and at least one passing test. The ladder is a ladder, not a wishlist.

### 2.3 Environment Matrix

See §3 — this is the core artifact the loop consults before any pass/fail verdict.

### 2.4 Non-Determinism Log (B2+)

A running table of every behavior *observed* to be non-deterministic, with three fields:

| Behavior | Tier | Handling |
|---|---|---|
| How the variance manifests | Where it lives | invariant-gated / N-sample threshold (n=X, α=Y) / sampled / prod-monitored |

**Why this log exists:** new stochastic escapes append here, and only an entry in this log justifies adding a stochastic-eval tier or a prod-sampling step. Speculation does not earn a tier; an observed escape does. The log is also the diagnostic: if an LLM-output gate keeps flapping, the log should show the behavior was already classified as non-deterministic and the fix is to gate on invariants and move the variance to a threshold eval.

### 2.5 Closed-Gaps trail (B2+)

One bullet per closed hole, structured as:

> `YYYY-MM-DD` — Gate `<X>` was blind to `<failure class>` because `<reason>`. Closed with `<test/tier>`. (ref: `<issue/PR>`)

The trail prevents the loop from re-opening a blind spot during a refactor (it can read *why* the tier exists). It also makes added ceremony legible: if the trail is empty and the plan has five tiers, that is a smell. Each tier should have at least one trail entry.

### 2.6 AC classification index

Maps acceptance criteria (or feature areas) to `env-class · deterministic? · tier(s) · (if PROD-ONLY) the named shift-right signal + rollback threshold`. This is the contract that prevents verification theater: a `PROD-ONLY`-tagged AC cannot be signed off from a `RUNS-local` tier — the matrix makes the mismatch visible.

For large codebases, this section lists areas (not every individual AC) and links to sub-plans. Keep it scannable.

### 2.7 Production-outcome tracking (B2+)

Two numbers, not one:
- **Gate-pass rate** (how often CI passes for merged PRs)
- **Production-survival** (escaped defects per sprint / rework deploys / UAT-found bugs)

A widening gap between these is the signal that the gates or the handoff are the problem, not the implementer. Log the gap and the corrective action on each review.

---

## 3. Environment Matrix in depth

The Environment Matrix is the single most important table in the plan. It makes structural blind spots visible and gives the loop an unambiguous rule: a tier marked `BLOCKED` for an environment **must not** claim to verify an AC that needs that environment.

### Cell semantics

| Cell | Meaning |
|---|---|
| `RUNS` | The tier executes **and is enforced as a gate** in this environment |
| `LOCAL-ONLY` | The tier exists and runs (locally / on demand) but is **not wired into the CI gate** — so for an autonomous loop it effectively does not run. This is a blind spot, **not** coverage. Hunt for it specifically when reconstructing an existing suite. |
| `BLOCKED` | The tier structurally cannot reach what this environment provides — a gate here is theater |
| `OBSERVED` | The behavior is monitored/sampled but not a hard blocking gate |
| `—` | Not applicable (tier doesn't exist in this environment) |

**`RUNS` vs `LOCAL-ONLY` is the distinction that catches the most-missed real gap.** A team can *build* a Playwright/e2e suite (so it "exists") yet never add it to the pipeline — the agent then ships green while the suite that would catch the bug never executes. When reconstructing, fill the **CI column from the actual pipeline config** (`.github/workflows/*`, the gate script), never from intent. A tier that is `RUNS` locally but `LOCAL-ONLY` in CI must be treated as missing coverage until it is gated.

### A worked template (B2 example)

| Tier ↓ / Env → | local | CI | staging | prod |
|---|---|---|---|---|
| static | RUNS | RUNS | — | — |
| unit | RUNS | RUNS | — | — |
| integration (real DB) | RUNS | RUNS | RUNS | BLOCKED (resets clean ≠ accumulated prod state) |
| contract / golden | RUNS | RUNS | — | — |
| E2E / device | RUNS | RUNS | RUNS | BLOCKED |
| live (opt-in) | OBSERVED | OBSERVED | OBSERVED | OBSERVED |
| build | — | RUNS | — | — |
| smoke / canary | — | — | RUNS | RUNS / OBSERVED |

**Why `integration` is BLOCKED at prod:** a `db reset`-based integration suite verifies "migrates from zero" — a state production never starts from. It is structurally blind to accumulated prod state, undeployed migrations, and data-shape regressions. That is why smoke/canary and prod-parity migration testing (see `references/prod-parity-and-migration.md`) exist.

**Why `E2E` is BLOCKED at prod:** emulation cannot see OS-controlled UI (PWA install prompts, camera, Face ID), real device engine divergence (iOS Safari flex/gap, `100vh` dynamic), or hardware. These are `PROD-ONLY` and route to the manual checklist.

The matrix must reflect **reality**, not aspiration. If the integration tier actually runs against a clean-reset DB, the matrix must say `BLOCKED` at prod — even if the aspirational plan once said `RUNS`.

---

## 4. Scaling by risk band (B0–B3)

The plan size is **proportional to risk** (meta-principle 9). Bigger is not better — a plan too heavy for the codebase is expensive to maintain, slow to read, and trains the loop to ignore it.

### B0 — trivial (~10–15 lines)

Pure-logic library, static site, script. No DB, no device surface, no external services.

**Include:** strategy header + 2-tier ladder (static + unit) + a 2-row Environment Matrix (static: RUNS/RUNS/—/—; unit: RUNS/RUNS/—/—). No logs. No AC index.

**Skip:** Non-Determinism Log, Closed-Gaps trail, production-outcome tracking. They have no surface to track.

### B1 — standard (~30–50 lines)

One app, one DB, server-rendered, no significant device/external surface.

**Add to B0:** integration tier in the ladder + matrix; AC classification index (the key anti-theater addition); `AGENTS.md` pointer in the strategy header.

**Skip:** Non-Determinism Log (no stochastic surface), Closed-Gaps trail (unless a bug has already escaped). Add those the moment a gap is closed, not speculatively.

### B2 — multi-surface (~60–100 lines, or with sub-plans)

DB + mobile/PWA + external APIs / money flows.

**Add to B1:** contract/golden tier; E2E/device tier; live (opt-in) tier; smoke/canary row; Non-Determinism Log (required — external/model outputs are inherently stochastic); Closed-Gaps trail (required once any tier is added beyond B1); production-outcome tracking.

If any single feature area generates more than ~15 AC rows, graduate it to a sub-plan (`docs/testing/specs/area-name.md`) and replace the rows with a link. The index stays scannable.

### B3 — agentic / high-stakes (full plan, actively maintained)

Autonomous coding loop, AI-judged outputs, or high-blast-radius prod (payments, health, auth).

**Add to B2 (all three logs mandatory):**

- Evaluator isolation is hard-required (not a recommendation): independent, non-agent-authored test tier + oracle in a separate read-only container.
- Mutation gate: ≥1 mutant killed per AC; surviving mutants = assertion gaps. Mutation score (not coverage %) is the quality signal.
- Stochastic verdicts are three-valued: PASS / FAIL / INCONCLUSIVE. Binary verdicts on stochastic agent output have near-zero regression-detection power.
- Canary gating: per-version metrics (error rate < 0.1%, p95 within +10%) with feature-flag rollback — never aggregate metrics.

All three logs (Non-Determinism, Closed-Gaps, Production-outcome) are actively maintained and reviewed on every sprint. A B3 plan with stale logs is a drift signal.

---

## 5. Sync discipline and drift prevention

The plan is **updated every time** a proposal is approved/implemented or a proven hole is closed (meta-principle 7). These are the mechanics:

### Spec-drift lint gate

A CI check (run alongside static analysis, fail-fast) that enforces:

1. Every file referenced in `qa-plan.md` (spec paths, sub-plans, command scripts) **exists**.
2. Every AC listed in the classification index has **either a linked test or a `[TODO]` tag with a due date**.
3. `date_modified` in the strategy header matches the last git-commit date that touched the plan.

The lint gate fails CI when the plan drifts from the code. This is how the plan stays accurate rather than aspirational: it versions with the code that it describes.

### Update triggers

| Event | Required update |
|---|---|
| A proposal is approved (new feature / AC) | Add ACs to classification index with env tag + tier |
| A test is merged for a new AC | Remove `[TODO]` tag; confirm tier matches env class |
| A bug escapes to production | Identify failure class → close the gap → append Closed-Gaps trail entry |
| A stochastic behavior is observed | Append Non-Determinism Log entry; re-gate that AC |
| Architecture change adds a new surface | Re-classify affected ACs; add earned tier if needed; update matrix |
| A tier is retired | Remove from ladder + matrix + lint reference list; add trail entry explaining why |

### Graduation rule

When a section of the AC index exceeds ~15 rows, move it to a sub-plan at `docs/testing/specs/<area-name>.md` and replace the rows with a single pointer row. The index stays dense and cheap to scan; the detail lives where the reader can find it. Never let the index become a spreadsheet — if it takes more than 10 seconds to scan, it has exceeded its purpose.

### Why density matters

The plan is read by a coding agent at the start of every run. A long, redundant, or aspirational plan is costly in two ways: token cost (every run) and trust cost (a plan with stale sections trains the loop to discount it). Keep it factual, current, and as short as the risk band allows. The template (`assets/qa-plan.template.md`) is the starting skeleton; delete sections the band doesn't earn.
