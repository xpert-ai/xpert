# View Extension Protocol

This document defines the contract between a view extension provider, its manifest, and an iframe remote component. It is intentionally small: every new backend interaction must be added as an explicit capability instead of becoming a generic RPC tunnel.

## Goals

- Keep plugin views portable across hosts.
- Keep iframe remote components token-free and host-agnostic.
- Make every backend interaction visible in the manifest.
- Let provider APIs grow by optional methods with clear permissions and tests.
- Avoid putting large files, streams, jobs, or assets into JSON actions.

## Three Contract Layers

The view extension surface has three layers. A feature is complete only when all three layers are defined.

| Layer                    | Owner                           | Purpose                                                                        |
| ------------------------ | ------------------------------- | ------------------------------------------------------------------------------ |
| Message protocol         | Host web app + remote component | The `postMessage` request/response envelope used by iframe views.              |
| Manifest declaration     | Provider                        | The visible capability whitelist for a view, including actions and parameters. |
| Provider optional method | Plugin SDK                      | The server-side method that actually handles the declared capability.          |

Do not add a broad `execute(any)` method to `IXpertViewExtensionProvider`. Add a named optional method only when a capability has a known lifecycle, payload type, and security boundary.

## Message Envelope

All iframe messages must use this envelope:

```ts
type XpertRemoteComponentMessage = {
  channel: 'xpertai.remote_component'
  protocolVersion: 1
  instanceId?: string
  type: string
  requestId?: string
}
```

Rules:

- `channel` and `protocolVersion` are mandatory.
- `instanceId` binds a message to one iframe instance after `init`.
- `requestId` is mandatory for request/response messages.
- The iframe may only send messages to its parent. It must not call view extension APIs directly.
- The host must ignore messages from any source other than the iframe content window.

## Supported Message Types

Parent to iframe:

| Type                  | Purpose                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `init`                | Supplies manifest, initial data payload, query, locale, and theme tokens. |
| `hostEvent`           | Delivers a host-side event that matched `manifest.hostEvents`.            |
| `data`                | Response to `requestData`.                                                |
| `parameterOptions`    | Response to `requestParameterOptions`.                                    |
| `actionResult`        | Response to `executeAction`.                                              |
| `fileActionResult`    | Response to `executeFileAction`.                                          |
| `clientCommandResult` | Response to `invokeClientCommand`.                                        |
| `error`               | Request-scoped failure response.                                          |

Iframe to parent:

| Type                      | Purpose                                      |
| ------------------------- | -------------------------------------------- |
| `ready`                   | Signals that the iframe is ready for `init`. |
| `resize`                  | Requests host height adjustment.             |
| `notify`                  | Requests a host notification.                |
| `requestData`             | Requests view data through `getViewData`.    |
| `requestParameterOptions` | Requests dynamic parameter options.          |
| `executeAction`           | Executes a JSON action.                      |
| `executeFileAction`       | Executes a multipart file action.            |
| `invokeClientCommand`     | Requests a host-side client command.         |

No other message type may perform backend I/O until it is added to this document, the host bridge, and the provider interface.

## Manifest Rules

The manifest is the capability whitelist. A remote component may only request operations that the manifest declares.

```ts
type XpertViewActionDefinition = {
  key: string
  label: I18nObject
  icon?: string
  placement?: 'toolbar' | 'row'
  actionType: 'invoke' | 'navigate' | 'open_detail' | 'refresh'
  inputSchema?: JsonSchemaObjectType
  inputDefaults?: 'target' | Record<string, unknown>
  confirm?: {
    title?: I18nObject
    message?: I18nObject
  }
  permissions?: string[]

  // Convention for extension hosts. Omitted means 'json'.
  transport?: 'json' | 'file'
}
```

Rules:

- `transport: 'json'` maps to `executeViewAction`.
- `transport: 'file'` maps to `executeViewFileAction`.
- If `transport` is omitted, hosts must treat the action as `json` for backward compatibility.
- File actions should normally use `actionType: 'invoke'` and should not be rendered as generic toolbar buttons unless the host explicitly supports file input for declared actions.
- `inputSchema` only describes JSON fields. It does not describe the uploaded file body.
- `clientCommands` declares host-side UI capabilities that the iframe may request through `invokeClientCommand`.
- Client commands are resolved by the host page, not by the plugin provider. They must be allowlisted in the manifest and must return structured success or error data.
- `hostEvents` declares host-side events that the view wants to observe. The host owns event normalization and matching; the plugin owns event semantics and UI behavior.
- Manifests must not include access tokens, concrete API URLs, host IDs, assistant IDs, or tenant IDs.

