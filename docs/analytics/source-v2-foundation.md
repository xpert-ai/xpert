# Analytics sources v2: Group A foundation

Tracks [xpert-ai/xpert-plugins#762](https://github.com/xpert-ai/xpert-plugins/issues/762).

The five non-database providers currently register `connectionType` so they can store configuration in a `DataSource`. This first rollout group adds the replacement protocol and a read-only inventory. It deliberately retains those registrations and existing configuration until the configuration resources and migration adapters are available.

## Compatibility contract

| Consumer                              | Contract / capability                                                                                             | Behavior                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Existing plugin / published dashboard | `AnalyticsBinding`, `analyticsBindingSchema`, `AnalyticsRuntimeCapability` (`platform.datasource.analytics`)      | Still v1 only, with original signatures and execution path       |
| New consumer                          | `AnalyticsBindingV2`, `supportedAnalyticsBindingSchema`, `AnalyticsRuntimeCapabilityV2` (`platform.analytics.v2`) | Explicit source references; query accepts v1 and v2              |
| Existing HTTP client                  | `/api/data-source/analytics/{sources,discover,query}`                                                             | Unchanged v1 validation and source permissions                   |
| New HTTP client                       | `/api/analytics/{sources,discover,query}`                                                                         | v2 discovery/source references and dual-version query validation |
| Dataset renderer                      | `xpert.analytics.dataset/v1`                                                                                      | Same field IDs, controls, exact decimal values and provenance    |

`schemaVersion` versions the Binding envelope. `contractVersion` remains the provider operation version. A v2 Binding contains `source`, never `dataSourceId` at the top level:

```ts
{
  kind: ('data-source', dataSourceId)
}
{
  kind: ('definition', definitionId, versionId)
}
{
  kind: ('artifact', artifactId, versionId)
}
```

All IDs must be UUIDs. Definition and Artifact versions are mandatory: no `latest`, partial references, caller scope or credentials. v1 schemas have not been broadened, so old renderers and plugins cannot accidentally receive a v2 binding.

For v1 input, the new Runtime delegates to the existing Runtime. For a v2 `data-source`, it builds a temporary v1 envelope and delegates to that same path. Both retain `DATA_SOURCE_VIEW`, tenant/organization lookup, current viewer identity, provider/type matching, operation version checks, current source revision checks and parent execution constraints. No serialized Binding or payload is saved by this conversion.

## Native v2 extension points

`AnalyticsProviderV2` / `AnalyticsProviderRegistryV2` are separate from v1 registration. Native providers implement `AnalyticsQueryProviderV2`; their context contains a versioned source and private options, never a synthetic DataSource ID. The initial native extension supports `definition` and `artifact`; database adapters continue through v1.

Platform-owned `AnalyticsSourceResolver` implementations are supplied by constructor injection through `ANALYTICS_SOURCE_RESOLVERS`. Each resource kind has one adapter. The adapter must:

1. Authorize the exact resource and version for the authenticated actor, including original file/connector/Assistant permissions.
2. Verify version integrity and active resource status; return the provider ID persisted by the resource, not the request's provider ID.
3. Return private version options only to the server. Discovery lists contain public metadata only.
4. Revalidate authorization, resource status and version integrity after execution.

The Runtime checks exact source equality and provider ownership, rechecks scoped provider availability, validates controls and results, enforces read-only operation versions, and bounds resolution, execution and revalidation by one deadline. Nested execution inherits deadline/cancellation/ancestry. Provider errors, including provider HTTP exceptions, are redacted.

**This PR installs no Definition/Artifact resolver.** Native v2 execution returns `ANALYTICS_SOURCE_KIND_UNAVAILABLE` until the owning platform adapters ship. The interfaces and executor are tested with explicit host adapters. This prevents an incomplete configuration or ACL implementation from falling back to an arbitrary DataSource or current version.

## Read-only migration inventory

After running this platform version, use the existing configured login/Keychain credentials and an organization the account is authorized to access:

```sh
node tools/scripts/analytics-migration-inventory.mjs \
  --api-url http://localhost:3000 \
  --org-id "$XPERT_ORG_ID" \
  --output /secure/local/path/analytics-inventory.json
```

The command uses `requireAuthentication` and `createRequestHeaders` from `local-plugin-cli.mjs`. After authentication, every request is GET. It creates a new local report with mode `0600`; it never overwrites a report, modifies configuration, saves/publishes a dashboard or moves a share link. Keep the report out of source control because it contains scoped resource identifiers. Tokens, options, file paths, URLs, native query payloads, HTML and document bytes are excluded.

The source endpoint `/api/analytics/migration-inventory/sources?page=1` requires the existing source-view permission. It reads all five exact legacy type identifiers in deterministic pages of 100 within the current tenant and organization. The report contains timestamps, provider availability, stored-options digests and per-dataset IDs/revisions/digests. Invalid or duplicate dataset identities are reported.

The collector enumerates the two explicitly registered Artifact families via the normal management API, then enumerates **every version**, not only `currentVersionId`. `/api/artifacts/analytics-inventory/:artifactId/versions/:versionId` reuses exact-version management authorization and checksum verification. `/api/artifacts/analytics-inventory/:artifactId/draft` reads only the current user's editable draft through `ArtifactDraftsService`, verifies the content digest and rechecks its revision after file access.

The scanner recognizes these explicit locations:

- `xpert.live-dashboard/v1`: `bindings[]`.
- `xpert.live-dashboard.package/v1`: `manifest.bindings[]`; dependencies and presentation bytes remain untouched.
- `xpert.analytics-script/v1`: `sources[].binding`.

Unknown document versions and invalid Bindings are reported, not inferred from similar-looking JSON. Nested script references retain their exact Artifact/version and are correlated against scanned versions. References report missing legacy sources, provider mismatches/unavailability, unresolved dataset revisions and unavailable script versions. Nothing is assigned a replacement source automatically.

### Reading the report

`storedOptionsDigest` and `storedDatasetDigest` fingerprint the serialized stored JSON. They are **not** the Files provider's parsed/defaulted `contractHash`, nor the REST/MCP upstream operation/tool hash. The inventory retains the hashes already in Bindings and marks effective provider verification as pending. Migration must use the owning plugin parser and upstream verification; recomputing a hash to bypass drift is not permitted.

`coverage.completeWithinVisibleListings` concerns enumeration, not migration readiness. `gaps` records unavailable/invalid responses, permission failures, checksum mismatches, incomplete pagination and changes observed during the scan. HTTP failures never count as empty lists. The CLI exits with code 2 after writing an incomplete report.

The account cannot enumerate other users' private Artifacts or other organizations. Deleted containers are excluded by the current management API; inaccessible archived/deleted versions remain explicit gaps. A live scan is not an atomic database snapshot. Sources and version lists are reread to detect drift; rerun inventory and compare digests before writing any migration. Partial reports cannot authorize cleanup.

## Subsequent rollout groups

| Provider         | Configuration entry / target                   | Legacy migration unit                                                            |
| ---------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| Workspace Files  | Analytics Definition, immutable version        | One legacy `datasets[]` entry per Definition                                     |
| REST/JSON        | Governed connector + Analytics Definition      | One approved dataset/operation per Definition; credentials stay in connector     |
| MCP Tools        | Governed MCP connection + Analytics Definition | One approved tool/dataset per Definition                                         |
| data-xpert       | Integration connection + Analytics Definition  | One Assistant analytics target per Definition                                    |
| Workspace Script | Existing versioned Definition Artifact         | Reuse the existing Artifact/version; no empty connection or duplicate Definition |

Group B owns persistence/ACLs, configuration UI, source resolvers, plugin v2 providers, registry/UI separation and provider-specific effective configuration validation. A later migration adds an idempotent mapping scoped by tenant/organization, old source, provider, dataset/revision and verified configuration digest, with compare-and-set preconditions.

Existing published version bytes, dependency locks, binding/control IDs, payloads and share version selection must not be rewritten. Upgrading an existing dashboard creates an explicit draft based on its exact current version and draft revision; publication remains a separate user action. Script nested bindings must preserve parent deadline and ancestry. Keep v1 source access and plugin execution available until all active references are accounted for; do not delete old configuration based only on an inventory count.

## Validation

The repository tests cover strict v1/v2 boundaries, five-provider published-package fixtures, native source/version/owner checks, permission denial, resource/provider revocation, cancellation/deadlines, HTTP pipe wiring, module dependency injection, draft revision/hash checks, inventory pagination/drift and sensitive-data exclusion. The JSON fixture is synthetic and contains no production data.

The unchanged Live Dashboard package is also compiled against the built SDK/Contracts in an isolated copy; its domain, service, sharing and immutable-library tests verify v1 publication and current-viewer execution. No running deployment or production data migration is part of this change.
