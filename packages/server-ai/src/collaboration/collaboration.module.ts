import { Global, Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CollaborationDocumentProviderRegistry } from '@xpert-ai/plugin-sdk'
import { RedisModule } from '@xpert-ai/server-core'
import { CollaborationGateway } from './collaboration.gateway'
import { CollaborationMaterializationProcessor } from './collaboration-materialization.processor'
import { CollaborationMaintenance } from './collaboration-maintenance.service'
import { CollaborationService } from './collaboration.service'
import { CollaborationDocument, CollaborationUpdate } from './entities'
import { RuntimeCapabilityModule } from '../shared/runtime/runtime-capability.module'

@Global()
@Module({
    imports: [
        RuntimeCapabilityModule,
        DiscoveryModule,
        RedisModule,
        TypeOrmModule.forFeature([CollaborationDocument, CollaborationUpdate])
    ],
    providers: [
        CollaborationDocumentProviderRegistry,
        CollaborationService,
        CollaborationGateway,
        CollaborationMaterializationProcessor,
        CollaborationMaintenance
    ],
    exports: [CollaborationDocumentProviderRegistry, CollaborationService]
})
export class CollaborationModule {}
