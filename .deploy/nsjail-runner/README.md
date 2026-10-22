# Xpert NsJail Runner

This directory contains the private Linux runtime used by the built-in `nsjail` sandbox provider. The Runner is not a second user-facing sandbox API: Xpert still owns provider selection, workspace binding, terminal routing, managed-service records, and preview authorization.

It also provides the independent, built-in `nsjail-compute` **Sandbox Jobs Runtime Provider** for `compute/node-python/v1`. Open-source Xpert can run the Workspace Script plugin's Python and JavaScript Actions through this provider without Xpert Pro or access to the Docker socket from the API.

## Open-source Compute Jobs

Build/release **both the API and Runner from this revision**. The Runner image includes the same digest-pinned Node 20 and Python 3.12 base images, Runner Host and Compute manifest as Runtime Suite 1.3.0. No separately published Compute image is required. Configure `NSJAIL_RUNNER_URL` and `NSJAIL_RUNNER_TOKEN` on the API using the overlay below, install the Workspace Script plugin, and retain the normal Sandbox Jobs database/Redis configuration. Compute is discovered automatically; selecting the interactive `NsJail Sandbox` in an Assistant is not required.

Requirements and behavior:

- Linux with delegated cgroup v2 and `cgroup.kill` (Linux 5.14+), using the overlay's privileged Runner and cgroup mount. `XPERT_NSJAIL_USE_CGROUP_V2=true` is mandatory for Compute. The host-development override defaults to `false`; explicitly set it to `true` when testing Compute.
- The API probes `/v1/compute/health` with the control-plane token. The probe launches a real jail, verifies both interpreters, actual Runner SHA-256, the complete Runtime Definition, read-only mounts, non-root UID, empty capabilities, `no_new_privs` and network denial. An old Runner, mismatched image or unavailable isolation fails closed. An unconfigured Runner does not prevent the API from starting.
- Each Job receives a fresh namespace, UID/GID 10001, no network (including when interactive egress is enabled), 256 MiB cgroup memory with no swap, one CPU, 64 PIDs, a 16 MiB shared-memory limit and 64 MiB **aggregate** scratch/output space. Inputs, Actions and host invocation replies are read-only in the jail. The input/reply staging tmpfs has a separate 64 MiB limit; individual RPC files/download batches are limited to 32 MiB and uploads to 4,096 files per Job.
- Job identity includes tenant, Job and binding identity. The RPC protocol accepts no shell command, image, environment or host path. Files arrive through confined RPC uploads; the Compute jail never mounts the API workspace or Runner control files. The existing `file.read`/`source.query` invocation bridge continues to authorize and execute host-side operations in Core.
- The 30-second hard deadline starts at runtime creation, covering input staging and execution. Cancellation, disconnect and deadline handling kill the complete cgroup. Output collection occurs after all children exit. Explicit destroy is idempotent, the reaper bounds abandoned state, and startup recovers marked resources left by an interrupted Runner. Provider reload cleanup uses persisted tenant/Job/binding evidence.
- The remote artifact digest records the Runner Host content hash; the image's pinned base digests live in the Dockerfile. Health verifies the deployed artifact rather than trusting a version label. NsJail binding priority is 100, so an installed healthy Pro Docker binding with priority 0 remains preferred.

This provider supports the Compute profile and materialized files. It does not advertise seekable read-only Workspace file mappings. Python has its standard library; this change does not add third-party packages such as pandas.

## Open-source Document Jobs

The built-in `nsjail-document` Provider adds `document/libreoffice-v1` (LibreOffice + Poppler), `document/node-20/v1` (AnyDoc) and `document/java-17/v1` (OpenDataLoader). Build and deploy both the API and Runner from this revision, configure the same `NSJAIL_RUNNER_URL`/`NSJAIL_RUNNER_TOKEN`, and install the corresponding document plugin. Discovery uses Sandbox Jobs; no Pro image or Docker socket on the API is required. The Python document binding in Pro remains independent and is not provided by NsJail. LibreOffice has its own rootfs and a probe that checks `soffice`, `pdftotext`, Noto CJK/Emoji fonts and a real two-page DOCX conversion with UTF-8 page text.

The Runner builds separate root filesystems from the OSS Runtime Suite's pinned bases, dependency locks, native modules, Java CLI and offline Chinese/English OCR assets. Its Node base pins a multi-platform index so ARM and x86 builds use matching interpreters. These assets substantially increase image size and build time. Readiness executes the real isolated dependencies, compares the full Definition and manifest, and fails closed on an old Runner or missing dependencies. API startup remains possible without a configured Runner.

