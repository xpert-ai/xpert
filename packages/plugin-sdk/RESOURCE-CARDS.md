# Conversation Resource Cards

A Resource Card is a persisted receipt for a business resource. File Artifacts remain the content/version/sharing model. Creating a scheduler or Project does not create an empty Artifact. A card may include `resource.artifactId` when it represents an existing file Artifact.

## Emit after a successful tool mutation

```ts
import { emitResourceCard } from '@xpert-ai/plugin-sdk'

const task = await tasks.create(input)
try {
  await emitResourceCard(
    {
      resource: { namespace: 'platform', type: 'scheduled-task', id: task.id },
      title: task.name,
      description: `${task.scheduleDescription} · ${task.timeZone || 'UTC'}`,
      icon: { type: 'emoji', value: '◷' },
      open: {
        target: 'workbench.view',
        viewKey: 'platform.scheduler__detail',
        selectionId: task.id
      }
    },
    runnableConfig
  )
} catch (error) {
  logger.warn('Task created; resource receipt delivery failed', error)
}
return task
```

Tools, middleware and plugin code can use the same helper inside an active Agent run. Pass its RunnableConfig to preserve callback context. The helper dispatches `ON_CHAT_EVENT`; the host binds the actual reply and execution, normalizes to a `MESSAGE` event and persists `type: 'resource_card'` content before forwarding. Emitters cannot choose message ownership. A presentation failure must not report a committed business mutation as failed or trigger another creation.

`resource.namespace + resource.type + resource.id` identifies the receipt **within a single reply**. Re-emitting replaces its snapshot at the same position. Other replies keep their own snapshots. The canonical part ID is produced by `resourceCardId`; callers should not concatenate an ID themselves. Text extraction and model history exclude these parts. Branches retain the content with their owning messages, and history loading never triggers navigation.

Targets are an allowlisted JSON protocol:

- `workbench.view`: required `viewKey`, optional `selectionId`, optional `parameters` containing scalars or scalar arrays.
- `assistant.project`: additionally requires the **platform Project ID** in `projectId`, and a `viewKey`.
- `workbench.file`: required `viewKey`, `fileKey` and `targetId`; opens a file preview with an original-file download action. Optional `previewFile` supplies a separate preview reference.

Targets cannot contain URLs, scripts or arbitrary client commands. Icons use the existing sanitized SVG, emoji or font renderer. Navigation and resource queries still pass through the host's View availability and access checks. An unavailable Workbench, missing View or denied/deleted resource produces feedback instead of an automatic fallback.

The card title/description is a snapshot. Opening loads current business state. There is no background polling. Explicit scheduler-card navigation remembers the selected task per conversation and supports browser refresh/back/forward.

## Composable content and image groups

Use the optional `content` array to compose ordered presentation blocks inside one resource card. Each block can have a `title`:

| Kind            | Items                         | Presentation                                                        |
| --------------- | ----------------------------- | ------------------------------------------------------------------- |
| `image-gallery` | `images: ResourceCardImage[]` | One responsive row initially; More expands the remaining images.    |
| `file-list`     | `files: ResourceCardFile[]`   | File titles, optional descriptions and authorized download actions. |
| `fields`        | `fields: ResourceCardField[]` | Read-only label/value pairs.                                        |

For example, add this `content` property to the card passed to `emitResourceCard`:

```ts
content: [
  { kind: 'fields', fields: [{ label: '状态', value: '已完成' }] },
  {
    kind: 'image-gallery',
    title: '施工配图',
    images: [
      {
        id: 'site-layout',
        title: '施工现场平面布置图',
        alt: '施工分区、出入口和运输路线',
        file: {
          viewKey: 'bid.view-provider__bid.studio',
          fileKey: 'bid-project-image',
          targetId: `${projectId}:${assetVersionId}`
        }
      }
    ]
  }
]
```

