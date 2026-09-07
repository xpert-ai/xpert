import { BullModule } from '@nestjs/bull'
import { forwardRef, Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UserModule } from '@xpert-ai/server-core'
import { KnowledgeDocumentModule } from '../../knowledge-document'
import { KnowledgeDocumentChunk } from '../../knowledge-document/chunk/chunk.entity'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { AgentMiddlewareRuntimeModule } from '../../shared/agent/middleware-runtime'
import { KnowledgebaseModule } from '../knowledgebase.module'
import { Knowledgebase } from '../knowledgebase.entity'
import {
    KnowledgeWikiJob,
    KnowledgeWikiModelInvocation,
    KnowledgeWikiPage,
    KnowledgeWikiPageContribution,
    KnowledgeWikiPageEvidenceEntity,
    KnowledgeWikiPageLinkEntity,
    KnowledgeWikiPageReduceInput,
    KnowledgeWikiPageReduceInputSource,
    KnowledgeWikiPageVersion,
    KnowledgeWikiProjectionState,
    KnowledgeWikiSourceMapResult,
    KnowledgeWikiSourceState
} from './entities'
import { KnowledgeWikiController } from './knowledge-wiki.controller'
import { KnowledgeWikiService } from './knowledge-wiki.service'
import { KnowledgeWikiGenerationService } from './knowledge-wiki-generation.service'
import { KnowledgeWikiFinalizeService } from './knowledge-wiki-finalize.service'
import { KnowledgeWikiPageReduceService } from './knowledge-wiki-page-reduce.service'
import { KnowledgeWikiGenerationConsumer } from './knowledge-wiki.job'
import { KnowledgeWikiJobDispatcherService } from './knowledge-wiki-job-dispatcher.service'
import { KnowledgeWikiJobFenceService } from './knowledge-wiki-job-fence.service'
import { KnowledgeWikiJobLeaseService } from './knowledge-wiki-job-lease.service'
import { KnowledgeWikiIndexService } from './knowledge-wiki-index.service'
import { KnowledgeWikiLinkService } from './knowledge-wiki-link.service'
import { KnowledgeWikiModelInvocationService } from './knowledge-wiki-model-invocation.service'
import { KnowledgeWikiInvocationBudgetService } from './knowledge-wiki-invocation-budget.service'
import { KnowledgeWikiProjectionService } from './knowledge-wiki-projection.service'
import { KnowledgeWikiRebuildCoordinatorService } from './knowledge-wiki-rebuild-coordinator.service'
import { KnowledgeWikiReconcilerService } from './knowledge-wiki-reconciler.service'
import { KnowledgeWikiRetractionService } from './knowledge-wiki-retraction.service'
import { JOB_KNOWLEDGE_WIKI_GENERATION } from './types'
import { KnowledgeWikiCommandHandlers } from './commands/handlers'

@Module({
    imports: [
        RouterModule.register([{ path: '/knowledgebase', module: KnowledgeWikiModule }]),
        TypeOrmModule.forFeature([
            Knowledgebase,
            KnowledgeDocument,
            KnowledgeDocumentChunk,
            KnowledgeWikiJob,
            KnowledgeWikiModelInvocation,
            KnowledgeWikiPage,
            KnowledgeWikiPageContribution,
            KnowledgeWikiPageEvidenceEntity,
            KnowledgeWikiPageLinkEntity,
            KnowledgeWikiPageReduceInput,
            KnowledgeWikiPageReduceInputSource,
            KnowledgeWikiPageVersion,
            KnowledgeWikiProjectionState,
            KnowledgeWikiSourceMapResult,
            KnowledgeWikiSourceState
        ]),
        CqrsModule,
        UserModule,
        AgentMiddlewareRuntimeModule,
        forwardRef(() => KnowledgebaseModule),
        forwardRef(() => KnowledgeDocumentModule),
        BullModule.registerQueue({ name: JOB_KNOWLEDGE_WIKI_GENERATION })
    ],
    controllers: [KnowledgeWikiController],
    providers: [
        KnowledgeWikiService,
        KnowledgeWikiGenerationService,
        KnowledgeWikiFinalizeService,
        KnowledgeWikiPageReduceService,
        KnowledgeWikiJobDispatcherService,
        KnowledgeWikiJobFenceService,
        KnowledgeWikiJobLeaseService,
        KnowledgeWikiIndexService,
        KnowledgeWikiLinkService,
        KnowledgeWikiModelInvocationService,
        KnowledgeWikiInvocationBudgetService,
        KnowledgeWikiProjectionService,
        KnowledgeWikiRebuildCoordinatorService,
        KnowledgeWikiReconcilerService,
        KnowledgeWikiRetractionService,
        KnowledgeWikiGenerationConsumer,
        ...KnowledgeWikiCommandHandlers
    ],
    exports: [KnowledgeWikiService, KnowledgeWikiGenerationService]
})
export class KnowledgeWikiModule {}
