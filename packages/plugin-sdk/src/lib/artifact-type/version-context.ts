import type { ArtifactRecord, ArtifactVersionRecord } from '../runtime/capabilities/artifacts'

/**
 * Host-resolved input for one authorized, immutable published Artifact version.
 * Shared by type extensions and presentation; no renderer or group context is required.
 * Providers validate domain identity/content. The host retains ACLs and post-operation rechecks;
 * retaining this object does not preserve authorization for a later request.
 */
export interface ArtifactVersionContext {
  /** Current authenticated caller; never substitute the resource creator for upstream access. */
  actor: { tenantId: string; organizationId: string; userId: string }
  /** Source ownership, including the authoring Project even when used from another Project. */
  artifact: ArtifactRecord
  /** Exact published version selected by the host; never resolve latest content or a working draft. */
  version: ArtifactVersionRecord
  /** Authorized, integrity-checked bytes; receiving them grants no general Workspace file access. */
  content: Buffer
}
