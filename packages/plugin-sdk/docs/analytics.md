# Read-only analytics capability

`platform.datasource.analytics` separates source query syntax from chart binding. It is additive; it does not replace database Workbench, Semantic Models or Artifacts.

| Layer               | Responsibility                                                             |
| ------------------- | -------------------------------------------------------------------------- |
| contracts           | Versioned Binding, Dataset, fields, parameters, completeness and freshness |
| plugin-sdk          | Provider registration, runtime capability, validation and normalization    |
| Platform DataSource | Actor authorization, scoped lookup, deadlines, limits and dispatch         |
| Source plugin       | Native syntax, connection schema, typed parameters and result projection   |
| Dashboard plugin    | Definition, controls, chart mapping, renderer integration and persistence  |

The platform and renderer do not interpret SQL, MDX, REST paths or ontology Actions. Only the provider interprets `binding.payload`. Views reference `output.datasetId` and stable `output.fields[].id`; `sourceField` or an exact `semanticRef` selects native columns.

## Provider contract

Implement `AnalyticsQueryProvider`, decorate with `@AnalyticsProvider('vendor.operation')`, and include the provider in the plugin module. Declare supported source types and operation contract versions. Optional `descriptor.connectionType` contributes a non-SQL connection schema through DataSourceType sync.

`execute(binding, parameters, context)` receives typed scalar parameters and authenticated source context. Connection options stay on the server. Honor `signal`, `maxRows`, `timeoutMs` and the absolute `deadlineAt`; return explicit columns even for zero rows. Providers must enforce read-only operations at the source, not merely advertise them.

Use the root SDK entry on the server. Browser code uses `@xpert-ai/plugin-sdk/analytics`, which contains schemas/normalization without Nest runtime imports.

## Business metadata discovery

Optional `provider.discover(request, context)` returns a versioned `AnalyticsDiscoveryResult`: bounded `items`, opaque `inspectRequest` / `nextRequest`, and a native `queryContract` with operation/version/payloadSchema/instructions. A provider owns navigation syntax and business metadata; the platform validates the envelope and reuses query authorization, source revision checks and deadlines.

`POST /api/data-source/analytics/discover` accepts `{ dataSourceId, providerId, request }`. Catalogs and inspect results must include authored descriptions, declared types and metric definitions when available. Missing metadata is not permission to infer business semantics from labels. Results have a 128 KB/50 item limit; pagination is provider-owned. Discovery does not grant execution permission or certify a metric.

PostgreSQL discovery uses the platform Workbench adapter's comments, types and keys. data-xpert discovery uses Assistant resource bindings, current actor policies, published entity analysis contracts and permitted Action input schemas. These implementations stay in their source plugins.

## Existing MCP connections

The generic [MCP Client Runtime](./mcp-client.md) exposes
`McpClientRuntimeCapability` (`platform.mcp.client`). Analytics plugins use
`client.tools.list(scope)` and `client.tools.call(scope, { toolName, contractHash, arguments })`.
The initial tools API enforces read-only selection and current-viewer authorization on the host.

`@xpert-ai/plugin-analytics-mcp` implements the `mcp.tool` provider. Its dataset catalog,
parameter paths, JSON projection and completeness rules remain plugin-owned; it does not add
MCP branches to Dataset normalization or the dashboard renderer. Build and deploy the matching
SDK/host capability before using the plugin; an older published SDK is insufficient.

## Execution

- `GET /api/data-source/analytics/sources`: authorized IDs and supported providers, never credentials.
- `POST /api/data-source/analytics/query`: `{ binding, controls }`; body cannot set actor/tenant/organization.
- Requires `DATA_SOURCE_VIEW`; capability callers must match the current host request actor.
- 30-second deadline, 1,000 rows and 2 MB normalized result budget per query.
- Known result/parameter validation failures return safe error codes so Agents can repair their bindings; arbitrary provider exception text is never surfaced.
- After execution, source revision and provider registration are checked again. Missing/ambiguous columns, invalid cells, duplicate grain and inconsistent completeness fail closed.
- No shared result cache. `sourceFetchedAt` means source query time, not last business-data change; `dataAsOf` is optional and source-owned.
- `int64` and `decimal` use exact strings. Timestamps include a timezone. Renderers must reject unsupported precision rather than silently round canonical data.

For composed queries, the platform assigns `executionId` before provider execution. Forward `signal`, `deadlineAt` and `ancestry` through the optional third argument of `AnalyticsRuntimeApi.query`. These are trusted execution constraints, not fields accepted from an HTTP body or Binding payload. Child queries cannot extend the parent deadline; the platform checks provider cycles and nesting depth.

## Reusable Artifacts changes

`listArtifacts.resourceIdPrefix` matches a literal resource ID prefix, never a pattern, within the caller's existing access scope. Storage-specific matching stays inside the platform Artifacts service.

`listArtifacts.includeCurrentVersion` optionally includes each result's active current-version metadata (for example its latest title). The platform loads pointers for the authorized, paginated result in one scoped batch; it does not expand access or load document content. Plugins should use this metadata instead of maintaining a separate copy of versioned titles.
`ensureArtifactVersion.expectedCurrentVersionId` enables compare-and-set inside the existing Artifact row lock; null means no current version. An idempotent retry may reuse the current version but cannot resurrect an old save over a newer one. Callers that omit it retain existing behavior.

No dashboard table, renderer schema or data-xpert dependency is added to the platform.

## Presentation is independent of providers

Bindings specify data access and the output contract, not page layout. The Live Dashboard plugin supports two consumers of the same Dataset:

- Standard mode uses Bindings, Controls and chart/table definitions with the Data Analytics renderer.
- HTML mode saves Bindings, Controls and HTML/JavaScript together. The page selects a `bindingId` and passes declared control values; it renders the returned Dataset fields itself.

The generic [isolated HTML document host](artifact-documents.md) provides the iframe and message protocol. The dashboard plugin owns version lookup and its query callback; the backend resolves the saved Binding and reauthorizes the current actor. Pages cannot supply replacement providers, data sources or native query payloads. Source providers do not implement page rendering or depend on a dashboard plugin.

## Workspace script provider

[Workspace live script queries](workspace-dataset-pipelines.md) documents the implemented `@xpert-ai/plugin-analytics-workspace-script` example. Its Python/JavaScript entrypoints, file/source aliases, CSV helpers and execution evidence belong to the plugin. The platform supplies the reusable Analytics, Workspace Files, Artifacts and Sandbox Jobs capabilities, including execution-time invocation and parent deadline/cancellation propagation.

Each query executes the script against current authorized inputs and returns the same Dataset contract to either presentation mode. Script or dependency reuse must not turn a dashboard refresh into reuse of a previous result. Deployment requires compatible SDK/contracts exports, a compute runtime artifact and a matching Runtime Binding; local source validation does not establish published-package compatibility.
