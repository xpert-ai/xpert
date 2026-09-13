// Bull registers workers in onModuleInit, before CQRS registers its handlers.
// The explicit CqrsModule dependency orders this gate after CQRS bootstrap.
import { Injectable, Module, OnApplicationBootstrap } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'

@Injectable()
export class KnowledgeProcessingReadyService implements OnApplicationBootstrap {
    private resolveReady!: () => void
    private readonly ready = new Promise<void>((resolve) => {
        this.resolveReady = resolve
    })

    onApplicationBootstrap() {
        this.resolveReady()
    }

    waitUntilReady() {
        return this.ready
    }
}

@Module({
    imports: [CqrsModule],
    providers: [KnowledgeProcessingReadyService],
    exports: [KnowledgeProcessingReadyService]
})
export class KnowledgeProcessingLifecycleModule {}
