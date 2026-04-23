import { TenantModule } from '@xpert-ai/server-core'
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
import { Strategies } from './plugins'
import { ScheduleNote } from './schedule-note.entity'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { AutoTask } from './auto-task.entity'
import { AutoTaskTemplate } from './auto-task-template.entity'


@Module({
	imports: [
		RouterModule.register([{ path: '/xpert-task', module: XpertTaskModule }]),
		TypeOrmModule.forFeature([XpertTask, ScheduleNote, ChatConversation, AutoTask, AutoTaskTemplate]),
		TenantModule,
		CqrsModule,
		forwardRef(() => XpertAgentModule),

		BullModule.registerQueue({
			name: 'xpert-task-scheduler'
		}),
	],
	controllers: [XpertTaskController],
	providers: [XpertTaskService, TaskSchedulerProcessor, ...CommandHandlers, ...Strategies],
	exports: [XpertTaskService]
})
export class XpertTaskModule {}
