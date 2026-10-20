import { RunStreamArchiveService } from './run-stream-archive.service'
import { ExecutionCancelModule } from '../execution/execution-cancel.module'
import { RunStreamSnapshotService } from './run-stream-snapshot.service'
import { Global, Module } from '@nestjs/common'
import { RedisModule } from '@xpert-ai/server-core'
import { RedisSseStreamService } from './redis-sse.service'

@Global()
@Module({
    imports: [RedisModule, ExecutionCancelModule],
    providers: [RedisSseStreamService, RunStreamSnapshotService, RunStreamArchiveService],
    exports: [RedisSseStreamService]
})
export class SseStreamModule {}
