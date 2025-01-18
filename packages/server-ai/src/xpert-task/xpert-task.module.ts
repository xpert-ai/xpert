import { TenantModule } from '@metad/server-core'
import { Module, forwardRef } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from 'nest-router'
import { XpertTaskService } from './xpert-task.service'
import { XpertTaskController } from './xpert-task.controller'
import { CommandHandlers } from './commands/handlers'
import { XpertTask } from './xpert-task.entity'
import { XpertAgentModule } from '../xpert-agent/xpert-agent.module'


@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/xpert-task', module: XpertTaskModule }]),
		TypeOrmModule.forFeature([XpertTask]),
		TenantModule,
		CqrsModule,
		forwardRef(() => XpertAgentModule)
	],
	controllers: [XpertTaskController],
	providers: [XpertTaskService, ...CommandHandlers],
	exports: [XpertTaskService]
})
export class XpertTaskModule {}
