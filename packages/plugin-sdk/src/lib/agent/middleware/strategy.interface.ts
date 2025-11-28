import { AgentMiddleware, PromiseOrValue } from './types'

export interface IAgentMiddlewareStrategy<T = unknown> {
  meta: {
    name?: string
    configSchema?: any
  }

  createMiddleware(options: T): PromiseOrValue<AgentMiddleware>
}
