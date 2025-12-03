import { TAgentMiddlewareMeta } from '@metad/contracts'
import { AgentMiddleware, PromiseOrValue } from './types'

export interface IAgentMiddlewareContext {
  tenantId: string
  userId: string
  workspaceId?: string
  projectId?: string
  conversationId?: string
  xpertId?: string
  agentKey?: string
}

export interface IAgentMiddlewareStrategy<T = unknown> {
  meta: TAgentMiddlewareMeta

  createMiddleware(options: T, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware>
}
