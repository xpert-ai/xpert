# Bosi Desktop onboarding and public appearance

Bosi is the Desktop entry point for a user's personal assistant in an organization. It reuses the existing `AssistantCode.CLAWXPERT` binding with `AssistantBindingScope.USER`, scoped by tenant, organization and user. The Desktop name does not rename the platform's ClawXpert template or invalidate existing bindings.

## First-run experience

After login and organization selection, Desktop reads the binding. An existing accessible assistant opens directly, without reinstalling it or changing its capabilities. An inaccessible binding or failed request produces an error rather than being treated as an invitation to create another assistant.

Users without a binding proceed through:

1. **Introduction**: what Bosi can help with.
2. **Capabilities & services**: optional plugins and connections available in the organization. An empty, non-actionable catalog skips this step; a failed request retains retry and skip options.
3. **Computer, local Shell and model selection**: cloud computer is selected by default when available; local Shell starts off and retains the existing command approval flow. The server supplies capability availability and compatible models, and Desktop additionally checks native Shell support. The searchable model picker groups models by provider and displays feature badges, including vision recommendations for computer use. A compatible organization default model is preferred.
4. **Creation and welcome**: install and publish the assistant, open its initial conversation and explicitly start the welcome run. The welcome prompt requests a brief introduction of enabled capabilities and an invitation to customize the name and avatar.

The `xpert-bosi-assistant` template derives from `xpert-my-claw-xpert`, preserving its skills, memory, planning and workflow. Selected capabilities and Desktop welcome instructions are composed through the shared [assistant capability mechanism](assistant-capabilities.md).

The computer illustration is a bundled preview, not a live desktop. Application hotspots change the preview caption; they do not launch applications, install software or provision a computer. The live computer view is available through the conversation's assistant dialog when the capability is available.

## Personal workspace and optional services

The first catalog or creation request reserves a private workspace owned by the current user, with no other members, and records it in the binding's `desktopOnboarding` checkpoint. The shared `EnsurePersonalDefaultWorkspaceCommand` resolves this workspace within the current tenant and organization. It does not use a team authoring workspace as the personal Bosi workspace or change the user's authoring default preference. Existing assistants retain their workspace.

The onboarding catalog comes from organization Agent Plugin packages and registered Connector definitions. It is not a fixed list of recommended brands. A short list, such as Documents alone, reflects the available packages and providers in that scope. Organization recommendation administration is outside this feature.

Do not confuse the underlying workspace package catalog with the onboarding status: a workspace package marked `not_published` can still be offered for installation, while `available` means it is already installed in that workspace. The onboarding API translates these inputs into selectable, ready, authorization-required, expired, configuration-required or unavailable states. Missing expert mappings or service registrations are reported with a reason.

Selecting a plugin uses the existing workspace installation service and pins the installed resource version. Deselecting removes Bosi's default selection; it does not uninstall the workspace resource. Choice updates require the current revision so multiple windows cannot silently overwrite one another.

Connecting a service opens the existing Cloud authorization page at `/workspace-connection?workspaceId=...&bindingId=...&organizationId=...`. The server verifies the reserved private workspace and connection ownership. Desktop validates the organization, service generation and connection attempt when processing the result. Credentials are not placed in this URL. Connections use the existing `shared` workspace authorization mode; the UI explains that sharing the workspace later may also share service access.

The conversation initializer applies selected resource versions and active connections once to the owner's Bosi welcome conversation and subsequent new conversations. It skips project conversations, other users' conversations and already-applied defaults, and preserves explicit runtime resource and connector settings. Selection is not an authorization grant: resource scope, versions and connection status remain subject to runtime checks.

## APIs and recovery

Host requests use authenticated tenant, organization and user context. Body or query parameters cannot replace that authorization scope. The controller validates input through the shared Zod validation pipe.

