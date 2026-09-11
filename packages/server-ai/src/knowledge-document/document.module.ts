import { JOB_KNOWLEDGE_QUESTIONS } from './questions/question-generation.command'
import { KnowledgeQuestionGenerationService } from './questions/question-generation.service'
import { KnowledgeQuestionGenerationController } from './questions/question-generation.controller'
import { KnowledgeQuestionsConsumer, KnowledgeQuestionsEnqueueHandler } from './questions/question-generation.job'
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
import {
    KnowledgeDocumentDeletionCleanupReceipt,
    KnowledgeDocumentDeletionIntent,
    KnowledgeDocumentPublicationAttempt,
    KnowledgeDocumentPublicationAttemptSource
} from './deletion'
import { KnowledgeDerivedIndexPublicationService } from './derived-index-publication.service'
import { RuntimeCapabilityModule } from '../shared/runtime/runtime-capability.module'
import { KnowledgeProcessingLifecycleModule } from './processing-lifecycle.module'

@Module({
    imports: [
        RouterModule.register([{ path: '/knowledge-document', module: KnowledgeDocumentModule }]),
        TypeOrmModule.forFeature([
            KnowledgeDocument,
            KnowledgeDocumentPage,
            KnowledgeDocumentChunk,
            KnowledgeDocumentDeletionIntent,
            KnowledgeDocumentDeletionCleanupReceipt,
            KnowledgeDocumentPublicationAttempt,
            KnowledgeDocumentPublicationAttemptSource
        ]),
        DiscoveryModule,
        RuntimeCapabilityModule,
        TenantModule,
        CqrsModule,
        KnowledgeProcessingLifecycleModule,
        UserModule,
        StorageFileModule,
        forwardRef(() => CopilotModule),
        IntegrationModule,
        forwardRef(() => KnowledgebaseModule),

        BullModule.registerQueue({ name: JOB_EMBEDDING_DOCUMENT }, { name: JOB_KNOWLEDGE_QUESTIONS })
    ],
    controllers: [KnowledgeDocumentController, KnowledgeQuestionGenerationController],
    providers: [
        KnowledgeQuestionGenerationService,
        KnowledgeQuestionsConsumer,
        KnowledgeQuestionsEnqueueHandler,
        KnowledgeDocumentService,
        KnowledgeDocumentChunkService,
        KnowledgeDocumentTransformSnapshotService,
        KnowledgeDocumentAnalysisSnapshotService,
        KnowledgeDocumentVisualAssetsRuntimeService,
        KnowledgeDerivedIndexPublicationService,
        KnowledgeDocumentConsumer,
        ...CommandHandlers,
        ...QueryHandlers
    ],
    exports: [
        KnowledgeDocumentService,
        KnowledgeDocumentChunkService,
        KnowledgeDocumentTransformSnapshotService,
        KnowledgeDocumentAnalysisSnapshotService,
        KnowledgeDocumentVisualAssetsRuntimeService,
        KnowledgeDerivedIndexPublicationService,
        TypeOrmModule
    ]
})
export class KnowledgeDocumentModule {}
