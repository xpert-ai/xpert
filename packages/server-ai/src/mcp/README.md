# MCP Module

Fix `const methods = this.metadataScanner.getAllFilteredMethodNames(instancePrototype);` to support @nestjs v8

## MCP `_meta` artifact bridge

`packages/server-ai/src/xpert-toolset/provider/mcp/meta-artifact-bridge.ts` is a temporary compatibility layer for the current `@langchain/mcp-adapters` behavior.

The MCP protocol allows tool results to include `_meta` for data that should be available to the client but not shown to the model. Xpert MCP servers use that side channel for UI-only payloads such as `xpertai/visualization`. Today, LangChain's MCP adapter applies `outputHandling` to `CallToolResult.content`, but it does not map `CallToolResult._meta` into `ToolMessage.artifact`. Without the bridge, `_meta` is lost before chat stream components can forward it to the frontend.

The bridge captures `_meta` from the SDK `Client.callTool()` result and attaches it directly to the LangChain tool artifact. It does not parse visualization payloads or implement resource-specific business logic; it only preserves MCP metadata outside model-visible `content`.

Delete this bridge once `@langchain/mcp-adapters` or the underlying MCP client natively exposes MCP result `_meta` as `ToolMessage.artifact` or an equivalent non-model-visible side channel.

## User identity when reconnecting an MCP App

**Xpert Pro reserves the template variable `env.oidc_token` for the business user's outbound OIDC token.** When reconnecting an App from a server-side snapshot, the host selects the MCP server that produced the card. For an HTTP or SSE server, it checks the values of `headers` and, when `auth.type` is `api_key`, `auth.value`. A direct template reference such as `{{env.oidc_token}}` or `Bearer {{env.oidc_token}}` opts that server into token issuance. The server chooses the header name. A static API key, a different variable name, or a stdio transport skips issuance on this path.

The host checks the authenticated user, tenant and organization against the snapshot, verifies the toolset and workspace, and requires the original Assistant ID. For a tenant-shared toolset, the saved execution context supplies the user's organization. A mismatch rejects the reconnect. After those checks the host injects a short-lived token into the connection for the original server only. The bearer stays out of the iframe and App history. [Connection preparation and scope checks](../mcp-app-runtime/mcp-app-actor-connection.ts)

Tool approval authorizes an operation. The header template independently determines whether the remote server receives a user token. The host reuses a tracked connection while its token has more than 30 seconds left. At or below that threshold, the next operation reconnects with a fresh token. Keep the template matcher and the configurations that depend on it in sync when changing the reserved name. [Connection lifecycle](../xpert-toolset/mcp-apps.service.ts) · [Header and scope regression tests](../mcp-app-runtime/mcp-app-actor-connection.spec.ts)
