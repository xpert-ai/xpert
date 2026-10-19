import { BaseStrategyRegistry, resolveStrategyMetadataTarget, type StrategySource } from '../strategy'
import {
  BUILTIN_GLOBAL_SCOPE,
  SYSTEM_GLOBAL_SCOPE,
  GLOBAL_ORGANIZATION_SCOPE,
  getDefaultTenantId,
  getTenantGlobalScopeKey
} from '../types'
import type { ProjectAccessActor } from '../runtime/capabilities/project-access'

export function pipelineActorScopeKeys(actor: ProjectAccessActor): string[] {
  if (!actor.tenantId) return []
  const tenant =
    actor.tenantId === getDefaultTenantId() ? GLOBAL_ORGANIZATION_SCOPE : getTenantGlobalScopeKey(actor.tenantId)
  return [...new Set([actor.organizationId || tenant, tenant, SYSTEM_GLOBAL_SCOPE, BUILTIN_GLOBAL_SCOPE])]
}

/** Public capabilities resolve from their explicit, authorized actor, never another ambient request. */
export abstract class ProjectPipelineScopedRegistry<T> extends BaseStrategyRegistry<T> {
  override assertCanRegister(key: string, instance: T, source: StrategySource) {
    const existing = this.strategies.get(source.scopeKey)?.get(key)
    if (existing) {
      const owner = this.getSource(existing)
      if (
        owner.kind !== source.kind ||
        (owner.kind === 'plugin' && source.kind === 'plugin' && owner.pluginName !== source.pluginName)
      )
        throw new Error('PIPELINE_ADAPTER_OWNER_CONFLICT')
    }
    super.assertCanRegister(key, instance, source)
  }

  override upsert(instance: unknown) {
    const target = resolveStrategyMetadataTarget(instance)
    const key = target ? this.reflector.get<string>(this.strategyKey, target) : undefined
    if (key) this.register(key, instance as T, this.getSource(instance as T))
  }

  listForActor(actor: ProjectAccessActor): T[] {
    const effective = new Map<string, T>()
    for (const scope of pipelineActorScopeKeys(actor))
      for (const [key, adapter] of this.strategies.get(scope) ?? []) {
        if (!effective.has(key)) effective.set(key, adapter)
      }
    return [...effective.values()]
  }

  getForActor(key: string, actor: ProjectAccessActor): T {
    for (const scope of pipelineActorScopeKeys(actor)) {
      const adapter = this.strategies.get(scope)?.get(key)
      if (adapter) return adapter
    }
    throw new Error('PIPELINE_ADAPTER_UNAVAILABLE')
  }
}
