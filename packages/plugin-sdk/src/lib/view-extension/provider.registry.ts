import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../strategy'
import { IXpertViewExtensionProvider } from './provider.interface'
import { VIEW_EXTENSION_PROVIDER } from './provider.decorator'

@Injectable()
export class ViewExtensionProviderRegistry extends BaseStrategyRegistry<IXpertViewExtensionProvider> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(VIEW_EXTENSION_PROVIDER, discoveryService, reflector)
  }

  listEntries(organizationId?: string): Array<{ providerKey: string; provider: IXpertViewExtensionProvider }> {
    const entries = new Map<string, IXpertViewExtensionProvider>()

    for (const scopeKey of this.resolveStrategyScopeKeys(organizationId)) {
      for (const [providerKey, provider] of this.strategies.get(scopeKey)?.entries() ?? []) {
        if (!entries.has(providerKey)) {
          entries.set(providerKey, provider)
        }
      }
    }

    return Array.from(entries.entries()).map(([providerKey, provider]) => ({
      providerKey,
      provider
    }))
  }
}
