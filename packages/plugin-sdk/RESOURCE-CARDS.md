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

Targets cannot contain URLs, scripts or arbitrary client commands. Icons use the existing sanitized SVG, emoji or font renderer. Navigation and resource queries still pass through the host's View availability and access checks. An unavailable Workbench, missing View or denied/deleted resource produces feedback instead of an automatic fallback.

The card title/description is a snapshot. Opening loads current business state. There is no background polling. Explicit scheduler-card navigation remembers the selected task per conversation and supports browser refresh/back/forward.

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
3. Build/release platform contracts and plugin-sdk, then update the platform's single ChatKit catalog and SDK dependency/lockfile to those actual published versions.
4. Build Bid against that public plugin-sdk (no local decorator/interface shim), run `verify:dist`, then deploy the matching host and plugin.

This change prepares changesets; it does not publish packages or deploy production. The platform contracts temporarily vendor the same parser while installed ChatKit 0.7.0 lacks it; keep the two implementations identical and replace the compatibility copy with a re-export when the new types package is published. Local Bid workspace overrides resolve the sibling built contracts/plugin-sdk. Do not describe a source alias or preview as a deployed package upgrade.

Existing message JSON is additive and needs no migration, new Artifact table or historical backfill.
