# Assistant Channels and Automations

The existing profile panel keeps its theme, shadcn components, avatar/header and custom View lifecycle. Its native tabs are Activity / Channels / Automations / About. Published capability counts now live in About. Opening a configuration dialog holds the profile lock until the dialog closes.

Channels show account labels, provider response settings, runtime connection state and recent activity. Their setup flow is account → response scenarios → validation and activation. Account selectors reuse organization-scoped Integration and workspace Connector select-options APIs. New credentials and OAuth authorization remain in the platform's existing account settings; credentials are not stored by the desktop or copied into Trigger graphs. A validated configuration is distinct from a connected runtime.

Automations use trigger type → conditions → optional instructions → review. Schedule has hourly, daily, weekday and weekly controls plus a custom cron option. Schedules follow the server timezone, matching the existing scheduler. Editing preserves the provider task and unexposed config fields. Additional instructions are stored in `IWFNTrigger.config.additionalInstructions` and append to the automatic run's input, including standard agent-chat handoffs, while the assistant's published instructions, skills, tools and connectors are inherited. The runtime handles this common field separately from provider schema validation and provider lifecycle calls.

## Provider contract and availability

`TWorkflowTriggerMeta.assistant` optionally declares `category`, a channel identifier or automation `kind`, account config field names and an optional `instructionField`. `configSchema` remains the existing provider-owned schema and validation source. The platform only forwards declared metadata and activity/run timestamps; it has no hard-coded provider catalog or default UI category. Bosi owns compatibility mappings for canonical Telegram, Linear, Lark, WeCom, Slack, Discord and Schedule provider IDs in `src/profile/triggers/model.ts`. Explicit provider metadata takes precedence; Bosi shows unclassified legacy providers as app-event automations. Labels never determine classification.

Telegram and Linear are the initial channel UI adapters; Lark supports QR quick connection when its plugin is installed; WeCom, Slack and Discord have reserved catalog entries. The repository does not ship Telegram or Linear runtime strategies. They become connectable only when the server registers the matching strategy (or a strategy with explicit presentation metadata). The desktop never substitutes mock connections for missing plugins. Webhook, Email and App Event likewise require an installed provider of that kind. Advanced/nested schemas use the existing Xpert editor instead of silently dropping fields.

The current trigger runtime is keyed by provider, with one binding per provider per assistant. The picker marks existing providers as configured; edits reuse the existing node. Multiple independent schedules would require changing the underlying scheduler/trigger identity contract and are not simulated by this UI.

## QR quick connection

Providers declaring `TWorkflowTriggerMeta.quickConnect.method = 'qr'` offer **Connect with QR code** in the channel wizard. This reuses the existing assistant-scoped `trigger-connections/:provider/qr` lifecycle (begin, poll, complete, cancel). Authorization activates the selected channel with the provider's default response settings; existing provider config is preserved when reconnecting. Advanced response settings remain available in Xpert. The desktop forwards only public QR/session/status fields. App credentials and device codes stay in the provider/Redis/Integration services, never in the renderer or Trigger graph.

QR creation waits until the effect is retained, so React StrictMode does not start competing server sessions. Stable server error codes distinguish authorization already in progress, unpublished trigger changes and unpublished assistants; only whitelisted local messages reach the renderer. The QR view handles expiry, denial, cancellation, activation failure/retry and late responses after closing. A successful authorization is only shown as connected after runtime activation succeeds. Channel mutations require workspace author access as well as the integration permission checked by the existing controller.

## Persistence and authorization

`GET /api/xpert/:id/trigger-settings`, `POST .../validate` and `POST .../trigger-settings` are narrow adapters over `IWFNTrigger`, `TXpertGraph` and `XpertPublishTriggersCommand`. No Channel/Automation tables or alternate scheduler are introduced. Requests use the desktop host's authenticated organization context. The server checks workspace read/author access independently, validates provider config, checks a revision, locks the assistant row, and patches only the selected trigger and matching draft node. Unrelated draft edits remain unpublished. Runtime activation failures roll back graph persistence and attempt runtime restoration.

Recent channel activity uses conversation update time; automation last-run uses conversation creation time, scoped to this assistant and provider. Missing timestamps remain unavailable. A provider without runtime connection telemetry displays Configured rather than Connected. Read-only, loading, retry, empty, unavailable-provider and stale-save states are explicit.

## Verification and UI fixtures

The development-only fixture is `tests/fixtures/trigger-preview.html`; it imports an in-memory host fixture and is not part of the production build. Query parameters include `empty`, `readonly`, `error`, `conflict`, `dark`, `locale=zh-Hans`, `qr-expired`, `qr-denied`, `qr-retry`, `qr-waiting` and `qr-delay` and `strict`. QR browser checks run under StrictMode against a fixture that rejects overlapping session creation. It does not access real accounts or mutate the platform.

From the repository root:

```sh
corepack pnpm exec nx build contracts
corepack pnpm --dir apps/desktop build
NODE_OPTIONS=--experimental-strip-types corepack pnpm --dir apps/desktop test
corepack pnpm exec jest --config packages/server-ai/jest.config.ts --runInBand --runTestsByPath packages/server-ai/src/xpert/configuration/assistant-trigger.service.spec.ts packages/server-ai/src/xpert/commands/handlers/publish-triggers.handler.spec.ts
corepack pnpm --dir apps/desktop exec vite --host 127.0.0.1 --port 4391 --strictPort
# In a second terminal; Playwright is available in this workspace:
node apps/desktop/scripts/test-trigger-ui.mjs
```

The browser check covers QR authorization, expiry/retry, denial, cancellation and activation retry, the tab merge, channel setup/test/save, automation CRUD and pause/resume, preserved edits, light/dark themes, read-only access, load errors and conflict recovery. Screenshots default to `/tmp/bosi-trigger-ui`; override with `BOSI_UI_OUTPUT`.
