import { createRuntimeCapability } from '../../core/runtime-capability'
import type {
  ArtifactAccessMode,
  ArtifactKind,
  ArtifactLinkDisposition,
  ArtifactLinkStatus,
  ArtifactLinkVersionMode,
  ArtifactSafeHtmlProfile,
  ArtifactStatus,
  ArtifactVersionStatus
} from '@xpert-ai/contracts'
import type { WorkspacePortableFileReference } from './workspace-files'

export type {
  ArtifactAccessMode,
  ArtifactKind,
  ArtifactLinkDisposition,
  ArtifactLinkStatus,
  ArtifactLinkVersionMode,
  ArtifactSafeHtmlProfile,
  ArtifactStatus,
  ArtifactVersionStatus
} from '@xpert-ai/contracts'

/** Scope fields used when an Artifact belongs to a user/workspace/project/Xpert context. */
export type ArtifactScopeInput = {
  tenantId?: string | null
  organizationId?: string | null
  userId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  xpertId?: string | null
}

/** Stable plugin-owned business identity for an Artifact container. */
export type ArtifactSourceInput = {
  pluginName: string
  resourceType: string
  resourceId: string
  checksum?: string | null
}

/** Creates or locates an Artifact container without uploading content bytes. */
export type CreateArtifactInput = {
  source: ArtifactSourceInput
  kind?: ArtifactKind | null
  title?: string | null
  description?: string | null
  scope?: ArtifactScopeInput | null
  metadata?: Record<string, unknown> | null
}

/** Immutable content payload metadata for a new Artifact version. */
export type ArtifactVersionInput = {
  workspaceFileRef: WorkspacePortableFileReference
  mimeType: string
  fileName?: string | null
  title?: string | null
  description?: string | null
  size?: number | null
  sha256?: string | null
  sourceVersionId?: string | null
  checksum?: string | null
  setCurrent?: boolean | null
  metadata?: Record<string, unknown> | null
}

export type CreateArtifactVersionInput = ArtifactVersionInput & {
  artifactId: string
}

/** Idempotently creates or reuses one immutable Artifact content version. */
export type EnsureArtifactVersionInput = CreateArtifactVersionInput & {
  idempotencyKey: string
}

/** Access policy requested for an Artifact link. */
export type ArtifactLinkAccessInput = {
  mode: ArtifactAccessMode
  customPrincipals?: string[] | null
  expiresAt?: string | Date | null
  ttlSeconds?: number | null
  userConfirmedPublicLink?: boolean | null
}

/** Browser response hints and HTML safety profile for an Artifact link. */
export type ArtifactLinkPresentationInput = {
  disposition?: ArtifactLinkDisposition | null
  allowDownload?: boolean | null
  safeHtmlProfile?: ArtifactSafeHtmlProfile | null
}

/** Creates a share/open/download entrypoint for an Artifact. */
export type CreateArtifactLinkInput = {
  artifactId: string
  artifactVersionId?: string | null
  versionMode?: ArtifactLinkVersionMode | null
  access: ArtifactLinkAccessInput
  presentation?: ArtifactLinkPresentationInput | null
  metadata?: Record<string, unknown> | null
}

/** Stable plugin-owned slot for one active durable share policy. */
export type ArtifactShareInput = CreateArtifactLinkInput & {
  shareKey: string
}

/** Creates a short-lived signed preview link; never use this as a durable share URL. */
export type CreateSignedArtifactPreviewLinkInput = Omit<CreateArtifactLinkInput, 'access'> & {
  ttlSeconds?: number | null
}

/** Immutable Artifact version returned to plugins. */
export type ArtifactVersionRecord = {
  id: string
  artifactId: string
  versionNumber: number
  status: ArtifactVersionStatus
  idempotencyKey?: string | null
  sourceVersionId?: string | null
  checksum?: string | null
  mimeType: string
  fileName?: string | null
  title?: string | null
  description?: string | null
  size?: number | null
  sha256?: string | null
  workspaceFileRef?: WorkspacePortableFileReference | null
  metadata?: Record<string, unknown> | null
  createdAt?: string | Date
}

/** Durable Artifact container returned to plugins. */
export type ArtifactRecord = ArtifactScopeInput & {
  id: string
  pluginName: string
  resourceType: string
  resourceId: string
  checksum?: string | null
  kind: ArtifactKind
  status: ArtifactStatus
  title?: string | null
  description?: string | null
  currentVersionId?: string | null
  currentVersion?: ArtifactVersionRecord | null
  metadata?: Record<string, unknown> | null
  createdAt?: string | Date
  updatedAt?: string | Date
}

