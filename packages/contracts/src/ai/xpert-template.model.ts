import { IBasePerTenantEntityModel } from '../base-entity.model'
import { MCPServerType, TMCPServer } from './xpert-tool-mcp.model'
import { XpertTypeEnum } from './xpert.model'
import { TAvatar } from '../types'
import { TCopilotModel } from './copilot-model.model'

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
  type: XpertTypeEnum | 'project'
  copilotModel?: Partial<TCopilotModel>
}

export interface IXpertMCPTemplate extends TTemplate {
  type: MCPServerType
  avatar: TAvatar
  author: string
  transport: MCPServerType
  icon: string
  explore: string
  tags?: string[]
  visitCount?: number
  server: TMCPServer
  options?: any
}

export type TKnowledgePipelineTemplate = TTemplate & {
  avatar: TAvatar
  author: string
  icon: string
  explore: string
  tags?: string[]
  visitCount?: number
}