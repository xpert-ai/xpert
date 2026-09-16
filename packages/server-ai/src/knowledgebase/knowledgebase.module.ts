import { KnowledgebaseTag } from './tags/knowledgebase-tag.entity'
import { KnowledgeDocumentTag } from './tags/document-tag.entity'
import { KnowledgeTagService } from './tags/knowledge-tag.service'
import { KnowledgeTagController, KnowledgeTagUsageController } from './tags/knowledge-tag.controller'
import { KnowledgebaseRuntimeService } from './runtime/knowledgebase-runtime.service'
import { KnowledgebaseDocumentsRuntimeService } from './runtime/knowledgebase-documents-runtime.service'
import { KnowledgebaseProvisioningRuntimeService } from './runtime/knowledgebase-provisioning-runtime.service'
import { DatabaseModule, IntegrationModule, Tag, TenantModule, UserModule } from '@xpert-ai/server-core'
import { BullModule } from '@nestjs/bull'
import { forwardRef, Module } from '@nestjs/common'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
    DocumentSourceRegistry,
    DocumentTransformerRegistry,
    ImageUnderstandingRegistry,
    KnowledgeStrategyRegistry,
    RetrieverRegistry,
    TextSplitterRegistry
} from '@xpert-ai/plugin-sdk'
import { CopilotModule } from '../copilot/copilot.module'
import { KnowledgeDocumentModule } from '../knowledge-document/document.module'
import { XpertWorkspaceModule } from '../xpert-workspace'
import { CommandHandlers } from './commands/handlers'
import { KnowledgebaseController } from './knowledgebase.controller'
import { Knowledgebase } from './knowledgebase.entity'
import { KnowledgebaseService } from './knowledgebase.service'
import { KnowledgebaseRebuildEmbeddingConsumer } from './knowledgebase-rebuild-embedding.job'
import { QueryHandlers } from './queries/handlers'
import { XpertModule } from '../xpert/xpert.module'
import { KnowledgebaseTaskService } from './task/task.service'
import { KnowledgebaseTask } from './task/task.entity'
import { Validators, Strategies, KnowledgeWorkbenchProviders, KnowledgebaseToolsProviders } from './plugins'
import { KnowledgeRetrievalLog, KnowledgeRetrievalLogService } from './logs/'
import { KnowledgebaseViewHostDefinition } from '../view-extension/hosts/knowledgebase-view-host.definition'
import { KnowledgebaseWriterMiddleware } from './knowledgebase-writer.middleware'
import { JOB_REBUILD_KNOWLEDGEBASE_EMBEDDING } from './types'
import { KnowledgeFilterV2MigrationService } from './migration'
import { KnowledgeGraphFilterScopeService } from './filter'
import {
    GraphKnowledgeCandidateRetriever,
    KeywordKnowledgeCandidateRetriever,
    KnowledgeKeywordIndexService,
    LegacyWeightedFusion,
    VectorKnowledgeCandidateRetriever,
    WeightedRrfFusion
} from './retrieval'
import { KnowledgeFAQController, KnowledgeFAQService } from './faq'
import { FAQSemanticService } from './faq/faq-semantic.service'
import { FAQSemanticCacheService } from './faq/faq-semantic-cache.service'
import {
    FAQSemanticPrewarmDispatcher,
    FAQSemanticPrewarmProcessor,
    JOB_FAQ_SEMANTIC_PREWARM
} from './faq/faq-semantic-prewarm'
import {
    KnowledgeWikiPage,
    KnowledgeWikiPageEvidenceEntity,
    KnowledgeWikiPageVersion,
    KnowledgeWikiSourceState
} from './wiki/entities'
import { KnowledgeWikiSearchScopeService } from './wiki/knowledge-wiki-search-scope.service'
import { KnowledgeParserSettingsService } from './parser-settings.service'
import { KnowledgeTableContextService } from './retrieval/table-context.service'
import { KnowledgePipelineCallbackProcessor } from './task/pipeline-callback.processor'

@Module({
    imports: [
        RouterModule.register([{ path: '/knowledgebase', module: KnowledgebaseModule }]),
        TypeOrmModule.forFeature([
            Tag,
            KnowledgebaseTag,
            KnowledgeDocumentTag,
            Knowledgebase,
            KnowledgebaseTask,
            KnowledgeRetrievalLog,
            KnowledgeWikiPage,
            KnowledgeWikiPageVersion,
            KnowledgeWikiPageEvidenceEntity,
            KnowledgeWikiSourceState
        ]),
        DiscoveryModule,
        TenantModule,
        CqrsModule,
        UserModule,
        forwardRef(() => CopilotModule),
        DatabaseModule,
        forwardRef(() => XpertWorkspaceModule),
        forwardRef(() => IntegrationModule),
        forwardRef(() => KnowledgeDocumentModule),
        forwardRef(() => XpertModule),
        BullModule.registerQueue(
            {
                name: JOB_REBUILD_KNOWLEDGEBASE_EMBEDDING
            },
            {
                name: JOB_FAQ_SEMANTIC_PREWARM
            }
        )
    ],
    controllers: [KnowledgebaseController, KnowledgeFAQController, KnowledgeTagController, KnowledgeTagUsageController],
    providers: [
        KnowledgeTagService,
        KnowledgePipelineCallbackProcessor,
        KnowledgeParserSettingsService,
        KnowledgeTableContextService,
        KnowledgebaseService,
        KnowledgebaseRuntimeService,
        KnowledgebaseDocumentsRuntimeService,
        KnowledgebaseProvisioningRuntimeService,
        KnowledgebaseRebuildEmbeddingConsumer,
        KnowledgebaseTaskService,
        KnowledgeRetrievalLogService,
        DocumentSourceRegistry,
        KnowledgeStrategyRegistry,
        RetrieverRegistry,
        TextSplitterRegistry,
        DocumentTransformerRegistry,
        ImageUnderstandingRegistry,
        KnowledgebaseViewHostDefinition,
        KnowledgebaseWriterMiddleware,
        KnowledgeFilterV2MigrationService,
        KnowledgeGraphFilterScopeService,
        VectorKnowledgeCandidateRetriever,
        GraphKnowledgeCandidateRetriever,
        KeywordKnowledgeCandidateRetriever,
        KnowledgeKeywordIndexService,
        LegacyWeightedFusion,
        WeightedRrfFusion,
        KnowledgeFAQService,
        FAQSemanticService,
        FAQSemanticCacheService,
        FAQSemanticPrewarmDispatcher,
        FAQSemanticPrewarmProcessor,
        KnowledgeWikiSearchScopeService,
        ...KnowledgeWorkbenchProviders,
        ...KnowledgebaseToolsProviders,
        ...QueryHandlers,
        ...CommandHandlers,
        ...Strategies,
        ...Validators
    ],
    exports: [
        KnowledgeTagService,
        KnowledgeParserSettingsService,
        KnowledgebaseService,
        KnowledgebaseTaskService,
        DocumentSourceRegistry,
        RetrieverRegistry,
        TextSplitterRegistry,
        DocumentTransformerRegistry,
        ImageUnderstandingRegistry,
        KnowledgeFilterV2MigrationService,
        KnowledgeGraphFilterScopeService,
        KnowledgeKeywordIndexService,
        KnowledgeFAQService,
        KnowledgeWikiSearchScopeService
    ]
})
export class KnowledgebaseModule {}
