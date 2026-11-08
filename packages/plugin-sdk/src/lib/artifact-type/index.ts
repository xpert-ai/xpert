import { applyDecorators, SetMetadata } from '@nestjs/common'
import type {
  ArtifactAccessMode,
  ArtifactKind,
  ArtifactLinkVersionMode,
  ArtifactTypeReference,
  IArtifactUseGrant,
  I18nObject
} from '@xpert-ai/contracts'
import type { ContentOperation } from '../content-resource'
import type { ArtifactLinkAccessInput } from '../runtime/capabilities/artifacts'
import { STRATEGY_META_KEY } from '../types'

export const ARTIFACT_TYPE_PROVIDER = 'XPERT_ARTIFACT_TYPE_PROVIDER'
/** The loader supplies plugin identity. A contribution cannot select another plugin's namespace. */
export const ArtifactTypeProvider = (resourceType: string) =>
  applyDecorators(
    SetMetadata(ARTIFACT_TYPE_PROVIDER, resourceType),
    SetMetadata(STRATEGY_META_KEY, ARTIFACT_TYPE_PROVIDER)
  )

export type ArtifactTypeSource = ArtifactTypeReference & {
  resourceId: string
  tenantId?: string | null
  organizationId?: string | null
  userId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  xpertId?: string | null
}
export type ArtifactTypeActor = { tenantId?: string | null; userId?: string | null }
export type ArtifactTypeLink = {
  accessMode: ArtifactAccessMode
  versionMode: ArtifactLinkVersionMode
  expiresAt?: Date | string | null
  allowDownload?: boolean
}
/**
 * Delegation facts passed to a type's assertUseGrant hook for domain-specific restrictions.
 * Projects, group and fixed version are host-resolved; this is neither an actor credential nor an analysis permission.
 * The host owns lifecycle/concurrency checks and separately validates ResourceAnalysisPolicy when requested.
 */
export type ArtifactUseGrantPolicy = Pick<
  IArtifactUseGrant,
  'artifactId' | 'versionId' | 'ownerProjectId' | 'targetProjectId' | 'targetGroupId' | 'permission' | 'expiresAt'
>
/** Declarative type capabilities validated by the host; opt-in metadata never substitutes for per-operation authorization. */
export interface ArtifactTypeDefinition {
  /** Localized semantic type name shown by libraries independently of the storage/rendering kind. */
  title?: I18nObject
  kinds: readonly ArtifactKind[]
  /** Copying bytes into another Project changes their lifecycle and sharing boundary. Custom views must opt in. */
  collection?: { allowCopy: boolean }
  content?: { mimeTypes: readonly string[]; maxBytes: number }
  /** A managed application owns publication; generic version uploads cannot bypass its draft workflow. */
  versioning?: { mode: 'draft-only' }
  /**
   * Opt in to fixed published versions used by another group's Project; omission disables group grants for this type.
   * Requires authenticated presentation. This does not enable draft/edit/copy/export access or bypass data ACLs.
   */
  useGrants?: {
    /** Group-scoped audience; other groups sharing the same Project receive no implicit access. */
    audience: 'group'
    /** Only read use is supported; do not model authoring access by adding operations to queryOperations. */
    permission: 'read'
    /**
     * Additional allowlist intersected with presentation-provider operations; omitted/empty permits no interactive queries.
     * This controls viewer interactions, separately from Agent analysis consent. Providers still enforce upstream data ACLs.
     */
    queryOperations?: readonly string[]
  }
  sharing?: {
    /** Opt in to authenticated Project shares beyond membership; source ACL and data policy still apply. */
    projectAccess?: 'link-audience'
    accessModes: readonly ArtifactAccessMode[]
    versionModes: readonly ArtifactLinkVersionMode[]
    maxTtlSeconds?: number
    allowDownload: boolean
    mutableLinks: boolean
    descriptor: boolean
    shareKey?: string
  }
  /** Built-in surfaces are resolved by host composition; plugins use the platform viewer. */
  presentation: { mode: 'file' } | { mode: 'snapshot' } | { mode: 'authenticated' }
}
export interface ArtifactSnapshotContext {
  /** This is the export's scope, not an authenticated principal. */
  source: ArtifactTypeSource
  viewer: { kind: 'anonymous' } | { kind: 'authenticated'; actor: { tenantId: string; userId: string } }
  content: Buffer
}
/** Snapshot renderers receive only the already-authorized version. They expose no query channel. */
interface ArtifactSnapshotReader {
  read(context: ArtifactSnapshotContext): Promise<object>
}
export type ArtifactSnapshotProvider = ArtifactSnapshotReader &
  ({ kind: 'host' } | { kind: 'plugin'; getEntry(): Promise<{ html: string }> })
export interface IArtifactTypeProvider {
  readonly definition: ArtifactTypeDefinition
  authorize(source: ArtifactTypeSource, actor: ArtifactTypeActor, operation: ContentOperation): Promise<void>
  /** Additional policy for working drafts; published reads keep their ordinary source policy. */
  authorizeDraft?(source: ArtifactTypeSource, actor: ArtifactTypeActor, operation: ContentOperation): Promise<void>
  /** Enforce domain review/dependency policy immediately before committing the verified draft. */
  assertDraftPublication?(
    source: ArtifactTypeSource,
    actor: ArtifactTypeActor,
    draft: import('../runtime/capabilities/artifact-drafts').ArtifactDraftRecord
  ): Promise<void>
  validateContent(content: Buffer, mimeType: string): Promise<void> | void
  /** Opt-in adoption of legacy file bindings; validate provenance as well as every saved payload. */
  validateLegacyContent?(source: ArtifactTypeSource, content: Buffer, mimeType: string): Promise<void> | void
  assertPublication?(source: ArtifactTypeSource, access: ArtifactLinkAccessInput): Promise<void> | void
  assertLink?(source: ArtifactTypeSource, link: ArtifactTypeLink): Promise<void> | void
  /**
   * Reject delegation that violates this resource's domain policy, using the host-resolved source and grant facts.
   * Called on offer, acceptance and granted reads; throw to deny. Omission retains all platform checks.
   * Does not grant source membership or replace the Analytics query provider's dataset-sharing authorization.
   */
  assertUseGrant?(source: ArtifactTypeSource, grant: ArtifactUseGrantPolicy): Promise<void> | void
  readonly snapshot?: ArtifactSnapshotProvider
  /** Optional fixed-version dataset declarations; queries and sharing authority remain with platform Analytics. */
  readonly analytics?: import('./analytics').ArtifactTypeAnalytics
}

export * from './registry'
export type { ArtifactVersionContext } from './version-context'
export type { ArtifactAnalyticsBinding, ArtifactTypeAnalytics } from './analytics'
export type { ArtifactTypeReference, ArtifactTypeBinding } from '@xpert-ai/contracts'
