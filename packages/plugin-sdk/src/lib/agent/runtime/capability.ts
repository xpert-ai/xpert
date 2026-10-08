import { createRuntimeCapability } from '../../core/runtime-capability'
import type { AgentInvocation, AgentInvocationRequest, AgentJson, AgentTarget } from './types'
import type { RuntimeIdentityScope } from '../../runtime/runtime-scope'
import type { TaskWaitRequest, TaskWaitResult } from './task-wait'
import type { ConversationResourceCard } from '@xpert-ai/contracts'

/** Invocation API bound to one authorized caller/execution. Each operation revalidates access. */
export interface AgentInvocationApi {
  /** Create a host-owned presentation receipt after a successful dispatch, without inspecting the runtime. */
  getResourceCard?(invocationId: string): Promise<ConversationResourceCard | null>
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
  /** Bounded observation; may return a running task. Only human interactions may suspend the graph. */
  awaitResult?(invocationId: string, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<AgentInvocation>
  /** Wait for dependencies within a bounded window. The Agent may wait again when the result is pending. */
  waitForTasks?(request: TaskWaitRequest, options?: { signal?: AbortSignal }): Promise<TaskWaitResult<AgentInvocation>>
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
