# Runtime traffic withdrawal and recovery

Issue: https://github.com/xpert-ai/xpert/issues/1207

The shipped `docker-compose.yml` and `docker-compose.cn.yml` route the webapp's API proxy through `api-ingress:3000`. This HAProxy hop resolves Docker's `api` service and health-checks each address independently. Up to 32 API replicas are supported by the template. API containers remain private; the webapp continues publishing the existing API port.

## Deployment contract

Every business ingress must target **api-ingress:3000**, including external Nginx, API subdomains, ChatKit, public/share routes, and WebSocket routes. Routing any of these directly to `api:3000` bypasses readiness withdrawal. Updating only the API image does not complete this migration.

For deployments managed by `xpert-installer`, copy the `api-ingress` service definition and `haproxy.cfg` into that deployment, attach it to the API's network, and change the external Nginx API upstream from `api:3000` to `api-ingress:3000`. Validate the effective Compose and Nginx configuration before applying it. The installer repository is not modified by this change. `XPERT_INGRESS_IMAGE` can point to an approved mirror of HAProxy 3.2.26; older versions without `init-state` are not compatible.

The gateway uses `fall=1`, a 1-second check interval and a 1-second check timeout. API withdrawal defaults to 5 seconds before rejecting new requests, in addition to the existing signal scheduling delay. This is a bounded health-check propagation contract, **not an explicit acknowledgement from an arbitrary external load balancer**. Do not lengthen check intervals or introduce queued/delayed health checks without revisiting the withdrawal budget. Platforms requiring acknowledged removal should implement an ingress-specific acknowledgement before entering drain.

`RUNTIME_TRAFFIC_WITHDRAWAL_MS` sets the API propagation wait (default `5000`, integer milliseconds from `5000` to `60000`). Invalid values fail application initialization. Both Compose files pass it into the API environment; recreate API containers after a change. This setting does not change HAProxy probes or the 300-second replica restart deadline. A longer wait consumes that deadline, and the budget must still cover the actual ingress propagation behavior.

A replacement starts unavailable to the gateway and needs three successful readiness checks before receiving new requests. Removal does not kill established SSE or WebSocket streams. The API retains its 30-second drain deadline and existing shutdown behavior for streams that do not finish. Proxy request replay is disabled, including for POSTs.

If all instances are unready, business traffic receives a structured `RUNTIME_NOT_READY` 503 with `Retry-After: 5`. Only the same narrowly defined recovery routes already supported by the API middleware may fall back to a listening replica. Authentication and organization/tenant authorization still run in the API. Draining replicas continue rejecting these requests. This fallback does not permit normal business traffic to bypass admission.

## Runtime behavior and diagnosis

A rolling candidate transitions through ready → withdrawing → draining → process restart → unready → ready. Withdrawing makes `/api/health/ready` return 503 while still accepting requests that pass the runtime safety guard. The coordinator checks operation ownership, target failures, and healthy-peer availability again before drain and before signalling. Cancellation restores readiness; unsafe plugin state or lease loss never acquires a grace-period bypass.

Admission validation retains its 5-second deadline and the registry retains its independent 45-second lease. A separate serial admission monitor runs independently of rollout bookkeeping and owns its Nest provider bootstrap/destruction hooks. The coordinator consumes it through injection; stopping or omitting the restart executor must not stop admission refresh. It does not authorize stale plugins or silently extend expired validation. A stopped monitor does not schedule new checks.

`/api/health/ready` includes `admission` diagnostics:

- `reason`: ready, startup-not-listening, plugin-not-admitted, validation-expired, or lease-expired.
- `validationAgeMs`, `validationRemainingMs`, and `leaseRemainingMs`.
- `checkDurationMs`, `checkInFlight`, and `lastCheckFailed`; the check includes reading the rollout snapshot and writing readiness.
- `eventLoopDelayMaxMs` and `eventLoopDelayP99Ms`, sampled over the most recent monitor interval.

Structured events include `runtime.readiness.changed`, `runtime.admission.check-slow`, `runtime.admission.check-failed`, and `runtime.restart.replica-withdrawing`. Correlate these with Redis latency, CPU throttling, and GC measurements; a long business request alone is not proof of event-loop blocking.

