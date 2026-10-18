# REST Client Runtime

`RestClientRuntimeCapability` (`platform.rest.client`) resolves a generic `RestClientRuntimeApi` independently of Analytics and dashboard plugins. The first version exposes `operations.list/call` for governed JSON reads on existing platform OpenAPI toolsets.

```ts
const client = runtime.require(RestClientRuntimeCapability)
const operations = await client.operations.list(scope)
const result = await client.operations.call(scope, {
  operationId: selected.operationId,
  contractHash: selected.contractHash,
  arguments: { query: { region: 'East' } }
})
// result.body is JSON; result.sourceFetchedAt records this fetch.
```

`scope: RestClientScope` requires the current actor's tenant, organization and user, the saved workspace/toolset IDs, an AbortSignal and an absolute deadline. The host requires an exact identity match, workspace read access and a toolset in the same tenant/organization/workspace, with category API and type `openapi`. A caller cannot supply a URL, credential snapshot or policy override.

Discovery returns enabled operations, descriptions, an argument schema and an opaque contract hash. Calls pin endpoint, method, serialization and schema to that hash. GET is supported; POST requires a persisted `x-xpert-read-only: true` declaration and an optional JSON body. The declaration narrows eligible operations but cannot prove a remote service is read-only. Only approved, trusted connections should be registered.

Arguments are grouped by `query`, `path` and `body` and validated without coercion or defaults. Query scalars/arrays use OpenAPI form serialization and path scalars use simple serialization; header/cookie parameters and unsupported serializers fail closed. Path values cannot traverse segments or change host, method or query. Caller headers are absent. HTTP(S) endpoints are selected from saved definitions; an administrator may intentionally configure an internal service. There is no arbitrary destination fetch API.

Authentication reuses saved OpenAPI `none` or `api_key` settings and the shared API-key header builder, including existing bearer/basic prefixes. The legacy UI spelling `bearar` is accepted as `bearer`; empty prefixes preserve the raw API-key value. Header assembly never modifies saved credentials. Credentials are never returned to consumers. Redirects are disabled. Responses must be successful JSON, bounded to 2,500,000 bytes. Input contracts and envelopes are bounded to 64,000 bytes; lists have at most 1,000 operations. Each request has a 30-second maximum budget bounded by the parent deadline. Raw HTTP failures and source content are not included in errors.

Access and connection definitions are checked before and after I/O. A changed connection, disabled operation or revoked grant discards the response. Pagination and Dataset projection belong to consumers and must preserve the same caller identity/deadline for each call. Successful results are not cached. Deploy the matching SDK and host before consuming this new capability; older published SDK packages do not supply it.
