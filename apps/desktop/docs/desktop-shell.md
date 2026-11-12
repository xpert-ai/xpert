# Desktop Shell (macOS and Windows internal preview)

The Assistant and its default sandbox stay on the Xpert server. `DesktopShell`
adds one tool, `desktop_shell`, for explicitly authorized desktop commands.

## Enable

1. Install the server and desktop changes together. With external schema management,
   apply `packages/server-ai/src/desktop-shell/migrations/20260924-desktop-shell.sql`
   before starting the server. Development schema synchronization also discovers the entities.
2. In Studio, connect **Desktop Shell** middleware to the intended Agent and publish
   the Assistant. Keep **Sandbox Shell** connected when it also needs server commands.
3. Sign in to the native macOS or Windows app. Optionally set the computer name, Shell,
   default working directory and command search path in **User menu → Connection &
   appearance → Desktop Shell**. No manual connection or conversation grant is needed.
   macOS offers zsh/bash; Windows uses the built-in Windows PowerShell 5.1. Windows
   command search paths use semicolons and preserve the PATH present when Bosi starts.
4. Ask the Assistant for a local command. Bosi connects on demand; an inline message
   card shows the exact command, computer, cwd and access notice. Choose **Allow once**
   or **Deny**. Nothing runs while the request is pending.
5. **Permissions** on the card opens the same Shell settings. Policies are **Ask for
   every command** (default), **Always allow in this organization**, or **Never allow**.
   The policy is persisted for this platform instance, account, organization and
   installation only. Existing conversation grants do not migrate to permanent access.

Also apply `packages/server-ai/src/desktop-shell/migrations/20260928-desktop-shell-approval.sql` for installations with
external schema management. Deploy server, Desktop and ChatKit changes together.

**Apply Shell settings** disconnects the current worker and revokes its pending
permits; the next request connects with the new settings. **Never allow** stops active
commands. Switching organizations, changing connections, signing out and quitting
also stop the worker. Closing the macOS window keeps the app and worker running.
After restarting, the selected policy remains but temporary operation permits do not.
Expired approvals cannot execute; deny or stop the request and make a new request.

Commands run with the signed-in operating-system user's permissions. The cwd is a
starting directory, not a filesystem sandbox. stdout/stderr are returned to Xpert.
No PTY, interactive stdin, persistent shell session, file synchronization or local
Agent runtime is provided. Each command gets a fresh non-interactive shell and a
small environment allowlist; platform account/device tokens are not inherited.

Windows requires Windows 10 or newer with Windows PowerShell and .NET available.
It does not require WSL, Python, a separate Node installation, SSH, or administrator
rights to run an approved command. Corporate policies that prohibit PowerShell or
`Add-Type` must be handled by the machine administrator; execution never falls back
to an unsupervised process. Only the command process uses a process-local script
execution-policy override; no machine/user execution policy is changed.

## Tool contract

```json
{"action":"info"}
{"action":"exec","command":"pwd; uname -s","timeout_sec":30}
{"action":"status","operationId":"<uuid>","cursor":0}
{"action":"cancel","operationId":"<uuid>"}
```

Before its first command, the Agent uses `info` to read the native client's explicit
platform, selected shell and default directory. This does not register a device,
create a permit or execute a command. Disabled/unavailable clients return
`{"available":false}`. Windows commands use PowerShell syntax, for example:

```json
{ "action": "exec", "command": "Get-Location; Write-Output '中文'", "cwd": "C:\\Users\\Example", "timeout_sec": 30 }
```

Windows accepts fully qualified drive and UNC directories. Drive-relative paths
such as `C:project` and rooted paths without a drive are rejected. Paths are not
normalized between approval and execution: the exact command/cwd/timeout digest
must still match. Each PowerShell command is read from a UTF-8 BOM script, supports
multiline input, disables profiles and interactive stdin, and reports explicit
`exit`/native-program exit codes and PowerShell errors. UTF-8 output is supported;
tools that emit a legacy code page must be configured to emit UTF-8 themselves.

`exec` optionally accepts an absolute `cwd`. Tenant, user, organization, device,
thread, grant and run are resolved from authenticated server context, never model
parameters. It returns a structured result with `executionTarget: "desktop"`, device
name/platform/shell, cwd, operationId, state, stdout/stderr, exitCode/signal,
nextCursor, truncated and optional error. A nonzero exit is `failed`, not success.

