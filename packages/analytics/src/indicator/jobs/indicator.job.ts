import { BaseStore } from '@langchain/langgraph'
import { EmbeddingStatusEnum } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { runWithRequestContext, UserService } from '@metad/server-core'
import { JOB_REF, Process, Processor } from '@nestjs/bull'
import { Inject, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Job } from 'bull'
import { CreateProjectStoreCommand } from '../../project'
import { IndicatorService } from '../indicator.service'
import {
	createIndicatorNamespace,
	EMBEDDING_INDICATOR_FIELDS,
	JOB_EMBEDDING_INDICATORS,
	pickEmbeddingIndicator,
	TJobEmbeddingIndicators
} from '../types'

@Processor({
	name: JOB_EMBEDDING_INDICATORS
})
export class EmbeddingIndicatorsConsumer {
	private readonly logger = new Logger(EmbeddingIndicatorsConsumer.name)

	constructor(
		@Inject(JOB_REF) jobRef: Job<TJobEmbeddingIndicators>,
		private readonly indicatorService: IndicatorService,
		private readonly userService: UserService,
		private readonly commandBus: CommandBus
	) {}

	@Process({ concurrency: 5 })
	async process(job: Job<TJobEmbeddingIndicators>) {
		const userId = job.data.userId
		const projectId = job.data.projectId
		const user = await this.userService.findOne(userId, { relations: ['role'] })
		const { items, total } = await this.indicatorService.findAll({
			where: {
				projectId: projectId,
				embeddingStatus: EmbeddingStatusEnum.REQUIRED
			},
			relations: ['tags', 'certification']
		})
		if (!total) {
			return
		}

		runWithRequestContext({ user: user, headers: { ['organization-id']: items[0].organizationId } }, async () => {
			const store = await this.commandBus.execute<CreateProjectStoreCommand, BaseStore>(
				new CreateProjectStoreCommand({ index: { fields: EMBEDDING_INDICATOR_FIELDS } })
			)
			const indicators = items.map(pickEmbeddingIndicator)

			for await (const indicator of indicators) {
				try {
					await store.put(createIndicatorNamespace(projectId), indicator.code, indicator)
					await this.indicatorService.update(indicator.id, {
						embeddingStatus: EmbeddingStatusEnum.SUCCESS,
						error: null
					})
				} catch (err) {
					await this.indicatorService.update(indicator.id, {
						embeddingStatus: EmbeddingStatusEnum.FAILED,
						error: getErrorMessage(err)
					})
				}
			}
		})
	}
}
