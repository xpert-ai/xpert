import { IXpertAgent, XpertTaskStatus } from '@metad/contracts'
import { InjectQueue } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Queue } from 'bull'
import { GetXpertAgentQuery } from '../../../xpert/queries'
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
		const { xpertId, agentKey } = command.task

		// Check agentKey
		if (xpertId && agentKey) {
			const agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(
				new GetXpertAgentQuery(xpertId, agentKey, false)
			)
			if (!agent) {
				throw new Error(`Xpert agent not found for xpertId: '${xpertId}' and key ${agentKey}`)
			}
		}

		const task = await this.taskService.create({
			...command.task,
			status: XpertTaskStatus.RUNNING
		})

		// Start task not in current context
		await this.scheduler.add({ taskId: task.id })

		return [task]
	}
}
