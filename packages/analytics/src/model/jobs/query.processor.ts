import { ISemanticModelQueryLog, QueryStatusEnum } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { runWithRequestContext, UserService } from '@metad/server-core'
import { Process, Processor } from '@nestjs/bull'
import { forwardRef, Inject } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Job } from 'bull'
import { EventsGateway } from '../../agent/agent.gateway'
import { DataSourceOlapQuery } from '../../data-source'
import { LogOneQuery } from '../../model-query-log'
import { ModelQueryLogUpsertCommand } from '../../model-query-log/commands'
import { ModelCubeQuery, ModelOlapQuery } from '../queries'
import { QUERY_QUEUE_NAME, TGatewayQuery } from '../types'

@Processor(QUERY_QUEUE_NAME)
export class ModelQueryProcessor {
	constructor(
		@Inject(forwardRef(() => EventsGateway))
		private readonly gateway: EventsGateway,
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus,
		private readonly userService: UserService
	) {}

	@Process({concurrency: 20})
	async handleQuery(job: Job<{ sessionId: string; userId: string; logId: string; data: TGatewayQuery }>) {
		const { sessionId, userId, logId, data } = job.data
		const { id, organizationId, dataSourceId, modelId, body, acceptLanguage, forceRefresh } = data
		const user = await this.userService.findOne(userId)

		const timeStart = Date.now()
		const log = await this.queryBus.execute<LogOneQuery, ISemanticModelQueryLog>(new LogOneQuery(logId))
		const waitingTime = timeStart - log.createdAt.getTime()
		await this.commandBus.execute(
			new ModelQueryLogUpsertCommand({
				id: logId,
				status: QueryStatusEnum.RUNNING,
				waitingTime
			})
		)

		runWithRequestContext({ user: user, headers: { ['organization-id']: organizationId } }, async () => {
			let error = null
			let status = QueryStatusEnum.SUCCESS
			let data = null
			try {
				let result = null
				if (modelId) {
					if (typeof body === 'string') {
						result = await this.queryBus.execute(
							new ModelOlapQuery(
								{
									id,
									sessionId,
									dataSourceId,
									modelId,
									body,
									acceptLanguage,
									forceRefresh
								},
								user
							)
						)
					} else {
						result = await this.queryBus.execute(
							new ModelCubeQuery(
								{
									id,
									sessionId,
									dataSourceId,
									modelId,
									body,
									acceptLanguage,
									forceRefresh
								},
								user
							)
						)
					}
				} else {
					result = await this.queryBus.execute(
						new DataSourceOlapQuery(
							{
								id,
								sessionId,
								dataSourceId,
								body: body as unknown as string,
								forceRefresh,
								acceptLanguage
							},
							user
						)
					)
				}

				data = result.data

				this.gateway.sendQueryResult(sessionId, {
					id,
					status: 200,
					data: result.data,
					cache: result.cache
				})
			} catch (err) {
				error = getErrorMessage(err)
				status = QueryStatusEnum.FAILED
				this.gateway.sendQueryResult(sessionId, {
					id,
					status: 500,
					statusText: error ?? 'Internal Server Error',
					data: error
				})
			} finally {
				const timeEnd = Date.now()
				await this.commandBus.execute(
					new ModelQueryLogUpsertCommand({
						id: logId,
						error,
						status,
						executionTime: timeEnd - timeStart,
						result: data
					})
				)
			}
		})
	}
}
