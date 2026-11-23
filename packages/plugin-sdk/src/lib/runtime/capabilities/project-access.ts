import { createRuntimeCapability } from '../../core/runtime-capability'
import type { ProjectApplicationBindings, XpertProjectClassification } from '@xpert-ai/contracts'

import type { RuntimeActor } from '../actor'

export type ProjectAccessActor = RuntimeActor
export interface ProjectHumanAccess extends XpertProjectClassification {
  projectId: string
  name?: string
  role: 'owner' | 'manager' | 'editor' | 'member' | 'assistant'
  /** Organization installation metadata resolved on request by {@link ProjectAccessApi.assertManage}. */
  applicationBindings?: ProjectApplicationBindings
  canManage: boolean
  archived: boolean
  /** Explicit Project bindings, for plugins that choose to use assignment as business policy. */
  assistantIds?: string[]
}
/** Project membership, Assistant execution access and explicit Assistant bindings. Feature activation remains Assistant-owned. */
export interface ProjectAccessApi {
  listReadable(input: { actor: ProjectAccessActor; projectIds?: string[] }): Promise<ProjectHumanAccess[]>
  assertEdit(input: { actor: ProjectAccessActor; projectId: string }): Promise<ProjectHumanAccess>
  /**
   * Require project management access and return the actor's access record for that project.
   * By default this checks project access alone. Request installation bindings when the operation
   * needs the current organization's role assignments or application settings.
   */
  assertManage(input: {
    actor: ProjectAccessActor
    projectId: string
    /** A matching installation must be ready. Without a matching installation, the result omits applicationBindings. */
    includeApplicationBindings?: boolean
  }): Promise<ProjectHumanAccess>
  /** Validate an explicit Assistant connection, including published/root identity normalization. */
  assertAssistant(input: {
    actor: ProjectAccessActor
    projectId: string
    assistantId: string
  }): Promise<ProjectHumanAccess>
}
export const ProjectAccessRuntimeCapability = createRuntimeCapability<ProjectAccessApi>('platform.project.access', {
  description: 'Resolve Project membership and Assistant execution access for platform and plugin operations.'
})
