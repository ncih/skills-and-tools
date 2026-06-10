<!--
  TEMPLATE for docs/testing/qa-plan.md — the living, AI-legible QA strategy.
  plan-qa-test writes this, sized to the codebase's risk band (B0–B3).
  RULES:
   - Keep it dense and cheap to read; the coding loop reads it every run.
   - Include ONLY the sections the risk band earns (see comments). Delete the rest.
   - B0 (trivial): keep the header, Tier ladder, and a 2-row Environment Matrix. Drop the logs.
   - B1: + Environment Matrix proper, + AC index.
   - B2: + Non-Determinism Log, + Closed-Gaps trail.
   - B3: all sections; the three logs are mandatory and actively maintained.
   - Update date_modified + the relevant log EVERY time a proposal is approved or a hole is closed.
   - Strategy lives here; executable COMMANDS + hard "never" rules live in AGENTS.md/CLAUDE.md (link, don't duplicate).
-->
# QA Plan — <Project Name>

> Single source of truth for what we test, where, and why. Read this before declaring any gate "green."
> Maintained by the `plan-qa-test` skill. Commands + hard rules: see `AGENTS.md` §<n>.

- **Risk band:** B<0|1|2|3> — <one line: why (surfaces present: DB / mobile / external / money / agent-loop / AI-judged)>
- **Stack:** <language · framework · test runner(s) · build>
- **Test shape:** <pyramid | honeycomb | trophy | hybrid> — <one line why, tied to where complexity lives>
- **AI-loop / evaluator-isolation:** <required (agent loop / AI-judged detected) | recommended | n/a>
- **date_modified:** YYYY-MM-DD

## Tier ladder
<!-- Only the rungs this band earns. For each: command, what it CATCHES, what it is BLIND TO. -->

| Tier | Command | Catches | Blind to |
|---|---|---|---|
| static | `<lint && typecheck>` | error classes, dead code, type drift | runtime behavior |
| unit | `<test>` | pure logic, some interaction | rendering, DB, network, concurrency, device |
| integration | `<test:integration>` | schema, contracts, authed path, realtime | state drift (if it resets clean), UI, device |
| <contract/golden> | `<...>` | I/O-seam mismatch, provider drift, serializable-output regressions | business-logic outcomes |
| <e2e / device> | `<test:e2e>` | renders-but-broken: steppers, focus loss, NaN-in-UI | true prod data, OS-controlled UI, real hardware |
| <live (opt-in)> | `<test:live>` | 3rd-party contract + output quality | cost/flakiness → out of per-commit gate |
| <build> | `<build>` | prerender/SSR crashes | runtime behavior |
| <post-deploy> | `<smoke + canary>` | deploy-only + prod-state failures, real-traffic regressions | (this IS the production-only tier) |

## Environment Matrix
<!-- The blind-spot map. Cell values:
       RUNS       = executes AND is enforced as a gate here
       LOCAL-ONLY = runs locally / on demand but is NOT wired into the CI gate → effectively
                    ABSENT for an autonomous loop (a blind spot, not coverage). The #1 reconstruction finding.
       BLOCKED    = cannot / must-not gate here (e.g. clean-state ≠ prod-state)
       OBSERVED   = monitored, not gated
     A tier that is LOCAL-ONLY or BLOCKED for an environment MUST NOT claim to verify an AC that needs it.
     When reconstructing an existing suite, mark the CI column from the ACTUAL pipeline config, not intent. -->

| Tier ↓ / Env → | local | CI | staging | prod |
|---|---|---|---|---|
| static | RUNS | RUNS | — | — |
| unit | RUNS | RUNS | — | — |
| integration | RUNS | RUNS | RUNS | BLOCKED (clean-state ≠ prod-state) |
| e2e / device | RUNS | RUNS *(LOCAL-ONLY if not in the pipeline!)* | RUNS | BLOCKED |
| live | OBSERVED (opt-in) | OBSERVED | OBSERVED | OBSERVED |
| smoke / canary | — | — | RUNS | RUNS / OBSERVED |

## Execution boundaries
<!-- WHERE / at what cadence each tier runs. Pairs with the matrix (RUNS/LOCAL-ONLY says *whether* it gates; this says *cadence*).
     Route each tier to the cheapest boundary that catches its failure class BEFORE escape:
     per-iteration · per-PR(+label) · periodic(scheduled) · post-deploy · UAT-manual. Delete rows the band doesn't have. -->

| Tier | Boundary | Notes |
|---|---|---|
| static · unit · integration · build | per-iteration (in-loop gate) | cheap + deterministic |
| browser / device E2E | per-PR (conditional on `needs:e2e` label) + periodic full-suite backstop | NOT per-iteration (cost/flake); NOT UAT (too late) |
| live LLM / OCR | periodic scheduled (behind secret; skip-clean if absent) | N-sample; gate invariants only; accuracy = signal |
| irreducible-manual | post-sprint UAT checklist | the only class that belongs at UAT |

> **Triage classifies once per issue** → writes a per-issue verification note + `needs:*` labels that drive the conditional tiers above. Implementer reads its issue (+ one hard rule in AGENTS.md), not this whole plan, every run.

## AC classification index
<!-- env-tag + tier per AC (or per feature/area for larger apps). The contract that prevents verification theater. -->

| AC / area | env-class | deterministic? | tier(s) | prod-only signal + rollback threshold |
|---|---|---|---|---|
| <AC> | <HERMETIC/DB/EXTERNAL-API/DEVICE/PROD-ONLY> | <yes/no> | <tier> | <signal · threshold — only if PROD-ONLY> |

## Non-Determinism Log
<!-- B2+. Every behavior observed to be non-deterministic, its tier, and how it's handled.
     New stochastic escapes append here. THIS LOG justifies a new tier — speculation does not. -->

| Behavior | Tier | Handling (invariant gated / N-sample threshold / sampled / prod-monitored) | Added |
|---|---|---|---|
| <e.g. model extraction drift> | <eval/live> | gate on <invariant>; log variance | YYYY-MM-DD |

## Closed-Gaps trail
<!-- B2+. The earned-tier audit trail. Prevents re-opening blind spots during refactors; proves added ceremony was justified. -->

- **YYYY-MM-DD** — Gate `<X>` was blind to `<failure class>` because `<reason>`. Closed with `<test/tier added>`. (ref: `<bug/issue>`)

## Production-outcome tracking
<!-- B2+. Two outcomes, not one. A widening gap = the gates/handoff are the problem. -->

- Gate-pass rate: <how tracked>
- Production-survival (escaped defects / rework deploys): <how tracked>
- Last review: YYYY-MM-DD — <gap + action>
