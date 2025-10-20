import { isNil } from '@metad/server-common'
import { runWithRequestContext, UserService } from '@metad/server-core'
import { JOB_REF, Process, Processor } from '@nestjs/bull'
import { Inject, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Job } from 'bull'
import { omitBy } from 'lodash'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { XpertChatCommand } from '../commands'
import { QUEUE_XPERT_TRIGGER, TTriggerJob } from '../types'
import { XpertService } from '../xpert.service'
import { STATE_VARIABLE_HUMAN } from '@metad/contracts'

@Processor({
	name: QUEUE_XPERT_TRIGGER
})
export class XpertTriggerConsumer {
	private readonly logger = new Logger(XpertTriggerConsumer.name)

	constructor(
		@Inject(JOB_REF) jobRef: Job,
		private readonly userService: UserService,
		private readonly xpertService: XpertService,
		private readonly commandBus: CommandBus
	) {}

	@Process({ concurrency: 5 })
	async process(job: Job<TTriggerJob>) {
		this.logger.log(`Processing job ${job.id}...`)
		this.logger.log(job.data)
		// const request = job.data.request

		const xpert = await this.xpertService.findOne(job.data.xpertId)
		const userId = job.data.userId || xpert.createdById
		const user = await this.userService.findOne(userId, { relations: ['role'] })
		runWithRequestContext({ user, headers: { ['organization-id']: xpert.organizationId } }, async () => {
			// Chat with xpert
			const stream = await this.commandBus.execute<XpertChatCommand, Observable<MessageEvent>>(
				new XpertChatCommand(
					{
						input: job.data[STATE_VARIABLE_HUMAN],
						xpertId: job.data.xpertId,
						state: job.data.state,
					},
					{
						from: job.data.from,
						isDraft: job.data.isDraft,
						execution: job.data.executionId ? { id: job.data.executionId } : null
					}
				)
			)
			stream
				.pipe(
					map((message: any) => {
						if (typeof message.data.data === 'object') {
							return {
								...message,
								data: {
									...message.data,
									data: omitBy(message.data.data, isNil) // Remove null or undefined values
								}
							}
						}

						return message
					})
				)
				.subscribe()
		})
	}
}
