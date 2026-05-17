import { Global, Module } from '@nestjs/common'
import { RedisModule } from '@xpert-ai/server-core'
import { RedisSseStreamService } from './redis-sse.service'

@Global()
@Module({
    imports: [RedisModule],
    providers: [RedisSseStreamService],
    exports: [RedisSseStreamService]
})
export class SseStreamModule {}
