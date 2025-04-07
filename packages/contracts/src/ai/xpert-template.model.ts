import { TAvatar } from '../types'
import { MCPServerType, TMCPServer } from './xpert-tool-mcp.model'
import { XpertTypeEnum } from './xpert.model'

export interface IXpertTemplate {
  id: string
  name: string
  title: string
  description: string
  avatar: TAvatar
  type: XpertTypeEnum
  category: string
  copyright: string
  privacyPolicy?: string
  export_data: string
}

export interface IXpertMCPTemplate {
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
  server: TMCPServer
}