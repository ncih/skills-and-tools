---
name: plan-qa-test
description: "Design and maintain a PROPORTIONAL, foolproof automated-QA test plan + infrastructure for any codebase — built for AI/agentic coding loops where a green CI gate is the only thing standing between the agent and production. USE THIS SKILL whenever the user wants to set up testing for a new project, scaffold test configs/gates, decide what to test where, map features or acceptance-criteria to test tiers, classify what is locally-verifiable vs production-only, audit or improve an existing test suite, figure out why a bug escaped to production, fix flaky or over-strict tests, judge whether coverage is actually good, or keep a living QA/test-strategy doc in sync as the codebase grows. Triggers on 'set up tests', 'test plan', 'test strategy', 'what should I test', 'why did this bug escape', 'our tests are flaky', 'is our coverage enough', 'QA plan', 'harden CI for the agent loop' — even when the word 'testing' is not used explicitly. Do not hand-roll a test plan without this skill; it encodes the failure-class taxonomy, tier ladder, environment classification, and robustness rules that prevent verification theater."
version: 1.0.0
status: active
tags: [skill, engineering, testing]
related: ["[[research-brief]]", "[[Filing_Standard]]", "[[System_Architecture]]"]
date_created: 2026-06-07
date_modified: 2026-06-07
---

# plan-qa-test

Design and maintain **foolproof automated QA testing for AI/agentic coding loops** — for any codebase, at a depth **proportional to that codebase's risk and complexity**.

The job is not "add more tests." It is to make a **green gate actually mean "works in production"** by ensuring every way the code can fail has a home — a tier, an environment-tier, or an explicit production-only route — while keeping the plan small enough that a coding agent can read it cheaply on every run.

> **The one question this skill exists to answer, for every check:** *"Where can this check not see?"* A gate that runs in an environment structurally blind to where bugs live is **verification theater** — it raises confidence without raising safety. The whole method is hunting blind spots and giving each one the cheapest durable home.

This skill is the operational distillation of `docs/testing/research-brief.md` (its intellectual source). The brief explains *why*; this skill and its `references/` are *how*, generalized off any one stack.

---

## The spine: nine meta-principles

Everything below serves these. Internalize them; they resolve most judgment calls.

1. **Gate on invariants; log the variance.** A build-failing assertion must be deterministic (schema, type, range, presence, a known substring, a business invariant like `refund_total ≤ order_total`). Non-deterministic output (LLM/OCR text, ranking, timing) is a **logged signal**, never a hard gate. *A flaky gate trains people to ignore red — worse than no gate.*
2. **Classify every acceptance criterion by the environment it needs** — before writing a test. `HERMETIC/LOCAL · INTEGRATION/DB · EXTERNAL-API · DEVICE · PRODUCTION-ONLY`. *A production-only AC can never be signed off from a local run.*
3. **Route each check to its cheapest durable home.** author-time rule (type/lint, an AGENTS.md note the loop reads every run) **>** a gate **>** a checklist.
4. **Earn every tier.** Add a tier only when a real (or concretely demonstrated potential) escaped bug proves the gap. No speculative ceremony.
5. **Track two outcomes.** Gate-pass *vs* production-survival. A widening gap means the gates or the handoff are the problem.
6. **Close proven holes permanently — without ceremony.** Escaped bug → reproduce at the right tier → fix → keep the regression → record the closed gap.
7. **Keep the QA plan in sync.** Update `docs/testing/qa-plan.md` every time a proposal is approved/implemented or a hole is closed. *A drifted plan is worse than none.*
8. **Isolate the evaluator from the agent.** What decides "pass" must be unwritable by what is being judged.
9. **Proportionality.** A simple app gets a simple plan; depth scales to *detected* risk. A heavyweight plan on a simple app is its own ceremony — maintenance, flakiness, and read-cost the risk doesn't justify. **This principle governs all the others** — apply 1–8 only as far as risk warrants.

---

## Operating model

```
SNIFF codebase → SIZE by risk (proportionality) → ROUTE by mode → PROPOSE → (human steers) → APPLY → keep plan IN SYNC
```

Always **propose a diff and get approval before writing test files, configs, gates, or migrations-to-test**. The human steers at every critical fork. Never silently scaffold.

### Step 0 — Sniff the codebase

Run `scripts/detect_stack.sh` (from the repo root) — or do it by hand if the script can't. Capture:

