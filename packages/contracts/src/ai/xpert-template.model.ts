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

export type TXpertTemplate = {
  id: string
  name: string
  title: string
  description: string
  avatar: TAvatar
  type: XpertTypeEnum | 'project'
  category: string
  copilotModel?: Partial<TCopilotModel>
  copyright: string
  privacyPolicy?: string
  export_data: string
}

export interface IXpertMCPTemplate {
  type: MCPServerType
  name: string
  title: string
  description: string
  avatar: TAvatar
  author: string
  id: string
  category: string
  transport: MCPServerType
  icon: string
  explore: string
  copyright: string | null
  privacyPolicy?: string | null
  tags?: string[]
  visitCount?: number
  server: TMCPServer
  options?: any
}