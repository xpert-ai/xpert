import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { SchedulerRegistry } from '@nestjs/schedule'
import { XpertTaskService } from '../../xpert-task.service'
import { DeleteXpertTaskCommand } from '../delete.command'

@CommandHandler(DeleteXpertTaskCommand)
export class DeleteXpertTaskHandler implements ICommandHandler<DeleteXpertTaskCommand> {
	readonly #logger = new Logger(DeleteXpertTaskHandler.name)

	constructor(
		private readonly taskService: XpertTaskService,
		private readonly schedulerRegistry: SchedulerRegistry,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: DeleteXpertTaskCommand) {
		const exists = await this.taskService.findAll({
			where: {
				createdById: RequestContext.currentUserId(),
				name: command.name
			}
		})


		if (exists.items.length) {
			await this.taskService.removeTasks(exists.items)
			return `Task '${command.name}' deleted`
		}

		return `No tasks found for '${command.name}'`
	}
}
