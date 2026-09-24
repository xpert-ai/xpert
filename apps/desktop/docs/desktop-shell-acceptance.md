# Desktop Shell acceptance — 2026-09-24

Implementation branch: `feat/desktop-shell`, based on develop `7c125edc8`.
This is an internal macOS ARM64 build; it has not been committed, merged or published.

## Environment

- API: worktree source, Node 24, `http://localhost:3190`.
- PostgreSQL: a dedicated copy of local Xpert configuration/data, excluding historical
  Agent checkpoints; copied schedules disabled. The additive Shell migration was applied.
- Redis: separate container and credentials on loopback port 6391.
- ChatKit frame: the existing local hosted frame at `http://localhost:4200/chatkit/index.html`.
- Server sandbox: existing nsjail container runtime. Desktop: native macOS zsh.
- Login: the existing local account from macOS Keychain; credentials were not added to source.
- Fixtures: fresh dedicated Assistants published only in the isolated database, with
  commands limited to temporary acceptance directories. Existing Assistants were not edited.
- Packaged app: `apps/desktop/release/mac-arm64/Xpert.app`, with a separate user-data profile.

The isolated API is the implementation under test. The original API on port 3000
has not been upgraded or migrated by this task.

## Results

| Check                            | Evidence / outcome                                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop and protocol regression  | 53 Node tests passed, including existing desktop tests                                                                                                                                            |
| Server targeted tests            | 64 Jest tests passed across authorization, operation persistence, Gateway, run creation/cancellation, ClientTool and SandboxShell                                                                 |
| Type checks / build              | server-ai TypeScript check and desktop TypeScript/Vite build passed                                                                                                                               |
| Native packaging                 | ARM64 Electron app built and launched; Worker uses the bundled runtime                                                                                                                            |
| Real login and device connection | Passed with the isolated Xpert API and native Worker                                                                                                                                              |
| Studio discovery                 | DesktopShell is listed as built-in middleware by the live Studio API                                                                                                                              |
| Reproducible live smoke          | `apps/desktop/scripts/test-shell-local.mjs` passed against the dedicated Assistant; its temporary local fixture was removed                                                                       |
| Real model → tool → desktop      | Assistant invoked desktop_shell; macOS stdout/stderr, cwd and zero exit code verified against the real filesystem                                                                                 |
| Same conversation, two targets   | sandbox_shell returned server Linux from nsjail; desktop_shell returned local Darwin                                                                                                              |
| Long-running operation           | A sleep command exceeded the 10-second synchronous wait; the Assistant used status and received final output                                                                                      |
| Packaged ChatKit context         | The UI-issued grant reached a real Agent tool call through the hosted ChatKit frame                                                                                                               |
| Native cancellation              | Stop command in Shell settings cancelled the running process group                                                                                                                                |
| Quit during execution            | Quit the packaged app while a real shell command was running; its process group no longer existed after app shutdown                                                                              |
| API restart / result loss        | API was forcibly stopped during a desktop command; Worker reconnected after restart, persisted result was recovered under the same operation ID, and the counter file contained exactly one write |
| Duplicate delivery / missing ACK | Automated counter test and paced delivery tests confirmed no second spawn, matching acknowledgements and bounded retransmission                                                                   |
| Uncertain Worker restart         | Durable pending intent reloaded as unknown and was not executed again (automated journal recovery test)                                                                                           |
| Authorization boundary           | Cross-user/tenant/organization/thread and wrong Assistant, expired/revoked grant, stale epoch and malformed credential checks passed                                                              |
| Offline / busy device            | Operation tests reject new execution without creating offline queued work                                                                                                                         |
| Output limits                    | stdout/stderr cap, cursor paging, UTF-8/emoji boundaries and binary NUL normalization passed                                                                                                      |
| Failure paths                    | Nonzero exit, missing executable, timeout, cancellation before exec, journal failure and expired lease tests passed                                                                               |
| Multiple API routing             | Two Gateway instances sharing mocked persisted state/Redis route only through the owning instance and reject the old connection epoch                                                             |

The two-Gateway test proves the routing contract; an actual load-balanced production
cluster, reverse-proxy failover and OS sleep/wake remain deployment-specific checks.
Worker recovery testing does not promise that arbitrary side effects can be rolled
back after an OS crash or hard kill.

Signing, notarization, automatic updates, Windows/Linux and PTY are outside this
internal macOS phase. The app is unsigned and is not a production distribution release.
