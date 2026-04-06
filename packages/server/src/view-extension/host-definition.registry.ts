import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { XpertViewHostDefinition } from './host-definition.interface'
import { VIEW_HOST_DEFINITION } from './host-definition.decorator'

@Injectable()
export class ViewHostDefinitionRegistry implements OnModuleInit {
  private readonly logger = new Logger(ViewHostDefinitionRegistry.name)
  private readonly definitions = new Map<string, XpertViewHostDefinition>()

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly reflector: Reflector
  ) {}

  onModuleInit() {
    for (const wrapper of this.discoveryService.getProviders()) {
      const { instance } = wrapper
      if (!instance) {
        continue
      }

      const hostType = this.reflector.get<string>(VIEW_HOST_DEFINITION, instance.constructor)
      if (!hostType) {
        continue
      }

      this.definitions.set(hostType, instance as XpertViewHostDefinition)
      this.logger.debug(`Registered view host definition for ${hostType}`)
    }
  }

  get(hostType: string): XpertViewHostDefinition | null {
    return this.definitions.get(hostType) ?? null
  }
}
