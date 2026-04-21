import { IBasePerTenantEntityModel } from '../base-entity.model'
import { IconDefinition, TAvatar } from '../types'
import { TCopilotModel } from './copilot-model.model'
import { MCPServerType, TMCPServer } from './xpert-tool-mcp.model'
import { XpertTypeEnum } from './xpert.model'

export interface IXpertTemplate extends IBasePerTenantEntityModel {
  key: string
  name?: string
  visitCount: number
  lastVisitedAt?: Date
}

export type TemplateSkillSyncMode = 'incremental' | 'full'

export type TemplateSkillSyncStatus = 'created' | 'updated' | 'unchanged' | 'missing' | 'failed'

export interface ITemplateSkillSyncItemSummary {
  created: number
  updated: number
  unchanged: number
  missing: number
  failed: number
}

export interface ITemplateSkillSyncRepositoryResult {
  name: string
  provider: string
  repositoryId?: string
  status: TemplateSkillSyncStatus
  message?: string
}

export interface ITemplateSkillSyncIndexResult {
  repositoryId?: string
  repositoryName: string
  provider: string
  mode: TemplateSkillSyncMode
  status: TemplateSkillSyncStatus
  syncedCount?: number
  message?: string
}

export interface ITemplateSkillSyncBundleResult {
  sharedSkillId: string
  provider: string
  repositoryName: string
  skillId: string
  status: TemplateSkillSyncStatus
  hash?: string
  repositoryId?: string
  indexId?: string
  message?: string
}

export interface ITemplateSkillSyncRefResult {
  provider: string
  repositoryName: string
  skillId: string
  status: TemplateSkillSyncStatus
  repositoryId?: string
  indexId?: string
  message?: string
}

export interface ITemplateSkillSyncSummary {
  repositories: ITemplateSkillSyncItemSummary
  indexes: ITemplateSkillSyncItemSummary
  bundles: ITemplateSkillSyncItemSummary
  featuredRefs: ITemplateSkillSyncItemSummary
  workspaceDefaults: ITemplateSkillSyncItemSummary
}

export interface ITemplateSkillSyncResult {
  mode: TemplateSkillSyncMode
  validateOnly: boolean
  fingerprint: string
  repositories: ITemplateSkillSyncRepositoryResult[]
  indexes: ITemplateSkillSyncIndexResult[]
  bundles: ITemplateSkillSyncBundleResult[]
  featuredRefs: ITemplateSkillSyncRefResult[]
  workspaceDefaults: ITemplateSkillSyncRefResult[]
  summary: ITemplateSkillSyncSummary
}

export type TTemplate = {
  id: string
  name: string
  title: string
  description: string
  category: string
  copyright: string
  privacyPolicy?: string
  export_data: string
}

export type TXpertTemplate = TTemplate & {
  avatar: TAvatar
  // icon: IconDefinition | string
  type: XpertTypeEnum | 'project'
  copilotModel?: Partial<TCopilotModel>
}

export interface IXpertMCPTemplate extends TTemplate {
  /**
   * string is the backward compatible image file URL format
   */
  icon: IconDefinition | string
  type: MCPServerType
  author: string
  transport: MCPServerType
  explore: string
  tags?: string[]
  visitCount?: number
  server: TMCPServer
  options?: any
}

export type TKnowledgePipelineTemplate = TTemplate & {
  icon: IconDefinition
  author: string
  explore: string
  tags?: string[]
  visitCount?: number
}
