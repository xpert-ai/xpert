import { IXpertAgent, RolesEnum, XpertTaskStatus } from '@metad/contracts'
import { InjectQueue } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Queue } from 'bull'
import { GetXpertWorkflowQuery } from '../../../xpert/queries'
import { XpertTaskService } from '../../xpert-task.service'
import { CreateXpertTaskCommand } from '../create.command'
import { RequestContext } from '@metad/server-core'
import { I18nService } from 'nestjs-i18n'

@CommandHandler(CreateXpertTaskCommand)
export class CreateXpertTaskHandler implements ICommandHandler<CreateXpertTaskCommand> {
	readonly #logger = new Logger(CreateXpertTaskHandler.name)

	constructor(
		private readonly taskService: XpertTaskService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		@InjectQueue('xpert-task-scheduler') private scheduler: Queue,
		private readonly i18n: I18nService,
	) {}

	public async execute(command: CreateXpertTaskCommand) {
		const { xpertId, agentKey } = command.task

		// Trial account limit
		if (RequestContext.hasRole(RolesEnum.TRIAL)) {
			const { items } = await this.taskService.findMyAll()
			if (items.length >= 10) {
				throw new Error(`Your user role can only schedule a maximum of 10 tasks`)
			}
		}

		// Check agentKey
		if (xpertId && agentKey) {
			const {agent} = await this.queryBus.execute<GetXpertWorkflowQuery, {agent: IXpertAgent}>(
				new GetXpertWorkflowQuery(xpertId, agentKey, false)
			)
			if (!agent) {
				throw new Error(`Xpert agent not found for xpertId: '${xpertId}' and key '${agentKey}'`)
			}
		}

		const request = RequestContext.currentRequest()
		const timeZone = request.headers['time-zone']
		const task = await this.taskService.create({
			...command.task,
			timeZone,
			status: XpertTaskStatus.RUNNING
		})

		// Start task not in current context
		await this.scheduler.add({ taskId: task.id })

		return [task]
	}
}
