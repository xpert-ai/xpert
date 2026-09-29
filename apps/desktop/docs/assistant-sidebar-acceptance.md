# Assistant sidebar acceptance — 2026-09-24

Implemented in the `feat/desktop-assistant-sidebar` worktree, with the companion
ChatKit changes in `/Users/lilinhao/tiwen/chatkit-js`.

## Verification

- Desktop: 53 Node tests pass; TypeScript and Vite production build pass.
- ChatKit: 19 Workbench tests pass; TypeScript and Vite app build pass.
- Both repositories pass `git diff --check`.
- Local integration passes against the worktree API: login, organization scope,
  discovery, two Assistant-scoped ChatKit sessions, refresh, catalog and frame assets.
- Browser: exercised pin/unpin, local duplicate and profile edit, new section and
  move, manual unread/read, conversation ID copy, latest-title display and resize.
  Original platform profile remains unchanged after editing the local copy.
- Native macOS: login, Chinese context menu, two pinned avatar cards, sidebar drag
  to 240px and collapse to a 72px rail, restore, and persistence after restart pass.
- Native macOS with the real Bid Studio Workbench: dragging chat reaches the
  384px minimum, continued drag past half that minimum collapses chat, and
  **Restore panel** restores the split. Automated tests additionally verify draft
  preservation and pointer cancellation/cleanup.

## Running environment

- Desktop preview: `http://127.0.0.1:4390/`.
- Local ChatKit: `http://127.0.0.1:5173/`.
- Worktree API: `http://127.0.0.1:3190`, using the isolated local test database.
- Desktop API URL and ChatKit URL both use port 5173; its development proxy forwards
  `/api` and `/socket.io` to port 3190. Xpert web URL remains `http://localhost:4200`.
- Native verification uses a separate development profile under
  `.xpert-local-environment/desktop-sidebar/native-profile`. Credentials stay in
  Electron's OS-encrypted storage. Browser preview preferences are in-memory and
  reset if its development host restarts; native preferences persist on disk.

## Semantics and limits

- Local copies share the source Assistant's server identity and conversation
  history. Editing or duplicating does not call platform Assistant write APIs.
- Sections, pins, manual unread, local profiles and copies are scoped by service,
  tenant, user and organization. The server remains authoritative for Assistant
  access and conversation read permissions.
- Activity is polled every 15 seconds while visible, with an additional refresh
  on focus and after ChatKit completes loading/responding. This is not a push
  notification implementation.
- Pin placement takes precedence over unread ordering. Within the pinned group
  and each normal section, unread rows precede read rows; sections with unread
  activity precede other sections.
- The builds retain the existing large-bundle warnings; signing, notarization and
  production packaging were not part of this verification.
