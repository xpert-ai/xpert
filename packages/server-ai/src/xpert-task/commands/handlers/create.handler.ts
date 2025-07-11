import { IXpertAgent, RolesEnum, TaskFrequency, TTaskOptions, XpertTaskStatus } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { InjectQueue } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Queue } from 'bull'
import { I18nService } from 'nestjs-i18n'
import { GetXpertWorkflowQuery } from '../../../xpert/queries'
import { XpertTaskService } from '../../xpert-task.service'
import { CreateXpertTaskCommand } from '../create.command'

@CommandHandler(CreateXpertTaskCommand)
export class CreateXpertTaskHandler implements ICommandHandler<CreateXpertTaskCommand> {
	readonly #logger = new Logger(CreateXpertTaskHandler.name)

	constructor(
		private readonly taskService: XpertTaskService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		@InjectQueue('xpert-task-scheduler') private scheduler: Queue,
		private readonly i18n: I18nService
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
			const { agent } = await this.queryBus.execute<GetXpertWorkflowQuery, { agent: IXpertAgent }>(
				new GetXpertWorkflowQuery(xpertId, agentKey, false)
			)
			if (!agent) {
				throw new Error(`Xpert agent not found for xpertId: '${xpertId}' and key '${agentKey}'`)
			}
		}

		if (!command.task.options && command.task.schedule) {
			command.task.options = parseCronExpression(command.task.schedule)
		}
		const request = RequestContext.currentRequest()
		const timeZone = request.headers['time-zone']
		const task = await this.taskService.create({
			...command.task,
			schedule: null, // Clear schedule to avoid confusion
			timeZone,
			status: XpertTaskStatus.SCHEDULED
		})

		// Start task not in current context
		await this.scheduler.add({ taskId: task.id })

		return task
	}
}

function parseCronExpression(cron: string): TTaskOptions {
	const [minuteStr, hourStr, dayStr, monthStr, weekStr] = cron.trim().split(' ')

	const minute = parseInt(minuteStr, 10)
	const hour = parseInt(hourStr, 10)
	const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`

	const day = dayStr === '*' ? undefined : parseInt(dayStr, 10)
	const month = monthStr === '*' ? undefined : parseInt(monthStr, 10)
	const dayOfWeek = weekStr === '*' ? undefined : parseInt(weekStr, 10)

	// Determine frequency
	let frequency: TTaskOptions['frequency']

	if (dayOfWeek !== undefined) {
		frequency = TaskFrequency.Weekly
	} else if (day !== undefined && month !== undefined) {
		frequency = TaskFrequency.Yearly
	} else if (day !== undefined && month === undefined) {
		frequency = TaskFrequency.Monthly
	} else if (day === undefined && month === undefined && dayOfWeek === undefined) {
		frequency = TaskFrequency.Daily
	} else {
		// fallback case, may be Once (you can confirm whether it is Once through additional fields)
		frequency = TaskFrequency.Once
	}

	const result: TTaskOptions = {
		frequency,
		time
	}

	if (frequency === 'Weekly') {
		result.dayOfWeek = dayOfWeek
	} else if (frequency === 'Monthly') {
		result.dayOfMonth = day
	} else if (frequency === 'Yearly') {
		result.dayOfMonth = day
		result.month = month
	} else if (frequency === 'Once') {
		// You may need an additional field date to store the actual time of Once. In this example, the specific date cannot be derived from cron.
		result.dayOfMonth = day
		result.month = month
		// result.date = '2025-07-10'; // You need to save it separately
	}

	return result
}
