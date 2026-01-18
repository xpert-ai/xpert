import { Global, Module } from '@nestjs/common'
import { RedisModule } from '@metad/server-core'
import { ExecutionCancelService } from './execution-cancel.service'

@Global()
@Module({
	imports: [RedisModule],
	providers: [ExecutionCancelService],
	exports: [ExecutionCancelService]
})
export class ExecutionCancelModule {}
