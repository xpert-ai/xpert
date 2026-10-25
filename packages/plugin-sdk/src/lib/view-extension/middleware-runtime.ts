import type { IWFNMiddleware, XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext } from '../agent/middleware/strategy.interface'
import { createRuntimeCapability } from '../core/runtime-capability'
import type { AssistantMiddlewareRequirement } from '../runtime/capabilities/assistant-middleware-access'

/** Server-only input: use the authorized context received by a View provider, never iframe input. */
export interface ViewMiddlewareRuntimeInput extends AssistantMiddlewareRequirement {
  context: XpertResolvedViewHostContext
  /** Authoring requires the same draft access policy as the Agent View host. Defaults to published. */
  isDraft?: boolean
}

/** Contains trusted configuration and callable capabilities. Never serialize this result to a Remote View. */
export interface ViewMiddlewareRuntimeResult {
  options: IWFNMiddleware['options']
  context: IAgentMiddlewareContext
}

export interface ViewMiddlewareRuntimeResolver {
  /** Revalidates identity, host access, the exact connected middleware and its Feature on every call. */
  resolve(input: ViewMiddlewareRuntimeInput): Promise<ViewMiddlewareRuntimeResult>
}

export const ViewMiddlewareRuntimeCapability = createRuntimeCapability<ViewMiddlewareRuntimeResolver>(
  'platform.view.middleware-runtime',
  { description: 'Resolve a View capability through its authorized Assistant middleware and scoped runtime.' }
)
