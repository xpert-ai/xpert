import type { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'
import type { ResourceAnalysisPolicy } from './resource-analysis.model'

/**
 * Persisted consent to use one published Artifact version in another group's Project in the same organization.
 * The source manager offers it; the receiving group owner accepts it. Every use rechecks current access.
 * This does not confer source Project membership, source credentials, draft/edit rights or onward sharing.
 * Dates are persistence values; clients consume the serialized ArtifactUseGrantSummary instead.
 */
export interface IArtifactUseGrant extends IBasePerTenantAndOrganizationEntityModel {
  /** Source Artifact identity; ownership stays with ownerProjectId. */
  artifactId: string
  /** Immutable published version ID; publishing a newer version does not update this grant. */
  versionId: string
  /** Source authoring Project, resolved by the host from the Artifact. */
  ownerProjectId: string
  /** Receiving group's Project at issuance; changing the group's binding invalidates access through this grant. */
  targetProjectId: string
  /** Only this group receives the grant, even if other groups use the same target Project. */
  targetGroupId: string
  /** Base resource-view permission; data analysis requires the separate analysis policy. */
  permission: 'read'
  /**
   * Proposed analysis scope while offered; effective scope once explicitly accepted by the group owner.
   * Omitted/null means view-only. Accepting without analysis consent clears it; source data ACLs still apply.
   */
  analysis?: ResourceAnalysisPolicy | null
  /**
   * offered awaits acceptance; active is accepted; revoked is closed by the source; removed is closed by the group.
   * Expiry is checked separately via expiresAt, so active alone never proves that access is currently allowed.
   */
  status: 'offered' | 'active' | 'revoked' | 'removed'
  /** Optimistic concurrency revision; pass the latest value as expectedRevision when changing this grant. */
  revision: number
  /** Human account that issued the offer, not an Assistant or plugin installation owner. */
  issuedById: string
  /** Accepting human account; absent until acceptance. Retained after subsequent closure. */
  acceptedById?: string | null
  /** Time of group-owner acceptance; absent for an offer that was never accepted. */
  acceptedAt?: Date | null
  /** Human account that revoked or removed the grant; absent while it remains open. */
  closedById?: string | null
  /** Explicit closure time; reaching expiresAt alone does not populate this field. */
  closedAt?: Date | null
  /** Exclusive access deadline, checked at use time without requiring an expiry background job. */
  expiresAt: Date
}

/**
 * Lifecycle and access audit events. Reference placement/removal are distinct from the grant state transition.
 * Extend producers and audit consumers together; an access event records a check, not a reusable authorization.
 */
export type ArtifactUseGrantEvent =
  | 'offered'
  | 'accepted'
  | 'revoked'
  | 'removed'
  | 'access'
  | 'denied'
  | 'reference_attached'
  | 'reference_removed'

/** Audit projection for one grant operation; never store credentials, query results or Artifact content here. */
export interface IArtifactUseGrantAudit extends IBasePerTenantAndOrganizationEntityModel {
  /** Grant whose lifecycle or access was checked. */
  grantId: string
  /** Authenticated human account responsible for this operation. */
  actorId: string
  /** Operation/outcome; see ArtifactUseGrantEvent for lifecycle versus reference events. */
  event: ArtifactUseGrantEvent
  /** Grant revision observed or produced by this event, not the reference revision. */
  revision: number
}
