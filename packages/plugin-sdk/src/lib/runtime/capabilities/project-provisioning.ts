import { createRuntimeCapability } from '../../core/runtime-capability'

/** Lifecycle states that plugin-managed Projects may synchronize to the platform. */
export type ProjectProvisioningStatus = 'active' | 'archived'

/** Portable identity of one required, direct External Assistant binding. */
export type ProjectExternalAssistantExpectation = {
  pluginName: string
  templateKey: string
  agentKey: string
}

/** Stable identity and desired state for an idempotently provisioned Chat Project. */
export type ProjectEnsureInput = {
  /** Caller-generated id reused across retries to prevent duplicate Projects. */
  projectId: string
  /** @deprecated Projects no longer belong to a Workspace. Accepted only for legacy callers. */
  workspaceId?: string
  /** Assistant that must be connected to the Project. */
  xpertId: string
  /** Primary requester Agent used as the trust anchor for direct External Assistants. */
  requesterAgentKey?: string
  /** Portable External Assistant identities that must all validate before any Project mutation. */
  externalAssistantExpectations?: ProjectExternalAssistantExpectation[]
  /** Current business-project display name. */
  name: string
  /** Current business-project lifecycle state. */
  status: ProjectProvisioningStatus
}

/** Effective Project state after an idempotent ensure operation. */
export type ProjectEnsureResult = {
  projectId: string
  /** @deprecated Echoed only when supplied by a legacy caller. */
  workspaceId?: string
  /** Complete set of Assistants connected after synchronization. */
  xpertIds: string[]
  /** Whether this call inserted the Project or reconciled an existing one. */
  operation: 'created' | 'updated'
}

/** Host API exposed to plugins that own one-to-one business Project mappings. */
export interface ProjectProvisioningApi {
  /** Create or reconcile a Chat Project without changing its caller-supplied id. */
  ensure(input: ProjectEnsureInput): Promise<ProjectEnsureResult>
}

export const ProjectProvisioningRuntimeCapability = createRuntimeCapability<ProjectProvisioningApi>(
  'platform.project.provisioning',
  {
    description: 'Idempotently provision a platform Chat Project and connect it to an Assistant.'
  }
)
