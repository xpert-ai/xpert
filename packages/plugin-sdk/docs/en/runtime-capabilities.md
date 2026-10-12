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
