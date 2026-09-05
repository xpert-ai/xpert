import { Global, Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { DefaultRuntimeCapabilityRegistry, XPERT_RUNTIME_CAPABILITIES_TOKEN } from '@xpert-ai/plugin-sdk'
import { RuntimeCapabilityProviderExplorer } from './runtime-capability-provider-explorer.service'

/** Owns the platform capability registry independently of any runtime consumer. */
@Global()
@Module({
    imports: [DiscoveryModule],
    providers: [
        {
            provide: XPERT_RUNTIME_CAPABILITIES_TOKEN,
            useFactory: () => new DefaultRuntimeCapabilityRegistry()
        },
        RuntimeCapabilityProviderExplorer
    ],
    exports: [XPERT_RUNTIME_CAPABILITIES_TOKEN]
})
export class RuntimeCapabilityModule {}
