import { ChatConversationModule } from '../chat-conversation/conversation.module'
import { XpertMemoryUserInput } from './adapters/xpert-memory-user-input'
import { FileMemoryUserInput } from '../plugins/file-memory/ports'
import { XpertMemoryViewAccess } from './adapters/xpert-memory-view-access'
import { ManagedQueueModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ChatConversation, ChatMessage } from '../core/entities/internal'
import { XpertModule } from '../xpert/xpert.module'
import { Xpert } from '../xpert/xpert.entity'
import { XpertWorkspaceModule } from '../xpert-workspace'
import { FileMemoryController } from './file-memory.controller'
import { FileMemoryFacade } from './file-memory.facade'
import {
    FileMemoryConversationHistoryReader,
    FileMemoryDreamModel,
    FileMemoryXpertScopeResolver
} from '../plugins/file-memory/ports'
import { XpertConversationHistoryReader } from './adapters/xpert-conversation-history-reader'
import { XpertDreamModel } from './adapters/xpert-dream-model'
import { XpertFileMemoryScopeResolver } from './adapters/xpert-scope-resolver'

import { FileMemoryPluginModule } from '../plugins/file-memory/file-memory-plugin.module'
import { FileMemoryReviewRuntime, FileMemoryVolume, FileMemoryViewAccess } from '../plugins/file-memory/ports'
import { XpertReviewRuntime } from './adapters/xpert-review-runtime'
import { XpertMemoryVolume } from './adapters/xpert-memory-volume'

const adapters = [
    { provide: FileMemoryUserInput, useClass: XpertMemoryUserInput },
    { provide: FileMemoryViewAccess, useClass: XpertMemoryViewAccess },
    { provide: FileMemoryVolume, useClass: XpertMemoryVolume },
    { provide: FileMemoryReviewRuntime, useClass: XpertReviewRuntime },
    { provide: FileMemoryConversationHistoryReader, useClass: XpertConversationHistoryReader },
    { provide: FileMemoryDreamModel, useClass: XpertDreamModel },
    { provide: FileMemoryXpertScopeResolver, useClass: XpertFileMemoryScopeResolver }
]
@Module({
    imports: [
        ChatConversationModule,
        CqrsModule,
        ManagedQueueModule,
        TypeOrmModule.forFeature([ChatConversation, ChatMessage, Xpert]),
        XpertModule,
        XpertWorkspaceModule
    ],
    providers: adapters,
    exports: [...adapters, ManagedQueueModule]
})
class FileMemoryHostModule {}

@Module({
    imports: [
        XpertModule,
        XpertWorkspaceModule,
        FileMemoryHostModule,
        FileMemoryPluginModule.register(FileMemoryHostModule)
    ],
    controllers: [FileMemoryController],
    providers: [FileMemoryFacade],
    exports: [FileMemoryPluginModule, FileMemoryFacade]
})
export class FileMemoryModule {}
