# Desktop assistant profiles

The expanded list and collapsed avatar rail share the same profile panel. Only the avatar is a hover/focus trigger; the title and description do not open a profile. Clicking either the avatar or text opens the conversation. `Alt+Down` on the avatar pins the profile and focuses its controls. Escape or Close dismisses it unless a custom View holds an active interaction. Closing, changing the sidebar layout, switching organization or signing out releases the profile session. Each rendered trigger owns its lock, so hidden sidebar layouts and stale cleanup cannot open a second panel or lock another assistant.

The panel is 420 × 600 CSS pixels, constrained to the available viewport. Its fixed header shows only avatar, name, status and latest activity time. Description, version and the summary metrics strip are deliberately absent to leave room for content. About contains the detailed description and publication metadata. Capabilities contains published skill, tool and sub-agent counts. Activity lists five recent conversations per page, using their actual status; idle does not mean completed. A conversation row opens that thread. The header's Open conversation icon uses the sidebar's existing latest-unread/latest-thread rule; Edit profile is an avatar corner button. Both have localized labels/tooltips and are disabled during a held interaction. There is no global bottom bar in either hover or pinned mode: the reclaimed 65 pixels belong to the active content, while each custom View owns its contextual actions.

## Extension contract

- Views come from the existing organization-scoped `view-hosts/agent/:id/slots/agent.profile.tabs/views` API. Desktop honors the returned visibility and order; it does not install or enable plugins.
- Activity, Capabilities and About remain native tabs. One custom tab is shown directly, and More lists additional Views. Tab switching preserves mounted custom components until the panel closes.
- `remote_component` protocol version 1 supports init, viewActive, data requests, declared parameter-option requests, JSON actions, notifications and error responses. It receives the selected locale, semantic theme values and initial empty query. The current profile host has no conversation runtime scope.
- Declared `assistant.profile.interaction` (`{ busy: true/false }`) holds the panel during editing. JSON actions also hold it until the request settles. `assistant.profile.close` closes only when no interaction/action is active.
- Declared `workbench.navigation.open`, with `target: workbench.view`, resolves an enabled fixed View belonging to the same assistant and opens it in the configured Cloud origin. Full keys and unique provider-prefixed aliases are supported; plugin-supplied arbitrary URLs are ignored.
- Declarative stats, tables, lists and detail schemas have a basic read-only renderer with search/pagination. They are not a full replacement for the Cloud schema renderer. File uploads, file grants and other client commands are explicitly unsupported in this release.

## Isolation and lifecycle

Electron owns authentication and resolves the current organization. It projects only display fields from the assistant profile and uses the existing user-owned conversation endpoint. Opening a View creates a revocable, generation-bound host session. Each request rechecks the enabled manifest; action authorization remains server-side.

Remote HTML is served on an ephemeral loopback-only port using an unguessable, expiring entry path. It has no API proxy, cookies or account tokens. Its CSP blocks network connections, external scripts and nested frames. The iframe has scripts/forms/downloads but no same-origin permission. Messages must originate from that iframe and match its protocol and instance. Hidden tabs keep their UI state but cannot make new bridge requests. Closing a panel revokes its entry/session; account and organization changes invalidate outstanding capabilities.

## Verification

Targeted host/protocol/list/i18n/workbench tests cover organization scope, data projection, undeclared operation rejection, entry revocation, authorized navigation, protocol validation and profile lock ownership. On Node 22 versions without default type stripping, run:

```sh
corepack pnpm --filter @xpert-ai/desktop exec node --experimental-strip-types --test \
  tests/assistant-profile.test.cjs tests/assistant-list.test.cjs tests/i18n.test.cjs tests/workbench.test.cjs
corepack pnpm --filter @xpert-ai/desktop build
```

Local acceptance exercised actual profile data, recent conversations, both sidebar layouts, pin/close/Escape/reopen, custom View search/pagination/detail, empty approval state and tab state retention. Business approvals were not submitted. The final renderer visual check used the development preview after native screen capture became unavailable; the earlier Electron check loaded the same real custom Views successfully.
