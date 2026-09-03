import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../strategy'
import { resolveStrategyMetadataTarget } from '../strategy'
import { describeXpertToolProvider } from './descriptor'
import { XPERT_TOOL_PROVIDER, XPERT_TOOL_PROVIDER_METADATA } from './decorators'
import type { XpertToolProviderInstance } from './types'

@Injectable()
export class XpertToolProviderRegistry extends BaseStrategyRegistry<XpertToolProviderInstance> {
  private readonly replacements = new WeakMap<object, XpertToolProviderInstance | null>()
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(XPERT_TOOL_PROVIDER, discoveryService, reflector)
  }

  override upsert(candidate: unknown) {
    const target = resolveStrategyMetadataTarget(candidate)
    if (!target || !Reflect.getMetadata(XPERT_TOOL_PROVIDER_METADATA, target)) return
    const instance = candidate as XpertToolProviderInstance
    const descriptor = describeXpertToolProvider(instance)
    const source = this.getSource(instance)
    this.assertUniqueClaims(instance, descriptor, source.scopeKey)
    const previous = this.register(descriptor.options.provider, instance, source)
    this.replacements.set(instance as object, previous ?? null)
  }

  rollback(instance: XpertToolProviderInstance) {
    const descriptor = describeXpertToolProvider(instance)
    const source = this.getSource(instance)
    const previous = this.replacements.get(instance as object)
    if (previous) {
      this.register(descriptor.options.provider, previous, this.getSource(previous))
    } else {
      this.unregister(descriptor.options.provider, source, instance)
    }
    this.replacements.delete(instance as object)
  }

  private assertUniqueClaims(
    instance: XpertToolProviderInstance,
    descriptor: ReturnType<typeof describeXpertToolProvider>,
    scopeKey: string
  ) {
    const toolNames = new Set(descriptor.tools.map(({ options }) => options.name))
    for (const [providerKey, existing] of this.strategies.get(scopeKey)?.entries() ?? []) {
      if (existing === instance || providerKey === descriptor.options.provider) continue
      const existingDescriptor = describeXpertToolProvider(existing as object)
      if (existingDescriptor.options.componentKey === descriptor.options.componentKey) {
        throw new Error(
          `Component key '${descriptor.options.componentKey}' is already registered for scope '${scopeKey}'.`
        )
      }
      const duplicateTool = existingDescriptor.tools.find(({ options }) => toolNames.has(options.name))
      if (duplicateTool) {
        throw new Error(`Tool '${duplicateTool.options.name}' is already registered for scope '${scopeKey}'.`)
      }
    }
  }
}