| Method and path                                                  | Purpose                                                                                |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /api/assistant-binding/bosi/setup?capabilities=...`         | Read binding, recovery phase, capability availability and compatible models.           |
| `POST /api/assistant-binding/bosi/workspace`                     | Resolve the reserved personal workspace for clients using the separate workspace step. |
| `POST /api/assistant-binding/bosi/onboarding`                    | Reserve the private workspace and read the catalog and current choices.                |
| `POST /api/assistant-binding/bosi/onboarding/choice`             | Save a plugin or connector choice using its revision.                                  |
| `POST /api/assistant-binding/bosi/onboarding/connection`         | Create or reuse a workspace connection and return its authorization target.            |
| `POST /api/assistant-binding/bosi/onboarding/connection/resolve` | Validate the reserved workspace and connection, then read authorization status.        |
| `POST /api/assistant-binding/bosi/bootstrap`                     | Idempotently install, publish and bind Bosi using `modelId` and `capabilities`.        |
| `POST /api/assistant-binding/bosi/welcome`                       | Start or recover the welcome run.                                                      |
| `GET /api/xpert/:id/appearance`                                  | Read public name, avatar, edit permission and appearance revision.                     |
| `POST /api/xpert/:id/appearance`                                 | Save public name and avatar using that revision.                                       |

`capabilities` contains the supported `cloud-computer` and `desktop-shell` keys; the setup query uses a comma-separated list. Bootstrap rechecks capability and model availability rather than relying on an earlier setup response.

The nullable `desktopBootstrap` JSON checkpoint records the chosen model and capabilities, imported assistant, initial thread and stable welcome message identity. Its phases are `installing`, `welcome_pending`, `welcome_running`, `ready` and `welcome_failed`. A database session lock serializes initialization for the same tenant, organization and user. A competing request receives HTTP 409 and can refresh state to recover the existing operation.

Interrupted installation resumes the imported draft. Welcome execution uses the normal Thread and Run commands with `on_disconnect: continue`. The server reconciles its checkpoint with persisted execution status. If an AI message exists, a failed welcome retries the previous execution; a preflight failure without an AI message reuses the original thread and client message identity. Completed welcomes are not automatically repeated, and retries do not create another assistant.

The full bootstrap checkpoint is a server-only schema. Public `progress` exposes only `phase`, `capabilities`, `modelId` and `threadId`. Draft and welcome execution identities stay on the server. The conversation's `bosiDefaultsApplied` marker is also server-only and keeps its existing JSON key to avoid reapplying defaults to old conversations.

Organization membership policy is resolved through the shared `ResolveUserOrganizationAccessCommand`, including the platform's super-admin role handling. Bosi still performs its own binding, workspace and authoring checks; it does not create membership records or grant permissions to make initialization succeed.

## Public name and avatar

**Customize your assistant** edits public Assistant metadata. The dialog states that everyone using the assistant can see the change. Readers can preview appearance, but saving and uploading require the existing workspace authoring permission in the current organization. The profile description remains a local display override; the public name is changed in the appearance dialog.

Saving checks an appearance revision and updates only `title`, `titleCN` and `avatar`. It does not overwrite workflow, instructions or unpublished drafts and does not require publishing a new workflow version. After saving, Desktop refreshes its list and active ChatKit configuration.

`TAvatar.appearance` has `version: 1` and an explicit `kind`: `character`, `pet` or `image`. Appearance and character types are re-exported from ChatKit types through [the contracts package](../packages/contracts/src/types.ts). The existing `url` static preview and emoji fields remain available to older avatar components.

Character and pet IDs are extensible resource strings, not enums of built-in names. Validation limits their length and safe characters. Pet assets can be a `sprite-atlas` or `animated-image` with a resource URL. Legacy pets identified only by ID retain the frame's `/pets/<id>/spritesheet.webp` convention.

Desktop loads the pet catalog from `/pets/catalog.json` on its configured ChatKit frame origin rather than maintaining a second fixed ID list. Catalog and asset requests are bounded and constrained to that origin and safe pet paths. New bundled pets are delivered by publishing the frame's catalog and assets. Uploaded pets do not need a built-in catalog entry.

The appearance library includes the Bosi animation, cartoon presets, configurable characters, pets and image uploads with square cropping. Uploads use platform file storage; cropped avatars produce a static PNG preview. Pet imports support animated images, both supported sprite-atlas versions and single-pet ZIP packages. See [Pet sprite import](pet-sprite-import.md) for dimensions, manifest fields, limits and validation. No AI image generation is part of this flow.

### Character editor

The visual editor exposes shape, expression, brows, mouth, color and motion through preview buttons rather than native selects. Character configuration supports 12 shapes, 11 eye styles, 5 brow styles and 5 mouth styles. Face controls include eye size (60–150%), spacing (55–160%), tilt (−15° to 15°) and automatic, dark or light ink. Motion supports float, bounce, sway or none, with speed (0.5–2×) and natural blinking. Optional fields keep older saved configurations usable.

The main preview has an expression ring, a rotating shape arc below it, and a horizontal color/activity bar. Hovering over the color control reveals preset swatches; its center opens custom color selection. Click and keyboard interactions can keep it open, while Escape and outside clicks close it. Brows, mouth and motion controls live in the left panel; the right panel holds the name, face adjustments, actual-size previews and presets.

The eight activity previews affect only the editor. They are never saved as the assistant's live state. Desktop's SVG previews and the ChatKit frame must render the shared configuration consistently, including reduced-motion behavior.

## Conversation character and summary dialog

ChatKit's `header.character` enables the centered character and compact activity bubble in message mode for assistants. The bubble reflects real execution and approval states rather than repeating full replies. Record mode retains its compact header. New Desktop configurations default to message bubbles; existing presentation settings are preserved.

Clicking the character or the existing summary button controls the same non-modal dialog on the right. It reuses task summary artifacts, pagination and resource-opening behavior. The centered character hides while the dialog is open and returns when it closes. Outside clicks, Escape and the close button dismiss it; interacting with the composer should retain input focus. The customization entry is inside this dialog, not under the centered character.

The dialog includes cloud computer and local Shell entries with actual availability and connection state. The cloud entry opens the registered computer view; the local entry opens the existing Shell panel. These entries do not grant execution permission. ChatKit emits `assistant.customize` and local `assistant.computer.open` effects for Desktop to handle, while platform requests in the frame continue through the Xpert SDK.

Assistant appearance comes from public Assistant data. Desktop disables the additional global roaming pet, and a user's global pet preference does not replace the assistant's pet.

## Deployment and verification

Deploy the server and contracts, Cloud authorization page, ChatKit frame, then Desktop. Deployments that manage database structure outside ORM synchronization must apply these additive, nullable-column migrations in order:

1. [Bootstrap checkpoint migration](../packages/server-ai/src/assistant-binding/migrations/20261003-bosi-bootstrap.sql).
2. [Onboarding preferences migration](../packages/server-ai/src/assistant-binding/migrations/20261004-bosi-onboarding.sql).

Existing bindings require no backfill. Keeping internal checkpoint types server-only changes no JSON storage keys and needs no additional migration. Desktop reports an upgrade requirement when an old server lacks the initialization APIs.

Generic onboarding, template composition, appearance APIs and Desktop UI remain available in OSS. The cloud computer implementation is provided by Pro's capability registration; a deployment without that provider shows its actual unavailable state.

For changes to this flow, validate:

- Tenant, organization and user isolation; old binding reuse; concurrent creation; interrupted installation; welcome retry and duplicate prevention.
- Plugin selection revisions, private workspace reuse, connection authorization and preservation of explicit conversation settings.
- Computer/Shell combinations, unsupported clients, model availability and server-side revalidation.
- Public appearance permissions and conflicts, upload failure, legacy avatars, sprite versions, pet switching and metadata refresh across clients.
- Real activity transitions, artifact and computer view opening, dialog dismissal and focus restoration, themes, narrow windows, keyboard operation and reduced motion in Electron.

Relevant regression suites live alongside [bootstrap and onboarding](../packages/server-ai/src/assistant-binding/bosi), [public appearance](../packages/server-ai/src/xpert/assistant-appearance) and [Desktop Host tests](../apps/desktop/tests). Run the related backend and Desktop tests/build, plus ChatKit types and component checks when changing the shared frame contract. Runtime computer and third-party authorization checks need an environment with the corresponding services.
