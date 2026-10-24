# Platform capabilities and scoped factories

The platform registry is populated by `RuntimeCapabilityProvider` discovery after Nest has instantiated the application modules. Domain modules own their providers. HTTP handlers, View Actions, background jobs and Agent runtimes can consume this registry without constructing an Agent middleware runtime.

## Choose the correct registry entry

Stateless domain APIs such as ProjectProvisioning, Knowledgebase, Artifacts and File are registered directly. Their domain authorization checks still run for each operation. Agent runtimes may bind additional defaults to the same domain service, such as the conversation for File access.

Three capabilities expose a **factory** in the platform registry. The operation API has a separate key and belongs only to a caller's scoped runtime:

| Platform factory key                                    | Scoped operation key                             | State owned by one API                                     |
| ------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| `ConnectorRuntimeFactoryCapability`                     | `ConnectorRuntimeCapability`                     | Host-selected connector binding IDs and execution identity |
| `ActorTokenRuntimeFactoryCapability`                    | `ActorTokenRuntimeCapability`                    | Caller identity, fixed delegation claims and token cache   |
| `KnowledgeDocumentVisualAssetsRuntimeFactoryCapability` | `KnowledgeDocumentVisualAssetsRuntimeCapability` | Issued image paths and execution binding                   |

The platform registry deliberately does not return a shared operation API for these three keys. Checking the scoped operation key on the platform registry is not a provider availability check; check the factory key there instead.

## Bind once for a caller operation

```ts
import {
  ActorTokenRuntimeFactoryCapability,
  type ActorTokenRuntimeScope,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'

// authorizedScope comes from the host's authenticated, authorized request/job context.
function bindJobTokenApi(capabilities: RuntimeCapabilityRegistry, authorizedScope: ActorTokenRuntimeScope) {
  return capabilities.require(ActorTokenRuntimeFactoryCapability).createScopedApi({
    ...authorizedScope,
    act: { sub: 'background-task' }
  })
}
```

Reuse the returned API during that one operation. Create a new API for the next caller/execution. Never keep a scoped API in a singleton, or register it back into the platform registry. Factory resolution must happen after provider discovery, not in service constructors.

`RuntimeIdentityScope` carries the authorized tenant, organization, user and optional project/Assistant/conversation/execution identity. It is an in-process host contract, not an HTTP DTO or model-visible tool input. A factory does not grant access: callers must first validate request/job ownership, and operations retain their domain checks.

- Connector APIs copy the selected binding IDs. Empty selection denies access. Credential access retains identity, Assistant, project membership, personal/shared authorization and audit checks. Existing connector execution binding requirements remain in force.
- ActorToken APIs capture identity and host-defined `act` claims. Per-call `act` adds metadata but cannot replace fixed host claims. Cached tokens are rejected if used under a different caller identity.
- Visual-assets APIs require a complete authorized execution binding when used. They only read paths issued to the same API/execution and recheck document fingerprints. The caller supplies an already scoped WorkspaceFiles writer.

## Agent integration

The Agent facade resolves the platform factories when initializing a scoped runtime and registers the resulting operation APIs in that runtime's child registry. This does not change the model-visible tool list inside a tool-call loop.

Some child Agent identities are assigned after graph construction. Visual-assets factories accept an optional host-owned `resolveExecutionScope` callback for this case. The Agent integration supplies the LangGraph resolver; the domain factory has no LangGraph dependency. Platform callers that omit the callback use the fixed scope captured at API creation. Every image issuance and consumption still verifies the execution binding.

## Agent invocation

Agent runtime extension contracts live under `src/lib/agent/runtime` and are
exported from `@xpert-ai/plugin-sdk`. `AgentRuntimeFactory`, strategies and the
registry describe the execution mechanism; `AgentInvocation*` types describe an
individual call. Renaming the factory does not change capability identifiers.

`AgentInvocationRuntimeCapability` is the scoped consumer API for invoking an
approved Agent binding. Resolve the binding immediately before starting a call;
provide the host tool-call/operation ID for idempotency. The API captures identity
and rechecks workspace grants, target revision and provider provenance. Tools
cannot supply user/organization identity or arbitrary runner configuration.

```ts
const api = context.runtime.capabilities.require(AgentInvocationRuntimeCapability)
const target = await api.resolve(bindingId)
const invocation = await api.start({ target, callId: toolCallId, input: { prompt } })
// wait mode uses the host checkpoint adapter; background mode returns the ID.
const completed = await api.awaitResult(invocation.id)
```

`inspect`, `cancel` and `respond` operate on the same invocation. A cancelling or
unknown state is not proof of termination. Caller jobs may use
`AgentRuntimeFactoryCapability` with a host-authorized identity;
never accept that identity from model arguments.

Providers implement `IAgentRuntimeStrategy` and use `@AgentRuntimeStrategy(key)`.
Persist a receipt with `context.checkpoint` before waiting for external work.
Declare checkpoint/session/no recovery accurately; reattachment must not send an
ambiguous prompt again. The strategy contract contains no graph types. The host
owns binding authorization, persistence, idempotency, waiting and audit history.
The native Xpert graph and native background Task transports are separate
strategies behind that same boundary. Providers must not call the Task facade
back from their own executor.


## Artifact source, ownership and resource authorization

`pluginName`, `resourceType`, and `resourceId` are the canonical source identity.
An optional `authorizationProviderKey` selects a registered content resource provider;
it authorizes that same `resourceId`. It does not change the owner, hide the artifact
from lists, or replace the share link's audience policy. Missing providers deny access.

```ts
await artifacts.createArtifact({
  source: { pluginName: '@example/documents', resourceType: 'page', resourceId: page.id },
  authorizationProviderKey: 'example.pages',
  scope: { projectId, userId: null },
  kind: 'markdown',
  title: page.title
})
```

