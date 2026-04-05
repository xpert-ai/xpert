import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { XpertMemoryAgentBridgeService } from './agent-bridge'
import { MEMORY_PATH_RESOLVER_TOKEN, memoryPathResolver } from './paths'
import { MEMORY_REGISTRY_TOKEN, MemoryRegistry } from './registry'

@Module({
    imports: [CqrsModule],
    providers: [
        MemoryRegistry,
        {
            provide: MEMORY_REGISTRY_TOKEN,
            useExisting: MemoryRegistry
        },
        {
            provide: MEMORY_PATH_RESOLVER_TOKEN,
            useValue: memoryPathResolver
        },
        XpertMemoryAgentBridgeService
    ],
    exports: [MemoryRegistry, MEMORY_REGISTRY_TOKEN, MEMORY_PATH_RESOLVER_TOKEN, XpertMemoryAgentBridgeService]
})
export class XpertMemoryModule {}
