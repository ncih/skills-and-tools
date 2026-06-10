# Generic Stack Fallback — Mapping the Tier Ladder onto an Unknown Stack

**Use this file when no first-class stack detector applies.** The method transfers even when the commands do not.

## Contents
1. [The portable principle: classify environments first, bind tools second](#1-classify-environments-first-bind-tools-second)
2. [Discovery protocol: find the tooling equivalents](#2-discovery-protocol-find-the-tooling-equivalents)
3. [Mapping each tier to its unknown-stack equivalent](#3-mapping-each-tier-to-its-unknown-stack-equivalent)
4. [When no test runner exists](#4-when-no-test-runner-exists)
5. [When no tool exists for a needed tier](#5-when-no-tool-exists-for-a-needed-tier)

Cross-references: `ac-classification.md` · `failure-classes-and-ladder.md`

---

## 1. Classify environments first, bind tools second

The environment a check *needs* is stack-independent. The command that runs it is not. Do them in order — getting this backwards is the most common reason a test plan misfires on an unfamiliar stack.

**Step 1 — classify every AC by environment class** (from `ac-classification.md`):

| Class | What it needs | Stack-independent recognition cue |
|---|---|---|
| **HERMETIC / LOCAL** | No I/O; fully in-process | Pure computation; mocked everything; no real clock, FS, or network |
| **INTEGRATION / DB** | Real DB engine + schema + auth | Any AC whose correctness depends on persisted state, schema shape, or row-level rules |
| **EXTERNAL-API** | Third-party contract | Any AC that calls a service you don't own and can't mock away at the boundary |
| **DEVICE** | Real browser engine or hardware | Mobile rendering, touch, camera, OS-controlled UI, PWA install |
| **PRODUCTION-ONLY** | Accumulated prod state, prod domain, real device | Cannot pass locally by construction — shift-right or manual only |

This table is the same regardless of whether the app is Rust + SQLite, Python + DynamoDB, or Go + PostgreSQL. Classify before you know the tools; the classification tells you *which* tools you need to find.

---

## 2. Discovery protocol: find the tooling equivalents

Run this discovery sequence against the unknown repo. Each question maps to a tier:

**Test runner (unit + integration)**
```
Look for: test scripts in package.json / Makefile / Taskfile / pyproject.toml / Cargo.toml / go.mod
Ask: what runs `make test`? What does `grep -r "describe\|it(\|func Test\|#\[test\]" .` find?
Find: the command that runs all tests and the flag that filters to one file/name.
```

**Filter syntax** (critical for tracer test isolation):
- Node/Deno: `--testNamePattern` / `-t` / `--grep`
- Python pytest: `-k "test_name"`
- Go: `-run TestFunctionName`
- Rust: `cargo test test_name`
- Ruby: `--name /pattern/`

**Build / type / lint**
```
Look for: tsc / mypy / pyright / cargo check / go vet / eslint / ruff / clippy
Ask: does CI run a typecheck step? Are there warnings-as-errors flags?
Find: the flag that makes warnings fatal (--max-warnings 0 / -D warnings / --strict)
```

**Real database in CI**
```
Look for: docker-compose.yml, .devcontainer, Testcontainers deps, DB_URL env vars
Ask: what engine does production use? (Never substitute a different engine in tests.)
Find: the service block or Testcontainers setup that spins the same engine at the same version.
If none exists: scaffold docker-compose.test.yml with the prod engine pinned to its exact version tag.
```

**E2E / browser**
```
Look for: playwright.config.*, cypress.config.*, selenium, puppeteer, webdriver deps
Ask: does the app have a UI? Is it browser-based?
Find: the command + how to run against a local dev server; how to set viewport/mobile.
If none: Playwright is the ecosystem-default for web apps (real WebKit, device descriptors, service-worker support).
```

**Lint / type tooling** (usually already present — just needs strictness flags):
```
Node/TS: eslint + tsc --noEmit --strict
Python: ruff + mypy --strict
Rust: clippy -D warnings
Go: go vet + staticcheck
```

---

## 3. Mapping each tier to its unknown-stack equivalent

Once you have the tool equivalents, bind each tier:

| Tier | Generic form | What to look for / scaffold |
|---|---|---|
| **Static** | Lint + type check | Run existing linter with warnings-as-errors; add strict typecheck if absent |
| **Unit / component** | In-process fast tests | Use the found test runner; mock all I/O at the boundary |
| **Integration (real deps)** | Test runner against real DB/services via docker-compose or Testcontainers | Pin the prod DB engine version; seed prod-shaped state (not a clean reset) |
| **Contract / golden** | CDC (Pact) for own APIs; recorded cassettes for third-party | Record real API responses with version + date stamps; fail if stale |
| **Live external (opt-in)** | Real 3rd-party API call behind an env flag | Guard with `if not os.environ.get("LIVE_API_KEY"): pytest.skip()` or equivalent |
| **Browser / device E2E** | Playwright (or found equivalent) with real viewport | Set device descriptor + `isMobile:true`; role-based locators; web-first assertions |
| **Build / prerender** | Production build + server-side render check | `npm run build && npm run start` or `cargo build --release`; probe `/` and critical routes |
| **Post-deploy smoke** | Synthetic probe against the real artifact | A health-check request against the deployed URL; curl + status assertion is enough |
| **Canary / prod monitor** | Per-version error rate + latency; rollback threshold | Tie to the deploy pipeline; never aggregate across versions |

**Proportionality check:** only instantiate the tiers that the risk band warrants (see SKILL.md §Step 1). A B0 library never needs E2E. A B2 app needs contract + device tiers only if those surfaces exist.

---

## 4. When no test runner exists

If the repo has no tests at all:

1. **Identify the ecosystem standard** — do not invent; use what the community has settled on:

| Language | Default runner | Config file |
|---|---|---|
| TypeScript / JS | vitest (or jest for legacy) | `vitest.config.ts` |
| Python | pytest | `pyproject.toml [tool.pytest]` |
| Go | built-in `go test` | (none needed) |
| Rust | built-in `cargo test` | (none needed) |
| Ruby | RSpec | `.rspec` |
| Java/Kotlin | JUnit 5 via Gradle/Maven | `build.gradle` / `pom.xml` |

2. **Scaffold minimally** — one config file, one tracer test that asserts a known-trivial invariant (e.g. `expect(1 + 1).toBe(2)` or `assert 1 + 1 == 2`). This proves the runner works before writing real tests.

3. **Do not scaffold all tiers at once.** Install the runner and make one unit test green. Then earn each subsequent tier by failure-class evidence (principle 4 from SKILL.md).

4. **Add the run command to AGENTS.md/CLAUDE.md immediately** — the loop needs a reliable `run tests` command from day one.

---

## 5. When no tool exists for a needed tier

When an AC is classified DEVICE or EXTERNAL-API, but no emulation tool or contract framework is installed:

**The AC does not disappear — it becomes PRODUCTION-ONLY.**

This is a shift-right signal, not a gap to paper over:

1. Mark the AC `[PROD-ONLY]` in the spec and the AC classification index.
2. In `docs/testing/qa-plan.md`, record it in the Environment Matrix as `BLOCKED` for all pre-prod environments.
3. Define the production signal that stands in for the missing gate: an error-rate threshold, a latency SLO, or a specific log event that fires when the behavior fails.
4. Set a rollback threshold (e.g. "error rate >0.1% on this route triggers feature-flag rollback") — this is the structural antidote to verification theater for that AC.
5. Add a manual checklist item if the risk is high enough that automated monitoring alone is insufficient (real device, real payment, real credential flow).

**When to escalate vs accept:** if a PRODUCTION-ONLY AC covers a high-severity, high-likelihood path (RPN ≥ 6×6; see `ac-classification.md §2`), escalate to a real-device cloud tier (BrowserStack/LambdaTest) or a sandboxed live-API tier rather than accepting production-only as permanent. The rule is: PRODUCTION-ONLY is a *routing decision*, not a pass.

---

## The method is portable; the commands are not

To recap: when you land on an unknown stack, do this in order —

1. **Classify ACs by environment** (`ac-classification.md`). Stack-agnostic.
2. **Run the discovery protocol** (§2) to find what tools exist.
3. **Map each earned tier to its discovered equivalent** (§3).
4. **If a tool is missing for a needed tier**, route that AC to PRODUCTION-ONLY + shift-right signal (§5).
5. **If no test runner exists**, install the ecosystem standard and scaffold one tracer test (§4).

The failure-class taxonomy (`failure-classes-and-ladder.md`) and the environment-class ladder (`ac-classification.md`) do not change. The names in the Makefile do.
