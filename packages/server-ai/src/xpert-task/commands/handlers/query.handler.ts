import { XpertTaskStatus } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { SchedulerRegistry } from '@nestjs/schedule'
import { instanceToPlain } from 'class-transformer'
import { FindConditions, Like } from 'typeorm'
import { XpertTask } from '../../xpert-task.entity'
import { XpertTaskService } from '../../xpert-task.service'
import { QueryXpertTaskCommand } from '../query.command'

@CommandHandler(QueryXpertTaskCommand)
export class QueryXpertTaskHandler implements ICommandHandler<QueryXpertTaskCommand> {
	readonly #logger = new Logger(QueryXpertTaskHandler.name)

	constructor(
		private readonly taskService: XpertTaskService,
		private readonly schedulerRegistry: SchedulerRegistry,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: QueryXpertTaskCommand) {
		const where = { createdById: RequestContext.currentUserId() } as FindConditions<XpertTask>
		if (command.name) {
			where.name = Like(command.name)
		}

		const { items } = await this.taskService.findAll({ where })

		return items.map((task) => {
			const plainTask = instanceToPlain(task)
			try {
				const job = this.schedulerRegistry.getCronJob(task.name)
				return {
					...plainTask,
					job
				}
			} catch (err) {
				return {
					...plainTask,
					status: XpertTaskStatus.PAUSED,
					job: null
				}
			}
		})
	}
}