## Host Event Subscriptions

Host events let a view react to activity that happened outside the iframe, for example an assistant tool call completing in the visible ChatKit. They are browser-local signals, not backend subscriptions.

The provider declares subscriptions in the manifest:

```ts
type XpertViewHostEventSubscription = {
  key: string
  event: string
  filter?: {
    sources?: string[]
    toolNames?: string[]
    viewKeys?: string[]
    visualizationTypes?: string[]
  }
  action?: {
    // Defaults to 'refresh'.
    type?: 'refresh' | 'forward' | 'refresh-and-forward'
    debounceMs?: number
  }
}

type XpertExtensionViewManifest = {
  hostEvents?: {
    subscriptions?: XpertViewHostEventSubscription[]
  }
}
```

Current data-xpert hosts normalize ChatKit logs into these event types:

| Event                             | Source    | Notes                                                                                                  |
| --------------------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| `assistant.tool.completed`        | `chatkit` | Emitted from `lg.tool.end` logs and component logs that contain tool output or visualization metadata. |
| `assistant.visualization.emitted` | `chatkit` | Emitted when a component log contains visualization metadata but the host cannot resolve a tool name.  |

Action behavior:

| Action                | Host behavior                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `refresh`             | Re-run the normal view refresh flow. Declarative views call `getViewData`; remote components receive the current `init` again. |
| `forward`             | Send a `hostEvent` message to the iframe. The remote component decides whether and how to refresh.                             |
| `refresh-and-forward` | Do both.                                                                                                                       |

Matching rules:

- The host first matches the current assistant context. The assistant identifier is host-internal and must not be forwarded to the iframe.
- `subscription.event` must equal the normalized host event type.
- `sources`, `toolNames`, `viewKeys`, and `visualizationTypes` are optional allowlists. If present, the event field must match.
- `debounceMs` is a lightweight duplicate guard for cases where one tool completion appears in multiple ChatKit logs.
- The host must not hard-code plugin view keys or tool names in the workbench extension renderer. Plugin-owned behavior belongs in the manifest and the remote component.

The forwarded `hostEvent` payload is intentionally small and sanitized:

```ts
{
  type: 'hostEvent',
  event: {
    id: 'assistant.tool.completed:...',
    type: 'assistant.tool.completed',
    source: 'chatkit',
    receivedAt: '2026-05-29T00:00:00.000Z',
    toolName: 'save_contract',
    toolCallId: 'tool-call-id',
    runId: 'run-id',
    threadId: 'thread-id',
    data: {
      output: {
        contractId: 'contract-1'
      }
    },
    visualization: {
      type: 'xpert.extension_view',
      viewKey: 'provider__review'
    }
  }
}
```

The payload must not include access tokens, API URLs, host IDs, assistant IDs, tenant IDs, organization IDs, or host-internal assistant routing fields.

Remote components should treat `hostEvent` as an intent signal. They may inspect `event.toolName`, `event.data.output`, and visualization metadata to switch tabs, update query parameters, refresh one data section, or ignore the event.

## Provider Interface Mapping

`IXpertViewExtensionProvider` exposes explicit optional methods:

```ts
interface IXpertViewExtensionProvider {
  supports(context: XpertResolvedViewHostContext): Promise<boolean> | boolean

  getViewManifests(
    context: XpertResolvedViewHostContext,
    slot: string
  ): Promise<XpertExtensionViewManifest[]> | XpertExtensionViewManifest[]

  getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> | XpertViewDataResult

  executeViewAction?(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> | XpertViewActionResult

  executeViewFileAction?(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest,
    file: XpertViewFileActionFile
  ): Promise<XpertViewActionResult> | XpertViewActionResult

  getViewParameterOptions?(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    parameterKey: string,
    query: XpertViewParameterOptionsQuery
  ): Promise<XpertViewParameterOptionsResult> | XpertViewParameterOptionsResult

  getRemoteComponentEntry?(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> | XpertRemoteComponentEntry
}
```

Mapping:

