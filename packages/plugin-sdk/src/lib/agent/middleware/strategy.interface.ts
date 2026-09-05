import { IWFNMiddleware, TAgentMiddlewareMeta, TXpertFeatures, XpertWorkspaceDataScope } from '@xpert-ai/contracts'
import { StructuredToolInterface } from '@langchain/core/tools'
import { RunnableToolLike } from '@langchain/core/runnables'
import { BaseStore } from '@langchain/langgraph'
import { AgentMiddleware } from './types'
import { PromiseOrValue } from '../../types'
import { AgentMiddlewareRuntimeApi } from './runtime'

export interface IAgentMiddlewareContext {
  tenantId: string
  organizationId?: string | null
  userId: string
  workspaceId?: string
  projectId?: string
  conversationId?: string
  threadId?: string
  xpertId?: string
  workspaceDataScope?: XpertWorkspaceDataScope | null
  xpertFeatures?: TXpertFeatures | null
  agentKey?: string
  knowledgebaseIds?: string[]
  store?: BaseStore
  node: IWFNMiddleware
  tools: Map<string, StructuredToolInterface | RunnableToolLike>
  runtime: AgentMiddlewareRuntimeApi
}

export interface IAgentMiddlewareStrategy<T = unknown> {
  meta: TAgentMiddlewareMeta

  /** Static Tool names exposed by this Middleware, for capability summaries without creating a runtime instance. */
  getToolNames?(options: T): readonly string[]

  createMiddleware(options: T, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware>
}
