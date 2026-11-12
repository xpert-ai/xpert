/**
 * Authoring View -> signed-in host command for source grant management.
 * The host verifies the declared View, Assistant and source Project before forwarding the action.
 * Embedded/group credentials never become source-management authority and no login token is returned to the View.
 */
export const ARTIFACT_USE_GRANT_MANAGE_COMMAND = 'artifact.use-grants.manage'
/** Allowlisted authoring actions; adding one also requires host dispatch and provider-side input validation. */
export type ArtifactUseGrantAuthoringAction =
  /** Paginated receiving-group candidates; input uses artifactId and optional offset/limit. */
  | 'group-grant-targets'
  /** Paginated grants issued for the source Artifact; uses the same pagination input. */
  | 'group-grants'
  /** Offer a fixed version to a group; input uses versionId, targetGroupId, days and optional analysis. */
  | 'group-grant-offer'
  /** Close an existing source grant using grantId and its latest expectedRevision. */
  | 'group-grant-revoke'
  /** Inspect shareable dataset metadata for versionId without querying business rows. */
  | 'group-grant-analysis-options'
/**
 * Credential-free host command payload. Actor and Project scope come from trusted host context.
 * The actionKey and input unions are not correlated by TypeScript; adapters must validate their combination.
 * This View adapter uses a duration in days; the runtime grant API receives an absolute expiresAt timestamp.
 */
export type ArtifactUseGrantAuthoringRequest = {
  /** Selects the operation and the corresponding input shape documented above. */
  actionKey: ArtifactUseGrantAuthoringAction
  /** Source identity is always required; fields from another action must be rejected at the adapter boundary. */
  input: { artifactId: string } &
    /** Zero-based pagination; omitted values use the authoring adapter's defaults. */
    (| { offset?: number; limit?: number }
      | {
          /** Published version of artifactId; drafts cannot be offered. */
          versionId: string
          /** Receiving group; its current Project is resolved by the server. */
          targetGroupId: string
          /** Whole-day duration, validated by the authoring adapter before computing expiresAt. */
          days: number
          /** Explicit proposed analysis scope; omission offers view-only use. */
          analysis?: import('./resource-analysis.model').ResourceAnalysisPolicy
        }
      /** Published version whose datasets and sharing eligibility should be described. */
      | { versionId: string }
      /** Latest grant revision is required to prevent revoking a concurrently changed grant. */
      | { grantId: string; expectedRevision: number }
    )
}
