import { SharedModule, TenantModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { SemanticModelModule } from '../model/model.module'
import { ModelQueryLogController } from './log.controller'
import { ModelQueryLogService } from './log.service'
import { SemanticModelQueryLog } from './log.entity'
import { CommandHandlers } from './commands/handlers'
import { QueryHandlers } from './queries/handlers'
import { QueryLogsCleanupService } from './jobs/logs-cleanup.service'

@Module({
	imports: [
		RouterModule.register([{ path: '/model-query-log', module: ModelQueryLogModule }]),
		TypeOrmModule.forFeature([SemanticModelQueryLog]),
		forwardRef(() => TenantModule),
		SharedModule,
		CqrsModule,
		forwardRef(() => SemanticModelModule)
	],
	controllers: [ModelQueryLogController],
	providers: [ModelQueryLogService, QueryLogsCleanupService, ...CommandHandlers, ...QueryHandlers],
	exports: [ModelQueryLogService]
})
export class ModelQueryLogModule {}
