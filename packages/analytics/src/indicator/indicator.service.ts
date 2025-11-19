import { BaseStore } from '@langchain/langgraph'
import { ChecklistItem, EmbeddingStatusEnum, IIndicator, IndicatorStatusEnum, mapTranslationLanguage, TIndicatorDraft } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { InjectQueue } from '@nestjs/bull'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Queue } from 'bull'
import { ILike, Repository } from 'typeorm'
import { plainToInstance } from 'class-transformer'
import { I18nService } from 'nestjs-i18n'
import { BusinessAreaAwareCrudService } from '../core/crud/index'
import { CreateProjectStoreCommand } from '../project/commands'
import { IndicatorCreateCommand } from './commands'
import { IndicatorDraftDTO, IndicatorPublicDTO } from './dto'
import { Indicator } from './indicator.entity'
import {
	createIndicatorNamespace,
	EMBEDDING_INDICATOR_FIELDS,
	extractIndicatorDraft,
	JOB_EMBEDDING_INDICATORS,
	TJobEmbeddingIndicators
} from './types'
import { IndicatorValidator } from './validators'


@Injectable()
export class IndicatorService extends BusinessAreaAwareCrudService<Indicator> {
	constructor(
		@InjectRepository(Indicator)
		indicatorRepository: Repository<Indicator>,
		@InjectQueue(JOB_EMBEDDING_INDICATORS) private indicatorQueue: Queue<TJobEmbeddingIndicators>,
		readonly commandBus: CommandBus,
		private readonly i18nService: I18nService,
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

	/**
	 * Batch creation of indicator drafts.
	 * 
	 * @param indicators 
	 * @returns 
	 */
	async createBulk(indicators: Indicator[]) {
		const results = []
		for await (const indicator of indicators) {
			const draft = extractIndicatorDraft(indicator)
			draft.code = indicator.code
			draft.name = indicator.name
			results.push(await this.commandBus.execute(new IndicatorCreateCommand(draft)))
		}
		return results
	}

	async deleteById(id: string) {
		const indicator = await this.findOne(id)

		// Clear indicator from the store
		const store = await this.commandBus.execute<CreateProjectStoreCommand, BaseStore>(
			new CreateProjectStoreCommand({ index: { fields: EMBEDDING_INDICATOR_FIELDS } })
		)
		await store.delete(createIndicatorNamespace(indicator.projectId), indicator.code)

		// Delete from db
		await this.delete(id)
	}

	/**
	 * Start embedding all indicators (Released & visible & code) in a BI Project.
	 * 
	 * @param projectId BI Project ID
	 */
	async startEmbedding(projectId: string) {
		const { items } = await this.findMy({ where: { projectId } })
		const indicators = items.filter((_) => _.status === IndicatorStatusEnum.RELEASED && _.visible && _.code)
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

	async checkCodeUnique(code: string, projectId: string): Promise<boolean> {
		const count = await this.repository.count({
			where: {
				tenantId: RequestContext.currentTenantId(),
				organizationId: RequestContext.getOrganizationId(),
				code,
				projectId
			}
		})
		return count === 0
	}

	async createDraft(draft: TIndicatorDraft, projectId: string): Promise<Indicator> {
		const indicator: IIndicator = {
			code: draft.code,
			name: draft.name,
			entity: draft.entity,
			draft: draft,
			projectId,
			modelId: draft.modelId,
			embeddingStatus: EmbeddingStatusEnum.REQUIRED,
			status: IndicatorStatusEnum.DRAFT
		}

		return await this.create(indicator)
	}

	async updateDraft(id: string, draft: TIndicatorDraft): Promise<Indicator> {
		const indicator = await this.findOne(id)
		if (indicator.draft?.version && indicator.draft.version !== draft.version) {
			throw new NotFoundException(
				await this.i18nService.t('analytics.Error.IndicatorDraftVersionNotFound', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
					args: {
						code: indicator.code,
						version: draft.version
					}
				})
			)
		}
		draft.checklist = await this.validate(draft)
		draft.version = draft?.version ? draft.version + 1 : 1
		draft.savedAt = new Date()
		await this.update(id, { draft })
		return this.findOne(id)
	}

	async validate(draft: TIndicatorDraft) {
		const results: ChecklistItem[] = []

		const issues = await new IndicatorValidator().validate(draft)
		if (issues.length) {
			results.push(...issues)
		}
		return results
	}

	async publish(id: string) {
		const indicator = await this.findOne(id)

		return this.update(
			id,
			{...(indicator.draft ? plainToInstance(
					IndicatorDraftDTO,
					indicator.draft,
					{ excludeExtraneousValues: true }
				) : {}),
				draft: null,
				status: IndicatorStatusEnum.RELEASED,
				embeddingStatus: EmbeddingStatusEnum.REQUIRED,
			}
		)
	}

	/**
	 * Embed indicator into vector store
	 * 
	 * @param id Indicator ID
	 * @returns 
	 */
	async embedding(id: string) {
		const indicator = await this.findOne(id)
		if (indicator.status !== IndicatorStatusEnum.RELEASED) {
			throw new BadRequestException('Indicator must be released before embedding')
		}
		if (!indicator.visible) {
			throw new BadRequestException('Indicator must be visible for embedding')
		}
		const store = await this.commandBus.execute<CreateProjectStoreCommand, BaseStore>(
				new CreateProjectStoreCommand({ index: { fields: EMBEDDING_INDICATOR_FIELDS } })
			)
		const namespace = createIndicatorNamespace(indicator.projectId)
		try {
			await store.put(namespace, indicator.code, indicator)
			await this.update(indicator.id, {
				embeddingStatus: EmbeddingStatusEnum.SUCCESS,
				error: null
			})
		} catch (err) {
			await this.update(indicator.id, {
				embeddingStatus: EmbeddingStatusEnum.FAILED,
				error: getErrorMessage(err)
			})
		}

		return this.findOne(id)
	}
}