| Limit                                | Value                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| Concurrent commands per device       | 1; additional work returns `DEVICE_BUSY`                                                  |
| Offline submission                   | `DEVICE_OFFLINE`; no offline queue or sandbox fallback                                    |
| Synchronous wait                     | 10 seconds, then use `status`                                                             |
| Command timeout                      | 60 seconds by default, 1–600 seconds allowed                                              |
| Retained output per command          | 1 MiB; further pipe data is drained and discarded                                         |
| Tool result output                   | 64 KiB per cursor page                                                                    |
| Text transport                       | UTF-8; NUL bytes normalized to the replacement character                                  |
| Frame / sending pace                 | 64 KiB transport frame; one acknowledged report at a time, at most 50 reports/s           |
| Heartbeat / execution lease          | 15 seconds / 90 seconds                                                                   |
| Operation permit / device credential | Permit up to 10 minutes; device credential up to 8 hours, refreshed every 30 minutes      |
| Local journal                        | Results retained 24 hours after deadline; 2,000 records / approximately 64 MiB output cap |

The server persists output and final facts before acknowledging them. Results remain
queryable in the server database; deleting a local expired journal does not erase the
server result. Operators should apply their existing database retention/backup policy
because command output may contain business data.

## Architecture and failure semantics

`@xpert-ai/contracts` owns the shared shell DTOs, wire messages and entity interfaces.
`@xpert-ai/desktop-protocol` depends on those types and provides runtime constants and
boundary validators; its JavaScript does not load contracts. Contracts must not depend
on desktop-protocol. Server and renderer code import shared types directly from contracts.

```mermaid
sequenceDiagram
    participant UI as Electron / ChatKit
    participant Agent as Server Assistant
    participant DB as Operation database
    participant GW as Desktop Shell Gateway
    participant Worker as Desktop Worker
    Agent->>UI: Client tool interrupt: prepare exact local command
    UI->>GW: Register device on demand, prepare pending operation permit
    Worker->>GW: Outbound authenticated WebSocket
    Agent->>UI: Generic HITL interrupt with opaque host reference
    UI->>UI: Show message approval; user allows or denies
    UI->>DB: Approve exact scoped permit
    UI->>Worker: Install one-operation permit and wait for ACK
    UI->>Agent: Resume only after host accepts the decision
    Agent->>DB: Revalidate permit and create unique operation (tenant, run, toolCallId)
    Agent->>GW: Redis dispatch notification
    GW->>Worker: Exec with operationId, epoch, grant and deadline
    Worker->>Worker: Durable intent, then spawn process group
    Worker->>GW: Ordered stdout/stderr and final result
    GW->>DB: Persist before ACK
    GW-->>Worker: ACK; next frame may proceed
    DB-->>Agent: Final result or running + operationId
```

Production uses HTTPS/WSS through the API's Socket.IO endpoint (`/socket.io/`, namespace
`/desktop-shell`); allow WebSocket upgrades at the reverse proxy. The desktop opens no
listening port. Each API instance subscribes to the same Redis dispatch channel and
only dispatches to devices it currently owns. A persisted connection epoch fences old
connections; the database is authoritative and Redis is a wake-up hint. API instances
must share the same PostgreSQL and Redis deployments.

The Worker is a separate process launched with Electron's bundled Node runtime. IPC
only exposes settings, state, grants and cancellation to the trusted top frame. Neither
renderer nor ChatKit has a direct `exec` bridge. The gateway authenticates a short-lived,
hashed, device-only credential; it cannot be used as a general platform account token.

ChatKit owns only `approvals.placement`, the generic approval layout and callbacks.
It does not classify shell commands or store native policies. The authenticated API
binds each permit to identity, thread, run, tool call and a digest of command/cwd/timeout.
The worker independently checks that digest and permits at most one operation per
grant. Direct API approval cannot bypass the worker's local permit check. A missing
host callback fails closed. `allow` still creates and validates a new permit for each
command; it merely omits interactive approval.

Duplicate delivery returns the existing operation without spawning again. Changed
arguments for the same run/toolCallId are rejected. Reconnect resends unacknowledged
results; local acknowledged completion survives Worker restarts. Cancellation is also
persisted before a delayed exec can arrive. Timeout, revoke, lost lease and user cancel
terminate the POSIX process group (TERM, then KILL). On Windows the supervisor uses
a Job Object, assigned atomically during suspended process creation, with breakaway
disabled and kill-on-close enabled. Only stdin/stdout/stderr handles reach the
command; completion travels over a separate authenticated local pipe. Natural shell
exit also terminates background descendants. A final receipt requires the Job's active
process count to reach zero; a supervisor crash without a receipt stays `unknown`
and does not release the device for another command. Worker death closes the control
pipe and requests Job termination. Abrupt process/OS failure may produce
`unknown`; this is not success, proof of rollback or permission to retry the command.
No exactly-once side-effect or arbitrary-process recovery guarantee is claimed.

