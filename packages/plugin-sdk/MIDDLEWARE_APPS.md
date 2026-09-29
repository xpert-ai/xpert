# MCP Apps in Agent middleware

An `AgentMiddleware` can return `apps` alongside `tools`. It does not need a remote
MCP server or a published Toolset. The host renders the bundled HTML using its
existing MCP App sandbox and RPC bridge.

ChatKit accesses resources, RPC, approvals and teardown through `/api/ai/mcp-apps`,
using the AI module's `ApiKeyOrClientSecretAuthGuard`. The ordinary management
routes keep the platform's standard authorization. Use an SDK version whose
`client.mcp.apps` targets this AI endpoint.

```ts
return {
  name: 'ProjectSettings',
  tools: [configure, readSettings, saveSettings],
  apps: {
    definitions: [{ key: 'settings', entry: 'dist/mcp-apps/settings.html' }],
    tools: {
      configure: { resourceKey: 'settings', visibility: ['model', 'app'] },
      read_settings: { visibility: ['app'], approval: 'none' },
      save_settings: { visibility: ['app'], approval: 'none' }
    }
  }
}
```

Keys in `apps.tools` must match actual tool names. App-only tools are excluded
from the model's tool list. `approval: 'none'` is a trusted plugin declaration for
operations whose own services enforce scope, revision and validation. Omit it
to retain host approval. App access never grants access to another middleware.
For decorated providers, use `@XpertToolProvider({ apps: [...] })` and
`@XpertTool({ middleware: true, app: { ... } })` with the same binding contract.

To pause after a successful tool, configure the Assistant:

```yaml
team:
  agentConfig:
    interruptAfter: [configure]
```

The completed tool result is checkpointed before a separate gate calls
LangGraph `interrupt`. Resume targets the gate, so tool side effects are not
replayed. Ordinary tools display a Continue control; an App sends a standard
`ui/message` after saving. The host supplies the original tool-call and execution
identity, and ChatKit uses the existing `action: resume` protocol. No `ui/resume`
extension is required. The App's message is added once at user priority on resume,
so the Agent can distinguish the confirmed input from the pre-pause tool result.
Inline images, audio and binary resources are retained in this message (25 MiB
combined); arbitrary file paths and remote attachment URLs are rejected. ChatKit
acknowledges continuation only after the run response supplies `Content-Location`,
not when the local thread is resolved. Cross-origin hosts must expose that header.
Error ToolMessages skip this gate so the Agent can repair
the failure. Prefer calling interactive tools alone rather than mixing them with
unrelated parallel work.

The runtime re-resolves middleware bindings and enabled tools for each App RPC.
UI teardown retains paused native form snapshots for 7 days; it does not cancel
the Agent. Business settings must still be persisted by domain services before
continuation. This requires the host capability `platform.middleware.mcp-apps`
and the corresponding ChatKit continuation support; it adds no ORM dependency
to the SDK.

On hosts with schema synchronization disabled, apply
`packages/server-ai/src/mcp-app-runtime/migrations/20260928-middleware-app-audit.sql`
before enabling native middleware Apps. Their audit rows retain provider identity
in `source` and leave `toolsetId` null. Interactive ChatKit user sessions are
accepted only for their bound Assistant; existing user JWT access remains valid.
An App produced by an external Assistant is also accessible when its persisted
execution parent chain terminates at the session's entry Assistant in the same
thread. Each execution remains subject to the normal access check.
