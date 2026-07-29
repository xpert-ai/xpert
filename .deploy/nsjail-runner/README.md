# Xpert NsJail Runner

This directory contains the private Linux runtime used by the built-in `nsjail` sandbox provider. The Runner is not a second user-facing sandbox API: Xpert still owns provider selection, workspace binding, terminal routing, managed-service records, and preview authorization.

## Start it

From the repository root:

```bash
export NSJAIL_RUNNER_TOKEN="$(openssl rand -hex 32)"
docker compose \
  -f docker-compose.yml \
  -f .deploy/nsjail-runner/docker-compose.nsjail.yml \
  up -d --build
```

The overlay does three things:

- mounts the same `/sandbox` volume into the API and Runner;
- connects only the API and Runner to the internal `nsjail-control` network;
- sets `NSJAIL_RUNNER_URL` and `NSJAIL_RUNNER_TOKEN`, which makes the `NsJail Sandbox` provider visible in Xpert and disables Local Shell fail-closed.

Select `NsJail Sandbox` in the Xpert sandbox feature after the services are healthy. Templates that name an unavailable provider are normalized to the first available provider during install, so templates that previously selected Local Shell use NsJail in this deployment mode. Removing the overlay and unsetting both API variables hides NsJail and restores Local Shell; Docker behavior is unchanged.

### Host development

When the API runs on the host through `pnpm run start:api:dev`, add the following values to the ignored root `.env`:

```dotenv
NSJAIL_RUNNER_URL=http://127.0.0.1:8090
NSJAIL_RUNNER_TOKEN=<random local token>
SANDBOX_VOLUME=/absolute/path/to/the/local/sandbox/root
XPERT_NSJAIL_USE_CGROUP_V2=false
```

Start the Runner with the host-development override:

```bash
corepack pnpm run start:nsjail:dev
```

The command publishes the Runner only on `127.0.0.1:8090` and mounts `SANDBOX_VOLUME` at the same absolute path inside the Runner. Configuring this variable also switches the host API from the legacy flattened `~/data` layout to tenant/scope-isolated paths below `SANDBOX_VOLUME`, so each NsJail runtime receives a strict descendant instead of the shared root. Restart the host API after changing `.env`; the frontend does not need to restart. The Runner token is read from the same ignored `.env` by Docker Compose and the API.

The provider uses a stable runtime ID and a shared `/workspace` for repeated commands. Each execute call, terminal, and managed service receives its own NsJail process boundary; the Runner tracks those processes and terminates them on timeout or runtime destruction. A runtime with no API activity and no running managed service is destroyed after two hours by default. Global and per-runtime admission limits bound concurrent execute processes before a jail is created. Managed-service readiness text is byte-limited and matched literally, even though the compatibility field is still named `readyPattern`; regular-expression metacharacters have no special meaning in the privileged Runner. Managed-service HTTP and SSE preview requests are proxied by entering only that service's network namespace. The current open-source preview controller does not proxy WebSocket upgrades, so Vite-style HMR still requires the later shared preview upgrade work described in the POC.

## Security and Linux validation

The Runner is intentionally the only privileged component. Do not mount the Docker socket, Xpert configuration, API credentials, or arbitrary host directories into it. RPC requests cannot choose mounts, host PIDs, NsJail flags, or executables, and workspace paths must resolve below `XPERT_NSJAIL_WORKSPACE_ROOT`.

Runner process state is restricted to `/var/lib/xpert-nsjail` (or a descendant). Startup cleanup requires a Runner-owned marker and refuses paths that overlap the rootfs or workspace mount, so an invalid `XPERT_NSJAIL_STATE_ROOT` cannot recursively clear shared data.

The overlay enables cgroup v2 by default and applies memory, swap, CPU, and PID limits to each NsJail process boundary in addition to namespaces, a read-only rootfs, `NO_NEW_PRIVS`, capability dropping, seccomp, and rlimits. The default swap limit is zero so the memory limit cannot spill into host swap. Because those cgroups are per jail rather than aggregate runtime limits, the Runner also enforces global/per-runtime execute admission and atomically reserves terminal slots before forking.

