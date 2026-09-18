import { IconDefinition } from '../types'
import { IBasePerWorkspaceEntityModel } from './xpert-workspace.model'
import { SkillSlashCommandAvailability } from './skill.model'
import { ITag } from '../tag-entity.model'
import type { ChatKitPromptScenario } from '@xpert-ai/chatkit-types'

export type PromptWorkflowScenario = ChatKitPromptScenario

/** Boundary validation for persisted and API-provided scenario lists. */
export function isPromptWorkflowScenarios(value: unknown): value is PromptWorkflowScenario[] {
  return (
    Array.isArray(value) &&
    value.length <= 20 &&
    value.every(
      (item: unknown) =>
        !!item &&
        typeof item === 'object' &&
        'id' in item &&
        typeof item.id === 'string' &&
        !!item.id.trim() &&
        item.id.length <= 100 &&
        'label' in item &&
        typeof item.label === 'string' &&
        !!item.label.trim() &&
        item.label.length <= 120 &&
        'args' in item &&
        typeof item.args === 'string' &&
        !!item.args.trim() &&
        item.args.length <= 20000
    ) &&
    new Set(value.map((item: PromptWorkflowScenario) => item.id)).size === value.length
  )
}

export type PromptWorkflowVisibility = 'private' | 'team' | 'tenant'

export type PromptWorkflowSourceType = 'xpert' | 'workspace_prompt_workflow' | 'skill'

export type PromptWorkflowCommandPriority = 'normal' | 'preferred'

export type TPromptWorkflow = {
  name: string
  label?: string
  description?: string
  icon?: string | IconDefinition | Record<string, unknown>
  category?: string
  aliases?: string[]
  argsHint?: string
  template: string
  scenarios?: PromptWorkflowScenario[]
  tags?: string[]
  visibility?: PromptWorkflowVisibility
  runtimeCapabilities?: unknown
  archivedAt?: Date | string | null
}

export interface IPromptWorkflow extends IBasePerWorkspaceEntityModel, TPromptWorkflow {
  organizationTags?: ITag[]
  /** Empty means every expert in this workspace. Stale IDs must not broaden the scope. */
  associatedXpertIds?: string[] | null
}

export type PromptWorkflowInput = Partial<TPromptWorkflow> & {
  organizationTagIds?: string[]
  associatedXpertIds?: string[]
}

export type TPromptWorkflowCommandSnapshot = TPromptWorkflow & {
  workflowId?: string
  workspaceId?: string
}

export type TXpertCommandProfileEntry = {
  id?: string
  source: PromptWorkflowSourceType
  enabled?: boolean
  order?: number
  priority?: PromptWorkflowCommandPriority

  workflowId?: string
  skillCommandName?: string
  snapshot?: TPromptWorkflowCommandSnapshot

  name?: string
  label?: string
  description?: string
  icon?: string | IconDefinition | Record<string, unknown>
  category?: string
  aliases?: string[]
  argsHint?: string
  template?: string
  runtimeCapabilities?: unknown
  availability?: SkillSlashCommandAvailability
}

export type TXpertCommandProfile = {
  version: 1
  enabled?: boolean
  commands?: TXpertCommandProfileEntry[]
}
