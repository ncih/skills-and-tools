# Production Parity & Migration Testing

**When to read this:** handling DB migrations, schema changes, ephemeral environments, post-deploy smoke, canary releases, or any out-of-code deliverable that must reach prod. Cross-links: `ci-gating-for-agents.md` (gate ordering, scope contracts), `ac-classification.md` (PRODUCTION-ONLY routing).

**Contents**
1. [The structural blind spot of full-reset integration tests](#1-the-structural-blind-spot)
2. [Engine parity: Testcontainers, not :latest or in-memory substitutes](#2-engine-parity)
3. [Expand-contract: the three-deployment pattern](#3-expand-contract)
4. [Decouple migrations from app startup](#4-decouple-migrations)
5. [Migration linting](#5-migration-linting)
6. [Schema-drift detection](#6-schema-drift-detection)
7. [Ephemeral/preview environments seeded from masked prod](#7-ephemeralpreview-environments)
8. [Gate deploy with smoke; gate release with canary](#8-deploy-smoke--release-canary)
9. [Authoring a migration ≠ delivering it](#9-authoring--delivering)

---

## 1. The structural blind spot

A test that runs `db reset` (or the equivalent — `schema migrate --from-zero`, `truncate all`, fresh fixtures) then applies migrations **verifies "migrates from zero."** That is a state prod never starts from.

What a full-reset integration test cannot see:
- A migration that is syntactically correct but incompatible with **accumulated prod data** (type coercions that fail on real values, NOT NULL constraints on columns that have NULLs in prod, index builds that lock a table already holding millions of rows).
- A migration that was **authored and committed but never deployed** — the worked example's most common escape: correct code, undeployed schema. Every gate that resets from zero never touches the applied-log gap.
- **Cumulative drift** between what the migration tool's applied-log claims and what is actually on the prod database (see §6).

The fix is structural: **test each migration starting from the previous prod schema**, restored from a snapshot or dump, not from an empty DB. This makes the integration test exercise the *actual* transition prod will undergo.

Classify any AC that requires verifying against accumulated prod state as `PRODUCTION-ONLY` (see `ac-classification.md`). These ACs cannot be signed off from a local gate that resets to zero; they need the prod-snapshot integration path described here, or a canary observation window (§8).

---

## 2. Engine parity

Pin Testcontainers (or any container-based DB fixture) to the **exact prod engine version**: `postgres:15.2`, not `postgres:15`, not `postgres:latest`. Patch-level differences in Postgres have broken index behavior and query plans in production while the test suite stayed green.

Two anti-patterns to prohibit:
- **`:latest` image tags** — silent version drift; the test suite "upgrades" the DB without a decision being made.
- **In-memory substitutes when prod isn't that engine** — H2 for a Postgres-backed app, SQLite for a MySQL app. These diverge on: `JSONB` operators, advisory locks, `RETURNING`, window functions, generated columns, and full-text search. A test that passes on H2 proves nothing about Postgres.

If your CI environment cannot run a container, the integration tier is **BLOCKED** for those ACs; mark it in the Environment Matrix and route to the prod-snapshot path or canary observation only.

---

## 3. Expand-contract (three-deployment pattern)

Every schema change that removes or renames a column (or changes a column's type in a way that breaks existing readers) is a **breaking change** if both the old and new app versions read the same live DB during a rolling deploy.

The pattern — sometimes called "parallel change" — makes breaking changes non-breaking by splitting them across three deploy windows:

| Deployment | Schema | App reads | App writes |
|---|---|---|---|
| **1 — Expand** | Add new column (nullable), keep old | Old column | Both old + new (dual-write) |
| **2 — Backfill + migrate reads** | Backfill new column for existing rows | New column | Both |
| **3 — Contract** | Drop old column | New column only | New column only |

Rules:
- Never combine expand and contract into one deploy. A migration that adds and drops in the same transaction is a zero-downtime illusion — it still forces all-or-nothing cutover.
- Do not drop the old column until all app instances that read it have drained. On Kubernetes/ECS this means waiting for the old deploy to fully roll out in step 2 before issuing step 3.
- Non-nullable columns: make them nullable in step 1, backfill in step 2, add the NOT NULL constraint in step 3 (or in step 2 with a fast `ALTER TABLE … SET NOT NULL` once NULLs are gone — Postgres 12+ validates this without a full table lock if you add a `CHECK (col IS NOT NULL)` as `NOT VALID` first).

---

## 4. Decouple migrations from app startup

Running `run_migrations()` inside `app.listen()` (or the ORM's equivalent auto-migrate on boot) creates two failure modes:
1. **Multi-pod race** — if three replicas boot simultaneously, they all try to acquire the migration advisory lock. This is safe only if your migration tool is genuinely safe under concurrent runners; many are not.
2. **Mixed lifecycle** — a failed deploy that rolls back the app binary does *not* roll back the migration already applied. You now have a prod DB in a state no running app version was designed for.

Run migrations as a **sequenced CI/CD job** (a Kubernetes Job, a deploy hook, or a CI step) that completes and is verified before the app container is updated. This makes the migration an auditable, reversible, independently observable step rather than a side-effect of app startup.

---

## 5. Migration linting

Block migrations at author-time (pre-commit hook or CI lint step) before they reach any environment. Squawk (Postgres) and equivalents for other engines catch the highest-impact classes:

| Pattern | Why it blocks |
|---|---|
| `CREATE INDEX` without `CONCURRENTLY` | Full table lock; blocks writes for minutes on large tables |
| `ALTER TABLE … ADD COLUMN col NOT NULL` without a default | Full table rewrite on older Postgres; immediate constraint failure on existing rows |
| `ALTER TABLE … SET NOT NULL` on a column with existing NULLs | Fails outright; prod has NULLs, test-from-zero does not |
| `DROP TABLE` / `DROP COLUMN` without prior expand step | Breaking change if old app version is still live |
| `TRUNCATE` in a migration | Irreversible; blocks prod restore |
| Non-idempotent `CREATE TABLE` (missing `IF NOT EXISTS`) | Breaks re-runs and multi-runner safety |
| Lock-acquiring ops (e.g. `ALTER TABLE … ADD CONSTRAINT FOREIGN KEY`) on tables over a configurable row-count threshold | Long lock; causes query queuing in prod |

Linting does not replace prod-snapshot testing (§1) — it catches authoring mistakes before they propagate. See `ci-gating-for-agents.md` for gate ordering: lint runs at the same stage as static analysis, before any container spin-up.

---

## 6. Schema-drift detection

The migration tool's applied-log (`schema_migrations`, `flyway_schema_history`, or equivalent) records *which migration files were run*, not *what the DB actually looks like*. These diverge when:
- A migration was applied manually in an emergency hotfix and never committed.
- A migration file was retroactively edited after being applied.
- A DBA made a structural change directly on the prod instance.

Run a **schema-diff tool** (Atlas `schema diff`, Liquibase `diff`, `pg_dump | diff`) as a **post-deploy check** that compares the live schema against the version-controlled target. Do not trust the applied-log alone.

This check belongs in the post-deploy smoke stage (§8), not in the pre-deploy CI gate — it requires a live prod (or staging) DB to compare against. When drift is detected:
1. Stop the release (if caught in staging, block promotion; if in prod, page the on-call).
2. Determine whether the drift is the source of truth (a fix that never got committed) or an error (a rogue hotfix).
3. Reconcile the migration file and the DB; never silently accept drift.

---

## 7. Ephemeral/preview environments

For any schema change, contract change, or multi-service dependency change, a **PR-scoped ephemeral environment** seeded from masked prod data is the most useful pre-merge gate. It exercises the *actual* transition (§1) without requiring access to prod, and gives reviewers a real URL to click through.

Two requirements that are easy to violate:

**Seed from a masked prod snapshot, not an empty schema.** An empty schema defeats the point entirely — you are back to "migrates from zero." The masking step (PII scrubbing, synthetic email/phone replacement) is a compliance necessity, not optional. Tooling: `pgsync` + anonymization, `pg_anonymizer`, or a purpose-built data-masking pipeline. Establish the masked-snapshot pipeline early; retrofitting it is expensive.

**Pin the snapshot age.** A snapshot older than a configurable window (default: 7 days) may have drifted enough to hide real compatibility issues. Fail the ephemeral env provision if the snapshot is stale; force a refresh.

For B0/B1 apps where the schema is simple and stable, an ephemeral env is disproportionate overhead. The proportionality check: does the schema change touch a table with significant prod data volume or accumulated nullable columns? If yes, the ephemeral env earns its cost.

---

## 8. Deploy smoke & release canary

Two distinct gates often collapsed into one term:

**Post-deploy smoke** — runs immediately after the new artifact is live (before real traffic is shifted), against the **real deployed artifact** (not the build artifact, not the container image in isolation). It verifies the artifact actually booted, reached the DB, and can serve a minimal synthetic request. Failures here mean the deploy itself is broken; roll back immediately. A passing smoke gate means "the artifact started" — not "it works correctly at scale."

**Release canary** — gates shifting real traffic to the new version. Run canary over a **window** (minutes to hours, depending on traffic volume and blast radius). The critical mistake is measuring aggregate metrics that pool old and new traffic: a canary error spike is invisible in aggregates if old-version traffic is dominant. Use **per-version metrics** (Datadog facet by `version` tag, Prometheus label, OTel resource attribute). Gate on:
- Error rate < threshold (e.g. 0.1% for a payment path; 1% for a low-stakes read path — set per-AC, not globally)
- p95 latency within +10% of the previous version's baseline
- Any business metric the feature is supposed to move (e.g. conversion rate, not just error rate)

Rollback is a **feature-flag toggle**, not a re-deploy. Every B2/B3 feature should ship behind a flag so rollback is a config change, not a 10-minute pipeline run. This is especially important for migrations: the app must be able to run against both the pre-contract and post-contract schema (§3, step 2) so the flag can be toggled without a schema rollback.

For B0/B1 apps, a post-deploy smoke is sufficient; a formal canary window is proportionate only when traffic volume makes per-version metrics meaningful (typically >100 req/min sustained).

---

## 9. Authoring a migration ≠ delivering it

The most persistent escape class in the worked example: **every gate was green because the migration was written and committed but never deployed to the environment being tested.** The code was correct; the schema was not there.

Out-of-code deliverables — anything that must reach a running environment separately from the app binary — are **invisible to local and CI gates by construction**. They include:

| Deliverable | Why local gates miss it |
|---|---|
| DB migrations | Require a real DB + a migration runner invocation; reset-from-zero tests never see the "not yet applied" state |
| Environment variables / secrets | The test suite has its own `.env`; prod has a secrets manager entry that may not match |
| Feature-flag configuration | Local may have the flag on; prod may not |
| Auth provider config (OAuth redirect URIs, SAML metadata) | Configured in a dashboard; no code change required; no CI step validates it |
| Dashboard / 3rd-party integrations | Stripe webhook endpoints, Datadog monitors, CDN rules — configured outside the repo |

Track these as a **blocking pre-UAT deploy checklist** — a named list of out-of-code deliverables per feature, verified against prod (or the target environment) before UAT begins. This is not a nice-to-have; it is the structural fix for the "correct code, undeployed schema" failure class.

Implementation: add an `out-of-code-deliverables` section to the feature spec (in `specs/NNN-*/spec.md` or equivalent). For each deliverable, name the environment variable key, migration file, or config location, and record the person/step responsible for applying it. The deploy step verifies each one is applied before promoting. This makes the invisible visible — and blockable.

See `ci-gating-for-agents.md` for how to wire this as a hard gate in the deploy pipeline, and `ac-classification.md` for tagging the relevant ACs as `PRODUCTION-ONLY` so the agent cannot sign them off from a local run.
