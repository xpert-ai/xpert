import { BaseStore } from '@langchain/langgraph'
import { EmbeddingStatusEnum } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { InjectQueue } from '@nestjs/bull'
import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Queue } from 'bull'
import { ILike, Repository } from 'typeorm'
import { BusinessAreaAwareCrudService } from '../core/crud/index'
import { CreateProjectStoreCommand } from '../project/commands'
import { IndicatorCreateCommand } from './commands'
import { IndicatorPublicDTO } from './dto'
import { Indicator } from './indicator.entity'
import {
	createIndicatorNamespace,
	EMBEDDING_INDICATOR_FIELDS,
	JOB_EMBEDDING_INDICATORS,
	TJobEmbeddingIndicators
} from './types'

@Injectable()
export class IndicatorService extends BusinessAreaAwareCrudService<Indicator> {
	constructor(
		@InjectRepository(Indicator)
		indicatorRepository: Repository<Indicator>,
		@InjectQueue(JOB_EMBEDDING_INDICATORS) private indicatorQueue: Queue<TJobEmbeddingIndicators>,
		readonly commandBus: CommandBus
	) {
		super(indicatorRepository, commandBus)
	}

	public async search(text: string) {
		let where = null
		if (text) {
			text = `%${text}%`
			where = [
				{
					code: ILike(text)
				},
				{
					name: ILike(text)
				},
				{
					business: ILike(text)
				}
			]
		}
		const condition = await this.myBusinessAreaConditions({
			where,
			order: {
				updatedAt: 'DESC'
			},
			take: 20
		})

		const [items, total] = await this.repository.findAndCount(condition)

		return {
			total,
			items: items.map((item) => new IndicatorPublicDTO(item))
		}
	}

	async createBulk(indicators: Indicator[]) {
		const results = []
		for await (const indicator of indicators) {
			results.push(await this.commandBus.execute(new IndicatorCreateCommand(indicator)))
		}
		return results
	}

	async deleteById(id: string) {
		const indicator = await this.findOne(id)

		const store = await this.commandBus.execute<CreateProjectStoreCommand, BaseStore>(
			new CreateProjectStoreCommand({ index: { fields: EMBEDDING_INDICATOR_FIELDS } })
		)
		await store.delete(createIndicatorNamespace(indicator.projectId), indicator.code)

		await this.delete(id)
	}

	async startEmbedding(projectId: string) {
		const { items } = await this.findMy({ where: { projectId } })
		const indicators = items.filter((_) => _.isActive && _.visible && _.code)
		indicators.forEach((indicator) => {
			indicator.embeddingStatus = EmbeddingStatusEnum.REQUIRED
			indicator.error = null
		})
		await this.repository.save(indicators)

		const job = await this.indicatorQueue.add({
			userId: RequestContext.currentUserId(),
			projectId
		})
	}
}
