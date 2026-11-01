# Artifact type plugins

The host owns Artifact containers, immutable versions, links, audience authorization, expiry, revocation, integrity checks and audit. A type contribution owns its content schema and additional business restrictions. Type approval never overrides platform authorization.

## Register a type

Include a decorated provider in the native plugin's Nest module:

```ts
import { Injectable } from '@nestjs/common'
import {
  ArtifactTypeProvider,
  type ArtifactTypeDefinition,
  type IArtifactTypeProvider,
  type ArtifactTypeSource,
  type ArtifactTypeActor,
  type ContentOperation
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'

const report = z.object({ schemaVersion: z.literal(1), title: z.string(), body: z.string() }).strict()

@Injectable()
@ArtifactTypeProvider('inspection-report')
export class InspectionReportArtifactType implements IArtifactTypeProvider {
  readonly definition: ArtifactTypeDefinition = {
    kinds: ['file'],
    content: { mimeTypes: ['application/json'], maxBytes: 1024 * 1024 },
    sharing: {
      accessModes: ['organization_all'],
      versionModes: ['version'],
      maxTtlSeconds: 7 * 86400,
      allowDownload: false,
      mutableLinks: false,
      descriptor: false,
      shareKey: 'published-report'
    },
    presentation: { mode: 'file' }
  }

  constructor(private readonly reports: InspectionReportsService) {}

  async authorize(source: ArtifactTypeSource, actor: ArtifactTypeActor, operation: ContentOperation) {
    // Reuse the application's governed resource API. A share is not source access.
    if (operation === 'read') await this.reports.assertExportAvailable(source)
    else await this.reports.authorizeExport(source, actor, operation)
  }

  validateContent(content: Buffer) {
    report.parse(JSON.parse(content.toString('utf8')))
  }
}
```

`InspectionReportsService` represents the plugin's business authorization service. Both synchronous and asynchronous validators are supported and awaited. Optional `assertPublication(source, access)` and `assertLink(source, link)` impose further dynamic restrictions, such as a deployment setting.

The decorator declares only `resourceType`. The plugin loader supplies `pluginName` and installation scope. Plugins cannot claim the platform namespace or a different plugin's type. The same provider instance cannot be reused across installations.

Create with an explicit type using the existing runtime capability:

```ts
const type = { pluginName: '@company/inspection', resourceType: 'inspection-report' }
const artifact = await artifacts.createArtifact({
  type,
  source: { ...type, resourceId: reportId },
  kind: 'file',
  title: reportTitle
})
```

`type` is the business type; `kind` is the platform format family and version `mimeType` describes the bytes. A custom type must match the source's plugin and resource type. Omitting `type` explicitly selects the built-in file behavior for ordinary generated files; a registered custom source cannot bypass its type by selecting file behavior. Use existing `ensureArtifactVersion`, `ensureArtifactShare`, `getArtifactShare` and revoke methods. Scope and resource IDs come from trusted execution or authenticated application context, never Agent-supplied identity fields.

The host persists `typeBinding` including the installation scope. Existing bindings cannot be retargeted. Uninstalling a required type denies reads, even if another installation provides a same-named type. Owners can still revoke links. Untyped rows are denied; this new protocol does not infer legacy types. The schema adds a nullable JSON column; new creation always writes a binding.

## Display modes

- `file`: serve the authorized immutable file through the ordinary Artifact content pipeline.
- `snapshot`: provide `snapshot: {kind: 'plugin', read(context), getEntry()}`. `read` returns presentation data from the already-authorized version; `getEntry` returns packaged HTML using the existing remote-component protocol. Use `requestData` to consume the data. There are no query operations. Viewer identity is an explicit anonymous/authenticated union; rendering has no ambient authenticated request identity. Public links use `/artifacts/snapshot/:slug`, including login handling for restricted links. The iframe remains opaque, no-network and script-sandboxed. The host checks access/type availability again after rendering, and the client clears expired content and periodically rechecks access.
- `authenticated`: register the existing `ArtifactPresentationProvider` for the same source and installation. Queries run as the current viewer. Public links do not grant access to this query surface. Declared operations, target versions and both providers are revalidated. See [Artifact presentations](./artifact-presentations.md).