| Profile                   | CPU | Memory | PIDs | Shared memory | Scratch/output | Hard deadline |
| ------------------------- | --- | ------ | ---- | ------------- | -------------- | ------------- |
| `document/libreoffice-v1` | 2   | 4 GiB  | 256  | 256 MiB       | 4 GiB          | 240 seconds   |
| `document/node-20/v1`     | 2   | 4 GiB  | 256  | 256 MiB       | 4 GiB          | 360 seconds   |
| `document/java-17/v1`     | 2   | 6 GiB  | 256  | 256 MiB       | 4 GiB          | 360 seconds   |

Each profile admits one active Job per Runner. Memory limits are ceilings, not reservations: the host must have enough free memory for OCR alongside its other services; host OOM can kill a Job before its own limit is reached. All document profiles require cgroup v2, prohibit swap and external networking, and run as UID/GID 10001 with read-only root and inputs. Java alone enables loopback inside its private Job namespace for the OCR subprocess; no other Job or host service is reachable. Compute, LibreOffice and Node retain disabled loopback. Java receives only the read-only `/sys/devices/system/cpu` topology subtree required by ARM OCR kernels, not the sysfs root. Cancellation, deadlines, disconnect cleanup and restart recovery share the Compute lifecycle implementation, with separate state directories and cgroups per profile.

Files are materialized over authenticated RPC: each file and download batch is limited to 32 MiB, staging to 64 MiB, and uploads to 4,096 files. Larger source documents require a different provider. Document artifact digests identify the expected manifest, including the dependency-lock and Runner hashes; readiness verifies the deployed content. Healthy Pro Docker bindings remain preferred at priority 0 over NsJail's 100.

### Compute verification

```bash
corepack pnpm run test:nsjail-runner
corepack pnpm exec nx test server-ai --runInBand \
  --testPathPatterns=nsjail-compute-runtime.provider.spec.ts
docker build -f .deploy/nsjail-runner/Dockerfile -t xpert-nsjail-runner:review .
node .deploy/nsjail-runner/check-image.cjs xpert-nsjail-runner:review
```

The image check uses a disposable privileged container and includes real Python/JavaScript execution, streamed invocation replies, network/filesystem isolation, OOM, disk limits, cancellation, timeouts, output bounds and cleanup. Document checks execute native conversion, the Java CLI and OCR CPU kernels; verify resource limits and private loopback policy; and reject cross-profile requests. CI runs these probes before image publication. Shared Compute and Document source changes are included in NsJail image release selection.

An additional opt-in Jest integration suite runs the **actual npm-packed Workspace Script Action** through the TypeScript Provider and Core's invocation bridge. Against a disposable Runner, set `NSJAIL_COMPUTE_TEST_URL`, `NSJAIL_COMPUTE_TEST_TOKEN` and `WORKSPACE_SCRIPT_ACTION_DIR` (the extracted directory containing `action.json` and `bundle/`), then run `nx test server-ai --runInBand --testPathPatterns=nsjail-compute-runtime.integration.spec.ts` through Corepack/pnpm. It checks both languages for aggregation, filtering and refreshed input data. These tests validate execution and the bridge; they do not claim browser UI, persisted database Jobs or real-user file authorization acceptance.

For packed document Action acceptance, set `NSJAIL_DOCUMENT_TEST_URL`, `NSJAIL_DOCUMENT_TEST_TOKEN`, `ANYDOC_ACTION_DIR`, `OPENDATALOADER_ACTION_DIR` (extracted directories containing `action.json` and `bundle/`) and `NSJAIL_DOCUMENT_FIXTURE_DIR`. The fixture directory must contain a one-page `native.pdf` with selectable text and a one-page `scanned.pdf` with image-only text, both containing `12345`. Run `nsjail-document-runtime.integration.spec.ts` with Jest. It executes both native PDF Actions and OpenDataLoader's real offline OCR through the TypeScript Provider, checks page coverage and the OCR result artifact, and destroys each Job afterward. It does not require or modify the running local API.

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

The provider uses a stable runtime ID and a shared `/workspace` for repeated commands. Each execute call, terminal, and managed service receives its own NsJail process boundary; the Runner tracks those processes and terminates them on timeout or runtime destruction. A runtime with no API activity is destroyed after two hours by default, including runtimes that still have a managed service, and a 24-hour hard lease bounds runtimes that remain continuously active. Global and per-runtime admission limits bound concurrent execute and preview-proxy processes before a child process is created. Managed-service readiness text is byte-limited and matched literally, even though the compatibility field is still named `readyPattern`; regular-expression metacharacters have no special meaning in the privileged Runner. Stopped, naturally exited, and readiness-failed service state and bounded logs remain available until the same service ID is restarted or the runtime is reaped. Managed-service HTTP and SSE preview requests are proxied by entering only that service's network namespace; an idle upstream body is closed after 60 seconds by default. The current open-source preview controller does not proxy WebSocket upgrades, so Vite-style HMR still requires the later shared preview upgrade work described in the POC.

