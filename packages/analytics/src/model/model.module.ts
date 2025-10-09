import { RedisModule, SharedModule, TenantModule, UserModule } from '@metad/server-core'
import { BullModule } from '@nestjs/bull'
import { Module, forwardRef } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { BusinessAreaModule } from '../business-area'
import { BusinessAreaUserModule } from '../business-area-user/index'
import { DataSourceModule } from '../data-source/data-source.module'
import { SemanticModelCacheModule } from './cache/cache.module'
import { CommandHandlers } from './commands/handlers'
import { EventHandlers } from './events/handlers'
import { ModelQueryProcessor } from './jobs/query.processor'
import { ModelController } from './model.controller'
import { SemanticModel } from './model.entity'
import { SemanticModelService } from './model.service'
import { provideOcap } from './ocap'
import { QueryHandlers } from './queries/handlers'
import { SemanticModelRoleModule } from './role/role.module'
import { QUERY_QUEUE_NAME } from './types'
import { AgentModule } from '../agent/agent.module'
import { ModelQueryLogModule } from '../model-query-log'

@Module({
	imports: [
		RouterModule.register([{ path: '/semantic-model', module: SemanticModelModule }]),
		TypeOrmModule.forFeature([SemanticModel]),
		BullModule.registerQueue({
			name: QUERY_QUEUE_NAME
		}),
		forwardRef(() => AgentModule),
		TenantModule,
		SharedModule,
		CqrsModule,
		UserModule,
		DataSourceModule,
		SemanticModelRoleModule,
		SemanticModelCacheModule,
		BusinessAreaUserModule,
		BusinessAreaModule,
		RedisModule,
		ModelQueryLogModule
	],
	controllers: [ModelController],
	providers: [
		SemanticModelService,
		...CommandHandlers,
		...QueryHandlers,
		...EventHandlers,
		...provideOcap(),
		ModelQueryProcessor
	],
	exports: [TypeOrmModule, SemanticModelService, BullModule]
})
export class SemanticModelModule {}
