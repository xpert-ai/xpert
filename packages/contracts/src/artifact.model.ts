import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'

/**
 * Access policies supported by platform-managed Artifact links.
 *
 * `public_link` is the only mode intended for anonymous web access; `signed_preview`
 * is a short-lived capability URL for temporary previews.
 */
export type ArtifactAccessMode =
  | 'owner_only'
  | 'workspace_all'
  | 'organization_all'
  | 'custom_principals'
  | 'public_link'
  | 'signed_preview'

/** Lifecycle state of an Artifact container. */
export type ArtifactStatus = 'active' | 'archived' | 'deleted'

/** Lifecycle state of an immutable Artifact content version. */
export type ArtifactVersionStatus = 'active' | 'deleted'

/** Lifecycle state of a public or scoped Artifact access entrypoint. */
export type ArtifactLinkStatus = 'active' | 'revoked' | 'expired'

/** Artifact rendering/download family used by viewers and security policy. */
export type ArtifactKind = 'html' | 'markdown' | 'pdf' | 'pptx' | 'image' | 'file' | 'site' | 'presentation'

/** Whether an Artifact link follows the latest version or pins one immutable version. */
export type ArtifactLinkVersionMode = 'latest' | 'version'

/** Browser presentation hint for Artifact responses. */
export type ArtifactLinkDisposition = 'inline' | 'attachment'

/** HTML safety profile applied when serving interactive or strict single-file HTML. */
export type ArtifactSafeHtmlProfile = 'strict' | 'interactive'

/** Audited events emitted by Artifact open/download/management flows. */
export type ArtifactAccessEvent = 'access' | 'download' | 'denied' | 'revoked' | 'expired' | 'archived' | 'deleted'

/**
 * Persistable reference to a Workspace Files object.
 *
 * The platform stores Artifact bytes in Workspace Files and keeps only this
 * portable reference in Artifact metadata, so async jobs and public controllers
 * can resolve content without leaking host filesystem paths.
 */
export interface IArtifactWorkspaceFileReference {
  source: 'platform.workspace.files'
  filePath: string
  workspacePath: string
  tenantId?: string | null
  userId?: string | null
  catalog?: 'projects' | 'users' | 'knowledges' | 'skills' | 'xperts' | null
  scopeId?: string | null
  projectId?: string | null
  knowledgeId?: string | null
  rootId?: string | null
  xpertId?: string | null
  isolateByUser?: boolean | null
  originalName?: string | null
  name?: string | null
  mimeType?: string | null
  size?: number | null
}

/**
 * Artifact is the durable product object created by Agents/plugins.
 *
 * It is a stable container for versioned content such as generated HTML, PDFs,
 * decks, images, static sites, or other files. Content bytes live in versions;
 * this record owns source identity, scope, title, and current-version pointer.
 */
export interface IArtifact extends IBasePerTenantAndOrganizationEntityModel {
  pluginName: string
  resourceType: string
  resourceId: string
  checksum?: string | null
  kind: ArtifactKind
  status: ArtifactStatus
  title?: string | null
  description?: string | null
  currentVersionId?: string | null
  currentVersion?: IArtifactVersion | null
  workspaceId?: string | null
  projectId?: string | null
  xpertId?: string | null
  userId?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Immutable content version of an Artifact.
 *
 * Version rows point at a Workspace Files reference and include enough content
 * metadata to validate checksums, serve downloads, and reproduce a fixed share.
 */
export interface IArtifactVersion extends IBasePerTenantAndOrganizationEntityModel {
  artifact?: IArtifact | null
  artifactId: string
  versionNumber: number
  status: ArtifactVersionStatus
  sourceVersionId?: string | null
  checksum?: string | null
  workspaceFileRef: IArtifactWorkspaceFileReference
  mimeType: string
  fileName?: string | null
  title?: string | null
  description?: string | null
  size?: number | null
  sha256?: string | null
  workspaceId?: string | null
  projectId?: string | null
  xpertId?: string | null
  userId?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Access entrypoint for an Artifact.
 *
 * A link owns the externally copied slug/public URL, access policy, optional
 * pinned version, and counters. It can point to `latest` or a fixed version.
 */
export interface IArtifactLink extends IBasePerTenantAndOrganizationEntityModel {
  artifact?: IArtifact | null
  artifactId: string
  artifactVersionId?: string | null
  versionMode: ArtifactLinkVersionMode
  slug: string
  publicUrl: string
  accessMode: ArtifactAccessMode
  status: ArtifactLinkStatus
  customPrincipals?: string[] | null
  tokenHash?: string | null
  expiresAt?: Date | null
  revokedAt?: Date | null
  accessCount: number
  downloadCount: number
  disposition: ArtifactLinkDisposition
  allowDownload: boolean
  safeHtmlProfile?: ArtifactSafeHtmlProfile | null
  workspaceId?: string | null
  projectId?: string | null
  xpertId?: string | null
  userId?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Append-only audit row for Artifact access and lifecycle events.
 *
 * Logs intentionally store hashes/summaries rather than public tokens or file
 * contents, so public access remains auditable without leaking sensitive data.
 */
export interface IArtifactAccessLog extends IBasePerTenantAndOrganizationEntityModel {
  link?: IArtifactLink | null
  linkId?: string | null
  artifactId?: string | null
  slug: string
  event: ArtifactAccessEvent
  accessMode?: ArtifactAccessMode | null
  principalUserId?: string | null
  ipHash?: string | null
  userAgent?: string | null
  statusCode?: number | null
  error?: string | null
  metadata?: Record<string, unknown> | null
}
