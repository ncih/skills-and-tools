---
type: reference
summary: "How to write and audit tests so the suite stays trustworthy: separating hard gates from quality signals, flaky-test management at scale, over-strict tests as a first-class defect, and how to test stochastic/LLM output without fooling yourself."
status: active
tags: [engineering, testing, skill-reference]
related: ["[[plan-qa-test]]", "ac-classification.md", "ci-gating-for-agents.md"]
date_created: 2026-06-07
date_modified: 2026-06-07
---

# Robustness & Non-Determinism

> **Scope:** applies to every tier, every codebase. Proportionality still governs — a B0 library needs Part A and maybe Part C; Part D (LLM output) is relevant only when stochastic surfaces exist.

## Table of Contents

1. [Part A — Gate on Invariants; Log the Variance](#part-a)
2. [Part B — Flaky-Test Management at Scale](#part-b)
3. [Part C — Over-Strict Tests as a First-Class Defect](#part-c)
4. [Part D — Testing Non-Determinism and LLM Output](#part-d)

---

## Part A — Gate on Invariants; Log the Variance {#part-a}

The core architectural split: **hard gates** and **quality signals** are separate systems with different configs, different jobs, and different consequences. Blending them is the root cause of flaky gates and ignored red.

### What belongs where

| Category | Hard gate (build-fails) | Quality signal (logged, not blocking) |
|---|---|---|
| **Deterministic** | schema shape, type, range, required field presence, known substring, business invariant (`refund_total ≤ order_total`), auth guard | — |
| **Stochastic** | invariants *about* stochastic output (non-empty, valid JSON, within token limit, PII regex absent) | the actual text, score, or distribution (mean, stddev, per-run variance) |
| **OCR / ranking** | `grand_total` numeric match, item list non-empty | per-item price deltas, rank position |
| **Timing** | SLO breach threshold (p95 > Xms over N samples) | per-request latency distribution |

**Why the split matters:** a flaky gate trains everyone to ignore red. Once a team learns that "red sometimes means nothing," the gate loses its signal value entirely — a green badge provides false assurance, and a red badge gets reflexively dismissed. Separate the two architecturally so each tells the truth about its own domain.

### Implementation pattern

- In test configs: hard-gate assertions live in the normal test body (fail = fail). Quality signals use a side-channel — a structured log, a metric emit, a `--reporter` output — that CI collects but does not gate on.
- Use a `NonDeterminismLog` section in `qa-plan.md` to record every behavior treated as a signal rather than a gate, with the justification. This prevents signal-tier behaviors from quietly migrating back into hard gates during refactors.
- At B3 (agentic): the quality signals feed back as permanent golden-dataset entries when they catch a real production failure (the flywheel — see Part D).

---

## Part B — Flaky-Test Management at Scale {#part-b}

Flakiness at machine-speed is an existential problem for agent loops: agents refactor and rename at a velocity that shatters selector-based tests, and "retry until green" masks real bugs. The discipline below is a system, not a one-off fix.

### Continuous / probabilistic scoring, not binary

Don't classify a test as flaky or stable based on one or two runs. Meta's **Probabilistic Flakiness Score (PFS)** runs a Bayesian model over recent run history to rank tests by fix-reward and to tell you *when to stop* deflaking (relative to the framework baseline). The key property: require a minimum run history (~20–50 runs) before labeling. "1/2 fails" is not "50% flaky" — the confidence intervals don't overlap.

Practical default: compute a rolling 7-day flake rate per test. Flake rate > 5% → quarantine candidate. Flake rate > 20% → immediate quarantine.

### Non-blocking quarantine with a hard SLA

Quarantine means: **not blocking CI, but still running** (evidence accumulates). Without this, you lose signal while reducing noise — exactly wrong.

The SLA is what prevents quarantine from becoming a permanent graveyard:

- **14 days:** fix it or delete it with an explanation.
- **30 days maximum:** auto-disable and file a ticket with full run history. No extensions without a recorded justification.

Slack's automated detect→suppress→ticket pipeline cut their test-job failure rate from **56.76% to 3.85%**, saving 553 triage hours — the SLA automation is what made it durable, not just the initial detection.

### Type-scoped retry budgets

Retries are a precision instrument, not a general flakiness treatment.

| Tier | Default retry budget | Rationale |
|---|---|---|
| Unit | **0** | A retry-pass is evidence of flakiness, not health. Real unit bugs are deterministic; retrying masks them. |
| Integration | **2** | Real deps (DB, network) have transient failure modes. Cap low; each retry-pass is still logged as a flakiness signal. |
| E2E / browser | **3** | Higher environmental variance (rendering, network, timing). Still: a test that passes only on retry 3 needs auditing. |

> **Note:** these are sensible defaults, not law. Block uses dynamic retries keyed on each test's historic flakiness score — a more advanced form that adjusts budgets per test rather than per tier. Treat 0/2/3 as the starting point and graduate to dynamic retries when you have the run-history infrastructure.

**Always log retry-passes** separately from clean passes. A gate that "passed" only after retries is not the same signal as one that passed first time — track them differently in your dashboard.

### Early flake detection at authoring time

The cheapest fix is finding flakiness before the test reaches the main suite.

- **Block's practice:** run every newly-authored test ~100× against a fixed codebase state before merge.
- **Datadog Early Flake Detection:** 5–20× runs on new tests at PR time.
- **Always apply to agent-authored tests.** Agents optimize for passing the current run — they do not optimize for cross-environment determinism. EFD (Early Flake Detection) is not optional for agent-written tests; it is the structural check on a known agent blind spot. A test written by an agent that passes once is not yet trustworthy.

A retry-pass during EFD is **evidence of flakiness, not evidence the test is acceptable with retries**.

### Team-visible dashboards with ownership

Visibility is the highest-leverage flakiness lever before any code changes.

- **Spotify** achieved a **33% reduction in flakiness from visibility alone** — before any code fixes — simply by publishing per-test flake rates with ownership labels.
- Dashboard must show: flake rate (7d trend), owner, time-in-quarantine, CI minutes wasted, retry-pass count.
- Without ownership labels, the dashboard creates awareness but no accountability. Assign ownership at the test-file level at minimum.

### Automated deflaking

Automated deflaking tools (FlakyGuard, Datadog Bits AI, TestSprite-style self-healing) now report ~47–52% developer-accepted fix rates. The key distinction: **they must fix the test to be deterministic, not fix it to always-pass**. A test that always passes because it was weakened to an invariant that no real bug can violate is not a deflaked test — it is a disabled test with better optics.

When evaluating automated deflaking output: require that the deflaked test still catches the bug it was designed to catch (run it against a known-bad version of the code).

---

## Part C — Over-Strict Tests as a First-Class Defect {#part-c}

Over-strict tests are flakiness's twin: both make the suite untrustworthy, but in opposite directions. Flaky tests create false negatives (ignore the red); over-strict tests create false positives (reject correct solutions). Both teach the agent loop to game or disable the gate.

### The evidence that this matters

OpenAI stopped evaluating SWE-bench Verified (Feb 23, 2026) after auditing 138 problems their model failed: **59.4% had flawed tests**; **35.5% were over-strict tests rejecting functionally correct solutions** — tests that asserted unspecified implementation detail rather than specified behavior. (openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/)

The practical consequence: when a coding agent encounters an over-strict test, it faces a false choice between breaking a correct implementation or producing the exact (possibly wrong) output the test expects. It learns to satisfy the test, not the spec.

### The over-strict defect patterns to flag

| Pattern | Why it's defective | Fix |
|---|---|---|
| **Exact-match where an invariant belongs** | Asserts specific prose, UUID, or order where the spec only requires format, type, or range | Replace with invariant assertion (non-empty, valid JSON, within range) |
| **Auto-accepted snapshots** | `--updateSnapshot` run without review; CI silently commits new baseline on agent output change | Require `--ci` flag; block snapshot auto-accept in CI; any snapshot change needs a human-reviewed PR diff |
| **Missing scrubbers on volatile fields** | Timestamps, UUIDs, session IDs in snapshots → failure on every non-deterministic run | Build a dedicated scrubber/redactor before the snapshot; `<ts>`, `<guid>`, `<session>` |
| **Asserting implementation path, not outcome** | Test checks internal function call count or specific code path rather than observable result | Re-scope to observable behavioral invariant |
| **Testing unspecified behavior** | Spec says "returns a list"; test asserts exact order of a list the spec doesn't sort | Remove the constraint or add a sort to make it specified |

### How to handle them: re-scope, not delete

Deleting an over-strict test leaves the behavior unverified. The right move is to **re-scope the assertion to what the spec actually requires**:

1. Find the spec or acceptance criterion the test was meant to verify.
2. Identify the minimum observable evidence that the spec is satisfied (the invariant).
3. Replace the exact-match with the invariant assertion.
4. If no spec exists, write one before touching the test — "I don't know what this should do" is a spec gap, not a test gap.

If the behavior genuinely needs exact-match (e.g. a deterministic hash or a specific regulatory output format), document *why* in a comment. This prevents future reviewers from flagging it as over-strict when it isn't.

---

## Part D — Testing Non-Determinism and LLM Output {#part-d}

The deepest challenge: a system whose output varies by design. Applying deterministic test discipline to stochastic outputs produces either always-failing (over-strict) or always-passing (vacuous) tests. Neither is useful. The architecture below separates the layers so each does its job.

### Evals vs tests: the distinction that matters

**Tests** make binary assertions about deterministic behavior. **Evals** measure quality over a distribution. They are not the same tool used at different confidence levels — they have different runners, different pass criteria, different cadences, and different purposes. Conflating them is how you end up with a test suite that is simultaneously 100% green and entirely useless for stochastic systems.

### The three-layer stack

| Layer | Purpose | When it runs | Pass criterion | Pattern |
|---|---|---|---|---|
| **1. Deterministic invariants** | Block any commit that violates a structural guarantee | Every commit (hard block) | Binary pass/fail | Schema shape, JSON validity, type, length bounds, regex (PII/safety), required tool parameters, token limit |
| **2. Stochastic evals** | Gate releases on aggregate quality over a distribution | Pre-release; N=5–10+ samples per eval | Aggregate pass-rate ≥ threshold over N; stddev > 0.15 flags instability | LLM-as-judge, semantic similarity, task-completion rate on a golden dataset |
| **3. Production sampling** | Catch escaped failures; feed the golden dataset flywheel | 5–10% of live traffic, continuously | Does not gate alone — feeds layers 1 and 2 | Sampled online scoring; failures become permanent golden cases |

The flywheel: every production failure that layer 3 catches becomes a golden case in layer 2's dataset, which tightens the threshold gate, which prevents the same class of failure from shipping again. Without the flywheel, evals on a static dataset drift from production reality.

### Temperature=0 is not determinism

GPU floating-point reduction-order and batching variance mean a model at temperature 0 can still produce ~80 distinct completions across 1,000 runs. Multi-sample + invariant gating is mandatory regardless of temperature setting. Never treat "temperature=0" as a substitute for the three-layer architecture.

### Golden/snapshot tests for agents

For agents, the artifact worth snapshotting is the **execution trace** (tool-call sequence, argument keys, decision points), not the prose output.

Rules for trustworthy agent snapshots:

1. **Build the scrubber first.** A dedicated redactor normalizes volatile fields before snapshotting: timestamps → `<ts>`, UUIDs → `guid_1/guid_2`, session tokens → `<session>`. The redactor is a first-class artifact, tested independently.
2. **Keep snapshots small enough to review in a PR diff.** If the snapshot is 500 lines of JSON, it will not be reviewed — it will be rubber-stamped. Snapshot the minimal trace that captures the behavior you care about.
3. **CI must refuse to auto-write new or changed snapshots.** Run with `--ci` or equivalent; any snapshot change requires a human-reviewed PR diff. An agent that changes its own snapshot baseline is the evaluator-tampering failure mode in a mild form.
4. **A snapshot change on a refactor is a signal, not a nuisance.** Treat unexpected snapshot changes as a behavior-change alert, not a formatting chore.

### Property/invariant first, golden second

Properties catch *classes* of failure; golden examples catch *specific* regressions. Write properties first:

- Output is valid JSON with required keys.
- Output length is within [min, max] characters.
- Output contains no PII patterns (regex).
- Output refuses off-domain queries (adversarial prompt set).
- Agent calls tool X before tool Y in flows of type Z.

Property-based testing with an LLM-as-generator (a model producing diverse adversarial inputs) is the emerging standard for fuzzing agent boundaries (Agentic PBT, arXiv 2510.09907; Property-Based Testing with Claude, red.anthropic.com 2026).

Golden examples are the complement: once you've seen a specific regression, pin it. But a golden dataset that isn't grown by production failures drifts from reality.

> **[Thin] caveat:** RAGAS faithfulness/context-precision thresholds (~0.8) appear in the research fan-out but not in the primary corpus. Treat specific RAGAS threshold values as unverified starting points — validate against your own human-labeled baseline before baking them into a release gate.

### LLM-as-judge: powerful but biased — mitigate explicitly

LLM judges are the most scalable eval mechanism. They are also systematically biased in ways that, unmitigation, produce calibrated-looking but structurally unreliable verdicts.

**Position bias:** judges favor the first response 60–75% of the time regardless of quality.
- Mitigation: **swap augmentation** — judge both orderings (A,B) and (B,A); count only verdicts consistent across both orderings.

**Self-preference ("Machiavellian judge"):** models favor outputs from their own model family while accurately discriminating quality within families.
- Mitigation: use a **cross-family judge** (judge with a different model family than the one being evaluated); use a **multi-judge ensemble** for high-stakes evals.

**Agreeableness / rubber-stamping:** judges affirm valid output >96% of the time (TPR) but catch invalid or hallucinated output <25% of the time (TNR). This is the failure mode that matters: the judge looks calibrated on good outputs and fails precisely where you need it.
- Mitigation: **minority-veto ensembles** — e.g., flag as a failure if ≥4 of 14 judges veto, even if the majority approves (this reduces max absolute error to ~2.8%). The threshold is tunable; the principle is that a high-confidence minority veto should block, not be outvoted.

**Calibration:** calibrate every judge dimension against 30–200 human-labeled examples. If human annotators disagree >20% on those labels, the rubric is too ambiguous — fix the rubric first, then calibrate. Regression calibration across ~5 datasets (~200 person-hours) can reduce max absolute error to ~1.2%. Recalibrate when you see judge-vs-human drift (compare judge scores against a held-out human-labeled set quarterly or after major model updates).

### The three-valued verdict: PASS / FAIL / INCONCLUSIVE

Binary pass/fail on stochastic agent output has near-zero regression-detection power — aggregate scores degrade gradually while individual runs stay within noise, so the gate stays green while behavior worsens.

Use three-valued verdicts:

| Verdict | Meaning | Action |
|---|---|---|
| **PASS** | ≥ threshold over N samples, within stddev budget | Proceed |
| **FAIL** | Below threshold | Block; file issue |
| **INCONCLUSIVE** | High variance (stddev > budget), insufficient N, or judge ensemble split | **Block and gather more evidence** — do NOT treat as PASS |

INCONCLUSIVE is the hardest discipline to maintain under time pressure. The instinct is to treat a high-variance result as "probably fine." Resist it: INCONCLUSIVE means "we don't know," and "we don't know" is not a release condition for production. Block, run more samples (or a wider human-labeled set), and resolve to PASS or FAIL before proceeding.

Use SPRT (Sequential Probability Ratio Test) or Wilson confidence intervals to bound the minimum N needed before a verdict can be called — this prevents both premature verdicts (too few samples) and unlimited sampling (running forever to reach certainty that isn't there).