For Project runtimes, the API sends only `protectProjectContent: true`; it never supplies host mount sources or sandbox targets. The Runner derives `project.md` and `skills` from the already validated canonical Project workspace, rejects missing, wrong-type, or symbolic-link sources, and over-mounts them at `/workspace/project.md` and `/workspace/skills` with NsJail `--bindmount_ro`. Runner file uploads reject the same protected paths so the file RPC cannot bypass the jail mounts. The protection flag is part of both the API runtime ID and the Runner's recreate compatibility check. Non-Project NsJail runtimes omit the field, and Local Shell remains an explicitly trusted development mode without pretending to enforce these Linux mount boundaries.

Managed application data is always protected by Runner protocol 3 (`appDataProtection: true`), independently of Project Content. Every execute, terminal and service overlays `/workspace/.apps` with the image-owned empty read-only `/opt/xpert-app-data-mask`; the real directory remains writable only through the host app-data API. Runner file upload/download RPCs reject `.apps`, including traversal and symlink aliases. Working directories cannot point into `.apps`. The mask exists even before the first application write, so long-lived processes cannot see data added later. Upgrade the Runner image before the API: the API rejects older Runners. Restart existing runtimes during this rollout. Local Shell remains trusted development execution without this mount boundary.

## Security and Linux validation

The Runner is intentionally the only privileged component. Do not mount the Docker socket, Xpert configuration, API credentials, or arbitrary host directories into it. RPC requests cannot choose mounts, host PIDs, NsJail flags, or executables, and workspace paths must resolve below `XPERT_NSJAIL_WORKSPACE_ROOT`. Project Content protection is an intent-only boolean; any other value is rejected and there is no RPC field for choosing its source or target paths.

Runner process state is restricted to `/var/lib/xpert-nsjail` (or a descendant). Startup cleanup requires a Runner-owned marker and refuses paths that overlap the rootfs or workspace mount, so an invalid `XPERT_NSJAIL_STATE_ROOT` cannot recursively clear shared data.

The overlay enables cgroup v2 by default and applies memory, swap, CPU, and PID limits to each NsJail process boundary in addition to namespaces, a read-only rootfs, `NO_NEW_PRIVS`, capability dropping, seccomp, and rlimits. The default swap limit is zero so the memory limit cannot spill into host swap. Because those cgroups are per jail rather than aggregate runtime limits, the Runner also enforces global/per-runtime execute admission and atomically reserves terminal slots before forking.

The overlay passes through the lifecycle and admission settings `XPERT_NSJAIL_MAX_RUNTIMES`, `XPERT_NSJAIL_RUNTIME_IDLE_TTL_SECONDS`, `XPERT_NSJAIL_RUNTIME_HARD_TTL_SECONDS`, `XPERT_NSJAIL_REAPER_INTERVAL_SECONDS`, `XPERT_NSJAIL_MAX_SERVICES_PER_RUNTIME`, `XPERT_NSJAIL_MAX_SERVICE_RECORDS_PER_RUNTIME`, `XPERT_NSJAIL_MAX_TERMINALS_PER_RUNTIME`, `XPERT_NSJAIL_MAX_EXECUTIONS_GLOBAL`, `XPERT_NSJAIL_MAX_EXECUTIONS_PER_RUNTIME`, `XPERT_NSJAIL_MAX_PROXIES_GLOBAL`, `XPERT_NSJAIL_MAX_PROXIES_PER_RUNTIME`, and `XPERT_NSJAIL_PROXY_IDLE_TIMEOUT_SECONDS`. It also exposes the bounded-input settings `XPERT_NSJAIL_MAX_DOWNLOAD_FILES`, `XPERT_NSJAIL_MAX_DOWNLOAD_BYTES`, `XPERT_NSJAIL_MAX_SERVICE_LOG_BYTES`, and `XPERT_NSJAIL_MAX_READY_TEXT_BYTES`; the per-jail resource settings `XPERT_NSJAIL_MEMORY_BYTES`, `XPERT_NSJAIL_SWAP_BYTES`, `XPERT_NSJAIL_CPU_MS_PER_SEC`, `XPERT_NSJAIL_PIDS`, `XPERT_NSJAIL_RLIMIT_AS_MB`, `XPERT_NSJAIL_RLIMIT_FSIZE_MB`, and `XPERT_NSJAIL_RLIMIT_NOFILE`; and workspace ownership through `XPERT_NSJAIL_UID` and `XPERT_NSJAIL_GID`. Export them before `docker compose up` to override the documented defaults.

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

The focused `.apps` mount/RPC regression probe is `verify_app_data.py`. Run it in a disposable Runner container with `/sandbox` empty and the repository Runner files mounted read-only at `/probe`, using `python3 /probe/verify_app_data.py`. It checks hidden contents, alias reads, writes, rename/removal of the mount point, normal public-file writes, and file RPC denial. This probe needs Linux mount namespace privileges, but disables networking and does not require a live API, credentials, model calls, or production volumes.
