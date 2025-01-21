import { XpertTaskStatus } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bull'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Queue } from 'bull'
import { XpertTaskService } from '../../xpert-task.service'
import { CreateXpertTaskCommand } from '../create.command'

@CommandHandler(CreateXpertTaskCommand)
export class CreateXpertTaskHandler implements ICommandHandler<CreateXpertTaskCommand> {
	readonly #logger = new Logger(CreateXpertTaskHandler.name)

	constructor(
		private readonly taskService: XpertTaskService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		@InjectQueue('xpert-task-scheduler') private scheduler: Queue
	) {}

	public async execute(command: CreateXpertTaskCommand) {
		// const exists = await this.taskService.findAll({
		// 	where: {
		// 		createdById: RequestContext.currentUserId(),
		// 		name: command.task.name
		// 	}
		// })

		// if (exists.items.length) {
		// 	await this.taskService.removeTasks(exists.items)
		// }

		const task = await this.taskService.create({
			...command.task,
			status: XpertTaskStatus.RUNNING
		})

		// Start task not in current context
		await this.scheduler.add({taskId: task.id})

		return [task]
	}
}
