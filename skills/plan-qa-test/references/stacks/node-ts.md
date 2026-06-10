---
type: reference
summary: "Concrete per-tier setup for Node/TypeScript projects (Next.js/React) — configs, gotchas, and tracer-test pointers for each rung of the earned test ladder."
status: active
tags: [testing, qa, engineering]
date_created: 2026-06-07
date_modified: 2026-06-07
---

# Stack Reference — Node / TypeScript (Next.js / React)

## Contents

1. [Tier 0 — Static analysis](#1-tier-0--static-analysis)
2. [Tier 1 — Unit / component](#2-tier-1--unit--component)
3. [Tier 2 — Integration (real DB)](#3-tier-2--integration-real-db)
4. [Tier 3 — Build gate](#4-tier-3--build-gate)
5. [Tier 4 — Browser / device E2E](#5-tier-4--browser--device-e2e)
6. [Tier 5 — Opt-in live (external APIs / models)](#6-tier-5--opt-in-live)
7. [Mobile gotchas to bake in at every tier](#7-mobile-gotchas)
8. [Tracer tests](#8-tracer-tests)

---

## 1. Tier 0 — Static analysis

Catches whole error classes at author time. AI-generated code over-produces `any` and unused vars; `--max-warnings 0` is the only setting that makes this a genuine gate (not a suggestion box).

Key config additions:

```jsonc
// eslint: no-explicit-any → error, no-unused-vars → error
// tsconfig: "strict": true, "noUnusedLocals": true, "noUnusedParameters": true
```

Gate commands:

```bash
npx eslint . --max-warnings 0
npx tsc --noEmit --strict
```

Run first in CI (1–3 min); gates everything downstream. Tighten existing configs incrementally — not all at once.

---

## 2. Tier 1 — Unit / component

**Why it exists:** pure logic and component-level interaction (focus states, ARIA attributes, render output) at in-memory speed. What it cannot see: real DB, network, multi-step user flows, mobile viewport rendering.

Use **vitest** (faster than Jest; native ESM; same API surface).

Split into two environments:

```ts
// vitest.config.unit.ts — React components, hooks, DOM interaction
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts', 'e2e/**'],
    globals: true,
  },
})

// vitest.config.logic.ts — pure functions, utils, server-side logic
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.logic.test.ts', 'lib/**/*.test.ts'], globals: true },
})
```

**What belongs here:** currency formatting, date math, validation functions, business invariants (e.g. `refund_total ≤ order_total`), React component attributes (ARIA, `type`, `inputMode`), focus/blur handlers, keyboard interaction, pure state transitions.

**What does not belong here:** DB queries, API calls (even mocked-via-msw ones belong in integration), multi-page flows, anything that needs a real viewport size.

Gate: `vitest run --config vitest.config.unit.ts`

---

## 3. Tier 2 — Integration (real DB)

**Why it exists:** covers the INTEGRATION/DB environment class — schema, auth/RLS, migrations applied in order, real query behavior. A unit test that mocks the DB is HERMETIC; it cannot catch a wrong column type, an RLS gap, or a migration that breaks existing rows.

Key config decisions:

```ts
// vitest.config.integration.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    fileParallelism: false,        // avoid cross-test DB state collisions
    testTimeout: 30_000,           // real DB ops; be generous
    hookTimeout: 60_000,
    setupFiles: ['./tests/setup/integration.ts'],
  },
})
```

```ts
// tests/setup/integration.ts — skip the whole tier cleanly when DB creds absent
import { beforeAll } from 'vitest'

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set — skipping integration tests')
    process.exit(0)   // or use test.skipIf at the suite level
  }
})
```

**Skip-clean pattern** (preferred over process.exit):

```ts
const hasDB = !!process.env.DATABASE_URL
describe.skipIf(!hasDB)('user auth flow', () => { ... })
```

**State drift warning:** do not `db reset` between tests. Reset-to-clean makes the gate HERMETIC about accumulated state — invisible to migrations that break on real prod-shaped data (see `prod-parity-and-migration.md`). Use transaction rollbacks or realistic fixtures, not an empty schema.

Gate: `vitest run --config vitest.config.integration.ts`

---

## 4. Tier 3 — Build gate

Next.js prerenders pages at build time. A browser global (`window`, `document`, `localStorage`) at module-load or render top-level causes a prerender crash **invisible to unit and integration tests** — it only surfaces in the real production build.

```bash
next build   # (vite build / remix build for other frameworks)
```

Cheap gate (1–5 min); run after integration, before E2E. Catches `window is not defined`, missing inlined env vars, and import errors tree-shaking masks in dev. Upstream fix: guard browser globals with `typeof window !== 'undefined'` or move into `useEffect`/event handlers — or add a `no-restricted-globals` lint rule to catch it at Tier 0.

---

## 5. Tier 4 — Browser / device E2E

**Why it exists:** the DEVICE environment class — what only a real browser rendering at a real mobile viewport can catch. The worked example's textbook escapes: `type="number"` steppers on iOS Safari, and focus loss from content-derived React keys. No static/mocked gate sees these.

**Playwright** is the default. The device descriptor is load-bearing — omitting `isMobile` silently renders at 980px desktop while claiming to test mobile.

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  retries: process.env.CI ? 2 : 0,   // CI only; retries on local mask real failures
  workers: process.env.CI ? 1 : undefined,  // serial when sharing a local backend
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:3000', trace: 'on-first-retry' },
  projects: [
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'Mobile — Pixel 5',
      use: {
        ...devices['Pixel 5'],
        isMobile: true,   // mandatory: sets UA, viewport, touch model
        hasTouch: true,   // mandatory: enables tap events
      },
    },
    {
      name: 'Mobile — iPhone 14',
      use: { ...devices['iPhone 14'], isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

**Flake-resistance is architectural, not retries.** Locators: `getByRole`, `getByLabel`, `getByTestId` — never CSS class selectors. Assertions: web-first auto-waiting (`await expect(locator).toBeVisible()`) — never `waitForTimeout`. Mobile interaction: `page.tap()` not `page.click()`; `page.fill()` for inputs. Data: UUID-per-run; no shared state via module globals. Time: `page.clock.install()` for time-sensitive paths.

Run serially (`workers: 1`) when tests share a local backend. Parallelize only when each test owns its data.

**What emulation cannot see** (route these to PRODUCTION-ONLY):
- True iOS Safari engine divergence (flex-wrap+gap, `100vh` rubber-band scroll)
- PWA install prompt (OS-controlled; not automatable in Playwright)
- Real camera / HEIC / EXIF handling
- Face ID / NFC / hardware sensors

Gate: `npx playwright test`

---

## 6. Tier 5 — Opt-in live (external APIs / models)

**Why it exists:** real third-party contract verification — does the API still accept our request shape? Does the model still return output with the expected invariants? This tier is **excluded from the per-commit gate** because it costs money, may be slow, and is flaky on third-party availability.

Gate it behind an env key:

```ts
// vitest.config.live.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.live.test.ts'], testTimeout: 60_000 },
})
```

```ts
// Pattern for every live test file
const hasKey = !!process.env.OPENAI_API_KEY  // or your provider's key
describe.skipIf(!hasKey)('OpenAI contract', () => {
  it('returns a response with expected invariants', async () => {
    const result = await callMyAIFunction('hello')
    expect(typeof result.text).toBe('string')           // gate on invariant
    expect(result.text.length).toBeGreaterThan(0)
    expect(result.text.length).toBeLessThan(4000)
    console.log('[live-tier variance]', result.text.slice(0, 100))  // log variance, don't gate on it
  })
})
```

Run manually or on a scheduled CI job, never on every commit. A failure signals third-party contract drift — update cassettes or Pact contracts accordingly.

---

## 7. Mobile gotchas to bake in at every tier

These two classes of bugs are from real production escapes. They are invisible to unit tests and static analysis without deliberate attention.

### Currency / numeric inputs

**The bug:** `<input type="number">` on iOS Safari shows steppers (+ / − arrows) and rejects decimal input in some locales. On Android, it changes the software keyboard to a numpad without a decimal key in some regions.

**The fix — enforce at the component level:**

```tsx
// Wrong — triggers OS-level input quirks on mobile
<input type="number" value={amount} onChange={...} />

// Correct — text input with decimal keyboard hint
<input
  type="text"
  inputMode="decimal"
  pattern="[0-9]*[.,]?[0-9]*"
  value={amount}
  onChange={...}
/>
```

**Cheapest durable home — AGENTS.md rule:** add `"NEVER use type='number' for currency or decimal inputs; use type='text' inputMode='decimal'"`. For deeper enforcement, a custom ESLint rule or `no-restricted-syntax` can flag `input[type="number"]` in component files. E2E tracer that validates the fix survives refactors: `assets/tracer-tests/e2e.smoke.example.spec.ts`.

### Stable list keys

**The bug:** React keys derived from displayed content (e.g. `key={item.name}` or `key={item.amount}`) cause focus loss mid-edit when the content changes during typing. The component unmounts and remounts, losing the cursor position.

**The fix:**

```tsx
// Wrong — key changes as user types
{items.map(item => <Row key={item.name} {...item} />)}

// Correct — key is stable across edits
{items.map(item => <Row key={item.id} {...item} />)}
```

**Cheapest durable home:** `eslint-plugin-react` `no-array-index-key` catches index keys. Content-derived keys need a custom rule or an `AGENTS.md` note: `"NEVER use item content (name, label, amount) as a React key; use a stable ID."`

---

## 8. Tracer tests

Tracer tests are the highest-leverage scaffold artifact — they teach the loop the project's conventions (locators, invariant-gating, fixture patterns) and guard the gotchas above from reappearing.

| Tier | Tracer file (copy + adapt) |
|---|---|
| Unit / component | `assets/tracer-tests/unit.example.test.ts` |
| Integration (real DB + RLS) | `assets/tracer-tests/integration.example.test.ts` |
| E2E mobile (incl. the input + focus gotchas) | `assets/tracer-tests/e2e.smoke.example.spec.ts` |
| Contract / I/O seam | `assets/tracer-tests/contract.example.test.ts` |
| Stochastic / LLM eval (opt-in) | `assets/tracer-tests/eval.example.test.ts` |

Create these when scaffolding (Mode A), built to the robustness standard in `references/robustness-and-nondeterminism.md`. Each tracer: one real behavior, right locator/assertion style, gates on an invariant not exact text, self-contained enough to copy as a pattern.

Cross-references: `references/ac-classification.md` (env-class routing) · `references/robustness-and-nondeterminism.md` (invariant-gating, flake prevention) · `references/prod-parity-and-migration.md` (integration tier state-drift rules) · `references/ci-gating-for-agents.md` (gate ordering, evaluator isolation)
