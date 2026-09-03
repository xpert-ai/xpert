# Plugin SDK

## Building

Run `nx build plugin-sdk` to build the library.

## Running unit tests

Run `nx test plugin-sdk` to execute the unit tests via [Jest](https://jestjs.io).

## Schema config

[Schema UI 扩展规范](./SCHEMA_SPECIFICATION.md)

## Permissions

[插件权限设计指南](./PERMISSIONS.md)

## Decorator-driven business Tools

Use `@XpertToolProvider()` on one injectable business class and `@XpertTool()` on its methods when the same domain operation should be available as an Agent Middleware Tool, a host-native MCP Tool, or both. Register only the decorated class in the plugin Nest module; the host expands it into one native Toolset and the declared Middleware groups.

```ts
import { XpertTool, XpertToolProvider, type XpertBusinessToolContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'

const inputSchema = z.object({ query: z.string().trim().min(1).max(200) }).strict()
const outputSchema = z.object({ items: z.array(z.object({ id: z.string() }).strict()) }).strict()

@XpertToolProvider({
  provider: 'order_ops',
  componentKey: 'order-operations',
  name: 'Order Operations',
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
      visibility: ['model']
    }
  })
  async search(input: z.infer<typeof inputSchema>, context: XpertBusinessToolContext) {
    return this.service.search(context.organizationId, input)
  }
}
```

MCP exposure is explicit. Provide strict Zod input/output schemas and return an allowlisted DTO; the host validates the output and maps it to `structuredContent`. Invocation context is constructed for every call and must never be cached on the Provider singleton. `getMiddlewareExtensions()` may add Agent-only hooks such as `wrapToolCall`, but business-critical behavior belongs in the method or shared service.

The host owns the public MCP endpoint identity. It combines the plugin's stable `artifactNamespace`, the Provider key, and an opaque scope hash; client names and product-specific identifiers do not belong in the slug. A tenant- or system-level plugin has one tenant-scoped Publication and capability snapshot, while each organization receives an independent access grant and organization-bound credential. An organization-level plugin receives a dedicated organization-scoped Publication.

## View extensions

[View Extension Protocol](./docs/view-extension-protocol.md)

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
