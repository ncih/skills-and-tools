/**
 * TIER: Browser / Device E2E — mobile-viewport smoke (B2+)
 * STACK: Playwright (TypeScript). Illustrative selectors — adapt to your app.
 *
 * PURPOSE
 * -------
 * This file is the tracer test for the mobile-viewport E2E tier. The coding loop
 * copies it to start its own smoke spec. Every anti-flake pattern carries a WHY
 * comment so the pattern propagates correctly, not just the code shape.
 *
 * HOW TO USE
 * ----------
 * 1. Copy to e2e/smoke.spec.ts in your project.
 * 2. Replace illustrative selectors (marked ILLUSTRATIVE) with role-based locators
 *    matching your app. Never replace them with CSS/XPath — that defeats the point.
 * 3. Adjust the seeded persona constants and base URL to match your test fixtures.
 * 4. This spec runs in CI on every commit (fast, emulated). Real-device cloud
 *    (BrowserStack / LambdaTest) runs at merge — see references/stacks/node-ts.md.
 *
 * WHAT EMULATION CAN SEE vs WHAT ONLY A REAL DEVICE CAN
 * ------------------------------------------------------
 * Emulation catches (~80%): mobile layout, touch events, input type mismatches,
 *   focus behaviour, NaN propagation, role-based accessibility tree.
 * Structurally blind (PRODUCTION-ONLY, never gate CI here):
 *   - iOS Safari engine divergence (flex-wrap+gap, dynamic 100vh, rubber-band scroll)
 *   - Real camera / HEIC / EXIF ingestion
 *   - PWA install prompt — OS-controlled; Playwright issue #26875 is open; emulation
 *     cannot trigger it. Gate via manual checklist + real-device session.
 *   - Face ID / NFC / biometric auth
 */

import { test, expect, devices } from '@playwright/test';

// ---------------------------------------------------------------------------
// Seeded persona — never use production credentials in a test.
// Create these via a fixture/seed script that runs before the suite.
// A UUID-per-run suffix prevents cross-run state contamination.
// ---------------------------------------------------------------------------
const SEED_USER = { email: 'smoke+seed@example.test', password: 'SeedPw!2026' };
const BASE_URL  = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Project-level device config (playwright.config.ts) should set this globally.
// We mirror it here to make the intent explicit for readers.
// WHY isMobile:true + hasTouch:true BOTH matter: omitting isMobile silently
// renders at a 980px desktop viewport even when deviceScaleFactor is set.
// Omitting hasTouch means pointer events fire as mouse, not touch — your
// tap targets and gesture handlers see different input and can behave
// differently from a real phone.
// ---------------------------------------------------------------------------
const PIXEL_7 = devices['Pixel 7'];  // { isMobile:true, hasTouch:true, viewport:{width:412,height:915}, ... }

test.use({ ...PIXEL_7, baseURL: BASE_URL });

// ---------------------------------------------------------------------------
// FIXTURE: authenticated session via storageState (fastest, most reliable).
// WHY: logging in through the UI in every test is slow AND flaky — the login
// page itself can fail for unrelated reasons, masking the actual smoke target.
// Use Playwright's storageState fixture to inject auth cookies once per run.
// ---------------------------------------------------------------------------
test.beforeAll(async ({ browser }) => {
  // If your CI populates storageState via globalSetup, remove this block.
  const ctx  = await browser.newContext({ ...PIXEL_7 });
  const page = await ctx.newPage();
  await page.goto('/login');

  // Role-based locator — survives CSS refactors and matches the a11y tree.
  // WHY getByLabel over getByPlaceholder: the label is the semantic contract;
  // placeholder text is presentational and frequently removed by designers.
  await page.getByLabel('Email').fill(SEED_USER.email);
  await page.getByLabel('Password').fill(SEED_USER.password);

  // page.tap() instead of page.click() — fires a real touch event.
  // WHY: some mobile click-targets only activate on touch (touchstart/touchend);
  // click() synthesises a mouse event, which can silently succeed in emulation
  // but fail on a real device or when the handler explicitly checks event.type.
  await page.getByRole('button', { name: 'Sign in' }).tap();

  await ctx.storageState({ path: 'e2e/.auth/smoke-user.json' });
  await ctx.close();
});

test.use({ storageState: 'e2e/.auth/smoke-user.json' });

