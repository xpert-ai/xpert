import { IconDefinition } from '../types'
import { IBasePerWorkspaceEntityModel } from './xpert-workspace.model'
import { SkillSlashCommandAvailability } from './skill.model'

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
  tags?: string[]
  visibility?: PromptWorkflowVisibility
  runtimeCapabilities?: unknown
  archivedAt?: Date | string | null
}

export interface IPromptWorkflow extends IBasePerWorkspaceEntityModel, TPromptWorkflow {}

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
