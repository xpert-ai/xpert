import { StandardReplyCapability } from './standard-reply.capability'
import { StandardReplyMiddleware } from './standard-reply.middleware'
import { FileMemoryConsolidation } from './dream-consolidation'
import { MemoryViewProvider } from './memory-view.provider'
import { MemoryManagement } from './memory-management'
import { DynamicModule, Module, Type } from '@nestjs/common'
import { FileMemoryReviewJob } from './dream-review.job'
import { FileMemoryDreamService } from './dream.service'
import { XpertFileMemoryMiddleware } from './file-memory.middleware'
import { FileMemoryService } from './file-memory.service'
import { FileMemoryWritebackRunner } from './file-memory.writeback-runner'
import { FileMemoryRecallPlanner } from './recall-planner'

@Module({})
export class FileMemoryPluginModule {
    static register(host: Type<unknown>): DynamicModule {
        const services = [
            StandardReplyCapability,
            StandardReplyMiddleware,
            MemoryViewProvider,
            MemoryManagement,
            FileMemoryReviewJob,
            FileMemoryDreamService,
            FileMemoryConsolidation,
            XpertFileMemoryMiddleware,
            FileMemoryService,
            FileMemoryWritebackRunner,
            FileMemoryRecallPlanner
        ]
        return { module: FileMemoryPluginModule, imports: [host], providers: services, exports: services }
    }
}
