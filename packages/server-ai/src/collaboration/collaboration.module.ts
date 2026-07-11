import { Global, Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CollaborationDocumentProviderRegistry } from '@xpert-ai/plugin-sdk'
import { RedisModule } from '@xpert-ai/server-core'
import { CollaborationGateway } from './collaboration.gateway'
import { CollaborationMaterializationProcessor } from './collaboration-materialization.processor'
import { CollaborationService } from './collaboration.service'
import { CollaborationDocument, CollaborationUpdate } from './entities'

@Global()
@Module({
    imports: [DiscoveryModule, RedisModule, TypeOrmModule.forFeature([CollaborationDocument, CollaborationUpdate])],
    providers: [
        CollaborationDocumentProviderRegistry,
        CollaborationService,
        CollaborationGateway,
        CollaborationMaterializationProcessor
    ],
    exports: [CollaborationDocumentProviderRegistry, CollaborationService]
})
export class CollaborationModule {}
