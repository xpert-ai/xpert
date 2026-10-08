import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { filter, type Subscription } from 'rxjs'
import { BaseStrategyRegistry, resolveStrategyMetadataTarget } from '../strategy'
import { RESOURCE_CARD_PROVIDER } from './provider.decorator'
import type { IResourceCardProvider, ResourceCardType } from './types'

const resourceTypeKey = ({ namespace, type }: ResourceCardType) => JSON.stringify([namespace, type])

function isProvider(value: unknown): value is IResourceCardProvider {
  return !!value && typeof value === 'object' && 'resolveMany' in value && typeof value.resolveMany === 'function'
}

@Injectable()
export class ResourceCardProviderRegistry
  extends BaseStrategyRegistry<IResourceCardProvider>
  implements OnModuleDestroy
{
  private readonly resourceLogger = new Logger(ResourceCardProviderRegistry.name)
  private subscription?: Subscription
  constructor(discovery: DiscoveryService, reflector: Reflector) {
    super(RESOURCE_CARD_PROVIDER, discovery, reflector)
  }

  override onModuleInit() {
    this.subscription = this.bus.events$
      .pipe(filter((event) => !event.strategyType || event.strategyType === RESOURCE_CARD_PROVIDER))
      .subscribe((event) => {
        try {
          if (event.type === 'UPSERT') this.upsert(event.entry.instance)
          else this.remove(event.orgId, event.pluginName)
        } catch {
          // Reject the conflicting provider without terminating the lifecycle subscription.
          this.resourceLogger.warn('Rejected invalid or conflicting resource card provider registration')
        }
      })
    for (const { instance } of this.discoveryService.getProviders()) if (instance) this.upsert(instance)
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe()
  }

  override remove(scopeKey: string, pluginName: string) {
    for (const entry of this.listAllRegistrations()) {
      if (
        entry.source.kind === 'plugin' &&
        entry.source.pluginName === pluginName &&
        entry.source.scopeKey === scopeKey
      ) {
        this.unregister(entry.type, entry.source, entry.strategy)
      }
    }
  }

  override upsert(instance: unknown) {
    const target = resolveStrategyMetadataTarget(instance)
    const resources = target && this.reflector.get<ResourceCardType[]>(RESOURCE_CARD_PROVIDER, target)
    if (!resources) return
    if (!isProvider(instance)) throw new Error('ResourceCardProvider must implement resolveMany')
    const source = this.getSource(instance)
    const keys = resources.map(resourceTypeKey)
    // A route belongs to one plugin across scopes; a different plugin cannot shadow it.
    // Preflight the whole batch so a conflicting multi-type provider is never partly installed.
    for (const key of keys) {
      for (const existing of this.listAllRegistrations().filter((entry) => entry.type === key)) {
        const samePlugin =
          source.kind === 'plugin' &&
          existing.source.kind === 'plugin' &&
          source.pluginName === existing.source.pluginName
        if (existing.strategy !== instance && !samePlugin) {
          throw new Error(`Resource card type ${key} is already registered`)
        }
      }
      this.assertCanRegister(key, instance, source)
    }
    for (const key of keys) this.register(key, instance, source)
  }

  find(resource: ResourceCardType, organizationId?: string): IResourceCardProvider | undefined {
    const key = resourceTypeKey(resource)
    for (const scopeKey of this.resolveStrategyScopeKeys(organizationId)) {
      const provider = this.strategies.get(scopeKey)?.get(key)
      if (provider) return provider
    }
    return undefined
  }
}
