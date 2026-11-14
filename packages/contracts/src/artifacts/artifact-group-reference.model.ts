import type { ArtifactLibraryView } from './artifact-presentation.model'
import type { IArtifactUseGrant } from './artifact-use-grant.model'
import type { ResourceAnalysisPolicy } from '../analytics/resource-analysis.model'

/**
 * Client-safe grant projection used by source-management and group acceptance APIs.
 * Contains no source file handles or credentials. It is display/concurrency metadata, not an access token.
 */
export interface ArtifactUseGrantSummary {
  /** Grant ID, distinct from the accepted group's reference ID. */
  id: string
  /** Original source Artifact; never a copied Artifact in the receiving Project. */
  artifactId: string
  /** Pinned published version ID; use this, not a latest-version lookup, when resolving content. */
  versionId: string
  /** Project retaining source ownership and authoring permissions. */
  ownerProjectId: string
  /** Receiving group's Project captured when the offer was issued. */
  targetProjectId: string
  /** Receiving group; Project membership alone does not allow use of this grant. */
  targetGroupId: string
  /** Read-only resource use; does not itself authorize querying upstream data. */
  permission: 'read'
  /** Proposed scope on an offer, accepted scope on an active grant; absent/null remains view-only. */
  analysis?: ResourceAnalysisPolicy | null
  /** Lifecycle state; consumers must also consider expiry and let the server reauthorize each operation. */
  status: IArtifactUseGrant['status']
  /** Grant concurrency token for accept/revoke operations; do not substitute a reference revision. */
  revision: number
  /** ISO 8601 access deadline serialized by the host. */
  expiresAt: string
}

/**
 * Accepted, group-scoped placement of a source Artifact's fixed published version.
 * This is not an ordinary Project catalog entry: viewers must belong to groupId and satisfy the live grant.
 * Keep ownerProjectId and runtimeProjectId separate when resolving data, navigation and authorization.
 */
export interface ArtifactGroupReference {
  /** Group reference ID used by group view/query/removal endpoints and resource navigation. */
  id: string
  /** Backing grant ID; acceptance creates the placement without transferring ownership. */
  grantId: string
  /** Source Artifact identity. */
  artifactId: string
  /** Fixed published version identity; unrelated to a working draft revision. */
  versionId: string
  /** Source authoring Project; never switch the group conversation into this Project to view the resource. */
  ownerProjectId: string
  /** Group's usage Project, which must still match the Project captured by the backing grant. */
  runtimeProjectId: string
  /** Audience owning this placement; another group in the same Project has no implied access. */
  groupId: string
  /** Display title stored with the placement; not an identifier or a permission discriminator. */
  title: string
  /** Reference concurrency token for removal; independent of the backing grant's revision. */
  revision: number
  /** Human-readable version sequence; use versionId for identity. */
  versionNumber: number
  /** Backing grant's ISO 8601 deadline; a previously fetched reference may expire or be revoked. */
  expiresAt: string
  /** No source editing through this reference; permitted analysis is described separately. */
  readOnly: true
  /** Effective, explicitly accepted analysis scope; absent/null means view-only. */
  analysis?: ResourceAnalysisPolicy | null
  /** Authenticated library-view URL, not a public share link or a bypass for group authorization. */
  url: string
}

/** Authorized library-view payload plus the group placement needed for subsequent scoped requests. */
export interface ArtifactGroupReferenceView extends ArtifactLibraryView {
  /** Revalidated placement corresponding to this view's fixed content version. */
  reference: ArtifactGroupReference
}
