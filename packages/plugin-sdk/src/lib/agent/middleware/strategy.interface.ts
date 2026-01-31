import { IWFNMiddleware, TAgentMiddlewareMeta } from '@metad/contracts'
import { StructuredToolInterface } from "@langchain/core/tools";
import { RunnableToolLike } from '@langchain/core/runnables';
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
  tools: Map<string, StructuredToolInterface | RunnableToolLike>
}

export interface IAgentMiddlewareStrategy<T = unknown> {
  meta: TAgentMiddlewareMeta

  createMiddleware(options: T, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware>
}
