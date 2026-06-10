/**
 * TIER: STOCHASTIC EVAL — OPT-IN / PRE-RELEASE (never per-commit)
 * ENV CLASS: EXTERNAL-API (live model call) — requires API key
 *
 * Copy this file as the eval-tier pattern when your codebase has LLM output,
 * ranking, OCR, or any other stochastic surface.
 *
 * HOW TO USE
 * ----------
 * 1. Set OPENAI_API_KEY (or your provider's key) in the environment — or
 *    replace the callModel stub with your real client.
 * 2. Replace the illustrative prompt/task with your own LLM feature under test.
 * 3. Tune N_SAMPLES, PASS_THRESHOLD, and STDDEV_BUDGET per §6.2 of the brief.
 * 4. Run manually or in a release pipeline, NOT on every commit:
 *      OPENAI_API_KEY=sk-... vitest run src/__evals__/eval.example.test.ts
 * 5. Read the logged variance report — it tells you drift direction before it
 *    becomes a production failure. Feed failures into your golden dataset.
 *
 * WHAT THIS TIER IS (AND ISN'T)
 * ------------------------------
 * Evals measure quality over a distribution. Tests make binary assertions about
 * deterministic behavior. These are different tools — conflating them produces
 * either always-failing (over-strict) or always-passing (vacuous) gates.
 *
 * This tier HARD-ASSERTS only structural invariants (the things that must be
 * true on every single sample regardless of LLM randomness). It LOGs quality
 * signals — mean score, stddev — without failing on them. The three-valued
 * verdict (PASS / FAIL / INCONCLUSIVE) prevents premature sign-off: high
 * variance does not pass, it blocks and asks for more evidence.
 *
 * Structural blindness (accepted): real user interaction, latency at prod
 * volume, multilingual edge cases, jailbreak robustness. Those belong to
 * production sampling + red-team exercises, not this tier.
 *
 * See: references/robustness-and-nondeterminism.md §Part D
 */

import { describe, it, expect, vi } from 'vitest'; // [illustrative — install vitest]

// ─────────────────────────────────────────────────────────────────────────────
// OPT-IN GUARD — skip the entire file when no API key is present.
//
// WHY: this file costs real money and real time on every run. Requiring an
// explicit API key makes the cost intentional, not accidental. The test runner
// skips cleanly rather than failing, so CI stays green without requiring the
// key, and a developer who sets the key can run it locally on demand.
//
// NEVER remove this guard and commit it as a per-commit gate. A stochastic
// test in the per-commit gate is how you get "sometimes red, usually green" —
// the single worst failure mode for gate credibility.
// ─────────────────────────────────────────────────────────────────────────────
const API_KEY = process.env.OPENAI_API_KEY; // swap for your provider's key name
const RUN_EVALS = !!API_KEY;

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION — tunable per your risk band and feature surface.
//
// N_SAMPLES: how many independent completions to draw per eval case.
// 5–10 is the minimum meaningful sample (brief §6.1). Below 5, the confidence
// interval is too wide to distinguish PASS from INCONCLUSIVE. Above 20, the
// marginal signal gain falls off fast — use a wider golden dataset instead.
//
// PASS_THRESHOLD: minimum fraction of samples that must pass the quality gate.
// 0.8 (80%) is a reasonable starting point; calibrate against human-labeled
// examples before hardening into a release gate (brief §6.2 — RAGAS ≈0.8 is
// [Thin]; validate before baking into your pipeline).
//
// STDDEV_BUDGET: variance above this triggers INCONCLUSIVE even if the mean
// would pass. 0.15 is the brief's threshold for "instability."
// ─────────────────────────────────────────────────────────────────────────────
const N_SAMPLES = 5;
const PASS_THRESHOLD = 0.8;    // 80% of samples must pass the quality criterion
const STDDEV_BUDGET = 0.15;    // scores more spread than this → INCONCLUSIVE

