import { ScheduleTaskStatus } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { SchedulerRegistry } from '@nestjs/schedule'
import { FindOptionsWhere } from 'typeorm'
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
		const where = { createdById: RequestContext.currentUserId() } as FindOptionsWhere<XpertTask>
		if (command.xpertId) {
			where.xpertId = command.xpertId
		}

		const { items } = await this.taskService.findAll({ where })

		return items.map((task) => {
			const _task = {
				id: task.id,
				name: task.name,
				schedule: task.schedule,
				xpertId: task.xpertId,
				agentKey: task.agentKey,
				prompt: task.prompt,
				status: task.status,
				deletedAt: task.deletedAt,
			}
			try {
				const job = this.schedulerRegistry.getCronJob(task.name)
				return {
					..._task,
					job
				}
			} catch (err) {
				return {
					..._task,
					status: ScheduleTaskStatus.PAUSED,
					job: null
				}
			}
		})
	}
}
