# CI Gating for Autonomous Agents

**Contents**
1. [When this applies](#when-this-applies)
2. [Evaluator isolation](#evaluator-isolation)
3. [Dual scope/contract gate](#dual-scopecontract-gate)
4. [Gate ordering: time-to-signal](#gate-ordering-time-to-signal)
5. [HITL tiered by irreversibility](#hitl-tiered-by-irreversibility)
6. [Independent test tier + mutation](#independent-test-tier--mutation)
7. [Three-valued verdicts for stochastic output](#three-valued-verdicts-for-stochastic-output)
8. [Benchmarks, cost tracking, and production proxies](#benchmarks-cost-tracking-and-production-proxies)

---

## When this applies

This reference has a **conditional hard requirement** — not everything here applies to every codebase. Apply the test:

> Does the codebase have (a) an **autonomous coding loop** that writes its own tests (AGENTS.md, ralph/, agent CI), or (b) **AI-judged / LLM-as-judge outputs** (evals/, LLM evaluation harnesses)?

| Condition | Status |
|---|---|
| Autonomous loop writes its own tests, OR LLM-as-judge outputs present | **HARD-REQUIRED**: evaluator isolation + independent test tier + mutation testing |
| Neither confirmed, but signals are ambiguous | Fail-open to **recommend** (flag the gaps, don't block on them) |
| Neither confirmed, definitely human-driven testing | These remain **recommendations** — apply proportionally to risk band |

When in doubt, fail open to recommend. A false positive (recommending isolation for a human-driven project) costs a little setup; a false negative (skipping isolation for an agent loop) breaks the fundamental safety property of the gate.

The sections below are written assuming HARD-REQUIRED status. Tone down to "consider" where the condition is unmet.

---

## Evaluator isolation

The oracle that decides PASS/FAIL must run in an environment the agent **cannot write to**. This is not optional hardening for agent loops — it is the baseline property of a meaningful gate.

**Why:** RewardHackingAgents (arXiv 2603.11337, 2026) demonstrates that evaluator-side manipulation occurs *frequently* under natural agent behavior, not just adversarial prompting. Scripted attacks succeed unless both evaluator-locking and train/test isolation are applied. The classic exploit is a pytest-hook or `conftest.py` overwrite: the agent modifies test fixtures or assertion logic so the suite "passes" on broken code.

**Implementation:**

- Run the test oracle in a **separate, read-only container** — the agent's working directory is mounted read-write; the oracle's assertion code and fixtures are mounted read-only.
- **Never share a writable filesystem** between the agent's execution environment and the oracle.
- For sensitive workloads (prod-adjacent runners, anything with real credentials), add process-level isolation (gVisor or Firecracker).
- Treat the oracle's config files, fixture directories, and test runners as **protected paths** (see scope gate below).

The key invariant: if the agent could have modified the thing that says "pass," the verdict means nothing.

---

## Dual scope/contract gate

Agent output is not just code — it is *scope*. A gate that checks correctness but not scope lets an agent silently overstep: writing files it wasn't asked to touch, modifying protected paths, or making a 50-file change where a 3-file change was scoped.

**Before the task starts — declare the task contract:**

```yaml
# Example contract declaration (adapt to your CI system)
task_contract:
  allowed_paths:
    - src/features/payments/
    - tests/unit/payments/
  max_changed_files: 8
  protected_paths:
    - db/migrations/         # any migration change requires human review
    - .env*                  # secrets never touched by the agent
    - src/interfaces/        # public contracts need explicit approval
    - conftest.py            # oracle config is protected
    - tests/integration/     # independent tier must remain agent-unmodified
```

**After the task — re-run the contract as a hard gate:**

- Diff the actual changed files against `allowed_paths`.
- Reject the PR if `max_changed_files` is exceeded or `protected_paths` are touched.
- This gate runs *before* the test suite — scope violations are a structural reject, not a test failure.

A contract violation is a signal worth investigating: either the task was underspecified, the agent drifted, or the scope needs expanding. Don't silently widen the contract; make it a human decision.

---

## Gate ordering: time-to-signal

Order CI stages to surface failures at the cheapest point — the signal you can get in 90 seconds should not be hidden behind a 20-minute behavioral test.

```
1. lint + typecheck          (~1–3 min)    →  block on any warning
2. security scan             (parallel)    →  SAST, secret detection
3. fast unit tests           (~1–5 min)    →  in-process, no I/O
4. integration tests         (~3–15 min)   →  real DB, real auth
5. contract / golden         (parallel)    →  I/O seam checks
6. behavioral / agentic      (last; gated) →  only on non-draft or high-risk PRs
```

**Specific rules for agent loops:**

- `--strict` and `--max-warnings 0` on all type/lint checks. Agents over-produce `any` type escapes and unused variables that a lenient config silently accepts.
- Behavioral and agentic tests run **last and only when warranted** (non-draft PR, changed files touching agent logic, or a risk-band B3 subsystem). Don't run expensive oracle evaluations on every trivial commit.
- Slow/live/opt-in tiers (real LLM calls, real external APIs) are **always behind an env key** and skip cleanly when the key is absent — never block CI on a missing credential.

Fast feedback is not a nice-to-have: an agent loop that waits 40 minutes for CI feedback will burn tokens and drift scope before it sees the signal.

---

## Execution boundaries: where each tier runs (and triage as the classifier)

Gate ordering decides the *sequence within a run*; this decides the *cadence and boundary* of each tier. The trap with expensive tiers (browser/device E2E, live LLM/OCR) is a false binary — run them on **every loop iteration** (cost + flake the risk can't justify) or defer to **post-sprint UAT** (too late: a whole sprint ships green, then breaks at sign-off). Neither. Route each tier to the **cheapest boundary that still catches its failure class before it escapes:**

| Tier class | Boundary | Why not the alternatives |
|---|---|---|
| static · unit · integration · build | **per-iteration** in-loop gate | cheap + deterministic |
| expensive deterministic (E2E mobile/browser) | **per-PR** required check, conditional on a triage label (`needs:e2e`) + a **periodic** full-suite on the integration branch as backstop | per-iteration wastes minutes (most issues don't touch it); UAT is too late (the renders-but-broken class must be caught before merge) |
| expensive stochastic (live LLM/OCR) | **periodic** scheduled job behind the secret (skip-clean if absent); N-sample, invariants hard-gated, accuracy logged as a signal | cost/flake/non-determinism disqualify a per-commit gate; UAT can't run it N times systematically |
| irreducible-manual (real device/receipt/OAuth/install) | **post-sprint UAT** | the only class a machine genuinely can't reach |

**Triage is the classification choke-point** — and it solves *two* problems at once:

1. *Knowledge* (what to verify): triage reads the plan **once per issue** (the lowest-frequency, highest-context-budget stage), classifies each AC's environment, and writes a terse per-issue **verification note** into the issue body. The implementer reads only its issue — no full-plan read on every iteration, so the loop's context stays lean.
2. *Cost* (where the expensive tier runs): the same classification sets **`needs:*` labels** (`needs:e2e`, `needs:ocr`) that make the per-PR job run **conditionally** — only when an issue actually touches that surface. Cost scales with risk (proportionality), not flat per-issue.

Backstops that make the conditional path safe: a **periodic full-suite** on the integration branch (catches a mislabeled issue within the period, blast radius = pre-release) and a single implementer hard rule — *"never report an AC covered by a tier that didn't run in this run's gates; route device/stochastic ACs to human UAT."* The implementer needs that one rule, not the whole plan.

> The skill's job isn't done until the loop's entrypoint (`AGENTS.md`/`CLAUDE.md`) is wired to the plan: a conditional pointer for testing tasks + that one hard rule. An unread plan is a blind spot. See `references/qa-plan-artifact.md`.

---

## HITL tiered by irreversibility

Human-in-the-loop is not a binary. Gate the human at the point where the action becomes hard to undo, not uniformly on everything.

| Action class | Verdict | Rationale |
|---|---|---|
| Reads (Read, Glob, Grep, list) | Auto-approve | Zero side-effects; blocking adds friction with no safety gain |
| Writes to allowed paths | Auto-approve within task contract | Reversible via git; contract gate covers scope |
| Writes/creates outside allowed paths | Gate — require approval | Scope creep; may be intentional but needs confirmation |
| Deploy to staging | Gate — require approval | Semi-reversible; canary can catch, but human reviews first |
| Deploy to production | Hard gate — human on the loop, always | Irreversible until rollback; agent never deploys to prod unsupervised |
| Destructive patterns | Hard-block unconditionally | See blocklist below |

**The blocklist — hard-block these patterns regardless of context:**

- `rm -rf` with any non-trivial path
- `DROP TABLE`, `DROP DATABASE`, `TRUNCATE` without a transaction/rollback wrapper
- `git push --force` to any shared branch
- Any direct production DB write not wrapped in a reversible migration

**Grow the blocklist one rule per real incident.** Do not add speculative blocks — that creates alert fatigue. When an agent does something destructive or unexpected, add the exact pattern that would have caught it. This is the ThumbGate discipline: precision over coverage.

Anthropic's Claude Code auto mode uses an action-classifier model for similar triage, with roughly 17% false-negative rate on overeager actions — meaning a code-level blocklist backstop is still necessary even with model-level filtering.

---

## Independent test tier + mutation

Agent-written tests are observational feedback — evidence of what the agent *thought* it implemented. They are not proof of correctness.

**Why:** When an agent writes both the code and the tests, both artifacts share the same mental model, including its blind spots. If the agent hallucinates a wrong parameter order, it will mock that exact wrong order and produce a green test against broken code (the "silent pass" problem). LLM-generated tests empirically encode *current behavior* rather than *intended spec* less than 50% of the time — meaning they lock bugs in as passing tests.

**The requirement:**

- Maintain **at least one test tier written independently of the agent** — authored by a human, a separate non-agent process, or a fixed test corpus that the agent's task contract marks as a protected path.
- This tier is the tier that *actually proves correctness* against the spec.
- **Mutation testing** is the quality signal for this tier, not line coverage. For each acceptance criterion, at least one mutant (a semantically-meaningful code change) must be killed by the independent tier. A mutant that survives means the assertion doesn't actually enforce the behavior it claims to.

Mutation score is a harder target than coverage percentage because 100% line coverage is achievable with zero assertions. A suite that kills ≥1 mutant per AC has actually *verified* the assertion, not just executed the line.

**Practical minimum for B3:** run mutation testing on the independent tier at release gates (not every commit — it is expensive). Aim for the independent tier to kill every mutant the agent tier misses.

---

## Three-valued verdicts for stochastic output

Binary PASS/FAIL on stochastic agent output has approximately zero regression-detection power. As agent behavior degrades gradually, a binary gate will stay green until the degradation crosses 100% — by which point the regression is severe and you have no earlier signal.

**The three verdicts:**

| Verdict | Meaning | Action |
|---|---|---|
| PASS | Behavior within threshold over N samples | Proceed |
| FAIL | Behavior outside threshold over N samples | Block; investigate |
| INCONCLUSIVE | Variance too high to determine; confidence interval too wide | Block; gather more samples or tighten the eval harness |

Use **SPRT (Sequential Probability Ratio Test)** or **Wilson confidence intervals** to compute the verdict from a sample of N runs. Both methods give you a statistically grounded threshold for "I have enough evidence to call this PASS or FAIL" vs. "I need more data."

INCONCLUSIVE is not a failure mode of the test framework — it is a real signal that the behavior is too noisy to gate on, and the right response is to fix the eval harness (tighten the prompt, narrow the output schema, add an invariant) not to collapse it to binary.

See `references/robustness-and-nondeterminism.md` for the full eval stack (deterministic invariants → stochastic evals → production sampling) and the LLM-as-judge calibration requirements.

---

## Benchmarks, cost tracking, and production proxies

**Synthetic benchmarks are not production proxies.** OpenAI stopped evaluating SWE-bench Verified (February 23, 2026) after auditing 138 problems their model failed: 59.4% had flawed tests, and 35.5% of those were over-strict tests that rejected functionally correct solutions. ProdCodeBench similarly finds that model rankings on production-derived tasks differ substantially from synthetic ones.

The practical implication: a benchmark score tells you how the agent performs on the benchmark. It does not tell you how it performs in your codebase, on your schemas, with your constraints.

**What to track instead:**

- **Cost-per-interaction** as a first-class gate. A seemingly minor change (100 extra tokens per prompt) multiplied by production volume equals real operating cost. Track it per agent run, trend it over time, and set a budget threshold as a gate. This is only visible with real traffic — synthetic runs won't surface it.
- **Behavioral regressions on your golden test corpus** — a curated set of real tasks and expected outputs, maintained as a protected path the agent cannot modify, re-run at every release gate.
- **Production sampling** — 5–10% of live agent interactions scored against the golden corpus creates the flywheel: escaped failures in production become permanent golden cases.

The discipline here is the same as the independent test tier: the thing that measures quality must not be written by the thing being measured.
