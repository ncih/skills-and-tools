/**
 * TIER: Integration (real DB + auth + RLS)
 *
 * WHAT THIS TIER CATCHES
 *   Real schema, FK constraints, auth wiring, Row-Level Security denials,
 *   and the mismatch between "works in unit mocks" vs "the real DB rejects this."
 *
 * WHAT THIS TIER IS BLIND TO
 *   State drift from accumulated prod data and from migrations that were authored
 *   but never deployed. A clean db-reset runs your migration from zero — prod
 *   never starts from zero. See the CRITICAL comment below.
 *
 * HOW TO USE THIS TRACER
 *   1. Copy alongside your feature under test. Keep the file co-located
 *      (`src/features/billing/__tests__/billing.integration.test.ts`).
 *   2. Replace the stub client, seed rows, and assertions with real ones.
 *   3. Ensure `vitest.config.integration.ts` targets environment: 'node'
 *      and does NOT run in the same job as your unit tests (different
 *      retry budget: integration gets 2 retries, unit gets 0).
 *   4. Guard with skipIf so the job fails-clean when secrets are absent
 *      (see below) — never let a missing secret produce a false-positive skip
 *      that the agent treats as "passed."
 *
 * REQUIRED ENV KEYS (set in CI secrets; never commit values):
 *   INTEGRATION_DB_URL   — full connection string to the integration DB
 *   INTEGRATION_SERVICE_KEY — service-role key that bypasses RLS (seeding only)
 *   INTEGRATION_ANON_KEY    — anon key; tenant-scoped JWTs derived from this
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// SKIP GUARD — cheapest durable home for "don't run without secrets"
// ---------------------------------------------------------------------------
// skipIf runs at collection time, before any beforeAll. The test file appears
// in output as "skipped", which is unambiguous: the agent sees it, the human
// sees it, and CI does NOT report it as green. Never use a runtime guard
// (if (!process.env.X) return) — that produces a silent pass.
// ---------------------------------------------------------------------------

const DB_URL = process.env.INTEGRATION_DB_URL;
const SERVICE_KEY = process.env.INTEGRATION_SERVICE_KEY;
const ANON_KEY = process.env.INTEGRATION_ANON_KEY;

const missingSecrets = !DB_URL || !SERVICE_KEY || !ANON_KEY;

// ---------------------------------------------------------------------------
// STUB CLIENTS — replace with your real DB client / auth library
// These stubs are illustrative; the patterns (service vs anon, JWT scoping)
// are what to copy, not the no-op implementations.
// ---------------------------------------------------------------------------

interface Row { id: string; tenant_id: string; amount: number }
interface Client { insert: (t: string, r: object) => Promise<void>; query: (sql: string, p?: unknown[]) => Promise<Row[]> }

function createServiceClient(_url: string, _key: string): Client {
  // Illustrative: real impl would be e.g. createClient(url, key, { auth: { autoRefreshToken: false } })
  return { insert: async () => {}, query: async () => [] };
}

function createAnonClient(_url: string, _key: string, _tenantJwt: string): Client {
  // Anon client scoped to a tenant JWT — this is what your app uses at runtime.
  return { insert: async () => {}, query: async () => [] };
}

// ---------------------------------------------------------------------------
// DETERMINISTIC SEED DATA
// ---------------------------------------------------------------------------
// Use fixed UUIDs, not crypto.randomUUID(). Random IDs make teardown fragile
// and make re-runs in a dirty DB non-idempotent.
// ---------------------------------------------------------------------------

const TENANT_A_ID  = '00000000-0000-0000-0000-000000000001';
const TENANT_B_ID  = '00000000-0000-0000-0000-000000000002';
const INVOICE_A_ID = '10000000-0000-0000-0000-000000000001';
const INVOICE_B_ID = '10000000-0000-0000-0000-000000000002';

// ---------------------------------------------------------------------------
// CRITICAL: PROD-SHAPED STATE, NOT A CLEAN RESET
// ---------------------------------------------------------------------------
// This suite must run against a DB that has already had all migrations applied
// in sequence from the previous prod schema version — NOT from a fresh `db reset`.
// A full reset only tests "migrates from zero," which prod never does.
// Migration drift (authored but not deployed) is invisible to a reset-based test;
// it is visible here only if the DB started from a realistic prior state.
//
// Recommended CI setup:
//   1. Restore a masked prod snapshot (or a version-stamped baseline dump).
//   2. Run pending migrations on top of that snapshot.
//   3. Run this suite.
//   4. Tear down.
//
// If your CI starts from a clean schema, document that in qa-plan.md under
// Environment Matrix as "BLIND TO: migration drift from prod state" and route
// that gap to a prod-smoke / canary tier.
// ---------------------------------------------------------------------------

describe.skipIf(missingSecrets)(
  'Invoice RLS — integration (real DB)',
  () => {
    let service: Client;
    let tenantAClient: Client;
    let tenantBClient: Client;

    beforeAll(async () => {
      if (missingSecrets) return; // belt-and-suspenders; skipIf is the real guard

      service = createServiceClient(DB_URL!, SERVICE_KEY!);
      // Derive tenant-scoped JWTs from the anon key; in real Supabase this is
      // done via signInWithPassword or a test helper that mints a JWT with
      // sub=<user_id> and app_metadata.tenant_id=<tenant>.
      tenantAClient = createAnonClient(DB_URL!, ANON_KEY!, `jwt-for-${TENANT_A_ID}`);
      tenantBClient = createAnonClient(DB_URL!, ANON_KEY!, `jwt-for-${TENANT_B_ID}`);

      // Seed: use service role (bypasses RLS) so we control state exactly.
      // Upsert, not insert — idempotent across re-runs in a dirty DB.
      await service.insert('invoices', { id: INVOICE_A_ID, tenant_id: TENANT_A_ID, amount: 100 });
      await service.insert('invoices', { id: INVOICE_B_ID, tenant_id: TENANT_B_ID, amount: 200 });
    });

    afterAll(async () => {
      if (!service) return;
      // Teardown: clean up seeded rows. Use service role; a tenant client
      // can't delete its own rows if RLS restricts deletes.
      await service.query(
        'DELETE FROM invoices WHERE id = ANY($1)',
        [[INVOICE_A_ID, INVOICE_B_ID]],
      );
    });

    // -----------------------------------------------------------------------
    // INVARIANT 1: row exists and shape is correct
    // Gate on structure (id, amount type, count in range) — NOT on exact prose
    // or volatile fields (timestamps, version numbers). This is an invariant
    // gate, not an exact-match snapshot. Over-strict assertions reject correct
    // code and teach the agent to game or disable the test.
    // -----------------------------------------------------------------------
    it('tenant A can read their own invoice and the amount is numeric', async () => {
      const rows = await tenantAClient.query(
        'SELECT id, amount FROM invoices WHERE id = $1',
        [INVOICE_A_ID],
      );

      // Invariant: row exists
      expect(rows).toHaveLength(1);

      const [row] = rows;
      // Invariant: amount is a finite number in a sane business range
      expect(typeof row.amount).toBe('number');
      expect(row.amount).toBeGreaterThan(0);
      expect(row.amount).toBeLessThanOrEqual(1_000_000); // adjust per domain

      // Invariant: no cross-tenant field leaked into the response
      expect(row.tenant_id).toBe(TENANT_A_ID);
    });

    // -----------------------------------------------------------------------
    // INVARIANT 2: count in range (seed may coexist with pre-existing rows)
    // Use toBeGreaterThanOrEqual rather than exact count — prod-shaped state
    // may have rows from prior test runs or baseline data. Exact counts are
    // over-strict in a non-fresh DB and will flake.
    // -----------------------------------------------------------------------
    it('tenant A sees at least their seeded invoice but no more than expected ceiling', async () => {
      const rows = await tenantAClient.query(
        'SELECT id FROM invoices WHERE tenant_id = $1',
        [TENANT_A_ID],
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.length).toBeLessThan(1000); // sentinel: > 1000 means seed leaked
    });

    // -----------------------------------------------------------------------
    // INVARIANT 3: RLS denies cross-tenant read
    // This is the test unit tests cannot cover — RLS is a DB-enforced policy.
    // A mock that returns [] proves nothing; a real DB that applies the policy
    // and returns [] is the invariant.
    // -----------------------------------------------------------------------
    it('tenant B cannot read tenant A invoice (RLS hard denial)', async () => {
      const rows = await tenantBClient.query(
        'SELECT id FROM invoices WHERE id = $1',
        [INVOICE_A_ID],
      );
      // RLS must return zero rows — not an error, not a partial result.
      expect(rows).toHaveLength(0);
    });
  },
);
