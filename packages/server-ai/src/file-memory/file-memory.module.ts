import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ChatConversation, ChatMessage } from '../core/entities/internal'
import { XpertModule } from '../xpert/xpert.module'
import { Xpert } from '../xpert/xpert.entity'
import { XpertWorkspaceModule } from '../xpert-workspace'
import { FileMemoryController } from './file-memory.controller'
import { FileMemoryFacade } from './file-memory.facade'
import { FileMemoryDreamService } from './dream.service'
import { XpertFileMemoryMiddleware } from './file-memory.middleware'
import { FileMemoryService } from './file-memory.service'
import { FileMemoryWritebackRunner } from './file-memory.writeback-runner'
import { FileMemoryConversationHistoryReader, FileMemoryDreamerInvoker, FileMemoryXpertScopeResolver } from './ports'
import { FileMemoryRecallPlanner } from './recall-planner'
import { XpertConversationHistoryReader } from './adapters/xpert-conversation-history-reader'
import { XpertDreamerInvoker } from './adapters/xpert-dreamer-invoker'
import { XpertFileMemoryScopeResolver } from './adapters/xpert-scope-resolver'

@Module({
    imports: [CqrsModule, TypeOrmModule.forFeature([ChatConversation, ChatMessage, Xpert]), XpertModule, XpertWorkspaceModule],
    controllers: [FileMemoryController],
    providers: [
        FileMemoryService,
        FileMemoryDreamService,
        FileMemoryFacade,
        FileMemoryRecallPlanner,
        FileMemoryWritebackRunner,
        XpertFileMemoryMiddleware,
        {
            provide: FileMemoryConversationHistoryReader,
            useClass: XpertConversationHistoryReader
        },
        {
            provide: FileMemoryDreamerInvoker,
            useClass: XpertDreamerInvoker
        },
        {
            provide: FileMemoryXpertScopeResolver,
            useClass: XpertFileMemoryScopeResolver
        }
    ],
    exports: [FileMemoryService, FileMemoryDreamService, FileMemoryFacade, FileMemoryRecallPlanner, FileMemoryWritebackRunner, XpertFileMemoryMiddleware]
})
export class FileMemoryModule {}
