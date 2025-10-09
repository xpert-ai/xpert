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
