import { Inject, Logger, OnModuleInit, type Type } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { filter } from 'rxjs'
import { RequestContext } from './core/context'
import { StrategyBus } from './core/strategy-bus'
import {
  BUILTIN_GLOBAL_SCOPE,
  GLOBAL_ORGANIZATION_SCOPE,
  ORGANIZATION_METADATA_KEY,
  PLUGIN_METADATA_KEY,
  PLUGIN_VERSION_METADATA_KEY,
  SYSTEM_GLOBAL_SCOPE,
  resolveTenantGlobalScopeKey
} from './types'

export type StrategySource =
  | {
      kind: 'builtin'
      scopeKey: string
    }
  | {
      kind: 'plugin'
      pluginName: string
      pluginVersion?: string
      scopeKey: string
    }

export class BaseStrategyRegistry<S> implements OnModuleInit {
  private readonly logger = new Logger(BaseStrategyRegistry.name)

  @Inject(StrategyBus)
  protected readonly bus: StrategyBus

  // Map<scopeKey, Map<type, strategy>>
  protected strategies = new Map<string, Map<string, S>>()
  protected pluginStrategies = new Map<string, Set<string>>()
  private readonly explicitSources = new WeakMap<object, StrategySource>()

  constructor(
    protected readonly strategyKey: string,
    protected discoveryService: DiscoveryService,
    protected reflector: Reflector
  ) {}

  onModuleInit() {
    this.bus.events$
      .pipe(filter((event) => !event.strategyType || event.strategyType === this.strategyKey))
      .subscribe((evt) => {
        if (evt.type === 'UPSERT') {
          this.upsert(evt.entry.instance)
        } else if (evt.type === 'REMOVE') {
          this.remove(evt.orgId, evt.pluginName)
        }
      })

    const providers = this.discoveryService.getProviders()
    for (const wrapper of providers) {
      const { instance } = wrapper
      if (!instance) continue
      this.upsert(instance)
    }
  }

  upsert(instance: unknown) {
    const target = resolveStrategyMetadataTarget(instance)
    if (!target) {
      return
    }
    const type = this.reflector.get<string>(this.strategyKey, target)
    if (type) {
      const source = this.getSource(instance as S)
      this.store(type, instance as S, source, false)
    }
  }

  /** Registers a host-generated adapter without mutating shared class metadata. */
  register(type: string, instance: S, source: StrategySource) {
    if ((typeof instance !== 'object' || instance === null) && typeof instance !== 'function') {
      throw new Error(`Cannot register non-object strategy '${type}'.`)
    }
    this.assertCanRegister(type, instance, source)
    this.explicitSources.set(instance as object, source)
    return this.store(type, instance, source, false)
  }

  /** Preflights adapter batches so a provider is expanded atomically across registries. */
  assertCanRegister(type: string, instance: S, source: StrategySource) {
    const existing = this.strategies.get(source.scopeKey)?.get(type)
    if (!existing || existing === instance) return
    const existingSource = this.getSource(existing)
    const samePlugin =
      existingSource.kind === 'plugin' && source.kind === 'plugin' && existingSource.pluginName === source.pluginName
    if (!samePlugin) {
      throw new Error(`Strategy '${type}' is already registered for scope '${source.scopeKey}'.`)
    }
  }

  /** Removes one exact programmatic registration without affecting fallback scopes. */
  unregister(type: string, source: StrategySource, expected?: S) {
    const orgMap = this.strategies.get(source.scopeKey)
    const current = orgMap?.get(type)
    if (expected !== undefined && current !== expected) return false
    return orgMap?.delete(type) ?? false
  }

  /** Returns the explicit registry provenance attached by the plugin loader. */
  getSource(instance: S): StrategySource {
    if ((typeof instance === 'object' && instance !== null) || typeof instance === 'function') {
      const explicit = this.explicitSources.get(instance as object)
      if (explicit) return explicit
    }
    const target = resolveStrategyMetadataTarget(instance)
    if (!target) {
      return {
        kind: 'builtin',
        scopeKey: BUILTIN_GLOBAL_SCOPE
      }
    }

    const pluginName = this.reflector.get<string>(PLUGIN_METADATA_KEY, target)
    if (!pluginName) {
      return {
        kind: 'builtin',
        scopeKey: this.reflector.get<string>(ORGANIZATION_METADATA_KEY, target) ?? BUILTIN_GLOBAL_SCOPE
      }
    }

    const pluginVersion = this.reflector.get<string>(PLUGIN_VERSION_METADATA_KEY, target)
    return {
      kind: 'plugin',
      pluginName,
      ...(pluginVersion ? { pluginVersion } : {}),
      scopeKey: this.reflector.get<string>(ORGANIZATION_METADATA_KEY, target) ?? GLOBAL_ORGANIZATION_SCOPE
    }
  }

  /**
   * Remove all strategies registered by the given plugin for the given scope.
   */
  remove(organizationId: string, pluginName: string) {
    const strategies = this.pluginStrategies.get(pluginName)
    const orgMap = this.strategies.get(organizationId)
    for (const type of strategies ?? []) {
      orgMap?.delete(type)
    }
  }

  /**
   * Resolve the primary scope key, falling back to request context org or tenant-global scope.
   */
  protected resolveOrganization(organizationId?: string) {
    const tenantId = RequestContext.getScope()?.tenantId ?? RequestContext.currentTenantId()
    const requested = organizationId ?? RequestContext.getOrganizationId()
    return !requested || requested === GLOBAL_ORGANIZATION_SCOPE ? resolveTenantGlobalScopeKey(tenantId) : requested
  }