New producers emit `content`, not top-level `images`. The reader converts historical top-level `images` only when `content` is absent. Image and file IDs must be unique within their block. The parser accepts up to 32 blocks and 100 items per block; these are transport bounds, not business image quotas. Invalid or unknown blocks are skipped independently.

Reference committed, immutable file versions. The View must declare the file key and implement its authorized resolver. Image previews require the `preview` purpose; download actions require `download`. Do not store signed URLs, private file paths, credentials or base64 pixels in a card.

ChatKit resolves visible thumbnails through the SDK View file-access session/grant API, reads authorized bytes and releases the session. Collapsed images are loaded only after expansion. Clicking an image opens a file preview with its own URL lifetime and an original-file download action. Failed previews can be retried without rerunning the business tool.

Committed cards appear as soon as their events arrive, including while the Assistant reply is streaming. Later events upsert the same card instead of adding duplicates. Cards render independently of text message bubbles and remain available in history.

The stream mapper binds an external Assistant's actual execution from runtime metadata; the root reply owns persistence. External Assistant transcripts retain cards for that execution and its descendants without counting them as tools or process steps. Plugins cannot supply either owner identity in the card payload.

For Bid, `bid_submit_role_task` emits one group only after the illustration task is accepted, including native writing and queued post-writing tasks. Repeated submissions upsert the same group in the current reply. Unaccepted candidates and omitted needs are excluded. An emission failure never changes the accepted submission result.

This extension requires coordinated ChatKit types/UI and host contracts/SDK/server updates before deploying a consuming plugin. Source tests do not upgrade installed packages.

## File preview and original download

Use `workbench.file` for an exported document's Open action. It opens the file preview rather than the business View:

```ts
open: {
  target: 'workbench.file',
  viewKey: 'bid.view-provider__bid.studio',
  fileKey: 'bid-export-docx',
  targetId: exportVersionId,
  previewFile: {
    viewKey: 'bid.view-provider__bid.studio',
    fileKey: 'bid-export-preview-pdf',
    targetId: exportVersionId
  }
}
```

`previewFile` is optional and uses the same `{ viewKey, fileKey, targetId }` reference shape. It can point to a derived PDF for a DOCX original. The preview and original download are authorized independently; Download always resolves the original reference. An unavailable preview can be retried without disabling Download. A resource card itself never grants file access.

Workbench navigation and file access are separate capabilities. If tabs are unavailable, a host can still provide authorized inline images and downloads. Leaving the runtime scope cancels pending file access and closes scoped file previews.

## Transactional first-conversation Project receipts

Implement the public `IProjectTypeProvider.createForConversation` interface and return optional `resourceCards` along with the managed state:

```ts
async createForConversation(context, input) {
  const bid = await input.transaction.save(makeBid({
    platformProjectId: input.projectId,
    title: input.name
  }))
  return {
    name: bid.title,
    status: 'active',
    viewKey: 'bid__projects', // Existing business entry remains independent.
    selectionId: bid.id,
    resourceCards: [{
      resource: { namespace: 'platform', type: 'project', id: input.projectId },
      title: bid.title,
      open: {
        target: 'assistant.project',
        projectId: input.projectId,
        viewKey: 'platform.project-tasks__timeline'
      }
    }]
  }
}
```

The host validates the target against `input.projectId`. It stores pending receipts in `Project.settings.conversationBootstrap` in the same transaction as the business write and conversation binding. `ProjectResourceCardService` locks the Project, then atomically updates the first Assistant message and `resourceCardMessageId`. Streaming begins after commit. A failed attachment leaves a pending receipt; competing first sends claim it once. Manual Project creation has no conversation receipt.

Do not emit directly inside the creation transaction: an event would escape a rollback. Plugins returning no receipts keep existing behavior.

## Scheduler example

`SchedulerAgentMiddleware` declares the `scheduler` Feature. `SchedulerDetailViewProvider` contributes the on-demand `platform.scheduler__detail` View using the built Remote Component assets. Its selection is the stable task ID. Data/actions call existing task access, update, pause and resume services; execution navigation verifies the conversation belongs to that task. Existing cron parsing and other scheduler tools are unchanged.