// ---------------------------------------------------------------------------
// SMOKE: homepage loads without a crash
// ---------------------------------------------------------------------------
test('home screen renders', async ({ page }) => {
  await page.goto('/');

  // Web-first auto-waiting assertion — Playwright retries until the condition
  // is true or the timeout fires. NEVER use waitForTimeout() here.
  // WHY: waitForTimeout is a fixed sleep that is simultaneously too slow
  // (adds wall-clock time) and too brittle (fails on slower CI machines).
  // Web-first assertions wait for the element, then assert — they are both
  // faster on a fast machine and more reliable on a slow one.
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible(); // ILLUSTRATIVE
});

// ---------------------------------------------------------------------------
// SMOKE: currency / numeric input field — the type=text + inputmode=decimal
// invariant. This is the single highest-value mobile input assertion.
//
// WHY this matters:
//   <input type="number"> renders as a stepper (▲▼ arrows) on mobile Chrome.
//   The stepper fires onChange with an empty string if the value is
//   non-numeric — including mid-edit states like "1." or "1,0" — which
//   propagates NaN through any arithmetic. The bug only manifests on a mobile
//   viewport; desktop and unit tests never see it.
//   Correct pattern: type="text" inputmode="decimal" — gives the numeric
//   keyboard on mobile, stores a string, parsing is explicit in your code.
//   (Source: Safari input[type=number] gotcha — soledadpenades.com 2024)
// ---------------------------------------------------------------------------
test('currency input is text + inputmode=decimal, not a number stepper', async ({ page }) => {
  await page.goto('/expenses/new'); // ILLUSTRATIVE

  const amountInput = page.getByLabel('Amount'); // ILLUSTRATIVE

  // Assert the HTML attribute — this is a deterministic invariant check,
  // not a visual assertion. It fails immediately if an engineer changes
  // the input type without understanding the mobile consequence.
  await expect(amountInput).toHaveAttribute('type', 'text');
  await expect(amountInput).toHaveAttribute('inputmode', 'decimal');
});

// ---------------------------------------------------------------------------
// SMOKE: typing into the field keeps focus (no mid-type focus loss)
//
// WHY pressSequentially matters:
//   fill() atomically sets the .value property — it never exercises the
//   keydown→keyup→input event chain. An input that loses focus between
//   keystrokes (e.g. a React component with a content-derived key that
//   unmounts+remounts on each state change) passes fill() but fails when
//   a real user types character by character.
//   pressSequentially fires a real keydown/keyup per character; the field
//   must hold focus across all of them or the value will be truncated.
//   This caught the "content-derived React key" bug in the worked example —
//   no unit or static gate can see it.
// ---------------------------------------------------------------------------
test('amount field keeps focus while typing (no mid-type unmount)', async ({ page }) => {
  await page.goto('/expenses/new'); // ILLUSTRATIVE

  const amountInput = page.getByLabel('Amount'); // ILLUSTRATIVE
  await amountInput.tap();   // tap to focus (touch event, not mouse click)

  await amountInput.pressSequentially('123.45');

  // Assert the full value arrived — if focus was lost mid-type, this will
  // contain a truncated string (e.g. '1' or '12') and the test fails.
  await expect(amountInput).toHaveValue('123.45');
  await expect(amountInput).toBeFocused();
});

// ---------------------------------------------------------------------------
// SMOKE: the body never contains "NaN"
//
// WHY: NaN propagates silently through JS arithmetic. A missing migration,
// a type="number" stepper edge-case, or an unguarded parseFloat('') all
// produce NaN that renders as the string "NaN" in the UI. This is a
// business-invariant assertion — a user must never see "NaN" on screen.
// It is cheap, deterministic, and catches an entire class of arithmetic
// failures in one assertion across the whole rendered page.
// ---------------------------------------------------------------------------
test('rendered page contains no NaN', async ({ page }) => {
  await page.goto('/expenses/new'); // ILLUSTRATIVE

  // Trigger a calculation path by filling and submitting the form.
  await page.getByLabel('Amount').tap();
  await page.getByLabel('Amount').pressSequentially('50.00');
  await page.getByRole('button', { name: /add expense/i }).tap(); // ILLUSTRATIVE

  // Wait for the result to appear before asserting absence.
  await expect(page.getByRole('region', { name: /summary/i })).toBeVisible(); // ILLUSTRATIVE

  // Deterministic negative-presence assertion on the full body text.
  await expect(page.locator('body')).not.toContainText('NaN');
});
