import { Injectable, Logger } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BUILTIN_GLOBAL_SCOPE, ORGANIZATION_METADATA_KEY, PLUGIN_METADATA_KEY, SYSTEM_GLOBAL_SCOPE } from '../types'
import { BaseStrategyRegistry } from '../strategy'
import type { ISandboxRuntimeProvider } from './runtime-provider'
import { SANDBOX_RUNTIME_PROVIDER } from './runtime-provider.decorator'

/** Discovers Runtime Provider strategies and rejects organization-scoped executable infrastructure. */
@Injectable()
export class SandboxRuntimeProviderRegistry extends BaseStrategyRegistry<ISandboxRuntimeProvider> {
  private readonly runtimeLogger = new Logger(SandboxRuntimeProviderRegistry.name)

  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(SANDBOX_RUNTIME_PROVIDER, discoveryService, reflector)
  }

  override upsert(instance: object): void {
    const target = Reflect.get(instance, 'metatype') ?? instance.constructor
    const pluginName = this.reflector.get<string>(PLUGIN_METADATA_KEY, target)
    const scope = this.reflector.get<string>(ORGANIZATION_METADATA_KEY, target) ?? BUILTIN_GLOBAL_SCOPE
    if (pluginName && scope !== SYSTEM_GLOBAL_SCOPE) {
      this.runtimeLogger.warn(
        `Ignored Sandbox Runtime Provider from non-system plugin ${pluginName} in scope ${scope}.`
      )
      return
    }
    super.upsert(instance)
  }
}
