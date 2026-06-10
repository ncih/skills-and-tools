---
type: reference
summary: "What each test tier catches and is structurally blind to; the failure-class taxonomy; how to choose the right test shape; the generalized tier ladder."
status: active
tags: [testing, qa, engineering]
date_created: 2026-06-07
date_modified: 2026-06-07
---

# Failure Classes and the Tier Ladder

## Contents

1. [The core question: "where can this check not see?"](#1-the-core-question)
2. [The failure-class taxonomy](#2-the-failure-class-taxonomy)
3. [What makes a plan complete](#3-what-makes-a-plan-complete)
4. [Choosing the test shape](#4-choosing-the-test-shape)
5. [The generalized tier ladder](#5-the-generalized-tier-ladder)
6. [Each blind spot earns the next rung](#6-each-blind-spot-earns-the-next-rung)

---

## 1. The core question

> **"Where can this check not see?"**

A green gate means "passed the checks we ran, in the environment we ran them in." It doesn't mean "works in production." The gap between those two statements is where escaped bugs live.

**Verification theater** is the failure mode where confidence rises (green indicators, high coverage numbers) while real safety does not — because the suite cannot exercise the environment where bugs actually occur. A 95%-coverage suite running in a structurally blind environment is theater.

Hunt blind spots first. Coverage numbers are secondary.

---

## 2. The failure-class taxonomy

Every escaped bug belongs to one class. Each class names the *structural reason* a cheap gate couldn't catch it — not a mistake in the test, but a limitation of the environment the test ran in.

| Failure class | The blindness | Generic trigger | Example |
|---|---|---|---|
| **State drift** | Local state ≠ prod state | The gate resets to a clean or full state (`db reset`, fresh fixtures) — the *opposite* of accumulated prod state. Can never catch an authored-but-undeployed migration, or a bug that only surfaces with real data shape/volume. | Claim = NaN because a missing column wasn't in the clean fixture; payment fails because the prod schema had an unapplied migration. |
| **Device / render gap** | Test runner ≠ target device | Verified on desktop or headless; blind to mobile rendering, touch events, `type="number"` steppers, camera flows, OS-controlled UI (PWA install prompt, Face ID, NFC). | A numeric input that works on desktop silently breaks on iOS Safari; a mobile keyboard type that renders differently from a desktop input. |
| **Synthetic-interaction gap** | Mocked / one-shot ≠ real user | Tests render once, never type character-by-character, never hit the empty-input fallback, never push a real artifact through a real model, never run two requests concurrently. | Focus loss mid-type from a content-derived React key; a manual-entry path that worked in isolation dead-locks when the keyboard is involved. |
| **Contract / boundary gap** | In-process ≠ real I/O seam | A mocked dependency hides a real schema mismatch, auth wiring error, or third-party API drift. The mock is correct for the day it was written; the provider changes. | A CDC provider changes a field name; a third-party webhook adds a required parameter; a serialized response omits a field the consumer assumed was always present. |
| **Non-determinism gap** | One run ≠ the distribution | A single pass "proves" a stochastic system. Exact-match assertions on variable output are either flaky (fail when output shifts) or vacuously loose (accept anything). | OCR grand-total extraction drifts across runs; an LLM reformats a response; a ranking changes with sampling temperature. |

These classes are codebase-agnostic. The triggers are structural, not incidental — you don't fix them by writing more unit tests, you fix them by placing a check in an environment that can actually see the failure.

---

## 3. What makes a plan complete

> A test plan is *complete* not when coverage is high, but when **every failure class has a named home** — a tier, an environment-tier, or an explicit "production-only, monitored" route.

A plan that stops at unit tests isn't "80% done." It's blind to state-drift, device/render, synthetic-interaction, and non-determinism classes entirely. Coverage percentage over a blind tier adds false confidence, not real safety.

For each failure class, the plan must answer: *which tier exercises this? If no tier can, what shift-right signal + rollback threshold stands in its place?*

---

## 4. Choosing the test shape

There is no universally correct shape. The pyramid, honeycomb, trophy, and SMURF heuristic are all valid — for different architectures. Choose by **where complexity actually lives**, not by convention.

| Shape | Best fit | Center of gravity |
|---|---|---|
| **Pyramid** | Domain-logic-heavy monolith | Unit — logic is in functions, not at seams |
| **Honeycomb** (Spotify) | Microservices | Integration — the seam *is* the risk; minimize solitary unit and broad integrated tests |
| **Trophy** (Kent C. Dodds) | Frontend / UI / serverless | Static analysis + integration; thin E2E cap; thin unit |
| **SMURF** (Google) | Any suite at scale | Per-test tradeoff across Speed, Maintainability, Utilization, Reliability, Fidelity — not a shape, a per-test scoring lens |

Sources: Spotify *Testing of Microservices* (engineering.atspotify.com/2018/01/testing-of-microservices); Kent C. Dodds *The Testing Trophy* (kentcdodds.com/blog/the-testing-trophy-and-testing-classifications); Fowler *On the Diverse Shapes of Testing* (martinfowler.com/articles/2021-test-shapes.html); Google *SMURF: Beyond the Test Pyramid* (testing.googleblog.com/2024/10/smurf-beyond-test-pyramid.html).

**Two cross-cutting truths:**

**Fowler's caution:** "The shape debates are mostly a semantic distraction." Spotify's "integration test" and the pyramid's "sociable unit test" are often the same test. Before re-shaping a suite, audit what your "unit tests" actually do — many already cross real seams and belong in a different bucket.

**For AI-generated code, skew toward integration over solitary unit tests.** AI produces structurally plausible code that passes happy-path units while hiding concurrency, environment, and contract faults. The 2025 consensus from multiple research channels: favor tests that exercise real seams (real DB, real auth, real I/O) over tests that mock every dependency. Mocked tests co-generated by the agent will share the agent's mental model — including its blind spots. A mock that perfectly mirrors the agent's wrong assumption produces a green test and a broken production path.

---

## 5. The generalized tier ladder

Each rung is defined by *what environment class it runs in* — that determines what it can catch and what it cannot. The table is abstracted off any one stack; adapt the generic command class to your runner.

| Rung | Generic command class | Catches | Structurally blind to |
|---|---|---|---|
| **Static** | lint, typecheck (`--strict`, `--max-warnings 0`) | Whole error classes at author time — hallucinated imports, type drift, dead code, unused vars | Any runtime behavior |
| **Unit / component** | Fast, in-process, dependencies mocked | Pure logic; some interaction (focus, attribute presence) | Real rendering, DB, network, concurrency, real device |
| **Integration (real deps)** | Real DB/queue/cache + auth + access control | Schema contracts, authed paths, realtime subscriptions | **State drift** if it resets to clean; UI rendering; device behavior |
| **Contract / golden** | CDC (e.g. Pact) + schema fuzz + approval/snapshot | I/O-seam mismatches, provider drift, serializable-output regressions | Business-logic outcomes, multi-hop flows, real user behavior |
| **Live external (opt-in)** | Real third-party API or model call | Third-party contract + output quality at this moment | Cost, flakiness — keep out of the per-commit gate |
| **Browser / device E2E** | Real rendered app, mobile viewport | "Renders-but-broken": steppers, focus loss, navigation, NaN-in-UI, mobile-specific input | True prod data, OS-controlled UI flows, real hardware sensors |
| **Build / prerender** | Production build (`next build`, `vite build`) | SSR/prerender crashes — browser globals at module/render top-level | Any runtime behavior after the build |
| **Post-deploy smoke + canary** | Synthetic probes against the deployed artifact; per-version metrics | Deploy-only and prod-state failures; real-traffic regressions | Everything that is only visible with long-running traffic or real user data |
| **Irreducible manual** | Scripted checklist + seed harness | Real receipt/scan, OAuth on the prod domain, install on a real phone, hardware sensors | — (a human or device is the only possible oracle here) |

**Read each row as a guarantee with a hard boundary.** Integration tests with a real DB guarantee schema contracts — but only from a clean-reset state, so they are blind to bugs that require accumulated prod state. That's not a quality problem with the tier; it's a structural property of the environment. You cannot fix it by writing more integration tests.

---

## 6. Each blind spot earns the next rung

Build the ladder deliberately. The organizing principle: **each rung's blind spot is the next rung's reason to exist.**

- Static analysis catches type drift → it's blind to runtime behavior → unit tests earn their place.
- Unit tests catch logic in isolation → blind to real DB contracts → integration earns its place.
- Integration tests (reset-to-clean) catch schema contracts → blind to accumulated prod state → prod-parity integration or canary earns its place.
- Browser E2E on desktop catches rendering → blind to mobile-specific behavior → mobile-viewport E2E earns its place.
- Emulated mobile catches most device issues → blind to OS-controlled flows (install prompt, Face ID, camera on real hardware) → irreducible manual earns its place.

**Earn every tier.** Add a rung only when a real (or concretely demonstrated potential) escaped bug proves the gap — not because a blog post recommends it, not because "completeness" feels good. Every tier has a maintenance, flakiness, and CI-time cost. Speculative tiers add ceremony without protection.

A B0 library with pure logic is *completely* covered by static + unit. Stopping there is not laziness — it's proportionality. See `SKILL.md` for the risk-band sizing that tells you which rungs are in scope for your codebase.

For the per-AC decision algorithm that routes each acceptance criterion to its minimum correct rung, see `references/ac-classification.md`.