Omit `scope.userId` to retain the current runtime user's ownership. Explicitly set it
to `null` with `projectId` for shared Project ownership. This clears only the stored
owner; authorization and `createdById` continue using the authenticated actor.
Project-owned artifacts require current Project read/edit/manage access even without
a resource provider. Ordinary user-owned artifacts retain their owner restriction
for management, including when a provider is configured.

Repeated creation preserves the resource authorization policy and Project ownership.
`findArtifactBySource` first resolves the current user's source identity, then a
Project-owned match, and reauthorizes it. Lists include currently authorized artifacts
and calculate pagination and totals after authorization. Provider checks currently
scan candidates in bounded batches; a future bulk-authorize API can optimize large lists.
Public/signed links still need their own audience/token checks; they cannot bypass a
protected resource's current ACL or a shared artifact's Project membership.


## Project content capabilities

Content extensions use server-authenticated `RuntimeActor` identities. Organization-bound APIs
require `OrganizationRuntimeActor`; Project APIs also support tenant-level Projects.
Never copy actor fields from a view action body. Views derive actors from their resolved host,
and jobs retain the authorized execution context.

| Capability | Responsibility |
| --- | --- |
| `platform.assistant.middleware-access` | `assertAccess({ actor, assistantId, scope, provider, requiredFeature })` checks the exact installed middleware using standalone Assistant access or Project membership + binding. Does not grant file/resource operations. |
| `platform.project.access` | Human membership, editing/management and explicit Assistant binding. |
| `platform.project.files` | Authorized Project file facade with CAS writes; shares Volume IO with WorkspaceFiles. |
| `platform.project.knowledge` | `ensureBinding({ actor, projectId, title })` creates/binds one Project-owned knowledge library. |
| `platform.content.resources` | Resource authorization, plus an `identities` subinterface for organization principal/directory resolution. |
| `platform.content.documents` | Model-backed collaborative documents, immutable revisions, publication and Assistant review. |
| `platform.content.references` | Authorize containing document and target before dispatching reference hooks. |
| `platform.content.editors` | Editor discovery and resource routing; versioned opaque file IO with Project and source ACL checks. Concrete formats and edit operations belong to plugins. |
| `platform.connector.documents` | Credential-bound remote document discovery/read; no implicit synchronization or remote write-back. |

`IContentResourceProvider.authorize` is mandatory. Optional `references`, `pages`, `publication`
and `locations` extension objects are independently composed in the same registration. Registering
an extension never grants access. The platform authorizes first, and the plugin validates its
source-specific relationships. Publication/location callbacks must tolerate retry.

`ContentDocumentInput.resourceId` identifies the **platform document**. `ContentSourceInput.sourceResourceId`
identifies the **provider's source**; never exchange them just because one plugin happens to use
the same UUID for both. `createChildPage` returns `{ documentId }`, reauthorized in the original Project.

Create/register a Markdown file directly through `ContentDocuments.register`. There is no old
editor migration API. Markdown model state stays in the platform; Spaces does not own parallel
collaboration rooms or review tables. Spreadsheet adapters only convert bytes to/from a typed grid;
callers still own source ACL, file versions and conflict handling.

Knowledge binding uses `platform.project` resource authority, independent of a Spaces installation.
Provisioning reuses the knowledge pipeline and requires its request/job context to match the explicit
actor. Project membership changes apply immediately to the bound library.

View providers that need middleware configuration or a scoped runtime use
`ViewMiddlewareRuntimeCapability.resolve({ context, provider, requiredFeature })`.
For capability entry points needing only an access assertion (Views, tools or trusted persisted jobs),
use `AssistantMiddlewareAccessRuntimeCapability.assertAccess` once per invocation:

```ts
await access.assertAccess({
  actor, assistantId, provider: 'spaces', requiredFeature: 'spaces',
  scope: projectId ? { type: 'project', projectId } : { type: 'assistant' }
})
```

The actor and scope come from trusted server context, not iframe/tool input. `assistant` scope
uses the published Assistant catalog policy. `project` scope uses current Project membership
and the requested Assistant binding, without adding catalog/workspace visibility requirements.
Project denial never falls back to standalone authority. Both scopes check active organization
membership and the requested published Assistant's graph. Resource services retain their own
Project, binding and operation ACLs; do not repeat middleware authorization per document or
collaboration recipient. Removing a feature disables its entry points, not the Project's documents.
Both share the same connected-provider/feature resolver; feature flags or a different provider
advertising the same feature are not authorization. Multiple connections to the requested provider
are rejected as ambiguous. There is no cross-request authorization cache.
Explicit-actor access is independent of content-resource identities and the ambient sender's credentials.

### File editors and text collaboration

Register editors with `@ContentEditorProvider(key)`. Metadata identifies the remote view and distinguishes `text-document` (Yjs model) from `file` (versioned binary codec). `ContentEditorRegistry.getTextModel` is reserved for the text collaboration pipeline.

A file editor supplies `create` and `validateFile`; its own service and Remote View implement concrete models and edit operations. The platform has no cell, workbook, slide or format patch protocol. A content resource provider exposes `editor.describe` and optional `editor.files.read/write` hooks. It owns location and atomic revision checks. Every capability call verifies the live actor, Project, Assistant binding and source permissions.

Use `workbench.content.resolve` with `{ resourceId, providerKey }`, then pass the returned `navigation` unchanged to `workbench.navigation.open`. The returned parameters preserve the source provider. Do not navigate the outer host or infer an editor from a filename in the remote UI. Text documents continue to use `platform.content.documents`; raw file writes cannot bypass its collaboration/publication pipeline.
