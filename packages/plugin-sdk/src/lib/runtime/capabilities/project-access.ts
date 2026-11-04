import { createRuntimeCapability } from '../../core/runtime-capability'
import type { XpertProjectClassification } from '@xpert-ai/contracts'

import type { RuntimeActor } from '../actor'

export type ProjectAccessActor = RuntimeActor
export interface ProjectHumanAccess extends XpertProjectClassification {
  projectId: string
  name?: string
  role: 'owner' | 'manager' | 'editor' | 'member' | 'assistant'
  canManage: boolean
  archived: boolean
  /** Explicit Project bindings, for plugins that choose to use assignment as business policy. */
  assistantIds?: string[]
}
/** Project membership, Assistant execution access and explicit Assistant bindings. Feature activation remains Assistant-owned. */
export interface ProjectAccessApi {
  listReadable(input: { actor: ProjectAccessActor; projectIds?: string[] }): Promise<ProjectHumanAccess[]>
  assertEdit(input: { actor: ProjectAccessActor; projectId: string }): Promise<ProjectHumanAccess>
  assertManage(input: { actor: ProjectAccessActor; projectId: string }): Promise<ProjectHumanAccess>
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