While the detail View stays open, switching tasks retains each unsaved form draft in memory. Saving commits through the existing service; drafts are not background-saved or polled.

Build assets with:

```sh
corepack pnpm exec tsc -p packages/server-ai/src/xpert-task/remote-components/scheduler-detail/tsconfig.json --noEmit
node packages/server-ai/src/xpert-task/remote-components/scheduler-detail/build.mjs
node packages/server-ai/src/xpert-task/remote-components/scheduler-detail/build.mjs --check
corepack pnpm remote-view:preview --config packages/server-ai/src/xpert-task/remote-components/scheduler-detail/preview.config.mjs --port 4325
```

The preview explicitly uses fixture data, not a live scheduler.

## Coordinated dependency rollout

1. Build/release ChatKit types and Xpert SDK message contracts.
2. Build/release ChatKit UI and wrappers together. Verify the iframe assets contain `resource_card` handling.
3. Update the platform's single ChatKit catalog and relevant dependency lockfiles to those published versions, then build/release platform contracts and plugin-sdk against them.
4. Build Bid against that public plugin-sdk (no local decorator/interface shim), run `verify:dist`, then deploy the matching host and plugin.

Platform contracts re-export the protocol from `@xpert-ai/chatkit-types`; plugin-sdk re-exports those contracts. Building local source does not publish packages or update the platform's pinned dependencies. Verify the installed release supports `content` blocks and `workbench.file` before deploying consumers. Local Bid workspace overrides may resolve sibling builds; do not describe a source alias or preview as a deployed package upgrade.

Existing message JSON is additive and needs no migration, new Artifact table or historical backfill.

## Agent task results

Browser views import result schemas and types from `@xpert-ai/plugin-sdk/agent-results`.
This public entry only exports portable result contracts and Zod validation; the SDK root also exports server dependencies.
Do not reach into another package's `src` directory or import the server SDK root from a browser bundle.

`emitResourceCard(card, runnableConfig)` emits the existing ChatKit `resource_card` contract. It does not create an Artifact or grant access to one. Emit after the referenced business object has been committed.

```ts
await emitResourceCard(
  {
    resource: { namespace: 'my-plugin', type: 'report', id: report.id },
    title: report.title,
    open: { target: 'workbench.view', viewKey: 'my-plugin__reports', selectionId: report.id }
  },
  config
)
```

Use stable namespace/type/id values. Repeated observations update the same card in the current reply. The host supplies `messageId` and `executionId`, persists the card, and excludes it from model/transcript text. Callers cannot choose another reply. The registered View must recheck authorization on every read and file download. Do not put credentials, arbitrary URLs, commands, or private paths in navigation parameters.

Task results use the provider-neutral `AgentResultItem` union: analysis, changes, tests, and explicitly declared file deliverables. File delivery defaults to `none`; `files` exports only the declared files and `archive` packages only an explicit selection. Export failure is recorded separately from task execution. A card for an exported artifact refers to the committed artifact and opens the authorized task results View.

New artifact references must include the committed `versionId`. The task-results View will not download older references without a pinned version: falling back to the current artifact version could deliver unrelated later content. Such task results remain readable.

Middleware using the host task-results View declares `AGENT_TASK_RESULTS_FEATURE` in `meta.features`. The View uses `AGENT_WORKBENCH_SLOT`, opens on demand, and declares support for selection and parameter queries. Other plugins should register their own governed View and feature; emitting a card alone does not activate a View.

Local rollout requires the matching ChatKit types/UI with resource-card support, then host contracts/SDK/server, then consuming plugins. Building a local SDK does not publish a new registry package.

`api:build` builds the task-results browser bundle before copying its assets. For a source-run API, first run `corepack pnpm nx run api:build-agent-results`. Generated `app.js` and `app.css` are ignored; commit the source and build configuration only.
