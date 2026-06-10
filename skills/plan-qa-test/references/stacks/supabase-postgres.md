# Supabase / Postgres — Integration & Migration Testing

**When to read this:** writing or auditing the integration tier for any Supabase or bare-Postgres backend — including auth, Row Level Security (RLS), migrations, schema drift, and the state-drift failure class. This is the stack-specific companion to `prod-parity-and-migration.md`; the generic patterns live there. This file narrows to Supabase's toolchain and Postgres specifics.

**Contents**
1. [Why this stack owns the state-drift failure class](#1-state-drift-the-home-failure-class)
2. [The canonical integration runner pattern](#2-canonical-runner-pattern)
3. [Exercising auth and RLS — not mocking them](#3-auth-and-rls)
4. [Migration testing against the previous prod schema](#4-migration-testing)
5. [Expand-contract and timestamp generation](#5-expand-contract-and-timestamps)
6. [Testcontainers-postgres as the portable alternative](#6-testcontainers-postgres)
7. [Schema-drift detection](#7-schema-drift-detection)
8. [Introspecting RLS safely](#8-introspecting-rls-safely)

---

## 1. State-drift: the home failure class

The state-drift failure class (see `failure-classes-and-ladder.md`) is most common and most dangerous in Supabase/Postgres projects because the dominant local workflow — `supabase db reset` — is structurally the opposite of prod state.

`db reset` applies every migration from a clean schema. Prod never starts from a clean schema; it has:
- Accumulated rows, including rows that violate constraints added after those rows were inserted.
- Nullable columns that later migrations assumed would be NOT NULL.
- A migration applied-log that may not match the live schema (manual hotfixes, edited migration files).
- RLS policies that depend on real user and tenant data shapes.

A green integration test on a reset DB proves "migrates from zero" — a state prod will never be in. This is why the integration tier, run against a reset DB, is **blind to the most common Supabase escape class**. The fix is in §4.

---

## 2. Canonical runner pattern

Run the integration tier against a **real local Supabase stack or a Testcontainers-postgres instance** (§6), never against a mock or in-memory substitute. The pattern:

```sh
# 1. Start the stack (local Supabase or docker compose)
supabase start          # or: docker compose up -d postgres

# 2. Export the local service keys — never read from .env.prod or any prod secret
export SUPABASE_URL="$(supabase status --json | jq -r .api_url)"
export SUPABASE_ANON_KEY="$(supabase status --json | jq -r .anon_key)"
export SUPABASE_SERVICE_ROLE_KEY="$(supabase status --json | jq -r .service_role_key)"

# 3. Run the integration suite
vitest run --project integration     # or: jest --testPathPattern=integration

# 4. Tear down (or leave up for dev speed; reset between test runs if state isolation is needed)
supabase stop
```

**Never read prod secrets in CI for the integration tier.** The integration tier authenticates against the local or containerized stack using the keys the stack itself exports. If a test needs a prod-only secret to run, that test is mis-tiered — classify the AC as `PRODUCTION-ONLY` and route it to shift-right observability (see `ac-classification.md`).

Opt-in in CI with an environment key so the tier skips cleanly when the local stack is unavailable:

```ts
// vitest.config.ts (integration project)
export default defineConfig({
  test: {
    include: ['**/*.integration.test.ts'],
    testTimeout: 30_000,
    // skip the whole tier if the stack hasn't been started
    globalSetup: './test/integration/global-setup.ts',
  },
})
```

```ts
// test/integration/global-setup.ts
export async function setup() {
  if (!process.env.SUPABASE_URL) {
    console.warn('SUPABASE_URL not set — skipping integration tier')
    process.exit(0)   // or use vitest's skip mechanism
  }
}
```

---

## 3. Auth and RLS

The point of an integration tier against a real Supabase stack is to exercise the **authed path through RLS**, not just the DB schema. A test that connects as the `service_role` key and bypasses RLS is testing Postgres logic, not your security model. Both are valid — but they answer different questions.

**Pattern: test as a real user, not as service_role.** Use `auth.admin.createUser` to mint a test user, take the returned `access_token`, and construct a second Supabase client that passes it as a Bearer header. Queries from that client run through RLS as a real authenticated user.

**What to gate on:**
- That a user can read/write their own rows — returns data, no error.
- That a user cannot read another tenant's rows — returns empty array (RLS filtering), no error. Gate on `data.length === 0`, not on an error, because RLS filters silently.
- That an unauthenticated client gets a 401 or empty data, depending on your policy.

**What not to gate on:** the specific SQL a policy executes — that couples the test to implementation. Test *behavior* (can Alice see Bob's rows?), not *mechanism* (is the policy using `auth.uid()` or `auth.jwt()`?).

**Seed data lifecycle:** create all test users and rows within the test or a `beforeAll` block, UUID-namespaced per run. Clean up in `afterAll`. Never depend on seed data another test inserted — that is a test-order dependency.

---

## 4. Migration testing against the previous prod schema

The correct discipline is in `prod-parity-and-migration.md §1–2`. Supabase-specific mechanics:

**Take a pre-migration snapshot** (`pg_dump --schema-only`) before applying the new migration and commit it as a test fixture. In CI, restore that snapshot, then run `supabase migration up --local` to apply *only* the new migration — simulating the actual prod transition. This catches the failure class `db reset` misses: a migration that is syntactically valid but semantically broken against accumulated prod data shapes. A common Supabase example: a migration that adds `NOT NULL` to a column that has `null` rows in prod but not in a freshly seeded local DB.

**Generate migration timestamps; never hardcode them.** Use `supabase migration new <name>` and let the CLI write the timestamp prefix. Hardcoded timestamps collide in teams, drift in CI, and break cherry-picks between branches.

---

## 5. Expand-contract and timestamps

The three-deployment expand-contract pattern (see `prod-parity-and-migration.md §3`) applies directly to Supabase schemas. Supabase-specific considerations:

- **RLS policies must be updated in step 1 (expand)** if the new column needs to be visible to a policy expression. A policy that references only the old column will silently exclude the new column from user-visible data even after the column exists.
- **Generated columns** (`GENERATED ALWAYS AS`) are not supported by all Postgres-compatible drivers; test the driver behavior, not just the Postgres behavior.
- **Supabase realtime** subscriptions may need policy updates when column visibility changes — verify that a subscribed user receives updates on the new column after step 1.

Never combine expand and contract in a single Supabase migration file. The migration runner applies them atomically; if the old app version is still live during the rollout, it will fail to read the now-removed column.

---

## 6. Testcontainers-postgres (portable alternative)

When the CI environment cannot run the full Supabase stack (Docker-in-Docker constraints, cost, startup time), Testcontainers-postgres is the portable substitute for the Postgres layer. It does not replicate Supabase Auth, Storage, or Realtime — scope it accordingly.

**Pin to the exact prod engine version:** `new PostgreSqlContainer('postgres:15.6')` — not `15`, not `latest`. Patch-level differences in Postgres have caused index-behavior and query-plan changes that `:latest` pulls silently introduce. Pin `major.minor.patch` and update deliberately as prod upgrades.

**What Testcontainers covers / does not cover:**
| Covers | Does not cover |
|---|---|
| Postgres query behavior, indexes, constraints | Supabase Auth JWT validation |
| Migration application and schema transitions | Row Level Security (needs `auth.uid()` context) |
| Application queries, transactions, advisory locks | Supabase Realtime, Storage, Edge Functions |
| Schema drift between app versions | OAuth / magic-link flows |

For RLS testing, the local Supabase stack (§2) is required. Use Testcontainers for the pure-Postgres layer and reserve the full stack for auth/RLS tests.

---

## 7. Schema-drift detection

The Supabase migration applied-log (`supabase_migrations.schema_migrations`) records which migration files ran. It does not reflect manual changes made via the Supabase Dashboard, SQL editor, or emergency hotfixes applied directly to the DB.

Run a schema diff as a **post-deploy check**, not a pre-deploy gate (it needs a live DB). Use `atlas schema diff --from <prod-db> --to file://supabase/migrations`, or a simpler `pg_dump --schema-only | diff` between prod and the locally-migrated state. When drift is detected: stop the release, determine whether the drift is authoritative (a fix never committed) or an error (a rogue hotfix), reconcile before promoting. See `prod-parity-and-migration.md §6` for the response protocol.

---

## 8. Introspecting RLS safely

The Postgres catalog tables for RLS (`pg_policies`, `pg_class`, `pg_roles`) are useful for assertion-level checks — verifying that a policy exists after a migration, or that a table has RLS enabled. Two catalog-specific pitfalls:

**Avoid `oid`-typed columns in catalog assertions.** Several catalog views (`relacl`, `proacl`) return `oid[]` columns that serialize differently across Postgres versions and drivers — brittle in assertions. Query only string-typed columns: `policyname`, `cmd`, `qual` from `pg_policies`; `tablename`, `tableowner` from `pg_tables`. 

**Avoid `information_schema.columns` for RLS-sensitive checks.** `information_schema` applies privilege filtering based on the current role, which can make columns invisible. Use `pg_catalog` views directly and connect as a superuser for catalog introspection.

**Gate on the presence and command of a policy, not its SQL expression.** `policyname` and `cmd` (`SELECT`, `INSERT`, etc.) are stable. The `qual` expression is an implementation detail — test it through behavior (§3), not a catalog assertion that couples the test to exact policy SQL.

---

Cross-reference: `prod-parity-and-migration.md` for the generic discipline (snapshot testing, expand-contract, decouple migrations from startup, migration linting, canary gating). This file is the Supabase/Postgres layer on top of that foundation.
