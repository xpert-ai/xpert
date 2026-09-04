import { createRuntimeCapability } from '../../core/runtime-capability'

/** Trusted server actor. View providers derive this from host context; jobs persist that actor. */
export interface ProjectAccessActor {
  tenantId: string
  organizationId?: string | null
  userId: string
}
export interface ProjectHumanAccess {
  projectId: string
  role: 'owner' | 'manager' | 'editor' | 'member'
  canManage: boolean
  archived: boolean
  /** Explicit Project bindings, for plugins that choose to use assignment as business policy. */
  assistantIds?: string[]
}
/** Human membership only. Assistant assignment and business authorization remain plugin-owned. */
export interface ProjectAccessApi {
  listReadable(input: { actor: ProjectAccessActor; projectIds?: string[] }): Promise<ProjectHumanAccess[]>
  assertManage(input: { actor: ProjectAccessActor; projectId: string }): Promise<ProjectHumanAccess>
}
export const ProjectAccessRuntimeCapability = createRuntimeCapability<ProjectAccessApi>('platform.project.access', {
  description: 'Resolve human Project membership for plugin views and durable background actions.'
})
