import { createRuntimeCapability } from '../../core/runtime-capability'
import type { OrganizationRuntimeActor } from '../actor'

/** Match a specific connected middleware, not another provider advertising the same feature. */
export interface AssistantMiddlewareRequirement {
  provider: string
  requiredFeature: string
}

/** Chosen by trusted server context, never by tool arguments or iframe payloads. */
export type AssistantMiddlewareAccessScope = { type: 'assistant' } | { type: 'project'; projectId: string }

export interface AssistantMiddlewareAccessApi {
  /** Live authorization for the exact published Assistant and middleware; resource operations retain their own ACLs. */
  assertAccess(
    input: AssistantMiddlewareRequirement & {
      actor: OrganizationRuntimeActor
      assistantId: string
      scope: AssistantMiddlewareAccessScope
    }
  ): Promise<void>

  /** Execute under the bound Assistant account, subject to live actor and middleware authorization. */
  runAsAssistant<T>(
    input: AssistantMiddlewareRequirement & {
      actor: OrganizationRuntimeActor
      assistantId: string
      scope: AssistantMiddlewareAccessScope
    },
    work: () => Promise<T>
  ): Promise<T>
}

export const AssistantMiddlewareAccessRuntimeCapability = createRuntimeCapability<AssistantMiddlewareAccessApi>(
  'platform.assistant.middleware-access',
  { description: 'Authorize a published Assistant and its exact connected middleware feature for a trusted actor.' }
)
