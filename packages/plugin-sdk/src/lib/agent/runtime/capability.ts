import { createRuntimeCapability } from '../../core/runtime-capability'
import type { AgentInvocation, AgentInvocationRequest, AgentJson, AgentTarget } from './types'
import type { RuntimeIdentityScope } from '../../runtime/runtime-scope'

/** Invocation API bound to one authorized caller/execution. Each operation revalidates access. */
export interface AgentInvocationApi {
  /** Resolve a binding to a pinned target. Optional on hosts with pre-resolved native targets. */
  resolve?(bindingId: string): Promise<AgentTarget>
  /** Start or recover an idempotent request. The returned snapshot may still be running. */
  start(request: AgentInvocationRequest): Promise<AgentInvocation>
  /** Refresh an existing invocation, possibly persisting provider observations. Never relaunches work. */
  inspect(invocationId: string): Promise<AgentInvocation>
  /** Request supported cancellation; cancelling does not confirm termination. */
  cancel(invocationId: string): Promise<AgentInvocation>
  /** Answer the current interaction using its exact ID and provider-defined response schema. */
  respond(invocationId: string, interactionId: string, response: AgentJson): Promise<AgentInvocation>
  /**
   * Optional checkpoint-aware wait; returns a terminal or unknown observation.
   * Allow host suspension to propagate instead of treating it as a tool failure.
   */
  awaitResult?(invocationId: string): Promise<AgentInvocation>
}

/** Caller-scoped API obtained through runtime.capabilities.require(...). */
export const AgentInvocationRuntimeCapability = createRuntimeCapability<AgentInvocationApi>(
  'platform.agent_invocation',
  { description: 'Scoped, versioned Agent invocation and lifecycle control' }
)

/** Trusted host factory; scope must come from authenticated context, not model arguments. */
export interface AgentRuntimeFactory {
  /** Create an API per caller/execution. Do not cache it as a global singleton. */
  createScopedApi(scope: RuntimeIdentityScope): AgentInvocationApi
}

/** Platform factory capability. The wire key is stable across SDK naming changes. */
export const AgentRuntimeFactoryCapability = createRuntimeCapability<AgentRuntimeFactory>(
  'platform.agent_invocation.factory'
)
