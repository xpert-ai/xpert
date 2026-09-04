import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import {
    type RuntimeCapabilityKey,
    type RuntimeCapabilityRegistry,
    XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import { RUNTIME_CAPABILITY_PROVIDER } from './runtime-capability-provider.decorator'

/** Discovers platform capability providers after Nest has instantiated the application graph. */
@Injectable()
export class RuntimeCapabilityProviderExplorer implements OnModuleInit {
    private readonly logger = new Logger(RuntimeCapabilityProviderExplorer.name)

    constructor(
        private readonly discoveryService: DiscoveryService,
        private readonly reflector: Reflector,
        @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
        private readonly capabilities: RuntimeCapabilityRegistry
    ) {}

    onModuleInit(): void {
        for (const wrapper of this.discoveryService.getProviders()) {
            const { instance } = wrapper
            if (!instance) continue

            const capability = this.reflector.get<RuntimeCapabilityKey<unknown>>(
                RUNTIME_CAPABILITY_PROVIDER,
                instance.constructor
            )
            if (!capability) continue
            if (this.capabilities.has(capability)) {
                const existing = this.capabilities.get(capability)
                if (
                    existing === instance ||
                    (typeof existing === 'object' && existing !== null && existing.constructor === instance.constructor)
                ) {
                    continue
                }
                throw new Error(`Runtime capability '${capability.id}' has more than one platform provider`)
            }

            this.capabilities.register(capability, instance)
            this.logger.debug(`Registered runtime capability provider for ${capability.id}`)
        }
    }
}
