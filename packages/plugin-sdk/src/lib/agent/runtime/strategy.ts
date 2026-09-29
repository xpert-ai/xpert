import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import type { RuntimeCapabilityRegistry } from '../../core/runtime-capability'
import { BaseStrategyRegistry, type StrategySource } from '../../strategy'
import { STRATEGY_META_KEY } from '../../types'
import type {
  AgentInvocationInput,
  AgentInvocationScope,
  AgentJson,
  AgentRuntimeCapabilities,
  AgentRuntimeHandle,
  AgentRuntimeObservation,
  AgentTarget
} from './types'

/** Trusted per-operation host context, independent of graph and provider transport details. */
export interface AgentRuntimeContext {
  /** Durable host invocation ID used to correlate provider receipts. */
  invocationId: string
  scope: Readonly<AgentInvocationScope>
  /** Cooperative cancellation; abort alone does not confirm remote termination. */
  signal?: AbortSignal
  capabilities: RuntimeCapabilityRegistry
  /** Persist a receipt before waiting on long-running work. Await persistence and propagate failures. */
  checkpoint(observation: AgentRuntimeObservation): Promise<void>
}

/** Pinned launch/recovery input supplied after the host reserves the invocation. */
export interface AgentRuntimeStart {
  target: Readonly<AgentTarget>
  input: Readonly<AgentInvocationInput>
  /** Host invocation ID for provider idempotency; distinct from the caller callId. */
  operationId: string
  /** Existing receipt for recovery. Reattach instead of resending the initial task. */
  previous?: AgentRuntimeHandle
}

/**
 * Extension point for native and third-party runtimes. Strategies may serve concurrent calls;
 * keep per-invocation state isolated. The host owns authorization and persistence.
 */
export interface IAgentRuntimeStrategy {
  /** Support flags must agree with the optional methods implemented below. */
  readonly capabilities: AgentRuntimeCapabilities
  /** Launch or recover approved work; checkpoint the handle as soon as it is known. */
  start(request: AgentRuntimeStart, context: AgentRuntimeContext): Promise<AgentRuntimeObservation>
  /** Reconcile existing work without relaunching it. Return unknown if its outcome cannot be established. */
  inspect(handle: AgentRuntimeHandle, context: AgentRuntimeContext): Promise<AgentRuntimeObservation>
  /** Required when cancellation is supported. Return cancelled only after termination is confirmed. */
  cancel?(handle: AgentRuntimeHandle, context: AgentRuntimeContext): Promise<AgentRuntimeObservation>
  /** Required when interactions are supported. Validate the response against the pending interaction. */
  respond?(
    handle: AgentRuntimeHandle,
    interactionId: string,
    response: AgentJson,
    context: AgentRuntimeContext
  ): Promise<AgentRuntimeObservation>
}

/** Nest discovery metadata key for runtime strategies. */
export const AGENT_RUNTIME_STRATEGY = 'AGENT_RUNTIME_STRATEGY'
/** Associate a stable provider key with an adapter. Also declare @Injectable() and register the provider. */
export const AgentRuntimeStrategy = (provider: string) =>
  applyDecorators(SetMetadata(AGENT_RUNTIME_STRATEGY, provider), SetMetadata(STRATEGY_META_KEY, AGENT_RUNTIME_STRATEGY))

/** Scoped strategy registry with pinned provider/version lookup for continuation. */
@Injectable()
export class AgentRuntimeRegistry extends BaseStrategyRegistry<IAgentRuntimeStrategy> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(AGENT_RUNTIME_STRATEGY, discoveryService, reflector)
  }

  /** Find the exact original scope/plugin/version, without fallback. Returns undefined if unavailable. */
  getPinned(provider: string, source: StrategySource): IAgentRuntimeStrategy | undefined {
    const strategy = this.strategies.get(source.scopeKey)?.get(provider)
    if (!strategy) return undefined
    const actual = this.getSource(strategy)
    return actual.kind === source.kind &&
      actual.scopeKey === source.scopeKey &&
      (actual.kind !== 'plugin' ||
        source.kind !== 'plugin' ||
        (actual.pluginName === source.pluginName && actual.pluginVersion === source.pluginVersion))
      ? strategy
      : undefined
  }
}
