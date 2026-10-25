import { Global, Module } from '@nestjs/common'
import { RedisModule } from '@xpert-ai/server-core'
import { RunDisplaySnapshotStore } from './display-snapshot/display-snapshot.store'
import { RedisSseStreamService } from './redis-sse.service'

@Global()
@Module({
    imports: [RedisModule],
    providers: [RedisSseStreamService, RunDisplaySnapshotStore],
    exports: [RedisSseStreamService]
})
export class SseStreamModule {}
