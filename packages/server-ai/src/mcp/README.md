# MCP Module

Fix `const methods = this.metadataScanner.getAllFilteredMethodNames(instancePrototype);` to support @nestjs v8

## MCP `_meta` artifact bridge

`packages/server-ai/src/xpert-toolset/provider/mcp/meta-artifact-bridge.ts` is a temporary compatibility layer for the current `@langchain/mcp-adapters` behavior.

The MCP protocol allows tool results to include `_meta` for data that should be available to the client but not shown to the model. Xpert MCP servers use that side channel for UI-only payloads such as `xpertai/visualization`. Today, LangChain's MCP adapter applies `outputHandling` to `CallToolResult.content`, but it does not map `CallToolResult._meta` into `ToolMessage.artifact`. Without the bridge, `_meta` is lost before chat stream components can forward it to the frontend.

The bridge captures `_meta` from the SDK `Client.callTool()` result and attaches it directly to the LangChain tool artifact. It does not parse visualization payloads or implement resource-specific business logic; it only preserves MCP metadata outside model-visible `content`.

Delete this bridge once `@langchain/mcp-adapters` or the underlying MCP client natively exposes MCP result `_meta` as `ToolMessage.artifact` or an equivalent non-model-visible side channel.
