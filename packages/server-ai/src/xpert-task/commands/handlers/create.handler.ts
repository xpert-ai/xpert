import { XpertTaskStatus } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { XpertTaskService } from '../../xpert-task.service'
import { CreateXpertTaskCommand } from '../create.command'

@CommandHandler(CreateXpertTaskCommand)
export class CreateXpertTaskHandler implements ICommandHandler<CreateXpertTaskCommand> {
	readonly #logger = new Logger(CreateXpertTaskHandler.name)

	constructor(
		private readonly taskService: XpertTaskService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: CreateXpertTaskCommand) {
		const exists = await this.taskService.findAll({
			where: {
				createdById: RequestContext.currentUserId(),
				name: command.task.name
			}
		})

		if (exists.items.length) {
			await this.taskService.removeTasks(exists.items)
		}

		const task = await this.taskService.create({
			...command.task,
			status: XpertTaskStatus.RUNNING
		})

		this.taskService.scheduleCronJob(task, RequestContext.currentUser())

		return [task]
	}
}
