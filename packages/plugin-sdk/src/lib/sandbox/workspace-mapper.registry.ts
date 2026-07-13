import { Injectable, Logger } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BUILTIN_GLOBAL_SCOPE, ORGANIZATION_METADATA_KEY, PLUGIN_METADATA_KEY, SYSTEM_GLOBAL_SCOPE } from '../types'
import { BaseStrategyRegistry } from '../strategy'
import type { SandboxWorkspaceMapper } from './workspace-mapper'
import { SANDBOX_WORKSPACE_MAPPER } from './workspace-mapper.decorator'

/** Discovers Provider path mappers while enforcing the same system-level trust boundary as Providers. */
@Injectable()
export class SandboxWorkspaceMapperRegistry extends BaseStrategyRegistry<SandboxWorkspaceMapper> {
  private readonly mapperLogger = new Logger(SandboxWorkspaceMapperRegistry.name)

  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(SANDBOX_WORKSPACE_MAPPER, discoveryService, reflector)
  }

  override upsert(instance: object): void {
    const target = Reflect.get(instance, 'metatype') ?? instance.constructor
    const pluginName = this.reflector.get<string>(PLUGIN_METADATA_KEY, target)
    const scope = this.reflector.get<string>(ORGANIZATION_METADATA_KEY, target) ?? BUILTIN_GLOBAL_SCOPE
    if (pluginName && scope !== SYSTEM_GLOBAL_SCOPE) {
      this.mapperLogger.warn(`Ignored Sandbox Workspace Mapper from non-system plugin ${pluginName} in scope ${scope}.`)
      return
    }
    super.upsert(instance)
  }
}
