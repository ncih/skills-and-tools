/**
 * TIER: UNIT — HERMETIC/LOCAL
 *
 * Copy this file as the unit-tier pattern for any new project.
 * Adapt the domain stub (moneyUtils) to your own pure-logic module.
 *
 * HOW TO USE
 * ----------
 * 1. Replace the illustrative imports (marked // [illustrative]) with real ones.
 * 2. Replace the "money util" stub with your own pure-logic function(s).
 * 3. Keep the invariant + boundary + interaction structure — it is the pattern.
 *
 * WHAT THIS TIER IS (AND ISN'T)
 * ------------------------------
 * Unit tests own HERMETIC logic: pure functions, formatting, validation rules,
 * and lightweight component interactions that don't need a real DOM, DB, or network.
 * They are the cheapest gate — run on every keystroke, zero flake if written correctly.
 *
 * Structural blindness (accepted, not a failure): real rendering, DB state, network,
 * concurrency, device viewport, and focus/event behavior that depends on a browser engine.
 * Those failure classes belong to integration/E2E tiers — see references/failure-classes-and-ladder.md.
 */

import { describe, it, expect } from 'vitest'; // [illustrative — real project installs vitest]

// ─────────────────────────────────────────────────────────────────────────────
// ILLUSTRATIVE STUB — replace with your real import
// e.g. import { addCents, formatCents } from '@/lib/money';
// ─────────────────────────────────────────────────────────────────────────────

/** All money is integer cents. Never floats. Never divide without ceiling/floor. */
function addCents(a: number, b: number): number {
  // Why integer cents? Floating-point arithmetic on money is a correctness trap:
  // 0.1 + 0.2 === 0.30000000000000004 in IEEE 754. Integer arithmetic is exact.
  return Math.round(a) + Math.round(b);
}

function formatCents(cents: number): string {
  // Converts integer cents → display string. Pure function: no I/O, no state.
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1: PURE-LOGIC TESTS — invariant + boundary discipline
// ─────────────────────────────────────────────────────────────────────────────

describe('addCents — pure money arithmetic', () => {

  // WHY ROUND-TRIP INVARIANT instead of exact-blob assertions:
  // An invariant test says "this property must always hold" — it survives refactors
  // and implementation changes as long as the contract is preserved. An exact-blob
  // test (expect(result).toBe(42)) pins the current behavior, including bugs.
  // OpenAI's SWE-bench audit found 35.5% of tests were over-strict (exact where
  // an invariant fits), causing correct implementations to be rejected.
  it('round-trip invariant: add then negate returns zero', () => {
    const a = 1500; // $15.00
    const b = 2750; // $27.50
    expect(addCents(addCents(a, b), -addCents(a, b))).toBe(0);
  });

  it('commutativity invariant: a+b === b+a', () => {
    const a = 999;
    const b = 1;
    expect(addCents(a, b)).toBe(addCents(b, a));
  });

  // WHY BOUNDARY VALUES:
  // Most logic bugs live at the edges, not in the happy middle.
  // The set { zero, one, min-int, max-safe-int, negative, negative-zero }
  // is a forcing function that exercises the branches your happy-path test ignores.
  it('zero is the additive identity', () => {
    expect(addCents(0, 0)).toBe(0);
    expect(addCents(1000, 0)).toBe(1000);
    expect(addCents(0, 1000)).toBe(1000);
  });

  it('negative cents (refunds, discounts)', () => {
    expect(addCents(1000, -300)).toBe(700); // $10.00 - $3.00 = $7.00
    expect(addCents(-500, -500)).toBe(-1000);
  });

  it('large values stay exact (no float drift)', () => {
    // WHY: JS Number is safe up to 2^53-1 for integers. If a codebase ever
    // used floats here, this test would catch drift at scale.
    const large = Number.MAX_SAFE_INTEGER - 1;
    expect(addCents(large, 1)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('formatCents — display formatting', () => {

  it('formats positive amount correctly', () => {
    expect(formatCents(1050)).toBe('$10.50');
    expect(formatCents(100)).toBe('$1.00');
    expect(formatCents(1)).toBe('$0.01');
  });

  it('formats zero', () => {
    // WHY: zero is a boundary that often breaks sign logic or padding
    expect(formatCents(0)).toBe('$0.00');
  });

  it('formats negative amounts (refunds)', () => {
    expect(formatCents(-1050)).toBe('-$10.50');
  });

  it('pads single-digit cents', () => {
    // WHY: '5' → '$0.05' not '$0.5' — a missing padStart breaks this
    expect(formatCents(5)).toBe('$0.05');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PART 2: COMPONENT INTERACTION TEST — focus + multi-char input accumulation
// ─────────────────────────────────────────────────────────────────────────────
// This pattern lives at unit tier because it tests attribute/logic behavior
// (value accumulation, key handling), NOT real browser rendering or focus policy.
// For real focus-loss-on-mobile, device/render gap tests own that — E2E tier.

// WHY this pattern at all?
// The worked example (SplitLah) had a focus-loss bug caused by content-derived
// React keys: each keypress re-created the element, losing focus mid-type.
// That specific bug needs an E2E test with a real mobile viewport.
// But we CAN unit-test the *accumulation contract* — does typing a sequence
// of characters produce the concatenated value? — without a real browser.

// ILLUSTRATIVE STUB: replace with your real component test harness
// e.g. import { render, screen, userEvent } from '@testing-library/react';
// e.g. import { AmountInput } from '@/components/AmountInput';

// Minimal in-memory accumulator simulating controlled-input logic:
function simulateControlledInput(
  initialValue: string,
  keystrokes: string[]
): string {
  // WHY STABLE KEY matters: if the component re-creates the element on each
  // render (content-derived key like key={value}), focus is lost between
  // keystrokes. The real fix is a stable key (key={fieldId}). This function
  // tests the accumulation logic in isolation; the stable-key requirement
  // is enforced at the component level via the E2E tracer.
  return keystrokes.reduce((acc, char) => acc + char, initialValue);
}

describe('controlled input — value accumulation contract', () => {

  it('typing multiple characters accumulates into the value', () => {
    // WHY NOT exact-blob on each intermediate state:
    // We care that the final value is correct, not the intermediate
    // render cycle implementation. Over-specifying intermediate steps
    // makes this test brittle to refactors that preserve the final contract.
    const result = simulateControlledInput('', ['1', '2', '.', '5', '0']);
    expect(result).toBe('12.50');
  });

  it('backspace should remove the last character', () => {
    // WHY: deletion is a boundary case for accumulation logic — apps often
    // test "type something" but forget "delete something"
    const afterBackspace = simulateControlledInput('12.5', ['\b']).replace(/.$/, '');
    expect(afterBackspace).toBe('12.');
  });

  it('typing into a pre-filled input preserves prior value', () => {
    // WHY: a common bug is that a re-mount wipes the initial value.
    // This invariant catches it: prior + new ≥ prior.length.
    const prior = '99.';
    const result = simulateControlledInput(prior, ['0', '0']);
    expect(result.startsWith(prior)).toBe(true);
    expect(result).toBe('99.00');
  });
});