The overlay passes through the lifecycle and admission settings `XPERT_NSJAIL_MAX_RUNTIMES`, `XPERT_NSJAIL_RUNTIME_IDLE_TTL_SECONDS`, `XPERT_NSJAIL_REAPER_INTERVAL_SECONDS`, `XPERT_NSJAIL_MAX_SERVICES_PER_RUNTIME`, `XPERT_NSJAIL_MAX_TERMINALS_PER_RUNTIME`, `XPERT_NSJAIL_MAX_EXECUTIONS_GLOBAL`, and `XPERT_NSJAIL_MAX_EXECUTIONS_PER_RUNTIME`. It also exposes the bounded-input settings `XPERT_NSJAIL_MAX_DOWNLOAD_FILES`, `XPERT_NSJAIL_MAX_DOWNLOAD_BYTES`, `XPERT_NSJAIL_MAX_SERVICE_LOG_BYTES`, and `XPERT_NSJAIL_MAX_READY_TEXT_BYTES`; the per-jail resource settings `XPERT_NSJAIL_MEMORY_BYTES`, `XPERT_NSJAIL_SWAP_BYTES`, `XPERT_NSJAIL_CPU_MS_PER_SEC`, `XPERT_NSJAIL_PIDS`, `XPERT_NSJAIL_RLIMIT_AS_MB`, `XPERT_NSJAIL_RLIMIT_FSIZE_MB`, and `XPERT_NSJAIL_RLIMIT_NOFILE`; and workspace ownership through `XPERT_NSJAIL_UID` and `XPERT_NSJAIL_GID`. Export them before `docker compose up` to override the documented defaults.

The API and Runner must see the same numeric workspace owner. The defaults are UID/GID `1000:1000`, matching the standard Xpert API image. Set both ownership variables when the API image uses a different identity. The Runner uses descriptor-relative, no-follow operations and assigns newly created upload directories and files to that configured jail identity so a file created through `sandbox_write_file` remains editable in a terminal.

If the target host does not expose a writable unified cgroup v2 hierarchy, the Runner fails fast instead of silently dropping resource controls. For a deployment probe only, use the rlimit-only compatibility mode while fixing cgroup delegation:

```bash
export XPERT_NSJAIL_USE_CGROUP_V2=false
```

Before production use, repeat the deployment probe on the actual Ubuntu 22/24 host and record:

- whether `privileged` can be reduced to a tested capability/device/mount set;
- AppArmor or SELinux policy requirements;
- cgroup v2 memory, CPU, and PID enforcement;
- amd64/arm64 behavior;
- workspace ownership for the API UID and configured `XPERT_NSJAIL_UID`/`GID`;
- aggregate execute/terminal admission and bounded download/log behavior under concurrency.

Docker Desktop is useful for protocol and functional smoke tests, but it is not proof of native Linux AppArmor, cgroup delegation, or minimum-capability behavior.

## Run the POC validation

Run the executable POC checks against the isolated Compose project with deliberately small limits:

```bash
export NSJAIL_RUNNER_TOKEN="$(openssl rand -hex 32)"
export XPERT_NSJAIL_MEMORY_BYTES=134217728
export XPERT_NSJAIL_CPU_MS_PER_SEC=200
export XPERT_NSJAIL_PIDS=32
export XPERT_NSJAIL_RLIMIT_AS_MB=512
export XPERT_NSJAIL_RLIMIT_FSIZE_MB=2
export XPERT_NSJAIL_RLIMIT_NOFILE=64
docker compose \
  -p xpert-nsjail-poc \
  -f docker-compose.yml \
  -f .deploy/nsjail-runner/docker-compose.nsjail.yml \
  up -d --build --no-deps nsjail-runner
docker compose \
  -p xpert-nsjail-poc \
  -f docker-compose.yml \
  -f .deploy/nsjail-runner/docker-compose.nsjail.yml \
  exec nsjail-runner python3 /app/poc_validate.py
```

The probe exercises the actual Runner HTTP protocol, namespaces, rootfs/workspace/credential/network boundaries, file traversal and link handling, timeout descendant cleanup, cgroup and rlimit enforcement as separate observations, seccomp controls, PTY, managed-service proxy lifecycle, and concurrent jail execution. On cgroup v2 it also records controller event counters such as `memory.events` and `pids.events`. It exits non-zero on any failed check and prints the measured limits and timings as JSON.

The script does not turn Docker Desktop into native-host proof. On the production Ubuntu host, also record kernel/release/architecture, AppArmor or SELinux state, whether cgroup v2 is delegated, the tested `privileged` and reduced-capability variants, Runner and per-jail memory, 10/50/100-jail density, and a same-workload Docker Sandbox baseline. WebSocket/HMR remains outside this Runner HTTP probe and requires an end-to-end Xpert preview test.
