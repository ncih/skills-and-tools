# AC Classification — Routing Each Acceptance Criterion to Its Tier

**Table of contents**
1. [Environment-class taxonomy](#1-environment-class-taxonomy)
2. [Risk weighting: RPN and SMURF](#2-risk-weighting-rpn-and-smurf)
3. [The cheapest-durable-home ladder](#3-the-cheapest-durable-home-ladder)
4. [Per-AC decision procedure](#4-per-ac-decision-procedure)
5. [Writing stochastic ACs](#5-writing-stochastic-acs)
6. [Worked examples](#6-worked-examples)

Cross-references: `failure-classes-and-ladder.md` · `robustness-and-nondeterminism.md`

---

## 1. Environment-class taxonomy

Tag every AC with the **minimum environment** required to faithfully verify it. This is not about test shape — it is about what the code needs to actually run. Getting this wrong is the primary route to verification theater.

| Class | Recognition cues | What gates can run here |
|---|---|---|
| **HERMETIC / LOCAL** | Pure computation, no I/O; mocked everything; state fully in-process; no network, no FS side-effects, no real clock | Author-time rules (lint/type), unit/component tests |
| **INTEGRATION / DB** | Real DB engine, real schema, real auth/RLS, real queue or cache; migrations must be applied; auth sessions required | Integration tests — but **only if they run against prod-shaped state**, not a clean-reset (see §4, step 5) |
| **EXTERNAL-API** | Third-party service call: payment processor, SMS/email provider, mapping, AI inference, OAuth provider; real contract matters | Contract tests (Pact CDC for own provider; BDCT/OpenAPI or recorded cassettes for third-party); opt-in live-API tier for quality checks |
| **DEVICE** | Real browser engine divergence (iOS Safari quirks, PWA install prompt, `100vh` dynamic viewport); touch/tap; camera/scan; hardware sensor; OS-controlled permission UI | Browser/device E2E with real viewport + `isMobile:true`; real-device cloud (BrowserStack/LambdaTest) for what emulation cannot see |
| **PRODUCTION-ONLY** | Real migration applied to accumulated prod data; OAuth redirect on prod domain; real external latency/data distribution; hardware camera on a real phone; real SMS delivery; compliance-gated environment | Cannot be signed off locally; shift-right observability (synthetic probes, per-version metrics, canary) + manual checklist |

**Recognition heuristic:** ask "what is the *narrowest environment* where this behavior can actually fail?" That environment is its class. If the answer is "only in production with real data / real devices," the AC is PRODUCTION-ONLY.

Common misclassifications to watch for:
- A DB test that runs `db reset` before each run is HERMETIC about state — it cannot catch migration drift, accumulated-data shape, or RLS bugs that depend on existing rows. It is still INTEGRATION/DB for schema checks, but PRODUCTION-ONLY for state-drift checks.
- A UI test running in a desktop headless browser is HERMETIC about mobile rendering. Calling it a "device test" is theater.
- An auth flow verified with a test OAuth client is HERMETIC about the real OAuth redirect config, which only exists on the prod domain.

---

## 2. Risk weighting: RPN and SMURF

The environment class tells you *what can see the failure*. Risk weighting tells you *how deep to go* at that tier.

### RPN = Severity × Likelihood × Detectability (1–10 each)

- **Severity**: blast radius if this fails in production (1 = cosmetic, 10 = data loss, financial, security, regulatory)
- **Likelihood**: how often the failure mode is triggered (1 = obscure edge case, 10 = core user path, every session)
- **Detectability**: how visible the failure is when it happens (1 = loud error/crash caught immediately, 10 = silent wrong value that propagates unnoticed)

RPN score → gate intensity:

| RPN | Gate intensity |
|---|---|
| < 100 | Smoke + monitoring; no dedicated test required |
| 100–300 | Unit + contract coverage; integration if DB surface |
| 300–600 | Full tier ladder appropriate to env class; E2E if device surface |
| > 600 | Full-spectrum: all appropriate tiers + manual checklist + security scan + canary with explicit rollback threshold |

Treat these bands as tunable starting points, not law. The proportionality principle applies: a B0/B1 app should rarely have RPNs over 300 on most ACs; a B3 agentic system likely has several in the >600 range.

### SMURF five-axis tradeoff

For each candidate tier, score it on:

- **Speed** — how fast does this tier run? (slower = fewer runs = delayed feedback)
- **Maintainability** — how expensive is it to keep this test accurate as the code evolves?
- **Utilization** — does this tier use real resources (quota, cost, third-party rate limits)?
- **Reliability** — how flaky is this tier structurally? (device E2E = high; unit = low)
- **Fidelity** — does this tier actually exercise the environment the AC needs?

Route to the tier with **highest Fidelity for the required environment at acceptable S/M/U/R**. When two tiers have equal Fidelity, always pick the faster/cheaper one. Fidelity is not negotiable — a test that can't see the failure mode doesn't count as coverage.

---

## 3. The cheapest-durable-home ladder

For any AC, walk left-to-right and stop at the first rung that can **faithfully** exercise its environment class. "Cheapest" means least flakiness + least maintenance + fastest feedback, not least effort to write.

```
author-time rule  →  unit/component  →  contract / integration  →  device E2E  →  shift-right observability
(lint/type check)    (in-process,        (real boundary or           (real browser,     (synthetic probe,
                      mocked deps)         real DB, real seam)         real device)        canary metric,
                                                                                           manual checklist)
```

Each rung's **blind spot** is what makes the next rung necessary — not speculation, but structural impossibility. A lint rule cannot see runtime behavior. A unit test with mocked deps cannot see a real schema mismatch. An integration test with a clean DB cannot see migration drift. A desktop headless test cannot see iOS touch behavior. Only production can see the real prod data shape, OAuth redirect, and device camera.

The key failure: routing an AC to a tier that **cannot faithfully exercise its environment** creates a passing test that provides no safety — it inflates confidence while the failure mode remains undetected.

---

## 4. Per-AC decision procedure

Run this for every acceptance criterion before writing any test code. Record the output in `qa-plan.md`.

```
FOR each acceptance criterion:

  1. CLASSIFY environment
        Ask: "What is the narrowest environment where this behavior can actually fail?"
        → { HERMETIC | INTEGRATION/DB | EXTERNAL-API | DEVICE | PRODUCTION-ONLY }

  2. CLASSIFY determinism
        Ask: "Given the same inputs, does this AC always have the same observable output?"
        → { deterministic | stochastic }
        Stochastic triggers: LLM output, OCR/vision, ranking, timing-sensitive, sampling

  3. SCORE risk
        Compute RPN (Severity × Likelihood × Detectability).
        Apply SMURF to select depth: which tier gives the best Fidelity-for-env
        at acceptable Speed/Maintainability/Utilization/Reliability?

  4. ROUTE to cheapest durable home
        Walk the ladder (§3): stop at the first rung that can faithfully exercise
        the environment class. This is the minimum; RPN may push to a deeper rung.

  5. IF env == PRODUCTION-ONLY:
          → BLOCK local sign-off for this AC (it cannot be marked green from CI)
          → EMIT a shift-right signal stub: name the production metric or probe
            (e.g. "error rate on /checkout < 0.1%") that stands in for the missing
            pre-prod gate, and define a rollback threshold
          → ADD a manual checklist item for the release checklist
          → Do NOT claim this AC is "covered" by any local gate

  6. IF determinism == stochastic:
          → Gate on invariants only (schema/shape, range, presence, known substrings,
            business invariants like total ≤ order_total)
          → Log the variance (do not assert on the variable part)
          → Require N-sample threshold evals for quality gates (N ≥ 5; report mean+stddev)
          → Never use a single-run exact-match assertion on variable output
          → See robustness-and-nondeterminism.md for the full stochastic gating model

  7. RECORD routing in qa-plan.md:
          AC text | env-class | determinism | RPN | assigned tier | rationale
          (one row per AC; keep it dense — this is the document the agent reads)
```

The decision procedure is sequential: environment class first because no amount of risk-weighting changes what the environment can see. A PRODUCTION-ONLY AC with RPN=900 still cannot be signed off locally — it just needs the shift-right signal defined more precisely.

---

## 5. Writing stochastic ACs

A stochastic AC cannot be written as an exact expected value — the output varies by design. Instead, write it in three parts:

```
THRESHOLD — the pass/fail criterion on the aggregate (e.g. "≥ 85% of responses")
α          — the acceptable false-positive rate (type-I error; e.g. α = 0.05)
n          — the minimum sample size for the eval (e.g. n = 10 per release gate)
```

**Example (deterministic AC):**
> "The receipt parser returns the correct grand total."
→ Wrong for stochastic output. Even at temperature=0, LLM/OCR output is not deterministic (GPU reduction-order variance produces ~80 unique outputs in 1000 runs).

**Example (stochastic AC — correct form):**
> "The receipt parser extracts a numeric grand_total present in the response [threshold: 100%], and the extracted value matches the ground-truth total within ±2% [threshold: ≥ 85%, α = 0.05, n = 10]."

The first invariant (presence, numeric type) is a hard gate. The second (accuracy) is a quality eval run over N samples — flagged if the mean falls below 85% or stddev exceeds 0.15 (instability signal). See `robustness-and-nondeterminism.md` for the full three-layer eval stack.

**On stochastic PRODUCTION-ONLY ACs:** these combine both complexity classes. The shift-right signal (step 5) is where the stochastic quality is actually measured — production sampling of real traffic (5–10%) feeds back into the golden dataset. The pre-prod gate covers only the deterministic invariants.

---

## 6. Worked examples

Five varied ACs mapped through the full procedure:

| AC | env class | deterministic? | RPN (S×L×D) | tier | notes |
|---|---|---|---|---|---|
| "Splitting a bill evenly across N members calculates each share correctly" | HERMETIC | yes | 5×9×2 = 90 | unit | Pure arithmetic. Low RPN — no dedicated E2E needed. An author-time type rule (no `any` on currency fields) covers most of the risk at zero cost. |
| "A new expense inserted by member A is immediately visible to member B in the same group" | INTEGRATION/DB | yes | 7×8×5 = 280 | integration (real DB + real RLS) | Must run against a real Postgres instance with RLS enabled — a mocked DB cannot see row-level security bugs. Clean-reset is fine here (testing the *schema*, not *state drift*). |
| "The payment processor webhook updates the ledger only once (idempotency)" | EXTERNAL-API | yes | 9×5×8 = 360 | contract (recorded cassette, dated) + integration | Third-party boundary: use a recorded cassette for CI determinism; an opt-in live tier for periodic contract validation. High Detectability score (8) — silent double-payment. RPN > 300 → full tier warranted. |
| "The OCR camera flow extracts items from a receipt photo" | DEVICE + stochastic | no | 8×6×7 = 336 | device E2E (real mobile viewport) for presence/format invariants; shift-right sampling for accuracy | Two-layer: (a) hard gate = response is non-empty JSON with a numeric grand_total (DEVICE E2E with real camera emulation or real-device cloud); (b) quality eval = accuracy ≥ 85% over n=10, measured in production sampling. Camera hardware and real HEIC processing are PRODUCTION-ONLY — manual checklist for release. |
| "Migrating existing groups to the new split_method schema field leaves no NULL values" | PRODUCTION-ONLY | yes | 9×9×9 = 729 | shift-right (post-deploy migration probe) + manual | Cannot be verified locally because local DB never has accumulated prod data. Shift-right signal: "after migration job completes, SELECT COUNT(*) WHERE split_method IS NULL = 0." Rollback threshold: any non-zero count triggers rollback. This AC **blocks local sign-off** — it must appear on the release checklist as a deploy-step verification, not a CI gate. |

**Reading the table:** the first two ACs sit comfortably in fast, cheap tiers. The third earns a contract tier because of the high blast radius and silent failure. The fourth requires two separate gates for its two separable properties (structure vs. quality). The fifth illustrates why PRODUCTION-ONLY ACs must never be claimed as covered by CI — the data shape that causes the bug does not exist in any pre-prod environment.

---

*Cross-references: `failure-classes-and-ladder.md` (what each tier catches and is blind to) · `robustness-and-nondeterminism.md` (stochastic gating, flakiness, LLM eval stack)*