- **Stack**: language(s), framework, test runner(s), package manager, build tool.
- **Surfaces present** (these are what create failure classes): persistent **DB / migrations**? **mobile web / PWA / device** features? **external APIs / 3rd-party models**? **auth / multi-tenant (RLS)**? **money / irreversible side-effects**?
- **AI-loop signals** (these flip the evaluator-isolation requirement to *hard*): an autonomous coding loop (`AGENTS.md`, `ralph/`, agent CI), or **AI-judged / LLM-as-judge / eval** outputs (`evals/`, LLM deps).
- **Existing test reality**: which tiers actually exist and *what environment they run in* (this is the real Environment Matrix, not the aspirational one).

### Step 1 — Size by risk (the proportionality engine)

Map the codebase to a **risk band**. The band decides which tiers/sections are even *in scope* — do not exceed it without a proven need.

| Band | Looks like | In-scope tiers | qa-plan.md weight |
|---|---|---|---|
| **B0 — trivial** | pure-logic lib, static site, script | static + unit | ~10–15 lines, no logs |
| **B1 — standard** | one app, one DB, server-rendered, no device/external surface | + integration (real DB), + build | short; Env Matrix appears |
| **B2 — multi-surface** | DB **+** mobile/PWA **+** external APIs / money | + contract/golden, + browser/device E2E, + opt-in live tier, + prod smoke/canary | full; Non-Determinism Log likely |
| **B3 — agentic / high-stakes** | autonomous coding loop, AI-judged outputs, or high-blast-radius prod | + **evaluator isolation + independent test tier + mutation** (now *hard-required*), + canary gating | full; all three logs maintained |

Bands are cumulative and **per-area**: a B1 app with one B3 subsystem (e.g. an LLM feature) scopes that subsystem to B3 and the rest to B1. When unsure, pick the **lower** band and let an escaped bug earn the upgrade (principle 4).

### Step 2 — Route by mode (auto-detected)

Routing keys off **both** the plan and the existing suite (from Step 0), because a codebase often has tests but no plan:

- **No `qa-plan.md` AND ~no meaningful tests → GREENFIELD.** Scaffold the plan + earned infra from scratch (Mode A).
- **No `qa-plan.md` BUT existing tests present → GREENFIELD / bootstrap.** Do **not** treat it as a blank slate or re-scaffold what exists. First run Mode B's reconstruction (read the existing suite → real Environment Matrix → blind spots by failure-class) to write the **first** `qa-plan.md` from current reality, then propose gap closures. *(This is the most common real entry point — e.g. a shipped app with 5 test tiers but no strategy doc.)*
- **`qa-plan.md` present → EVALUATE-AND-IMPROVE** (Mode B — grow it).

If the user explicitly asks for one mode, honor that.

---

## Mode A — Greenfield

Create a proportional plan + the minimum earned infrastructure for a new (or untested) codebase.

> **Bootstrap first if tests already exist.** When Step 0 found existing tests but no `qa-plan.md`, begin with Mode B steps 1–2 (reconstruct the real Environment Matrix + find blind spots) so the first plan reflects reality — then scaffold only what is genuinely *missing*. Never re-create or duplicate tiers that already exist.

