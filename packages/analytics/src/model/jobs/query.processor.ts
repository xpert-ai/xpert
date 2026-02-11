import { ISemanticModelQueryLog, QueryStatusEnum, TGatewayQueryEvent } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { runWithRequestContext, UserService } from '@metad/server-core'
import { ExecutionQueueService } from '@metad/server-ai'
import { Process, Processor } from '@nestjs/bull'
import { forwardRef, Inject } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Job } from 'bull'
import { EventsGateway } from '../../agent/agent.gateway'
import { DataSourceOlapQuery } from '../../data-source'
import { LogOneQuery } from '../../model-query-log/queries/log-one.query'
import { ModelQueryLogUpsertCommand } from '../../model-query-log/commands/upsert.command'
import { ModelCubeQuery, ModelOlapQuery } from '../queries'
import { QUERY_QUEUE_NAME } from '../types'

@Processor(QUERY_QUEUE_NAME)
export class ModelQueryProcessor {
	constructor(
		@Inject(forwardRef(() => EventsGateway))
		private readonly gateway: EventsGateway,
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus,
		private readonly userService: UserService,
		private readonly executionQueue: ExecutionQueueService
	) {}

	@Process({ concurrency: 20 })
	async handleQuery(job: Job<{ sessionId: string; userId: string; logId: string; data: TGatewayQueryEvent }>) {
		const { sessionId, userId, logId, data: event } = job.data
		const {
			id,
			tenantId,
			organizationId,
			dataSourceId,
			modelId,
			body,
			acceptLanguage,
			forceRefresh,
			isDraft
		} = event

		const user = await this.userService.findOne(userId)
		const log = await this.queryBus.execute<LogOneQuery, ISemanticModelQueryLog>(
			new LogOneQuery(logId)
		)

		const abortController = new AbortController()
		const runId = this.executionQueue.generateRunId()
		const sessionKey = this.executionQueue.sessionKeyResolver.resolveForAnalytics({
			sessionId,
			modelId
		})

		try {
			await this.executionQueue.run({
				runId,
				sessionKey,
				globalLane: 'main',
				abortController,
				source: 'analytics',
				task: async () => {
					const timeStart = Date.now()
					const waitingTime = timeStart - log.createdAt.getTime()
					await this.commandBus.execute(
						new ModelQueryLogUpsertCommand({
							id: logId,
							status: QueryStatusEnum.RUNNING,
							waitingTime
						})
					)

					await this.runInContext(
						{
							user,
							organizationId,
							language: acceptLanguage
						},
						async () => {
							let error = null
							let status = QueryStatusEnum.SUCCESS
							let resultData = null

							try {
								let result = null
								if (modelId) {
									if (typeof body === 'string') {
										result = await this.queryBus.execute(
											new ModelOlapQuery(
												{
													id,
													tenantId,
													organizationId,
													sessionId,
													dataSourceId,
													modelId,
													body,
													acceptLanguage,
													forceRefresh,
													isDraft
												},
												user
											)
										)
									} else {
										result = await this.queryBus.execute(
											new ModelCubeQuery(
												{
													id,
													tenantId,
													organizationId,
													sessionId,
													dataSourceId,
													modelId,
													body,
													acceptLanguage,
													forceRefresh,
													isDraft
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

								resultData = result.data

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
										result: resultData
									})
								)
							}
						}
					)
				}
			})
		} catch (err) {
			const error = getErrorMessage(err)
			await this.commandBus.execute(
				new ModelQueryLogUpsertCommand({
					id: logId,
					status: QueryStatusEnum.FAILED,
					error
				})
			)
			this.gateway.sendQueryResult(sessionId, {
				id,
				status: 500,
				statusText: error ?? 'Internal Server Error',
				data: error
			})
		}
	}

	private runInContext<T>(
		params: {
			user: any
			organizationId: string
			language?: string
		},
		task: () => Promise<T>
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			runWithRequestContext(
				{
					user: params.user,
					headers: {
						['organization-id']: params.organizationId,
						language: params.language
					}
				},
				() => {
					task().then(resolve).catch(reject)
				}
			)
		})
	}
}