All URLs are returned by the platform; plugins do not choose origins or construct share URLs. A snapshot's `data` must contain only deliberately published content. Native server plugins are trusted code; these contracts are not a process sandbox.

## Built-in conversation plugin

The host registers `ConversationArtifactPlugin` at `@xpert-ai/platform / conversation_snapshot` using this same registry. Its snapshot has `kind: 'host'`, reserved for built-ins. Application composition binds its `/s/:slug` UI, which continues to use ChatKit's read-only MessageList. Conversation entity queries, snapshot schema and public-sharing settings stay in `conversation-sharing`.

No host-internal policy interface or compatibility adapter is retained. Deploy contracts, SDK, server schema and Cloud viewer together. Previously untyped experimental rows require an authorized republish; the server does not silently reinterpret them.

## Project library integration

`ArtifactLibraryRuntimeCapability` (`platform.artifact-library`) manages a Project's pinned references independently of publishing and link creation. Its `add`, `open`, `selectVersion`, `share`, and `revoke` operations accept the authenticated actor and Project (plus Assistant when applicable). A reference is registered in Content Catalog with `presentation.kind: 'artifact'`; collections such as Spaces own only its folder placement. Opening requires both Project membership and the source Artifact's current authorization. Moving, renaming or trashing a reference never mutates the original Artifact.

Declare `definition.title` as an `I18nObject` (for example, `{ en_US: 'Shared conversation', zh_Hans: '分享会话' }`) to name the semantic type. Library responses expose the bound type identity and title through `type`; catalog snapshots include it in `presentation.type`. Collections localize this metadata for list, card and management views independently of the reference relationship and rendering kind. Older providers without a title use the generic Artifact label; consumers must not infer types from filenames or user-authored titles.

Use `ArtifactsApi.readArtifactVersion({ artifactId, artifactVersionId, purpose })` to read published bytes with source authorization, active-version checks, content validation and checksum verification. `purpose: 'copy'` additionally requires `definition.collection.allowCopy: true`. Custom types default to denying copies; the built-in file type permits them. Copying creates an independent lifecycle under the destination Project's ACL, so the collecting UI must explain and confirm this boundary. Conversation snapshots remain reference-only.

The authenticated library viewer reuses the type's file, snapshot or authenticated presentation without minting a share. Existing shares are resolved by the type's `sharing.shareKey` (or `artifact-library`) and their stored URLs can be copied repeatedly. Selecting another reference version does not update the published link. Public sharing remains an explicit, separately authorized operation.

## Project working content and explicit share audiences

Types that own an application draft workflow can declare `versioning: { mode: 'draft-only' }`. Generic version uploads are rejected; publish through Artifact Drafts. `authorizeDraft` adds the working-copy policy. `assertDraftPublication` runs again under the Artifact lock immediately before an immutable version is committed, so domain review checks cannot be bypassed through the generic draft API.

`ArtifactContentRuntimeCapability` stores definition bytes in protected Artifact-owned storage. Ordinary project file listings and file tools cannot read that storage. Reads check the current source policy and require draft access unless the exact content is already referenced by a formal version. The platform validates ownership, canonical references, checksums and the 50 MB limit.

By default, Project membership and link audience are cumulative restrictions. A type may explicitly declare `sharing.projectAccess: 'link-audience'` only with authenticated presentation and organization/workspace audiences. In that case a manager's explicit share can grant access to the published definition outside Project membership. Provider authorization and any resource ACL still apply; tenant and audience membership are checked, revocation remains immediate, and the exception never applies to drafts, generic file APIs, library references, edits or data queries. It cannot enable anonymous/public sharing.
