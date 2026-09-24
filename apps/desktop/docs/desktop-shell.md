# Desktop Shell (macOS internal preview)

The Assistant and its default sandbox stay on the Xpert server. `DesktopShell`
adds one tool, `desktop_shell`, for explicitly authorized desktop commands.

## Enable

1. Install the server and desktop changes together. With external schema management,
   apply `packages/server-ai/src/desktop-shell/migrations/20260924-desktop-shell.sql`
   before starting the server. Development schema synchronization also discovers the entities.
2. In Studio, connect **Desktop Shell** middleware to the intended Agent and publish
   the Assistant. Keep **Sandbox Shell** connected when it also needs server commands.
3. Sign in to the native macOS app. Open **User menu → Connection & appearance →
   Desktop Shell**. Set the computer name, zsh/bash, default working directory and
   command search path, then choose **Enable Shell**.
4. Select the Assistant and choose **Use this computer** above ChatKit. This grants
   access to that conversation. New or branched conversations require their own grant.
5. Ask the Assistant to use `desktop_shell`. Recent commands and a **Stop command**
   action appear in the Shell settings. **Disconnect this conversation** revokes its
   grant; **Disable Shell** revokes all grants for the device.

Shell settings take effect immediately, independently of the appearance Save/Cancel
buttons. The shell starts disabled after restarting the app. Switching organizations,
changing connections, signing out and quitting disable it and terminate active work.
Closing the macOS window keeps the app and Worker running; quitting the app stops them.

Commands run with the signed-in operating-system user's permissions. The cwd is a
starting directory, not a filesystem sandbox. stdout/stderr are returned to Xpert.
No PTY, interactive stdin, persistent shell session, file synchronization or local
Agent runtime is provided. Each command gets a fresh non-interactive shell and a
small environment allowlist; platform account/device tokens are not inherited.

## Tool contract

```json
{"action":"exec","command":"pwd; uname -s","timeout_sec":30}
{"action":"status","operationId":"<uuid>","cursor":0}
{"action":"cancel","operationId":"<uuid>"}
```

`exec` optionally accepts an absolute `cwd`. Tenant, user, organization, device,
thread, grant and run are resolved from authenticated server context, never model
parameters. It returns a structured result with `executionTarget: "desktop"`, device
name/platform/shell, cwd, operationId, state, stdout/stderr, exitCode/signal,
nextCursor, truncated and optional error. A nonzero exit is `failed`, not success.

| Limit                          | Value                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| Concurrent commands per device | 1; additional work returns `DEVICE_BUSY`                                                  |
| Offline submission             | `DEVICE_OFFLINE`; no offline queue or sandbox fallback                                    |
| Synchronous wait               | 10 seconds, then use `status`                                                             |
| Command timeout                | 60 seconds by default, 1–600 seconds allowed                                              |
| Retained output per command    | 1 MiB; further pipe data is drained and discarded                                         |
| Tool result output             | 64 KiB per cursor page                                                                    |
| Text transport                 | UTF-8; NUL bytes normalized to the replacement character                                  |
| Frame / sending pace           | 64 KiB transport frame; one acknowledged report at a time, at most 50 reports/s           |
| Heartbeat / execution lease    | 15 seconds / 90 seconds                                                                   |
| Grant and device credential    | Up to 8 hours; device credential refreshed every 30 minutes                               |
| Local journal                  | Results retained 24 hours after deadline; 2,000 records / approximately 64 MiB output cap |

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
    UI->>GW: Account-authenticated registration and conversation grant
    Worker->>GW: Outbound authenticated WebSocket
    Agent->>DB: Unique operation (tenant, run, toolCallId)
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

Duplicate delivery returns the existing operation without spawning again. Changed
arguments for the same run/toolCallId are rejected. Reconnect resends unacknowledged
results; local acknowledged completion survives Worker restarts. Cancellation is also
persisted before a delayed exec can arrive. Timeout, revoke, lost lease and user cancel
terminate the process group (TERM, then KILL). Abrupt process/OS failure may produce
`unknown`; this is not success, proof of rollback or permission to retry the command.
No exactly-once side-effect or arbitrary-process recovery guarantee is claimed.

## Validate and package

From the repository root (Node 24, Corepack pnpm):

```sh
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

The output is `apps/desktop/release/mac-arm64/Xpert.app`. `XPERT_DESKTOP_USER_DATA`
can select a separate absolute profile directory for testing without replacing the
normal account. No system Node/pnpm is required to run the packaged Worker.

Desktop UI text is translated into en, zh-Hans, zh-Hant and ja (jp remains an alias).
Server messages use the platform's en/en-US/zh-Hans i18next resources.

See `desktop-shell-acceptance.md` for exercised paths and remaining release checks.
Unsigned packaging is suitable for internal validation; signing, notarization, update
rollout and Windows/Linux support are separate release work.