  protected resolveGlobalFallbackOrganization() {
    const tenantId = RequestContext.getScope()?.tenantId ?? RequestContext.currentTenantId()
    return resolveTenantGlobalScopeKey(tenantId)
  }

  protected resolveStrategyScopeKeys(organizationId?: string) {
    const orgKey = this.resolveOrganization(organizationId)
    const globalKey = this.resolveGlobalFallbackOrganization()
    const scopeKeys = [orgKey]

    if (orgKey !== globalKey) {
      scopeKeys.push(globalKey)
    }

    if (!scopeKeys.includes(SYSTEM_GLOBAL_SCOPE)) {
      scopeKeys.push(SYSTEM_GLOBAL_SCOPE)
    }

    if (!scopeKeys.includes(BUILTIN_GLOBAL_SCOPE)) {
      scopeKeys.push(BUILTIN_GLOBAL_SCOPE)
    }

    return scopeKeys
  }

  /**
   * Get strategy by type from the given organization including global strategies as fallback.
   *
   * @param type
   * @param organizationId
   * @returns
   */
  get(type: string, organizationId?: string): S {
    organizationId ??= RequestContext.getOrganizationId()
    const strategy = this.resolveStrategyScopeKeys(organizationId)
      .map((scopeKey) => this.strategies.get(scopeKey)?.get(type))
      .find((item): item is S => !!item)
    if (!strategy) {
      throw new Error(`No strategy found for type '${type}' for strategy '${this.strategyKey}'`)
    }
    return strategy
  }

  /**
   * List all strategies for the given organization including global strategies, or only global strategies if global org is specified.
   *
   * @param organizationId
   * @returns
   */
  list(organizationId?: string): S[] {
    organizationId ??= RequestContext.getOrganizationId()
    const effective = new Map<string, S>()

    for (const scopeKey of this.resolveStrategyScopeKeys(organizationId)) {
      for (const [type, strategy] of this.strategies.get(scopeKey)?.entries() ?? []) {
        if (!effective.has(type)) {
          effective.set(type, strategy)
        }
      }
    }

    return Array.from(effective.values())
  }

  listRegistrations(organizationId?: string): Array<{ type: string; strategy: S; source: StrategySource }> {
    organizationId ??= RequestContext.getOrganizationId()
    const effective = new Map<string, S>()
    for (const scopeKey of this.resolveStrategyScopeKeys(organizationId)) {
      for (const [type, strategy] of this.strategies.get(scopeKey)?.entries() ?? []) {
        if (!effective.has(type)) effective.set(type, strategy)
      }
    }
    return Array.from(effective, ([type, strategy]) => ({ type, strategy, source: this.getSource(strategy) }))
  }

  /** Returns every direct registration without applying request-scope fallback rules. */
  listAllRegistrations(): Array<{ type: string; strategy: S; source: StrategySource }> {
    const registrations: Array<{ type: string; strategy: S; source: StrategySource }> = []
    for (const [scopeKey, strategies] of this.strategies) {
      for (const [type, strategy] of strategies) {
        const source = this.getSource(strategy)
        registrations.push({
          type,
          strategy,
          source: source.scopeKey === scopeKey ? source : { ...source, scopeKey }
        })
      }
    }
    return registrations
  }

  private store(type: string, instance: S, source: StrategySource, rejectCrossPluginConflict: boolean) {
    const pluginName = source.kind === 'plugin' ? source.pluginName : undefined
    const organizationId = source.scopeKey
    const orgMap = this.strategies.get(organizationId) ?? new Map<string, S>()
    const existing = orgMap.get(type)
    if (rejectCrossPluginConflict && existing && existing !== instance) {
      const existingSource = this.getSource(existing)
      const samePlugin =
        existingSource.kind === 'plugin' && source.kind === 'plugin' && existingSource.pluginName === source.pluginName
      if (!samePlugin) {
        throw new Error(`Strategy '${type}' is already registered for scope '${organizationId}'.`)
      }
    }
    orgMap.set(type, instance)
    this.strategies.set(organizationId, orgMap)
    this.logger.debug(`Registered strategy of type ${type} for scope ${organizationId} from plugin ${pluginName}`)
    if (pluginName) {
      const pluginStrategies = this.pluginStrategies.get(pluginName) ?? new Set<string>()
      pluginStrategies.add(type)
      this.pluginStrategies.set(pluginName, pluginStrategies)
    }
    return existing
  }
}

/** Returns whether a discovered provider can carry decorator metadata. */
export function isStrategyInstance(instance: unknown): instance is object {
  return (typeof instance === 'object' && instance !== null) || typeof instance === 'function'
}

/** Resolves the class used for plugin and organization metadata without reflecting over primitive provider values. */
export function resolveStrategyMetadataTarget(instance: unknown): Type<unknown> | null {
  if (!isStrategyInstance(instance)) {
    return null
  }

  if (typeof instance === 'function') {
    return instance as Type<unknown>
  }

  const metatype = (instance as { metatype?: unknown }).metatype
  if (typeof metatype === 'function') {
    return metatype as Type<unknown>
  }

  const constructor = (instance as { constructor?: unknown }).constructor
  return typeof constructor === 'function' ? (constructor as Type<unknown>) : null
}
