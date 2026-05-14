import { BullModule } from '@nestjs/bull'
import { forwardRef, Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UserModule } from '@xpert-ai/server-core'
import { KnowledgeDocumentModule } from '../knowledge-document'
import { KnowledgebaseModule } from '../knowledgebase'
import { Knowledgebase } from '../knowledgebase/knowledgebase.entity'
import { CommandHandlers } from './commands/handlers'
import {
    KnowledgeGraphCommunity,
    KnowledgeGraphEntity,
    KnowledgeGraphIndexJob,
    KnowledgeGraphMention,
    KnowledgeGraphRelation
} from './entities'
import { GraphragController } from './graphrag.controller'
import { KnowledgeGraphIndexConsumer } from './graphrag.job'
import { GraphragService } from './graphrag.service'
import { QueryHandlers } from './queries/handlers'
import { JOB_KNOWLEDGE_GRAPH_INDEX } from './types'

@Module({
    imports: [
        RouterModule.register([{ path: '/knowledgebase', module: GraphragModule }]),
        TypeOrmModule.forFeature([
            Knowledgebase,
            KnowledgeGraphCommunity,
            KnowledgeGraphEntity,
            KnowledgeGraphIndexJob,
            KnowledgeGraphMention,
            KnowledgeGraphRelation
        ]),
        CqrsModule,
        UserModule,
        forwardRef(() => KnowledgebaseModule),
        forwardRef(() => KnowledgeDocumentModule),
        BullModule.registerQueue({
            name: JOB_KNOWLEDGE_GRAPH_INDEX
        })
    ],
    controllers: [GraphragController],
    providers: [GraphragService, KnowledgeGraphIndexConsumer, ...CommandHandlers, ...QueryHandlers],
    exports: [GraphragService]
})
export class GraphragModule {}