1. **Gather the units to verify** — features, acceptance criteria, user stories, or (if none are written) the critical user journeys you can infer from the code. You are not inventing requirements; you are routing the ones that exist.
2. **Classify each AC** with the per-AC decision procedure → `references/ac-classification.md`. Output per AC: `env-class · deterministic? · risk · chosen tier · (if PRODUCTION-ONLY) the shift-right signal + rollback threshold`.
3. **Select the tier ladder** for the risk band (Step 1) → `references/failure-classes-and-ladder.md` for what each rung catches/is-blind-to and how to pick the test *shape*.
4. **Scaffold only earned tiers, each with ONE robust tracer test.** Use `assets/tracer-tests/` + the matching `references/stacks/*` file. The tracer is the highest-leverage artifact — it teaches the loop the project's conventions (locators, fixtures, invariant-gating, scrubbers) far better than prose. Build every tracer to the robustness standard (`references/robustness-and-nondeterminism.md`) so it propagates *good* patterns, never flaky/over-strict ones.
5. **Wire the gate ordering** (static → unit → integration → slower tiers; opt-in/flaky/live tiers behind env keys, skipping cleanly when secrets are absent) → `references/ci-gating-for-agents.md`.
6. **Write `docs/testing/qa-plan.md`** from `assets/qa-plan.template.md`, sized to the band (`references/qa-plan-artifact.md`). Add the executable commands + hard "never" rules to `AGENTS.md`/`CLAUDE.md` (don't duplicate strategy there).
7. **Propose the full diff** (configs, scripts, tracers, plan, AGENTS.md block) → on approval, apply → confirm gates run green.

Do **not** scaffold tiers the band doesn't justify. A B0 lib gets static + unit + a ~12-line plan, and that is *complete*, not lazy.

---

## Mode B — Evaluate-and-improve

Assess and grow an existing plan as the codebase changes (e.g. a shipped sprint, an escaped bug, "is our coverage enough?").

1. **Reconstruct the real Environment Matrix** — for each existing tier, ask *two* questions: (a) *what environment does it actually run in?* (e.g. "integration resets the DB → blind to prod state"), and (b) **is it actually enforced as a CI gate, or does it only run locally / on demand?** A tier that exists but is **not wired into CI is effectively absent for an autonomous loop** — the agent ships green without it ever running (the classic trap: a Playwright suite that was built but never added to the pipeline). Mark those cells `LOCAL-ONLY` in the matrix; they are blind spots, **not** coverage. The gap between this *real* matrix and the aspirational one is exactly where bugs live.
2. **Find blind spots by failure-class** → `references/failure-classes-and-ladder.md`. For each class (state-drift, device/render, synthetic-interaction, contract, non-determinism), ask: does any tier actually exercise it? Unhomed classes are the findings.
3. **Re-classify ACs as the architecture changed** — a feature that was pure-logic last quarter may now touch DB/mobile/3rd-party, moving its ACs to new tiers (principle 2).
4. **Flag flaky AND over-strict tests** → `references/robustness-and-nondeterminism.md`. Over-strict (exact-match where an invariant belongs; auto-accepted snapshots; missing scrubbers) is a first-class defect — it rejects correct code and teaches the loop to game or disable it.
5. **If a bug escaped** (or could), trace it to the tier that *should* have caught it → recommend the **cheapest durable** closure (principle 3) → add the regression → record it in the **Closed-Gaps trail**. Recommend a new tier **only** when a real/potential escape proves the gap (principle 4).
6. **Check the two-outcome gap** (principle 5) and the evaluator-isolation requirement if AI-loop signals are present (Step 0).
7. **Propose the changes** (new/removed tests, config changes, plan updates, closed-gaps entries) → on approval, apply → **update `docs/testing/qa-plan.md`** (principle 7).

Findings should be ranked by failure-class severity × likelihood, and each must name a concrete closure, not "add more tests."

---

## The shared artifact: `docs/testing/qa-plan.md`

Both modes are thin wrappers around maintaining this one **living, AI-legible, cheap-to-read** doc. It is the loop's memory and the human's dashboard. Full spec + scaling rules: `references/qa-plan-artifact.md`; skeleton: `assets/qa-plan.template.md`. It contains (sized to band):

- **Strategy header** — stack, risk band, chosen test shape + why.
- **Tier ladder** — each tier: command, what it catches, what it's blind to.
- **Environment Matrix** — tiers × environments (local/CI/staging/prod) = `RUNS / LOCAL-ONLY / BLOCKED / OBSERVED`. *The table the agent must consult before declaring any gate "green."* `LOCAL-ONLY` (runs but isn't a CI gate) is a blind spot, not coverage — an autonomous loop never runs it.
- **Non-Determinism Log** — each known stochastic behavior, its tier, and how it's handled. *Justifies new tiers; isn't speculation.*
- **Closed-Gaps trail** — per closed hole: "Gate X was blind to [class] because [reason]; closed with [test/tier] on [date]."
- **AC classification index** — env-tag + tier per AC (or per area, for larger apps).

Keep it dense. If it grows past ~2 pages, graduate large areas to sub-plans rather than bloating the index.

---

## Execution boundaries — where each tier runs, and wiring the loop to the plan

Deciding *what* to test (the tier ladder) is half the job; the other half is *where each tier runs*. Two symmetric mistakes to avoid: running expensive tiers on **every loop iteration** (cost + flake the risk doesn't justify) and deferring them to **post-sprint UAT** (too late — that is exactly how a whole sprint ships green then breaks at sign-off). Route each tier to the **cheapest boundary that still catches its failure class *before it escapes*:**

| Tier class | Execution boundary |
|---|---|
| static · unit · integration · build | **per-iteration** (in-loop gate) |
| expensive deterministic (browser/device E2E) | **per-PR required check**, conditional on a triage label (e.g. `needs:e2e`) + a **periodic** full-suite on the integration branch as backstop |
| expensive stochastic (live LLM/OCR) | **periodic** scheduled job behind the secret (skip-clean if absent); N-sample, gate on invariants only, accuracy = signal |
| irreducible-manual (real device / receipt / OAuth on prod / install) | **post-sprint UAT** — the *only* class that belongs at UAT |

> Record the boundary explicitly in `qa-plan.md` (an "Execution boundary" line per tier). "Which tier runs where" is the question the matrix's `RUNS`/`LOCAL-ONLY` cells answer; the boundary says *at what cadence*.

**Triage is the classification choke-point.** Consume the plan **once per issue at triage**, not on every implementer run: triage classifies each acceptance criterion's environment, writes a terse per-issue *verification note* into the issue, and sets `needs:*` labels that drive **conditional** CI. The implementer then reads only its issue (no plan-read → no per-run context bloat) plus the one hard rule below. This keeps cost **proportional** (an expensive tier runs only when an issue actually touches that surface) and the loop's context lean.

**Wire the loop to the plan — or it's an orphan.** A QA plan the loop is never pointed at is its own blind spot: verification theater of the plan itself. The skill's job is not done until the entrypoint the loop reads every run (`AGENTS.md` / `CLAUDE.md`) carries **(1)** a *conditional* pointer to `qa-plan.md` for testing/verification/gate-changing tasks, and **(2) one** terse hard rule — *"never report an AC as covered by a tier that did not run in this run's gates (e.g. per-PR / periodic tiers); route device & stochastic ACs to human UAT."* Keep the pointer terse; the plan is read at triage, not per iteration.

---

## Reference map — read ONLY what the band warrants (proportional reading)

The SKILL.md body already carries the spine (the 9 principles, the bands, both workflows). **Reading every reference on every run is itself a proportionality violation** — it inflates token cost and reading time on simple codebases for no benefit. After Step 0–1 (you know the band + surfaces), load a reference **only** when its surface is actually present.

**Always load (the core trio + your one stack file):**
- `references/ac-classification.md` — the per-AC routing algorithm (the heart of every run)
- `references/failure-classes-and-ladder.md` — tiers, blind spots, shape selection
- `references/qa-plan-artifact.md` — how to write/update `qa-plan.md`
- exactly **one** of `references/stacks/{node-ts,supabase-postgres,generic}.md` (the detected stack; `generic.md` if unknown)

**Load conditionally — pull only when the trigger is present:**

| Reference | Pull it ONLY when |
|---|---|
| `references/prod-parity-and-migration.md` | a DB / migrations surface is detected (any band with a DB) |
| `references/robustness-and-nondeterminism.md` | a stochastic surface exists (LLM/OCR/ranking/timing), flaky tests are reported, **or** you're in evaluate/bootstrap mode auditing an existing suite |
| `references/ci-gating-for-agents.md` | an autonomous agent loop or AI-judged outputs are detected (B3) |

**Concretely:** a **B0/B1** app with no DB and no stochastic surface needs only the core trio + one stack file — do **not** open the prod-parity, robustness, or agent-gating references. A **B2** DB+external app adds prod-parity (and robustness only if it has stochastic output). Only **B3** pulls the full set. When in doubt, prefer fewer references and let a finding pull the next one.

---

## Guardrails

- **Propose before you write.** Configs, gates, tests, and plan edits all go through a human-approved diff.
- **Proportionality beats completeness.** When in doubt, do less and let a real escape earn more.
- **Never weaken a correctness gate to make it pass.** Fix the code or escalate. Over-strict gates get *re-scoped* (invariant instead of exact-match), not deleted wholesale.
- **Wire the loop to the plan.** A `qa-plan.md` the entrypoint never points at is an orphan — finish by adding the conditional pointer + the one hard rule to `AGENTS.md`/`CLAUDE.md` (see Execution boundaries). Route the *what-to-verify* through triage (per-issue note + `needs:*` labels), not a full-plan read on every implementer run.
- **Don't fake provenance.** If a recommendation isn't grounded in the codebase or the brief, say so.
