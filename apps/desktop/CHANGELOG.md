# @xpert-ai/desktop

## 0.3.0

### Minor Changes

- 4fff330: Upgrade the shared ChatKit packages to 0.13.0 across Cloud, Desktop and server-side chat contracts, keeping workspace and deployment dependency locks aligned.

  Support shared group conversations with human and digital expert participants through the existing ChatKit chat, composer, header and workbench. Include participant-aware messages, member management and links to digital expert execution conversations, along with the new-tab workbench fallback and model names in context usage information.

### Patch Changes

- 074fe87: Resolve macOS signing entitlement files from the Desktop app directory so certificate-signed CI installers can read the app and helper permissions from the isolated workspace.
- 1d82d89: Fix Bosi installer builds on all platforms by resolving the signing verification hook from the Desktop app directory. Preserve microphone entitlements in ad-hoc macOS builds so audio capture passes the same signing checks as certificate-signed builds.
- 1df2927: Allow certificate-free ad-hoc macOS signing in pull-request builds so the packaged app, Electron helpers and native recorder pass the audio entitlement checks. Keep certificate secrets restricted to branch builds.
- 17e0342: Add a generic, user-initiated microphone and system-audio capture capability on macOS 15+. Deliver versioned capture events and WAV chunks to callbacks declared by the requesting plugin View, with encrypted local buffering, resumable delivery, device ownership checks, and shutdown on sleep or account changes. Keep application workflows in plugins and publish the shared command and delivery contracts.
- b7b2dd1: Include microphone entitlements in macOS app and helper signatures and verify packaged audio executables after signing. Share native microphone permission checks between realtime voice and plugin audio capture, report signing and consent failures before opening a voice session, and detect missing input or sustained digital silence during calls without treating intentional mute as a fault. Distinguish system-audio permission failures from microphone failures.
- 7b1c018: Fix missing Assistant avatars imported from templates in Desktop by preserving validated inline image Data URLs in Assistant lists and template/expert catalogs. Share avatar URL normalization, enforce the existing 5 MiB avatar limit for embedded images, and retain emoji and default-avatar fallbacks for unsupported URLs.
- 4d2d5ae: Show the current organization's unread Assistant message total on the macOS Dock icon. Share a main-process activity snapshot with the sidebar, keep polling while the window is hidden or closed, and refresh after messages are marked read. Clear counts on account, organization, or server changes, reject stale responses, and avoid double-counting local Assistant copies.
- Updated dependencies [17e0342]
  - @xpert-ai/desktop-protocol@0.3.0

## 0.2.1

### Patch Changes

- b86bba1: Add resumable personal Bosi onboarding with tenant, organization and user isolation, private workspace preparation, workspace service connections, capability-aware model selection and recoverable template installation. Reuse existing Assistant bindings and persist initialization and welcome progress.

  Add authorized public Assistant name and avatar updates, a Desktop appearance studio with configurable characters, uploaded images and pets, and ChatKit appearance and computer controls. Preserve published configuration when saving profile fields and keep Assistant capability changes behind explicit settings saves.

- 01fd502: Add the on-demand Conversation Map Workbench View with shared shadcn controls, React Flow layouts, searchable conversation and branch navigation, and host-backed display preferences. Include compact directory rows, content-sized cards, accessible action tooltips, and reproducible source builds.

  Use `agent.workbench` as the canonical Assistant Workbench slot. Normalize legacy `agent.workbench.fixed` and `agent.workbench.main` requests and plugin declarations at the host boundary, preserving authorization and opening preferences without duplicate views.

- b86bba1: Ship grouped Desktop settings, usage and integer-point views, account registration entry points, and language initialization from system and account preferences. Preserve preferences when Keychain access is denied and retain existing conversation appearance choices while defaulting new users to bubble mode.

  Refresh the Assistant list on native window activation without refreshing it when focus moves between the sidebar and conversation. Upgrade the embedded ChatKit integration to the shared 0.10.0 release.

- ada086b: Declare jsdom as a direct Desktop development dependency so isolated installer builds can run the renderer tests without relying on transitive server dependencies. Regenerate the Desktop dependency lock for reproducible CI installs.

  Use ES2020-compatible quote escaping for execution usage CSV exports so the Web production build succeeds without raising its browser library target.

  Exclude test-support directories from the server-ai production compilation so Jest mocks remain available to tests without entering API build output.

- b86bba1: Preserve host-provided root font size and corner-radius variables in remote Views. Make shared React theme utilities prefer the corresponding host radius values and clamp fallback radii so compact themes remain valid.
  - @xpert-ai/desktop-protocol@0.2.1

## 0.2.0

### Minor Changes

- e4485ba: Release Bosi Desktop, API and Webapp together for configurable digital experts.

  Bosi can create blank assistants and edit their model, optional capabilities and instructions. Personal profile overrides remain local, while shared assistant settings require workspace edit access and take effect after publishing.

  Add an extensible Assistant capability registry, model and runtime compatibility checks, and configuration APIs with stale-edit protection. Keep cloud computer support in the Pro capability provider, and preserve existing workflow settings when managed capabilities change.

- cf671da: Add desktop update discovery, a sidebar download button with live progress, and explicit install/restart confirmation. Publish verified update feeds per operating system and architecture alongside stable release installers.
- 99d09ec: Release a coordinated minor update across all Xpert workspace packages, including the API, Web and Bosi applications, shared SDK and contracts, backend and UI libraries, bundled plugins, sandbox runtimes and documentation.

### Patch Changes

- 43d9c79: Default Bosi connections to the hosted Xpert API, Web and ChatKit deployments, and support customer-specific URLs embedded at build time through environment variables or a JSON file. Preserve saved connections and support API endpoints with or without the /api suffix.
- cbeb150: Fix Desktop installer builds when signing secrets are unset, keep Linux x64 artifact names consistent, and make Shell authorization tests independent of the build host's home directory.
- cccbc9d: Build Bosi installers for macOS, Windows and Linux on x64 and arm64 with Changesets-controlled candidate and stable releases.

  Complete Traditional Chinese and Japanese translations for local Shell permissions so release validation covers every supported language.

  Declare the document preview dependency required by standalone Desktop builds.

- 0d6f2d3: Support trusted private deployments with an opt-in connection setting for untrusted service certificates. Apply the setting only to configured API, Web and ChatKit hosts, including Desktop Shell connections, and reset connections when the policy changes.

  Check service certificates independently of this setting and show non-blocking warnings with specific certificate or network errors. Keep certificate warnings visible when connections are allowed, while preserving normal certificate validation by default.

- ce73ebe: Upgrade the shared ChatKit packages to 0.8.0 across the API, Web and Bosi desktop applications.
- Updated dependencies [99d09ec]
  - @xpert-ai/desktop-protocol@0.2.0