Desktop preserves runtime error codes and retry timing through IPC. Safe reads and the exact ChatKit session-creation endpoint retry at most twice, with a 15-second retry-scheduling budget and the existing per-attempt request timeout. Only explicit runtime refusals are retried; unknown 503s, network failures, and chat/tool writes are not replayed. Account/configuration changes abort pending recovery. Successful session acquisition clears its own previous banner without requiring a new iframe-ready event.

Operation `completed` and completed replica counts describe runtime requirements and replacement readiness, including already-current targets. They do not acknowledge ingress readmission. Ready/completed audit events carry `completionScope: "runtime"`; withdrawal events report the configured `withdrawalMs`. The current `rolling-self-signal` executor requires a process supervisor. Future deployment orchestration must replace that execution policy while keeping admission monitoring active.

## Plugin installation and capacity (#1228)

Registry installs now use asynchronous child processes and one shared-store lock, including during bootstrap. The lock is rooted in the existing plugin volume, so replicas using that volume serialize npm builds and manifest changes. A separate watchdog bounds npm even if its API parent is killed. Lock recovery waits beyond that watchdog deadline; a displaced owner cannot renew or release a replacement owner's lock, or publish after losing its lease.

Each build uses a private staging directory. The installer validates the package name, requested version and resolvable entry, writes its completion marker, then renames the directory into place. Readers see a complete artifact. Legacy directories need entry and offline `npm ls` validation before reuse; merely finding `package.json` is insufficient. Failed builds retain the previous version and manifest. Recovered installations remove abandoned private stages in the affected package parent directory. Manifest changes use the same lock and an atomic replacement; malformed manifests are preserved and reported as errors.

`PLUGIN_INSTALL_TIMEOUT_MS` defaults to 120000 per npm command and `PLUGIN_INSTALL_LOCK_WAIT_MS` to 180000. Both accept integer milliseconds from 1000 to 600000 and are normalized at the server configuration boundary. All replicas sharing a plugin volume must use the same timeout settings. Locking requires a shared filesystem with atomic directory creation/rename, stable inode identity and coherent modification times. A root shared by the API replicas limits installations to one npm process group at a time; separate local volumes coordinate independently.

Deploy the updated installer to **all** replicas before resuming plugin changes: older API processes do not participate in this lock protocol. Keep the 5-second admission deadline, lease validation, one-candidate rolling restart policy and bounded client recovery enabled. Installation runs outside the serving event loop, but operators must still provision CPU, memory and disk headroom for its child process.

The ingress migration is a separate deployment requirement. Check effective `docker compose config` and `nginx -T` output for each API, ChatKit, public/share and WebSocket route; each business upstream must reach `api-ingress:3000`. A healthy API image alone does not establish withdrawal or readmission. Verify traffic during an overlapping plugin installation and rollout before declaring production recovery.

## Validation

From the repository root, with workspace dependencies installed:

```sh
corepack pnpm exec jest --config packages/server/jest.config.ts --runInBand packages/server/src/runtime-control packages/server/src/managed-connection/instance-registry.service.spec.ts packages/server/src/tenant/tenant-setting/tenant-settings
node --experimental-strip-types --test apps/desktop/tests/*.test.cjs apps/desktop/tests/audio-capture/*.test.cjs
corepack pnpm exec tsc --noEmit -p apps/desktop/tsconfig.json
node --test docker/runtime-ingress/rollout.test.cjs
```

The Docker test requires `node:22-bookworm`, `nginx:1.30.6`, and `haproxy:3.2.26-alpine` (or `XPERT_INGRESS_IMAGE`) locally. It creates an isolated network and cleans up its containers. It runs the actual lifecycle/middleware/withdrawal source in three Node fixtures, behind real Nginx and HAProxy. Each fixture restarts its Node process within the same container. It checks two rolling passes, GET/session/chat requests without duplicate writes, established SSE, cancellation, replacement readiness, all-unready recovery, and recovery-route authentication.

The proxy fixture also bundles the actual registry installer and admission monitor. Two API replicas request the same simulated 7-second npm installation on a shared volume while a third process restarts. It asserts one install, responsive admission, successful ordinary/ChatKit/chat traffic, and no POST replay. The fake npm performs no network installation. Separate server tests cover process-group cancellation, orphan watchdogs, lock takeover, partial artifacts and concurrent manifest updates.

This fixture is not a full platform deployment: plugin convergence and Redis lease behavior are covered by the server tests, while the proxy test covers transport behavior with a simulated valid lease. Before production rollout, repeat the acceptance with the actual deployed API/plugin versions, PM2, proxy paths and long-running business operations.
