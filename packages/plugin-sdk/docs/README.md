# Plugin SDK

## Runtime capabilities

See [platform capabilities and scoped factories](./en/runtime-capabilities.md) for domain registration, execution-scoped APIs and usage outside Agent middleware.

See [knowledgebase APIs](./en/KNOWLEDGEBASE_API.md) for resource discovery, readiness, permissions and migration from legacy listing.

## Model adapters

See [OpenAI-compatible Embedding usage callbacks](./openai-compatible-embeddings.md) for shared vector clients and host-owned accounting.

## Building

Run `nx build plugin-sdk` to build the library.

## Running unit tests

Run `nx test plugin-sdk` to execute the unit tests via [Jest](https://jestjs.io).

## Schema config

[Schema UI Extension Specification](./en/SCHEMA_SPECIFICATION.md)

## Permissions

[Plugin Permission Design Guide](./en/PERMISSIONS.md)

## Provider registries

Use `BaseStrategyRegistry` for discovery, plugin lifecycle events, scope precedence and lookup. `findByName(name, organizationId?)` returns `undefined` for an unavailable registration; `get` requires a match. The base class cancels its bus subscription when the module is destroyed. Existing registry naming and replacement policies remain unchanged.

Opt into `NamedProviderRegistry<T>` when a provider category requires plugin-qualified names, implementation validation and rejection of a different live instance with the same name in the same scope. Pair it with `definePluginRegistration` so ownership and duplicate declarations are also checked before module initialization. An existing instance may be registered again; replacement requires removing the previous registration first. Rejected dynamic registrations are logged without replacing the existing instance or preventing later lifecycle events. Initial discovery errors still fail module initialization.

```ts
const REPORT_RENDERER = 'EXAMPLE_REPORT_RENDERER'
export const ReportRenderer = definePluginRegistration(REPORT_RENDERER, 'report renderer')

interface ReportRendererApi {
  render(input: string): string
}

@Injectable()
export class ReportRendererRegistry extends NamedProviderRegistry<ReportRendererApi> {
  constructor(discovery: DiscoveryService, reflector: Reflector) {
    super(REPORT_RENDERER, discovery, reflector)
  }

  protected isProvider(instance: object): instance is ReportRendererApi {
    return 'render' in instance && typeof instance.render === 'function'
  }
}
```

Import `NamedProviderRegistry` and `definePluginRegistration` from `@xpert-ai/plugin-sdk`, `Injectable` from `@nestjs/common`, and `DiscoveryService` / `Reflector` from `@nestjs/core`. Register the registry in a module with the host's discovery and strategy bus providers. A plugin implementation can use `@ReportRenderer('@example/reports:preview')`; its name belongs to that installing plugin. `findByName(name, organizationId?)` uses the base class's scoped lookup. The two Widget registries use this same opt-in layer and provide only their own interface validation and action resolution.

## A2UI Widget actions

Declare one action provider per Widget type in your plugin's Nest module. Its `actions` map contains named handlers that share the provider's dependencies. For `@example/dashboard:review`, the local action `publish` has the full name `@example/dashboard:review.publish`. Use that full name in both the A2UI button action and the containing surface's `serverActions`.

```ts
@WidgetActionProvider('@example/dashboard:review')
export class DashboardReviewActions implements IWidgetActionProvider {
  constructor(private readonly dashboards: DashboardService) {}

  readonly actions = {
    publish: {
      execute: async (context: WidgetActionContext) => {
        await this.dashboards.publishFromWidget(context)
        return { refresh: 'thread' as const }
      }
    },
    cancel: {
      execute: async (context: WidgetActionContext) => {
        await this.dashboards.cancelReviewFromWidget(context)
        return { refresh: 'thread' as const }
      }
    }
  }
}

@Module({ providers: [DashboardService, DashboardReviewActions] })
export class DashboardPluginModule {}
```

Import `WidgetActionProvider`, `IWidgetActionProvider` and `WidgetActionContext` from `@xpert-ai/plugin-sdk`. Each map entry implements `IWidgetActionHandler`; local names contain only letters, digits, underscores or hyphens. The host resolves the exact provider namespace and an explicitly declared own action. It does not invoke arbitrary provider methods or inherited object properties. Registration and unloading apply to the whole action set.

The host checks thread access, the assistant message and the current action declaration restored from a server-issued Widget reference. Client-editable message content cannot authorize an action. The domain service validates the form, authorizes the caller for the target resource and handles repeated submissions. An action entry for a dynamically reconstructed card can set `widgetSource: 'receipt'`. Its `execute` handler must then verify the thread, assistant message, Widget ID and allowed operation against its own server record before changing state. Message rendering and action handling remain separate contracts; register both providers in the same business module.

Both decorators declare a registration category and name. Before Nest constructs providers, the host checks the name against the installing plugin and rejects duplicate names within a category and installation scope. New plugin-owned named strategies can use `definePluginRegistration(metadataKey, kind)` for the same preflight.

### Publish and restore a dynamic card

Register a `@MessageWidgetProvider` alongside the action provider in the plugin module. Calling `publishWidget()` during an active reply emits a Widget block at that point in the message stream, after its reference is persisted. The host binds the calling execution and thread, saves the block's position in the reply, and starts a separate text block for subsequent text. A producer that already knows the persisted assistant message may specify `messageId` in that thread. Both forms use a stable Widget ID from the domain record. Reissuing the same binding updates the original block without moving it. References without a streamed position remain recoverable at the end of the reply.

```ts
@MessageWidgetProvider('@example/dashboard:review')
export class DashboardReviewCards implements IMessageWidgetProvider {
  constructor(private readonly dashboards: DashboardService) {}

  issue(capabilities: RuntimeCapabilityRegistry, widgetId: string) {
    return capabilities.require(ConversationRuntimeCapability).publishWidget(this, {
      widgetId,
      provider: '@example/dashboard:review'
    })
  }

  resolve(references: readonly MessageWidgetReference[]) {
    return this.dashboards.reviewWidgetsForCurrentViewer(references)
  }
}
```

Import the capability, provider and types from `@xpert-ai/plugin-sdk`. Pass the registry from the current middleware invocation. Add `DashboardReviewCards` and the action provider to the same module's providers. Live publication, message completion, history reads and reconnect snapshots call `resolve` with the issued references for that provider and restore each card at its original position. Return authorized `{ messageId, widget }` pairs with the original Widget IDs and current `serverActions`. To show a card in restricted sessions, explicitly set `visibleInRestrictedSessions = true` and return only fields safe for that viewer. Provider resolution is bounded to two seconds; unavailable cards are omitted without blocking the reply indefinitely. Unloading the provider hides its cards. Reinstalling the owning provider can restore them from the same references.

## Decorator-driven business Tools

Use `@XpertToolProvider()` on one injectable business class and `@XpertTool()` on its methods when the same domain operation should be available as an Agent Middleware Tool, a host-native MCP Tool, or both. Register only the decorated class in the plugin Nest module; the host expands it into one native Toolset and the declared Middleware groups.

```ts
import { XpertTool, XpertToolProvider, type XpertBusinessToolContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'

const inputSchema = z.object({ query: z.string().trim().min(1).max(200) }).strict()
const outputSchema = z.object({ items: z.array(z.object({ id: z.string() }).strict()) }).strict()
const resultsApp = {
  key: 'order_results_app',
  entry: 'dist/mcp-apps/order-results/index.html',
  title: 'Order results',
  csp: { connectDomains: [], resourceDomains: [] }
}

@XpertToolProvider({
  provider: 'order_ops',
  componentKey: 'order-operations',
  name: 'Order Operations',
  apps: [resultsApp],
  defaultMiddleware: 'OrderCoordinationMiddleware',
  middlewares: [{ provider: 'OrderCoordinationMiddleware', meta: coordinationMeta }]
})
export class OrderOperationsTools {
  @XpertTool({
    name: 'orders_search',
    description: 'Search orders in the active organization.',
    inputSchema,
    outputSchema,
    middleware: true,
    mcp: {
      behavior: { risk: 'read', sideEffect: 'none', idempotency: 'safe' },
      requiredContext: ['tenant', 'organization', 'principal', 'execution'],
      visibility: ['model', 'app'],
      app: { resourceKey: resultsApp.key }
    }
  })
  async search(input: z.infer<typeof inputSchema>, context: XpertBusinessToolContext) {
    return this.service.search(context.organizationId, input)
  }
}
```

MCP exposure is explicit. Provide strict Zod input/output schemas and return an allowlisted DTO; the host validates the output and maps it to `structuredContent` and a JSON `TextContent` block so clients that only expose text can still read the result. With `resultFormat: 'tool_result'`, image and other content blocks are preserved and the validated structured metadata also receives a JSON text fallback. Invocation context is constructed for every call and must never be cached on the Provider singleton. `getMiddlewareExtensions()` may add Agent-only hooks such as `wrapToolCall`, but business-critical behavior belongs in the method or shared service.

For connection configuration, declare the form in `configSchema` and optionally implement
`validateConfig(config: unknown): void | Promise<void>` on the Provider. The native Toolset
adapter awaits this hook when a host configuration-save path invokes `validateConfig`,
including MCP service configuration tabs. Reuse invocation validation rules and reject
invalid values with a sanitized error; never include credentials in the error message.
The hook validates values only: it does not persist or normalize them, and does not replace
per-invocation authorization. Providers without the hook retain their existing behavior.

Use the same `@XpertToolProvider` class for every capability:

| Decorator                | Method signature                                                | Result                       |
| ------------------------ | --------------------------------------------------------------- | ---------------------------- |
| `@XpertTool`             | `(input, context)`                                              | Tool DTO or content envelope |
| `@XpertResource`         | `(context: ResourceReadContext)`                                | `McpResourceReadResult`      |
| `@XpertResourceTemplate` | `(args: Record<string, string>, context: ResourceReadContext)`  | `McpResourceReadResult`      |
| `@XpertPrompt`           | `(args: Record<string, string>, context: ToolExecutionContext)` | `McpPromptResult`            |

No business base class is required. All four decorators support inherited methods;
a child override replaces the parent declaration, and an undecorated override
removes that exposure. The SDK reuses its existing `BuiltinToolset` adapter.
Resource-only and prompt-only providers are supported. Template and prompt options
can specify `completionMethod` to bind an instance `McpCompletionHandler`.

```ts
@XpertResourceTemplate({
  key: 'project', uriTemplate: 'example://projects/{projectId}',
  arguments: { projectId: { required: true } }, requiredContext: ['tenant', 'principal']
})
readProject(args: Record<string, string>, context: ResourceReadContext) {
  return this.projects.readResource(args.projectId, context)
}
```

Handlers receive the current caller's context and retain their provider `this`.
Do not cache caller context on a singleton. `getMcpExtensions()` remains a legacy
compatibility hook; duplicate keys or public URIs/names are rejected when merged
with decorated declarations. Runtime publication and component fingerprints use
the same resolved definitions. App bundles remain in provider options.

Use `mcp.task` for the existing MCP task policy and `mcp.inputSchema` for stricter
transport inputs (for example, requiring project identity that native Workbench
calls may infer). The MCP adapter validates the shared schema first, then the
transport schema. The transport schema is advertised to MCP clients. Native
methods also receive execution-scoped workspace files via `context.host.files`
and the current Agent feature configuration via `context.xpertFeatures`.

Existing tools without a structured output contract may explicitly select
`resultFormat: 'tool_result'` and omit `outputSchema`. The SDK still validates the
content envelope and media blocks, but does not claim to validate business fields
in `structuredContent`. DTO-format MCP methods continue to require a strict
output schema, and supplied output schemas retain their validation.

For completed operations, `prepareToolResult(() => project(result), () => minimalReceipt)` defers output mapping to the adapter. The normal path maps and validates once; projection, validation or JSON serialization failures recover a bounded receipt without executing the business method again. Declare `outputSchema: z.union([normalSchema, receiptSchema])`, with strict objects in every branch. The fallback is validated too. Business exceptions thrown before the method returns remain errors. With `tool_result`, both callbacks return the content envelope and the union describes its structured metadata. The MCP protocol still validates the published JSON Schema; custom Zod refinements remain enforced by the SDK. Do not put side effects inside either callback.

For a host-native MCP App, declare each static HTML bundle once in the Provider's `apps` array, then bind a Tool with `mcp.app.resourceKey` and include `app` visibility. The App key must exist in the same Provider and its entry must be a relative `.html` path inside the packaged plugin. The host publishes the bundle as a `ui://` resource; plugins must not create a stdio server or put CSP/credentials in Tool results.

Agent middleware can also expose these Apps without a published Toolset. See [middleware Apps and post-tool continuation](./en/MIDDLEWARE_APPS.md) for `app` bindings and `interruptAfter` checkpoints.

The host owns the public MCP endpoint identity. It combines the plugin's stable `artifactNamespace`, the Provider key, and an opaque scope hash; client names and product-specific identifiers do not belong in the slug. A tenant- or system-level plugin has one tenant-scoped Publication and capability snapshot, while each organization receives an independent access grant and organization-bound credential. An organization-level plugin receives a dedicated organization-scoped Publication.

## View extensions

[View Extension Protocol](./en/view-extension-protocol.md)

## Browser collaboration client

Remote Components should import the framework-neutral collaboration client from the browser-safe entry point:

```ts
import {
  createCollaborationClient,
  createCollaborationPresenceStore,
  createSocketIoTransportAdapter,
  createYjsDocumentAdapter
} from '@xpert-ai/plugin-sdk/collaboration-client'
```

This entry point excludes the NestJS and Node.js dependencies used by the server SDK.

Choose the client using the server-issued session's `engine` (omitted means legacy Yjs):

| Engine       | Browser client                                 | Authoritative content and writes                                                    |
| ------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `yjs`        | `createCollaborationClient` with a Yjs adapter | Platform CRDT state; plugin materializes business projections.                      |
| `operations` | `createOperationCollaborationClient`           | Domain service and its operation log; platform carries revision notifications only. |

Both reuse the transport adapter and presence utilities. These live in protocol-neutral
modules; the operations client does not depend on the Yjs client. Existing public exports
remain available from the entry point above.

For `operations`, register an `ICollaborationOperationsProvider` with `authorize` and
`getRevision`. Submit edits through the domain API, which owns validation, idempotency,
conflict resolution, persistence and undo. After committing, call `notifyRevision`.
On `onRevision`, invalidate/refetch domain state while preserving local drafts under the
domain's conflict rules. Notifications may skip intermediate revisions; they are neither
operation payloads nor save acknowledgements. Reconnect and periodic sync read the latest
committed revision to repair missed notifications.

`getDocumentState`, `applyUpdate` and `migrateDocument` are Yjs-only APIs. An operations
session cannot use them to write content. Likewise, platform `sequenceNumber` and
materialization fields must not be treated as the current domain revision.

### Native MCP invocation defaults

A decorated tool can declare `mcp.defaultApprovalMode: 'allow' | 'confirm' | 'deny'`.
The native capability descriptor carries this default through auto-publication and
provider synchronization. Explicit Publication administrator policies take
precedence. Omitting the field retains the existing risk defaults: reads allow,
writes confirm, and dangerous tools deny. A dangerous tool can run directly only
when its owner explicitly declares `allow`; risk annotations remain unchanged.
Manual Publications review changes to this declaration before adopting them.

For public Artifact links authorized by trusted application policy, runtime callers
may pass `access.publicLinkAuthorization: 'application_policy'` instead of
asserting `userConfirmedPublicLink`. This field must be derived by trusted plugin
code, never exposed as a tool argument. Existing user-confirmation calls retain
their behavior; user identity and Artifact scope checks still apply.

These additions require matching host contracts/runtime support and an SDK build
containing these interfaces. They are not part of the published SDK 3.18.3 baseline.

## Conversation resource receipts

See [RESOURCE-CARDS.md](./en/RESOURCE-CARDS.md) for the public protocol, tool/middleware emitter, transactional Project provider example, and coordinated release order.

## Project task business types

Task providers can register business types without changing task hierarchy, status or ownership:

```ts
import { ProjectTaskProvider, type IProjectTaskProvider, type ProjectTaskTypeDefinition } from '@xpert-ai/plugin-sdk'

@ProjectTaskProvider('example.tasks')
export class ExampleTasks implements IProjectTaskProvider {
  readonly key = 'example.tasks'
  readonly taskTypes = [
    {
      key: 'example.tasks.illustration',
      presentation: {
        label: { en_US: 'Construction images' },
        icon: 'Images'
      }
    }
  ] satisfies ProjectTaskTypeDefinition[]

  async snapshot() {
    return {
      revision: '1',
      tasks: [
        {
          key: 'chapter-images',
          title: 'Prepare construction images',
          kind: 'task' as const,
          taskType: 'example.tasks.illustration',
          status: 'todo' as const,
          predecessorKeys: [],
          executions: []
        }
      ]
    }
  }
}
```

Each `taskType` must reference a unique registration prefixed by the owning provider key and a dot. Presentation accepts an `I18nObject` label and a `ProjectTaskIconName` token. Supported icons are `FileText`, `FileScan`, `FileSearch`, `ListChecks`, `ListTree`, `ShieldCheck`, `FilePenLine`, `Workflow`, `Images`, `FolderInput` and `FileOutput`; providers cannot register SVG, HTML, scripts or remote icon URLs.

The host persists this key in the existing task `type` column and resolves presentation from the same provider on graph reads. Omit `taskType` to retain legacy persisted values, or pass `null` to clear it. Existing unknown types retain their identity and receive a structural fallback icon. New projections referencing unregistered types are rejected with a provider diagnostic. Registration changes are reflected on the next graph read without rewriting history.

`kind` still means `task`, `summary` or `milestone`. A task with children keeps its business icon; the separate expand/collapse control represents hierarchy. List, tree, Gantt, board and detail views share the same icon renderer, while status indicators and Assistant avatars retain their own meanings. Titles and execution prompts never determine a task's business type.

Deploy matching contracts, SDK and host support before a plugin starts emitting `taskType`. This is an additive public contract and requires no database migration or historical task rewrite.

## Tool image references

See [TOOL-IMAGES.md](./en/TOOL-IMAGES.md) for `ToolImagesRuntimeCapability`, reference-only tool results, temporary visual model inputs, execution scope, and recovery rules. Never persist the messages returned by `prepareModelInput`.