/** Share/open/download entrypoint returned to plugins. */
export type ArtifactLinkRecord = ArtifactScopeInput & {
  id: string
  artifactId: string
  artifactVersionId?: string | null
  shareKey?: string | null
  versionMode: ArtifactLinkVersionMode
  slug: string
  publicUrl: string
  accessMode: ArtifactAccessMode
  status: ArtifactLinkStatus
  customPrincipals?: string[] | null
  expiresAt?: string | Date | null
  revokedAt?: string | Date | null
  accessCount?: number
  downloadCount?: number
  disposition: ArtifactLinkDisposition
  allowDownload: boolean
  safeHtmlProfile?: ArtifactSafeHtmlProfile | null
  metadata?: Record<string, unknown> | null
  createdAt?: string | Date
  updatedAt?: string | Date
  artifact?: ArtifactRecord
  version?: ArtifactVersionRecord | null
}

/** Filter used when listing Artifacts visible to the current plugin/runtime scope. */
export type ListArtifactsInput = {
  pluginName?: string | null
  resourceType?: string | null
  resourceId?: string | null
  status?: ArtifactStatus | 'all' | null
  page?: number | null
  pageSize?: number | null
}

export type ListArtifactsResult = {
  items: ArtifactRecord[]
  total: number
  page: number
  pageSize: number
}

export type FindArtifactBySourceInput = Pick<ArtifactSourceInput, 'pluginName' | 'resourceType' | 'resourceId'> & {
  includeDeleted?: boolean | null
}

export type ListArtifactVersionsInput = {
  artifactId: string
  idempotencyKey?: string | null
  status?: ArtifactVersionStatus | 'all' | null
}

export type EnsureArtifactVersionResult = {
  version: ArtifactVersionRecord
  outcome: 'created' | 'reused'
}

export type ArtifactShareKeyInput = {
  artifactId: string
  shareKey: string
}

export type EnsureArtifactShareResult = {
  link: ArtifactLinkRecord
  outcome: 'created' | 'reused' | 'replaced'
  replacedLinkId?: string | null
}

/** Mutable parts of an Artifact link; content versions remain immutable. */
export type UpdateArtifactLinkAccessInput = {
  access?: ArtifactLinkAccessInput | null
  presentation?: ArtifactLinkPresentationInput | null
  artifactVersionId?: string | null
  versionMode?: ArtifactLinkVersionMode | null
}

/** Platform runtime capability exposed to plugins for managing generated Artifacts. */
export interface ArtifactsApi {
  createArtifact(input: CreateArtifactInput): Promise<ArtifactRecord>
  findArtifactBySource(input: FindArtifactBySourceInput): Promise<ArtifactRecord | null>
  createArtifactVersion(input: CreateArtifactVersionInput): Promise<ArtifactVersionRecord>
  listArtifactVersions(input: ListArtifactVersionsInput): Promise<ArtifactVersionRecord[]>
  ensureArtifactVersion(input: EnsureArtifactVersionInput): Promise<EnsureArtifactVersionResult>
  getArtifact(idOrSlug: string): Promise<ArtifactRecord>
  listArtifacts(input?: ListArtifactsInput): Promise<ListArtifactsResult>
  archiveArtifact(idOrSlug: string): Promise<ArtifactRecord>
  deleteArtifact(idOrSlug: string): Promise<ArtifactRecord>
  createArtifactLink(input: CreateArtifactLinkInput): Promise<ArtifactLinkRecord>
  getArtifactShare(input: ArtifactShareKeyInput): Promise<ArtifactLinkRecord | null>
  ensureArtifactShare(input: ArtifactShareInput): Promise<EnsureArtifactShareResult>
  revokeArtifactShare(input: ArtifactShareKeyInput): Promise<ArtifactLinkRecord | null>
  createSignedPreviewLink(input: CreateSignedArtifactPreviewLinkInput): Promise<ArtifactLinkRecord>
  updateArtifactLinkAccess(idOrSlug: string, patch: UpdateArtifactLinkAccessInput): Promise<ArtifactLinkRecord>
  revokeArtifactLink(idOrSlug: string): Promise<ArtifactLinkRecord>
}

export const ArtifactsRuntimeCapability = createRuntimeCapability<ArtifactsApi>('platform.artifacts', {
  description:
    'Create, version, preview, download, share, archive, and delete platform-managed plugin and Agent artifacts.'
})
