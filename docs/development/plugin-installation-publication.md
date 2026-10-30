# Plugin installation publication

Issue: [#1264](https://github.com/xpert-ai/xpert/issues/1264).

Refresh keeps the last committed `plugin_instance` row and its runtime files available to concurrent startup. Runtime strategy removal uses the `refresh` cause; only a genuine uninstall deletes the registration and version directories.

## Publication boundary

1. Hold the existing shared-volume installation lease across preparation, registration and publication. Uninstall uses the same lease.
2. Prepare each candidate in a host-generated runtime directory. Registry and code installations both persist its `runtimeName` and `immutableRuntime` contract in `sourceConfig`. A completion receipt is written after staging. Immutable candidates do not replace the legacy filesystem discovery manifest; startup selects them from the committed database record.
3. Complete applicable import, registration, schema and lifecycle checks. Save the new installation and `runtimePublication` intent in one PostgreSQL transaction, checking lease ownership before writing and before commit. Startup readers see the old committed row until commit, then the complete replacement.
4. Publish the runtime requirement with the durable publication ID. Redis records its receipt atomically with the cumulative generation manifest. Replaying an ambiguous reply does not create another generation. Acknowledge only the matching database intent.
5. On startup and periodically thereafter, `PluginPublicationRecovery` replays remaining intents under the same lease. Intent identity and scope are validated against their owning row. New installs replay earlier pending intents first. Explicit `deferActivation` staging does not create an automatic publication intent.

A registration failure leaves an existing installation unchanged. Candidate cleanup only removes that operation's private directory, and never runs after a database publication attempt: a lost database reply may have committed. Such orphan candidates and superseded artifacts are conservatively retained until explicit uninstall. There is deliberately no eager garbage collection while another boot may still hold an older startup snapshot.

An immutable startup restore never rebuilds from a changed workspace or substitutes another registry artifact. A missing receipt/artifact is a startup failure and retains strict runtime admission. Legacy rows continue through the legacy staging path until refreshed.

The nullable `runtimePublication` JSONB column and the partial pending-publication index are TypeORM-managed and are applied by the existing `schema-sync` deployment step. Deploy the matching host code and schema. A mixed rollout containing old writers still capable of deleting refresh registrations does not provide the new invariant.

This boundary guarantees a recoverable startup installation. It does not make arbitrary plugin bootstrap side effects or the live Nest module graph transactional; a failed hot replacement may require restarting that process from the retained installation.

## Recovery polling cost

Normal installation publishes immediately; background polling only repairs interrupted or failed publication. Bootstrap performs an immediate check. Consecutive empty checks increase the delay ceiling through 10, 20, 40 and 60 seconds. Each delay is randomized across 80–100% of its ceiling to spread replica traffic. Finding pending work or encountering an error resets the ceiling to 10 seconds. Delays begin after a pass completes, so slow passes do not overlap, and shutdown cancels future checks.

The idle query uses `EXISTS` and a partial index on `updatedAt` where `runtimePublication IS NOT NULL`. It does not load plugin records or acquire the filesystem lease. Replay under the lease reads only scope, plugin name and publication intent, excluding plugin configuration. At sustained idle, each process performs approximately 1–1.25 checks per minute. A pending publication missed just after an idle check may wait up to 60 seconds before the next check starts, plus query/lock/processing time.

## Regression coverage

- Paused replacement registration with an independent PostgreSQL startup reader; organization, global and system scopes.
- Uncommitted writes, a killed writer connection, and lease loss during the database transaction.
- Failed registration, ambiguous commit replies and failed runtime publication, including preservation of old files.
- Recovery in a replacement service from persisted intent; acknowledgement cannot clear a newer intent.
- Redis publication replay after an acknowledgement loss; cumulative requirements across scopes and existing strict admission/serial rollout regressions.
- Cross-process registry staging, immutable startup restore, missing artifacts, and genuine uninstall.
- Recovery provider bootstrap, periodic retry and shutdown; refresh scope resolution without an explicit scope key.
- Idle backoff, jitter bounds, retry reset, no overlapping polls and shutdown during a pending query; PostgreSQL existence-query index eligibility and publication-only projection.

Validated on 2026-10-30: all 31 targeted suites and 307 tests passed, including disposable PostgreSQL and Redis integration tests. `corepack pnpm exec nx build api --configuration=development` also passed (three existing dynamic-require webpack warnings).

The subsequent polling optimization passed all 4 affected suites and 36 tests, including real PostgreSQL checks, and the API development build passed again with the same three warnings. Index eligibility was verified with `EXPLAIN` and sequential scans disabled; this confirms a usable index path, not a production performance benchmark.

Run targeted tests through Corepack. For PostgreSQL tests, set `XPERT_PLUGIN_TEST_DATABASE_URL` to a disposable localhost database named `xpert_plugin_test_1264`. For Redis integration cases, set `RUNTIME_RESTART_TEST_REDIS_URL` to a disposable Redis database; the suite clears that database. Never point either test at a platform database.

```sh
corepack pnpm exec jest --config packages/server/jest.config.ts --runInBand --watchman=false \
  packages/server/src/plugin/plugin-management packages/server/src/plugin/plugin-instance \
  packages/server/src/plugin/plugin-refresh packages/server/src/plugin/plugin.helper.spec.ts \
  packages/server/src/plugin/uninstall packages/server/src/plugin/organization-plugin.store.spec.ts \
  packages/server/src/plugin/installation packages/server/src/runtime-control
```