Windows builds compile the supervisor once into an AnyCPU .NET Framework executable
and ship it under `resources/shell`, unpacked from ASAR. Running a command does not
compile C# or start an extra PowerShell host. The supervisor authenticates its receipt
pipe and waits for an explicit `start` message before creating the command process.
A cancellation or control EOF during startup returns `not_started`; an interrupted
supervisor without a receipt still returns `unknown`. Startup remains inside the
existing command deadline and cancellation grace period.

## Validate and package

From the repository root (Node 24, Corepack pnpm):

```sh
node apps/desktop/scripts/build-windows-shell.mjs
node --test packages/desktop-protocol/test/*.test.cjs apps/desktop/tests/*.test.cjs
corepack pnpm exec jest --config packages/server-ai/jest.config.ts --runInBand \
  --runTestsByPath packages/server-ai/src/desktop-shell/desktop-shell-auth.service.spec.ts \
  packages/server-ai/src/desktop-shell/desktop-shell-operation.service.spec.ts
corepack pnpm --filter @xpert-ai/desktop build
corepack pnpm --filter @xpert-ai/desktop exec electron-builder --dir --mac --arm64
```

For a repeatable real Agent smoke test, configure a **dedicated published test Assistant**
with Desktop Shell middleware, supply `XPERT_SHELL_ASSISTANT_ID` (and optionally
`XPERT_API_URL` / `XPERT_ORGANIZATION_ID`), then run:

```sh
corepack pnpm --filter @xpert-ai/desktop test:shell:local
```

This opt-in test signs in using the existing local Keychain convention (or
`XPERT_USERNAME` / `XPERT_PASSWORD`), opens a test conversation, executes one bounded
command in a temporary directory, checks the actual file, revokes access and removes
its local fixture. It does not create or modify an Assistant.

The output is `apps/desktop/release/mac-arm64/Bosi.app`. `XPERT_DESKTOP_USER_DATA`
can select a separate absolute profile directory for testing without replacing the
normal account. No system Node/pnpm is required to run the packaged Worker.

Desktop UI text is translated into en, zh-Hans, zh-Hant and ja (jp remains an alias).
Server messages use the platform's en/en-US/zh-Hans i18next resources.

See `desktop-shell-inline-approval-acceptance.md` for the current approval upgrade,
and `desktop-shell-acceptance.md` for earlier transport validation.
Unsigned packaging is suitable for internal validation; signing, notarization, update
rollout and Linux support are separate release work.

## Native Windows validation

First run `node apps/desktop/scripts/build-windows-shell.mjs`, then
`node --test apps/desktop/tests/windows-shell-engine.test.cjs` on Windows. This
suite covers Unicode and long commands, stdin/environment boundaries, exit codes,
output limits, approval/replay, startup cancellation/EOF, deadlines, descendant cleanup, and
worker/supervisor crashes. It is skipped on macOS/Linux: passing the portable suites
or compiling the C# helper there does not prove Windows execution.

Build Windows installers on Windows, where the .NET Framework C# compiler is available.
The `dev`, `build`, `test` and isolated CI build commands prepare the supervisor
automatically; the installed application does not need a compiler. Packaging smoke
checks execute the unpacked supervisor to detect missing files or an unavailable runtime.
For a local, unsigned Windows x64 test package without installing developer tools
on the target computer, run on the Windows build machine:

```sh
corepack pnpm exec tsc -p .deploy/desktop/tsconfig.contracts.json
corepack pnpm --filter @xpert-ai/desktop build
corepack pnpm --filter @xpert-ai/desktop exec electron-builder --dir --win --x64 \
  --publish never --config.win.signAndEditExecutable=false
node apps/desktop/scripts/package-windows-shell-validation.mjs apps/desktop/release/win-unpacked
```

The kit uses the packaged Electron executable in Node mode and tests the engine
inside `resources/app.asar`. On Windows, extract the entire directory and run
`Run Shell Tests.cmd`; results are written to `shell-validation/results.tap`.
It runs only temporary fixtures, does not connect to an Xpert API, and does not
change an installed Bosi profile or system services. An automated SSH run may invoke
`Bosi.exe shell-validation/run.cjs` with `ELECTRON_RUN_AS_NODE=1`.

Human acceptance follows successful native tests and requires matching Desktop and
server changes: approve a command writing/reading a Chinese-named file in a test
directory, deny another command and verify no file was written, then stop a long
command and verify the next approved command works. SSH is only a development/test
transport and is not required by the product.
