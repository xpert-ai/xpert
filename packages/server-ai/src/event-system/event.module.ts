import { Global, Module } from '@nestjs/common'
import { RedisModule } from '@xpert-ai/server-core'
import { XpertEventController } from './event.controller'
import { XpertEventPublisher } from './event-publisher.service'
import { XpertEventStreamService } from './event-stream.service'

@Global()
@Module({
	imports: [RedisModule],
	controllers: [XpertEventController],
	providers: [XpertEventPublisher, XpertEventStreamService],
	exports: [XpertEventPublisher, XpertEventStreamService]
})
export class XpertEventModule {}
