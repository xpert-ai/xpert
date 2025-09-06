import { TenantModule } from '@metad/server-core'
import { Module, forwardRef } from '@nestjs/common'
import { BullModule } from '@nestjs/bull'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { XpertTaskService } from './xpert-task.service'
import { XpertTaskController } from './xpert-task.controller'
import { CommandHandlers } from './commands/handlers'
import { XpertTask } from './xpert-task.entity'
import { XpertAgentModule } from '../xpert-agent/xpert-agent.module'
import { TaskSchedulerProcessor } from './scheduler.job'


@Module({
	imports: [
		RouterModule.register([{ path: '/xpert-task', module: XpertTaskModule }]),
		TypeOrmModule.forFeature([XpertTask]),
		TenantModule,
		CqrsModule,
		forwardRef(() => XpertAgentModule),

		BullModule.registerQueue({
			name: 'xpert-task-scheduler'
		}),
	],
	controllers: [XpertTaskController],
	providers: [XpertTaskService, TaskSchedulerProcessor, ...CommandHandlers],
	exports: [XpertTaskService]
})
export class XpertTaskModule {}
