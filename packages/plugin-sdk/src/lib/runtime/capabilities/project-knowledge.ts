import { createRuntimeCapability } from '../../core/runtime-capability'
import type { OrganizationRuntimeActor } from '../actor'

export interface ProjectKnowledgeApi {
  /** One built-in library per Project. Uses current Project ACL, independent of a Space or Assistant.
   * Provisioning calls the existing knowledge service; its request/job context must match actor.
   */
  ensureBinding(input: { actor: OrganizationRuntimeActor; projectId: string; title: string }): Promise<{ knowledgebaseId: string }>
}
export const ProjectKnowledgeRuntimeCapability = createRuntimeCapability<ProjectKnowledgeApi>(
  'platform.project.knowledge', { description: 'Provision and bind the Project-owned built-in knowledge library.' }
)
