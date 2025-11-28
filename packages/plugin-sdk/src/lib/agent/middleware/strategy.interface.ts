import { TAgentMiddlewareMeta } from '@metad/contracts'
import { AgentMiddleware, PromiseOrValue } from './types'

export interface IAgentMiddlewareStrategy<T = unknown> {
  meta: TAgentMiddlewareMeta

  createMiddleware(options: T): PromiseOrValue<AgentMiddleware>
}
