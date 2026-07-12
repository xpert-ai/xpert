# Plugin SDK

## Building

Run `nx build plugin-sdk` to build the library.

## Running unit tests

Run `nx test plugin-sdk` to execute the unit tests via [Jest](https://jestjs.io).

## Schema config

[Schema UI 扩展规范](./SCHEMA_SPECIFICATION.md)

## Permissions

[插件权限设计指南](./PERMISSIONS.md)

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
