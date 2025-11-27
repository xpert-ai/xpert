import { AgentMiddleware, PromiseOrValue } from './types'

export interface IAgentMiddlewareStrategy<T = unknown> {
  meta: {
    configSchema?: any
  }

  createMiddleware(options: T): PromiseOrValue<AgentMiddleware>
}
