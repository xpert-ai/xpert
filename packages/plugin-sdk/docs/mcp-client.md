# MCP Client Runtime

`McpClientRuntimeCapability` (`platform.mcp.client`) resolves a `McpClientRuntimeApi`
for governed access to existing platform MCP connections. It is shared by plugin consumers,
independent of Analytics, Dataset, Binding and dashboard rendering.

The initial API implements **read-only `tools.list/call` only**. Resources, Prompts,
Tasks and subscriptions are not exposed. The host fixes the tools policy; a request cannot
enable writes, interaction, asynchronous tasks or arbitrary protocol methods.

## Usage

```ts
import { McpClientRuntimeCapability } from '@xpert-ai/plugin-sdk'

const client = runtime.require(McpClientRuntimeCapability)
const tools = await client.tools.list(scope)
// Select an exact tool from the application's approved catalog and discovery result.
const result = await client.tools.call(scope, {
  toolName: selected.name,
  contractHash: selected.contractHash,
  arguments: validatedArguments
})
```

`runtime` is the injected platform capability registry. `scope: McpClientScope` contains
the current `actor` (tenant, organization, user), an existing
`workspaceId`/`toolsetId`/`serverName`, `signal` and an absolute `deadlineAt`.
Supply identity from trusted execution context. The host requires an exact match with
the current authenticated request and rechecks workspace read access. The toolset must
belong to the same tenant, organization and workspace and have category MCP.
URLs, credentials, connection snapshots and policy overrides are rejected inputs.

## Tools policy and contracts

- Discovery includes enabled, model-visible tools with `readOnlyHint: true` and without
  `destructiveHint: true` or required task execution. Calls repeat this selection.
- Consumers additionally restrict operations to their own approved catalog. Read-only
  annotations narrow selection; they neither grant permission nor prove remote behavior.
- `contractHash` pins input/output schemas and annotations. Changed contracts require
  rediscovery and an explicit caller-side update; the hash does not pin remote code.
- Arguments and structured output use JSON Schema validation without coercion. Remote
  schemas are isolated so repeated refreshes and reused `$id` values cannot collide.
- A successful result contains optional JSON `structuredContent` and plain `text` blocks.
  Tool errors, invalid output and interaction requests fail. Resource links are not fetched.
  Consumers must explicitly choose whether to accept structured JSON or text JSON.

## Execution boundary

The platform reuses ToolRuntime and MCP Consumer authentication. A shared internal connection
lifecycle owns authorization, cancellation, cleanup and safe runtime errors; protocol clients
and connection credentials stay internal. Access and connection/tool selection are checked
around remote I/O and immediately before tool execution. Revoked access discards the result.

Each operation has a 30-second maximum budget bounded by its caller's deadline. Discovery
has at most 20 pages and 1,000 tools, with cyclic cursors rejected. Call envelopes and individual
tool metadata are bounded to 64,000 bytes; remote tool results are bounded to 2,500,000 bytes.
Consumers such as Analytics may enforce tighter limits. Successful results are not cached.

Future capabilities must define their own host-authorized policies before being exposed;
expanding this API must preserve the read-only contract used by analytics consumers.
Deploy the matching host and SDK before consuming this capability. This new export does not
imply that an older published SDK or host supports it.
