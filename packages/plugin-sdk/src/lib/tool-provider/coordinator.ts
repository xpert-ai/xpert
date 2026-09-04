import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { DiscoveryService } from '@nestjs/core'
import type { Subscription } from 'rxjs'
import { AgentMiddlewareRegistry } from '../agent/middleware/strategy.registry'
import { StrategyBus } from '../core/strategy-bus'
import { resolveStrategyMetadataTarget } from '../strategy'
import { ToolsetRegistry } from '../toolset/strategy.registry'
import { DecoratedAgentMiddlewareStrategy, DecoratedToolsetStrategy } from './adapters'
import { describeXpertToolProvider } from './descriptor'
import { XPERT_TOOL_PROVIDER, XPERT_TOOL_PROVIDER_METADATA } from './decorators'
import { XpertToolProviderRegistry } from './registry'
import type { XpertToolProviderInstance } from './types'

/** Expands one decorated business provider into the existing Toolset and Middleware registries. */
@Injectable()
export class XpertToolProviderCoordinator implements OnModuleInit, OnModuleDestroy {
  private subscription?: Subscription
  private readonly processed = new WeakSet<object>()

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly bus: StrategyBus,
    private readonly providerRegistry: XpertToolProviderRegistry,
    private readonly toolsetRegistry: ToolsetRegistry,
    private readonly middlewareRegistry: AgentMiddlewareRegistry
  ) {}

  onModuleInit() {
    this.subscription = this.bus.events$.subscribe((event) => {
      if (event.type === 'UPSERT' && event.strategyType === XPERT_TOOL_PROVIDER) {
        this.expand(event.entry.instance)
      }
    })
    for (const wrapper of this.discovery.getProviders()) {
      if (wrapper.instance) this.expand(wrapper.instance)
    }
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe()
  }

  private expand(candidate: unknown) {
    if (!candidate || (typeof candidate !== 'object' && typeof candidate !== 'function')) return
    const instance = candidate as object
    if (this.processed.has(instance)) return
    const target = resolveStrategyMetadataTarget(instance)
    if (!target || !Reflect.getMetadata(XPERT_TOOL_PROVIDER_METADATA, target)) return

    const provider = instance as XpertToolProviderInstance
    const descriptor = describeXpertToolProvider(provider)
    const source = this.providerRegistry.getSource(provider)
    const pluginName = source.kind === 'plugin' ? source.pluginName : undefined
    const pluginVersion = source.kind === 'plugin' ? source.pluginVersion : undefined

    const toolsetAdapter = new DecoratedToolsetStrategy(provider, pluginName, pluginVersion)
    const middlewareAdapters = (descriptor.options.middlewares ?? [])
      .filter((definition) => descriptor.tools.some((item) => item.middlewareProvider === definition.provider))
      .map((definition) => ({
        provider: definition.provider,
        strategy: new DecoratedAgentMiddlewareStrategy(provider, descriptor, definition.provider)
      }))
    try {
      this.toolsetRegistry.assertCanRegister(descriptor.options.provider, toolsetAdapter, source)
      for (const adapter of middlewareAdapters) {
        this.middlewareRegistry.assertCanRegister(adapter.provider, adapter.strategy, source)
      }
    } catch (error) {
      this.providerRegistry.rollback(provider)
      throw error
    }

    this.toolsetRegistry.register(descriptor.options.provider, toolsetAdapter, source)
    for (const adapter of middlewareAdapters) {
      this.middlewareRegistry.register(adapter.provider, adapter.strategy, source)
    }
    this.processed.add(instance)
  }
}