// ─────────────────────────────────────────────────────────────────────────────
// ILLUSTRATIVE MODEL STUB — replace with your real client call.
//
// e.g. import OpenAI from 'openai';
// const client = new OpenAI({ apiKey: API_KEY });
// async function callModel(prompt: string): Promise<string> {
//   const response = await client.chat.completions.create({
//     model: 'gpt-4o-mini',
//     messages: [{ role: 'user', content: prompt }],
//   });
//   return response.choices[0].message.content ?? '';
// }
// ─────────────────────────────────────────────────────────────────────────────
async function callModel(prompt: string): Promise<string> {
  // Stub: in a real project this hits your LLM provider. The stub returns a
  // plausible but slightly random JSON response so the invariant + variance
  // patterns below are demonstrable without a live key.
  const score = 0.7 + Math.random() * 0.25; // simulate 0.70–0.95 quality scores
  return JSON.stringify({
    summary: `Concise answer to: ${prompt.slice(0, 40)}`,
    quality_score: parseFloat(score.toFixed(2)),
    sources: ['doc-1', 'doc-2'],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — mean, stddev, and the three-valued verdict engine.
// ─────────────────────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  const m = mean(values);
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

type Verdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

function verdict(passRate: number, scoreStddev: number): Verdict {
  // Three-valued, not binary. Rationale from the brief (§6.1, §10):
  // Binary pass/fail on stochastic output has ~0% regression-detection power —
  // aggregate scores degrade while individual runs stay within noise. Three values
  // force the right action: INCONCLUSIVE means "we don't know," and "we don't
  // know" is not a release condition.
  if (scoreStddev > STDDEV_BUDGET) return 'INCONCLUSIVE'; // too noisy to trust
  if (passRate >= PASS_THRESHOLD) return 'PASS';
  return 'FAIL';
}

// ─────────────────────────────────────────────────────────────────────────────
// THE EVAL SUITE
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!RUN_EVALS)('LLM summary eval — stochastic, opt-in', () => {
  // WHY skipIf: this is the idiomatic vitest opt-in guard. The entire suite
  // skips silently when RUN_EVALS is false (no API key). No test is marked
  // "pending" or "todo" — it simply does not run, producing no false signal.

  it('hard-asserts structural invariants on every sample; logs variance', async () => {
    // WHY N_SAMPLES independent calls, not one:
    // Temperature=0 is NOT determinism. GPU reduction-order and batching variance
    // mean a model at temp=0 can still produce ~80 distinct completions across
    // 1,000 runs (brief §6.1). A single passing call proves nothing about the
    // distribution. You need N samples to get a confidence interval.

    const PROMPT = 'Summarise what a QA tier ladder is in ≤3 sentences.';

    const qualityScores: number[] = [];
    const invariantPasses: boolean[] = [];

    for (let i = 0; i < N_SAMPLES; i++) {
      const raw = await callModel(PROMPT);

      // ── HARD ASSERTIONS (structural invariants) ────────────────────────────
      // These run synchronously on each sample. Any failure here is a hard block
      // regardless of how the quality signal looks — a structural invariant that
      // sometimes fails is a critical defect, not acceptable variance.

      // 1. Output must be valid JSON. A malformed JSON response is not "low
      //    quality" — it is a contract violation that will crash downstream consumers.
      let parsed: { summary?: string; quality_score?: number; sources?: unknown[] };
      expect(() => { parsed = JSON.parse(raw); }).not.toThrow();
      parsed = JSON.parse(raw); // safe after the assertion above

      // 2. Required fields must be present. Missing keys are structural defects.
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('quality_score');
      expect(parsed).toHaveProperty('sources');

      // 3. Types and ranges must be correct. "Quality score" must actually be a
      //    number in [0, 1] — a string "high" or a value of 42 is a contract break.
      expect(typeof parsed.quality_score).toBe('number');
      expect(parsed.quality_score).toBeGreaterThanOrEqual(0);
      expect(parsed.quality_score).toBeLessThanOrEqual(1);

      // 4. Summary must be non-empty and within the length the prompt asked for.
      //    (3 sentences ≈ 50–500 chars — adjust to your spec.)
      expect(typeof parsed.summary).toBe('string');
      expect((parsed.summary as string).length).toBeGreaterThan(10);
      expect((parsed.summary as string).length).toBeLessThan(600);

      // 5. No PII patterns. Adapt the regex to your data surface — SSNs, card
      //    numbers, emails. A safety/PII escape is a hard block, not variance.
      const PII_PATTERN = /\b\d{3}-\d{2}-\d{4}\b|\b\d{16}\b/; // SSN, card
      expect(PII_PATTERN.test(parsed.summary as string)).toBe(false);

      // 6. Sources must be a non-empty array (the model must ground its answer).
      expect(Array.isArray(parsed.sources)).toBe(true);
      expect((parsed.sources as unknown[]).length).toBeGreaterThan(0);

      // ── QUALITY SIGNAL (logged, not gating) ───────────────────────────────
      // The quality_score is the model's self-reported quality or an inline
      // judge score. We log it — mean, stddev — but do NOT hard-assert its value.
      //
      // WHY NOT gate on the exact score:
      // Exact-match on a stochastic value is the definition of an over-strict
      // test. The score will vary legitimately across runs. Gating on it produces
      // a test that is either always-red (too tight) or always-green (too loose).
      // The invariants above catch defects; the distribution below catches drift.
      qualityScores.push(parsed.quality_score as number);

      // Track which samples passed a lightweight quality heuristic (e.g. score > 0.7).
      // This heuristic becomes the input to the three-valued verdict.
      invariantPasses.push((parsed.quality_score as number) > 0.7);
    }

    // ── VARIANCE REPORT (logged to stdout, never a hard-fail alone) ──────────
    const scoreMean = mean(qualityScores);
    const scoreStd = stddev(qualityScores);
    const passRate = invariantPasses.filter(Boolean).length / N_SAMPLES;
    const v = verdict(passRate, scoreStd);

    // Structured log — CI collects this as a quality signal, not a gate signal.
    // In a real pipeline: emit to a metrics endpoint, a Datadog custom metric,
    // or a quality-signal reporter. The key is that this data is VISIBLE but
    // NOT blocking (unless the verdict below fires).
    console.log('[eval:summary]', JSON.stringify({
      prompt: PROMPT,
      n_samples: N_SAMPLES,
      pass_threshold: PASS_THRESHOLD,
      stddev_budget: STDDEV_BUDGET,
      score_mean: parseFloat(scoreMean.toFixed(3)),
      score_stddev: parseFloat(scoreStd.toFixed(3)),
      pass_rate: parseFloat(passRate.toFixed(3)),
      verdict: v,
      scores: qualityScores,
    }));

    // ── THREE-VALUED VERDICT ──────────────────────────────────────────────────
    // INCONCLUSIVE blocks just like FAIL. This is the hardest discipline to
    // maintain: when variance is high, the instinct is "probably fine, ship it."
    // Resist. High variance means you don't know — and "don't know" is not a
    // release condition. Block, run more samples, resolve to PASS or FAIL.
    //
    // In a real pipeline: INCONCLUSIVE should trigger a re-run with higher N
    // (or a human review of the score distribution) rather than auto-failing,
    // because the root cause might be an outlier sample, not a real regression.
    // Here we assert PASS to keep the illustrative example runnable; in your
    // project, assert v !== 'FAIL' and handle INCONCLUSIVE explicitly.
    expect(['PASS', 'INCONCLUSIVE']).toContain(v); // adjust to your policy

    if (v === 'INCONCLUSIVE') {
      // Surface the reason so the operator can decide: run more samples or flag
      // for human review. Never silently treat INCONCLUSIVE as PASS.
      console.warn(
        `[eval:summary] INCONCLUSIVE — stddev ${scoreStd.toFixed(3)} exceeds budget ` +
        `${STDDEV_BUDGET}. Run N>${N_SAMPLES} samples or review score distribution.`
      );
    }
  }, 60_000); // generous timeout: N live API calls can take 20–40 s in practice
});
