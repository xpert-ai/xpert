import { IntegrationModule, StorageFileModule, TenantModule, UserModule } from '@xpert-ai/server-core'
import { BullModule } from '@nestjs/bull'
import { forwardRef, Module } from '@nestjs/common'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CopilotModule } from '../copilot/copilot.module'
import { KnowledgebaseModule } from '../knowledgebase/knowledgebase.module'
import { CommandHandlers } from './commands/handlers'
import { KnowledgeDocumentController } from './document.controller'
import { KnowledgeDocument } from './document.entity'
import { KnowledgeDocumentConsumer } from './document.job'
import { KnowledgeDocumentService } from './document.service'
import { KnowledgeDocumentPage } from './page/document-page.entity'
import { QueryHandlers } from './queries/handlers'
import { JOB_EMBEDDING_DOCUMENT } from './types'
import { KnowledgeDocumentChunk } from './chunk/chunk.entity'
import { KnowledgeDocumentChunkService } from './chunk/chunk.service'
import { KnowledgeDocumentTransformSnapshotService } from './transform-snapshot.service'
import { KnowledgeDocumentAnalysisSnapshotService } from './analysis-snapshot.service'
import { KnowledgeDocumentVisualAssetsRuntimeService } from './visual-assets-runtime.service'
import { KNOWLEDGE_DOCUMENT_VISUAL_ASSETS_RUNTIME } from './visual-assets-runtime.token'

@Module({
    imports: [
        RouterModule.register([{ path: '/knowledge-document', module: KnowledgeDocumentModule }]),
        TypeOrmModule.forFeature([KnowledgeDocument, KnowledgeDocumentPage, KnowledgeDocumentChunk]),
        DiscoveryModule,
        TenantModule,
        CqrsModule,
        UserModule,
        StorageFileModule,
        forwardRef(() => CopilotModule),
        IntegrationModule,
        forwardRef(() => KnowledgebaseModule),

        BullModule.registerQueue({
            name: JOB_EMBEDDING_DOCUMENT
        })
    ],
    controllers: [KnowledgeDocumentController],
    providers: [
        KnowledgeDocumentService,
        KnowledgeDocumentChunkService,
        KnowledgeDocumentTransformSnapshotService,
        KnowledgeDocumentAnalysisSnapshotService,
        KnowledgeDocumentVisualAssetsRuntimeService,
        {
            provide: KNOWLEDGE_DOCUMENT_VISUAL_ASSETS_RUNTIME,
            useExisting: KnowledgeDocumentVisualAssetsRuntimeService
        },
        KnowledgeDocumentConsumer,
        ...CommandHandlers,
        ...QueryHandlers
    ],
    exports: [
        KnowledgeDocumentService,
        KnowledgeDocumentChunkService,
        KnowledgeDocumentTransformSnapshotService,
        KnowledgeDocumentAnalysisSnapshotService,
        KNOWLEDGE_DOCUMENT_VISUAL_ASSETS_RUNTIME,
        TypeOrmModule
    ]
})
export class KnowledgeDocumentModule {}
