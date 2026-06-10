/**
 * TIER: Contract / Route-handler (I/O seam)
 *
 * WHAT THIS TIER CATCHES
 *   Schema/shape mismatches at the boundary between YOUR code and an external
 *   service — the fields YOUR code reads, the status codes YOU produce for each
 *   upstream condition, and YOUR error-handling logic. It does not call the
 *   real external service; it tests YOUR handling of a mocked (or recorded)
 *   response.
 *
 * WHAT THIS TIER IS BLIND TO
 *   Whether the real provider still honours the contract you're mocking. That
 *   gap is closed by the LIVE opt-in tier (run out-of-band, never per-commit)
 *   and, for own-team providers, by Pact's `can-i-deploy` gate (see below).
 *
 * CHOOSING THE RIGHT CONTRACT TECHNIQUE
 *   Own-team provider (microservice you control):
 *     → Use CONSUMER-DRIVEN CONTRACT TESTING (Pact / PactFlow).
 *       The consumer (this service) publishes its expectations; the provider
 *       CI verifies them. `can-i-deploy` is a HARD DEPLOY GATE — a provider
 *       version cannot reach prod if any consumer contract is incompatible.
 *       This file would be generated/verified by Pact, not written by hand.
 *
 *   Third-party / public API (you don't control the provider):
 *     → Use BI-DIRECTIONAL CT (BDCT / OpenAPI diff) or RECORDED CASSETTES.
 *       Cassettes: record one real HTTP response, stamp it with date + API
 *       version, replay on every run. Fail if the cassette is older than N days
 *       (staleness guard). Schemathesis-style fuzz the API surface separately
 *       to catch edge cases (1.4–4.5× more defects than hand-written tests).
 *       This file illustrates the cassette/mock approach.
 *
 * HOW TO USE THIS TRACER
 *   1. Copy alongside your route handler:
 *        src/routes/payments/__tests__/payments.contract.test.ts
 *   2. Replace the stub handler and mock response with your real ones.
 *   3. Keep the loose shape matchers (expect.objectContaining / toMatchObject)
 *      — exact-value assertions on fields YOU DON'T OWN create false failures
 *      when the upstream changes a non-breaking field like a description string.
 *   4. Seed multiple mock records for filter/list tests (Postel's-Law false
 *      positives: a single-item response makes most filter logic vacuously pass).
 *   5. This tier runs HERMETICALLY — no network, no DB, no secrets needed.
 *      vitest.config.ts (default config) is correct; no special env key guard.
 *
 * TARGET ENV: HERMETIC / LOCAL — runs everywhere, including offline.
 * RETRY BUDGET: 0 (like a unit test — if it flakes, the mock is non-deterministic
 *   and that is a bug in the test, not the code).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// ILLUSTRATIVE IMPORTS
// In a real project these would be your actual route handler and HTTP client.
// The interfaces below are typed stubs so the patterns are copy-worthy without
// requiring a compiled project.
// ---------------------------------------------------------------------------

interface PaymentResult {
  paymentId: string;
  status: 'pending' | 'succeeded' | 'failed';
  amount: number;
  currency: string;
}

interface RouteResponse {
  statusCode: number;
  body: unknown;
}

// Stub: replace with e.g. `import { handleCreatePayment } from '../handler'`
async function handleCreatePayment(
  input: { amount: number; currency: string },
  fetch: typeof globalThis.fetch,
): Promise<RouteResponse> {
  if (!input.currency || typeof input.amount !== 'number') {
    return { statusCode: 400, body: { error: 'invalid_input' } };
  }
  let raw: Response;
  try {
    raw = await fetch('https://payments.example.com/v1/charges', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  } catch {
    return { statusCode: 502, body: { error: 'upstream_unreachable' } };
  }
  if (!raw.ok) {
    return { statusCode: 502, body: { error: 'upstream_non_200', upstreamStatus: raw.status } };
  }
  let json: unknown;
  try {
    json = await raw.json();
  } catch {
    return { statusCode: 422, body: { error: 'upstream_unparseable' } };
  }
  const data = json as Record<string, unknown>;
  if (!data.id) {
    return { statusCode: 500, body: { error: 'missing_required_key', key: 'id' } };
  }
  return {
    statusCode: 200,
    body: {
      paymentId: data.id,
      status: data.status,
      amount: data.amount,
      currency: data.currency,
    } satisfies PaymentResult,
  };
}

// ---------------------------------------------------------------------------
// MOCK UPSTREAM RESPONSE
// ---------------------------------------------------------------------------
// This is the "cassette" — what the external API returns. Only include the
// fields YOUR code reads. Extra fields the API returns are ignored; asserting
// on them couples your test to the provider's internal implementation.
//
// WHY LOOSE MATCHERS:
//   Exact string values (e.g. exact `paymentId` UUID) tie the test to
//   incidental data, not behavior. `expect.objectContaining` asserts only the
//   keys and types that your domain logic depends on. A provider can add fields
//   without breaking your consumer. (Pact calls this "like()" matchers — same
//   principle, same reason.)
// ---------------------------------------------------------------------------

const MOCK_UPSTREAM_SUCCESS: Record<string, unknown> = {
  id: 'ch_test_abc123',        // YOUR code maps this → paymentId
  status: 'pending',
  amount: 5000,                 // cents
  currency: 'usd',
  // upstream may return many more fields; your handler ignores them
  created: 1717776000,
  livemode: false,
};

describe('POST /payments — contract (I/O seam, mocked upstream)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // HAPPY PATH — shape assertion, not exact body
  // Assert the KEYS and TYPES your code produces, not the literal values.
  // This guards against YOUR mapping logic (id → paymentId, etc.) while
  // staying robust to incidental value changes.
  // -------------------------------------------------------------------------
  it('200 — returns the expected shape when upstream succeeds', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => MOCK_UPSTREAM_SUCCESS,
    } as Response);

    const res = await handleCreatePayment({ amount: 5000, currency: 'usd' }, fetchMock);

    expect(res.statusCode).toBe(200);
    // Shape assertion: does the handler map the upstream fields correctly?
    expect(res.body).toMatchObject({
      paymentId: expect.any(String),  // mapped from upstream `id`
      status: expect.stringMatching(/^(pending|succeeded|failed)$/),
      amount: expect.any(Number),
      currency: expect.any(String),
    });
    // Business invariant: amount must round-trip without sign change
    expect((res.body as PaymentResult).amount).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // MISSING KEY → 500
  // What if the upstream omits a field YOUR handler requires?
  // This is the "silent contract break" scenario — the provider ships a change,
  // your handler reads undefined, and the response looks wrong to the client.
  // Gate on this so the contract break is caught at this tier, not in prod.
  // -------------------------------------------------------------------------
  it('500 — upstream response missing required key `id`', async () => {
    const malformedResponse = { ...MOCK_UPSTREAM_SUCCESS };
    delete (malformedResponse as Record<string, unknown>).id;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => malformedResponse,
    } as Response);

    const res = await handleCreatePayment({ amount: 5000, currency: 'usd' }, fetchMock);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: 'missing_required_key' });
  });

  // -------------------------------------------------------------------------
  // BAD INPUT → 400
  // YOUR validation, not the upstream's. The upstream is never called.
  // Test the invariant (statusCode 400 + an error field), not the exact message.
  // -------------------------------------------------------------------------
  it('400 — rejects missing currency without calling upstream', async () => {
    const res = await handleCreatePayment({ amount: 5000, currency: '' }, fetchMock);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
    // Upstream was never reached — our validation fired first
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // UPSTREAM NON-200 → 502
  // The upstream is reachable but returns an error. YOUR handler must not
  // propagate a raw upstream error body — it must translate it to a safe shape.
  // -------------------------------------------------------------------------
  it('502 — upstream 402 maps to a safe 502 (no raw upstream body leaked)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 402,
      json: async () => ({ error: 'payment_required', internal_trace: 'sensitive' }),
    } as Response);

    const res = await handleCreatePayment({ amount: 5000, currency: 'usd' }, fetchMock);

    expect(res.statusCode).toBe(502);
    // Assert shape, not exact message — and verify no internal_trace is leaked
    expect(res.body).toMatchObject({ error: expect.any(String) });
    expect(JSON.stringify(res.body)).not.toContain('internal_trace');
  });

  // -------------------------------------------------------------------------
  // UNPARSEABLE UPSTREAM BODY → 422
  // The upstream returns 200 but the body is not valid JSON (e.g. a CDN error
  // page, a truncated response). YOUR handler must not throw; it must degrade
  // to a client-visible 422 so the caller can retry or surface the issue.
  // -------------------------------------------------------------------------
  it('422 — upstream returns 200 with non-JSON body (e.g. CDN error page)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    } as unknown as Response);

    const res = await handleCreatePayment({ amount: 5000, currency: 'usd' }, fetchMock);

    expect(res.statusCode).toBe(422);
    expect(res.body).toMatchObject({ error: 'upstream_unparseable' });
  });
});