| Capability        | Manifest declaration                          | Message                   | API transport                       | Provider method           |
| ----------------- | --------------------------------------------- | ------------------------- | ----------------------------------- | ------------------------- |
| Data query        | `dataSource.mode = 'platform'`                | `requestData`             | `GET /data`                         | `getViewData`             |
| Parameter options | `parameters[].optionSource.mode = 'provider'` | `requestParameterOptions` | `GET /parameters/:key/options`      | `getViewParameterOptions` |
| JSON action       | `actions[].transport = 'json'` or omitted     | `executeAction`           | JSON `POST /actions/:key`           | `executeViewAction`       |
| File action       | `actions[].transport = 'file'`                | `executeFileAction`       | multipart `POST /actions/:key/file` | `executeViewFileAction`   |
| Remote entry      | `view.type = 'remote_component'`              | host-managed              | `GET /remote-component/entry`       | `getRemoteComponentEntry` |
| Client command    | `clientCommands[].key`                        | `invokeClientCommand`     | host in-page registry               | host-managed              |
| Host event        | `hostEvents.subscriptions[]`                  | `hostEvent`               | browser-local                       | host-managed              |

## Client Command Rules

Client commands let a remote component ask the current host page to perform a UI-local action, for example sending a message through the page's visible assistant ChatKit. They are not backend RPC and they must not expose auth or host internals to the iframe.

```ts
type XpertViewClientCommandDefinition = {
  key: string
  label?: I18nObject
  description?: I18nObject
  permissions?: string[]
}
```

Rules:

- The iframe may call only command keys declared in `manifest.clientCommands`.
- The host must reject messages from the wrong iframe window or wrong `instanceId`.
- Command payloads are intent data only. They may include text, attachments, references, and view state, but not tokens, API URLs, assistant IDs, or tenant IDs.
- If the command handler is missing or unavailable, the host should return a structured unsupported result so the remote component can fall back to a backend action.
- Provider code must continue to work without client commands; they are an optional host enhancement.

## File Action Rules

File actions use multipart transport end to end.

```text
iframe remote component
  -> postMessage executeFileAction
  -> host web app builds FormData
  -> host API proxy resolves host context
  -> xpert-pro view-host file endpoint
  -> provider.executeViewFileAction(...)
```

Rules:

- The multipart field name is `file`.
- JSON fields are `targetId`, `input`, and `parameters`.
- The iframe should send file bytes as a transferable `ArrayBuffer` or another host-supported file payload. Do not rely on cross-sandbox `File` objects being reusable by the parent window.
- The provider receives `XpertViewFileActionFile` with `buffer`, `originalname`, `mimetype`, and `size`.
- The provider must validate file type, required worksheet/header shape, maximum size, and business-level duplicate behavior.
- The provider must return `XpertViewActionResult`; large parsed previews should go in `data`, not in `message`.

## Error Shape

Provider action results should use `success: false` for business failures that the UI can display.

```ts
{
  success: false,
  message: {
    en_US: 'Preview has validation errors',
    zh_Hans: '预览存在校验错误',
  },
  data: {
    errors: ['...'],
  },
  refresh: false,
}
```

Transport, permission, and malformed request failures should be thrown by the host or provider service so they become request-scoped `error` messages.

## Security Invariants

- Remote components must not receive access tokens.
- Remote components must not receive xpert-pro API base URLs.
- Remote components must not decide `hostType`, `hostId`, tenant, organization, or assistant identity.
- Hosts must resolve context from authenticated server-side state.
- Hosts must check that `viewKey` exists and is visible.
- Hosts must check that `actionKey` exists, is visible, and matches the requested transport.
- Hosts must forward only normalized JSON fields and multipart file bytes.
- Providers must re-check business permissions and never trust iframe-provided identifiers by themselves.

## Versioning

`protocolVersion: 1` is the current iframe protocol.

Backward-compatible changes:

- New optional manifest fields.
- New optional provider methods.
- New message types that older hosts safely ignore.
- Additional fields inside existing result `data`.

Breaking changes require a new `protocolVersion`:

- Renaming existing message types.
- Changing request/response pairing.
- Changing required envelope fields.
- Changing file payload semantics.

## Adding A New Capability

Before adding a new backend interaction, update this document and answer:

1. What message type does the iframe send?
2. What manifest field declares the capability?
3. What API transport does the host use?
4. What optional provider method handles it?
5. What permissions and context are enforced by the host?
6. What payload size and lifecycle constraints apply?
7. What tests prove non-declared operations fail?

Recommended future capabilities:

| Capability               | Suggested provider method                         |
| ------------------------ | ------------------------------------------------- |
| Streaming action         | `executeViewStreamAction?`                        |
| Long-running job         | `createViewJob?`, `getViewJob?`, `cancelViewJob?` |
| Generated asset download | `getViewAsset?`                                   |
| Server-side subscription | `subscribeViewEvents?`                            |

Do not add them until a real view needs them.
