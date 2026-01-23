import { IWFNMiddleware, TAgentMiddlewareMeta } from '@metad/contracts'
import { AgentMiddleware } from './types'
import { PromiseOrValue } from '../../types'

export interface IAgentMiddlewareContext {
  tenantId: string
  userId: string
  workspaceId?: string
  projectId?: string
  conversationId?: string
  xpertId?: string
  agentKey?: string
  node: IWFNMiddleware
}

export interface IAgentMiddlewareStrategy<T = unknown> {
  meta: TAgentMiddlewareMeta

  createMiddleware(options: T, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware>
}
