import { createRuntimeCapability } from '../../core/runtime-capability'
import type { OrganizationRuntimeActor } from '../actor'

/** Match a specific connected middleware, not another provider advertising the same feature. */
export interface AssistantMiddlewareRequirement {
  provider: string
  requiredFeature: string
}

/** Chosen by trusted server context, never by tool arguments or iframe payloads. */
export type AssistantMiddlewareAccessScope =
  | { type: 'assistant' }
  | { type: 'project'; projectId: string }

export interface AssistantMiddlewareAccessApi {
  /** Authorize an Assistant capability entry on every invocation, without caching grants.
   * Standalone access uses the Assistant catalog policy; Project use requires current
   * membership and an Assistant binding instead. Both require active organization membership.
   * View providers needing configuration/runtime should use ViewMiddlewareRuntimeCapability.
   * This does not grant file/resource operations. Resource ACLs and collaboration delivery
   * retain their own checks and must not depend on this middleware feature remaining installed.
   */
  assertAccess(input: AssistantMiddlewareRequirement & {
    actor: OrganizationRuntimeActor
    assistantId: string
    scope: AssistantMiddlewareAccessScope
  }): Promise<void>
}

export const AssistantMiddlewareAccessRuntimeCapability = createRuntimeCapability<AssistantMiddlewareAccessApi>(
  'platform.assistant.middleware-access',
  { description: 'Authorize a published Assistant and its exact connected middleware feature for a trusted actor.' }
)
