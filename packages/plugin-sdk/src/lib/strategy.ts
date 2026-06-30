import { Inject, Logger, OnModuleInit } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { filter } from 'rxjs'
import { RequestContext } from './core/context'
import { StrategyBus } from './core/strategy-bus'
import {
  BUILTIN_GLOBAL_SCOPE,
  GLOBAL_ORGANIZATION_SCOPE,
  ORGANIZATION_METADATA_KEY,
  PLUGIN_METADATA_KEY,
  resolveTenantGlobalScopeKey
} from './types'

export class BaseStrategyRegistry<S> implements OnModuleInit {
  private readonly logger = new Logger(BaseStrategyRegistry.name)

  @Inject(StrategyBus)
  protected readonly bus: StrategyBus

  // Map<scopeKey, Map<type, strategy>>
  protected strategies = new Map<string, Map<string, S>>()
  protected pluginStrategies = new Map<string, Set<string>>()

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

  upsert(instance: any) {
    const type = this.reflector.get<string>(this.strategyKey, instance.constructor)
    if (type) {
      const target = instance.metatype ?? instance.constructor
      const pluginName = this.reflector.get<string>(PLUGIN_METADATA_KEY, target)
      const organizationId =
        this.reflector.get<string>(ORGANIZATION_METADATA_KEY, target) ??
        (pluginName ? GLOBAL_ORGANIZATION_SCOPE : BUILTIN_GLOBAL_SCOPE)
      const orgMap = this.strategies.get(organizationId) ?? new Map<string, S>()
      orgMap.set(type, instance as S)
      this.strategies.set(organizationId, orgMap)
      this.logger.debug(`Registered strategy of type ${type} for scope ${organizationId} from plugin ${pluginName}`)
      if (pluginName) {
        const pluginStrategies = this.pluginStrategies.get(pluginName) ?? new Set<string>()
        pluginStrategies.add(type)
        this.pluginStrategies.set(pluginName, pluginStrategies)
      }
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
}
