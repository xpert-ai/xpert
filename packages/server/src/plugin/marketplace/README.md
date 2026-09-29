# Marketplace cache coordination

API replicas must run the same cache protocol version and connect to the same PostgreSQL database and Redis deployment. The plugin module uses the existing `RedisModule` configuration and `RedisLockService`; no new credentials or cache server configuration is needed.

## Responsibilities

- `plugin-marketplace.service.ts`: request scope, installed-state overlays, source management and response assembly. Tenant/organization-specific loaded metadata is never stored in the public npm or public-catalog caches.
- `plugin-marketplace-shared-cache.ts`: shared value storage, renewable leases, atomic owner-checked publication, negative caching, bounded cold-load waiting and Redis outage handling. Redis Cluster keys for a resource share a hash slot.
- `plugin-marketplace-catalogs.ts`: persistent source snapshots, cheap cold indexing, background enrichment and public-catalog sharing. PostgreSQL `xmin` checks fence both success and failure writes after source edits, deletion or another refresh claim.
- `plugin-marketplace-packages.ts` and `plugin-marketplace-registry.ts`: public npm metadata, bundle manifests, README and download counts; tenant-scoped platform catalog projections. Registry download updates compare the package and prior indexing timestamp and update only download fields.
- `plugin-marketplace-assets.ts`: publishes icon contents before returning their hashes. Asset keys include tenant, organization, source, plugin and target application. Requests recheck current catalog visibility before reading cached bytes. Historical hashes remain available for one day.

## Cache behavior

| Data                                    | Fresh lifetime                                              | Retention / retry                                                    |
| --------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Persisted source catalog                | `XPERT_PLUGIN_MARKETPLACE_CACHE_TTL_MS`, default 10 minutes | PostgreSQL retains the last successful snapshot                      |
| Shared source indexing result           | Same as source catalog                                      | Twice its fresh lifetime                                             |
| Public catalog                          | Same as source catalog                                      | 24 hours, serving stale while refreshing                             |
| npm metadata, bundle, README, downloads | 10 minutes                                                  | Successful values retained for 24 hours; null results for 60 seconds |
| Platform catalog                        | 10 minutes                                                  | 20 minutes; database records remain the fallback                     |
| Icons                                   | Immutable by content hash                                   | 24 hours after last publication                                      |

Refresh leases last 30 seconds and renew at one-third of their lifetime. Cold followers wait at most about 30 seconds; warm reads return their snapshot immediately while refresh work runs in the background. Failed refreshes retain existing values and back off for 60 seconds across replicas. Redis operations have a one-second deadline and a short local circuit breaker.

If Redis fails, persisted source catalogs and bounded local snapshots remain readable. A cold shared-cache miss does not fall through to uncoordinated upstream fetching. Cold public requests return 503 when no cached value is available. If an icon cannot be published, its image is included directly in the summary so the card remains usable.

Builtin source creation uses a deterministic UUID derived from tenant and registry URL, with `INSERT ... ON CONFLICT DO NOTHING`. Existing source rows retain their IDs and data. This needs no schema migration and prevents duplicate first-creation rows among replicas using this implementation. Existing duplicate legacy rows are not deleted automatically.

## Tests

Ordinary unit tests run without external services. The integration suite requires explicitly supplied `MARKETPLACE_TEST_REDIS_URL` and `MARKETPLACE_TEST_POSTGRES_URL`. It uses two independent Redis clients and PostgreSQL connections, creates an isolated temporary schema, and removes that schema afterward. Use disposable test services, not application production connections.

```sh
corepack pnpm exec jest --config packages/server/jest.config.ts --runInBand --runTestsByPath \
  packages/server/src/plugin/marketplace/plugin-marketplace-shared.integration.spec.ts
```

Coverage includes cold-load coalescing, replica restart, shared negative cache, stale reads, lease renewal/takeover, rejection of obsolete publications, Redis outage fallback, package cache sharing, scoped icon lookup, concurrent builtin creation, source edits/deletion during refresh, and public-catalog sharing.
