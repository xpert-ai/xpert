import { OrderTypeEnum } from '@metad/contracts'
import { Agent, DataSourceFactory, DSCoreService } from '@metad/ocap-core'
import { Inject, Injectable, Logger } from '@nestjs/common'
import {
	AnalyticsDSCoreInput,
	AnalyticsIndicatorValidationInput,
	AnalyticsPermissionService,
	AnalyticsResolvedChatBIModel,
	RequirePermissionOperation
} from '@xpert-ai/plugin-sdk'
import { firstValueFrom } from 'rxjs'
import { In } from 'typeorm'
import { ChatBIModelService } from '../../chatbi-model'
import {
	getSemanticModelKey,
	NgmDSCoreService,
	OCAP_AGENT_TOKEN,
	OCAP_DATASOURCES_TOKEN,
	registerSemanticModel
} from '../../model/ocap'

function formatStatementPreview(statement: string, maxLines = 20): string {
	const lines = (statement || '').split(/\r?\n/)
	const preview = lines
		.slice(0, maxLines)
		.map((line, index) => `${String(index + 1).padStart(2, '0')}| ${line}`)
		.join('\n')

	if (lines.length > maxLines) {
		return `${preview}\n... (${lines.length - maxLines} more lines)`
	}

	return preview
}

@Injectable()
export class PluginAnalyticsPermissionService implements AnalyticsPermissionService<DSCoreService> {
	private readonly logger = new Logger(PluginAnalyticsPermissionService.name)

	constructor(
		@Inject(OCAP_AGENT_TOKEN)
		private readonly agent: Agent,
		@Inject(OCAP_DATASOURCES_TOKEN)
		private readonly dataSourceFactories: { type: string; factory: DataSourceFactory }[],
		private readonly chatBIModelService: ChatBIModelService
	) {}

	private async getChatBIModels(modelIds: string[]) {
		if (!modelIds?.length) {
			return []
		}

		const { items } = await this.chatBIModelService.findAll({
			where: { id: In(modelIds) },
			relations: ['model', 'model.dataSource', 'model.dataSource.type', 'model.roles', 'model.indicators'],
			order: {
				visits: OrderTypeEnum.DESC
			}
		})

		for (const id of modelIds) {
			if (!items.some((item) => item.id === id)) {
				throw new Error(`ChatBI model '${id}' not found`)
			}
		}

		return items
	}

	@RequirePermissionOperation('analytics', 'model')
	async resolveChatBIModels(modelIds: string[]): Promise<AnalyticsResolvedChatBIModel[]> {
		const items = await this.getChatBIModels(modelIds ?? [])
		return items.map((item) => ({
			chatbiModelId: item.id,
			modelId: item.modelId,
			modelKey: item.model ? getSemanticModelKey(item.model) : item.modelId,
			cubeName: item.entity,
			entityCaption: item.entityCaption,
			entityDescription: item.entityDescription,
			prompts: item.options?.suggestions ?? []
		}))
	}

	@RequirePermissionOperation('analytics', 'dscore')
	async getDSCoreService(input: AnalyticsDSCoreInput = {}): Promise<DSCoreService> {
		const modelIds = input?.modelIds ?? []
		const semanticModelDraft = input?.semanticModelDraft ?? false
		this.logger.log(
			`[getDSCoreService] Build DSCoreService for chatbiModelIds=${JSON.stringify(modelIds)}, semanticModelDraft=${semanticModelDraft}`
		)
		const dsCoreService = new NgmDSCoreService(this.agent, this.dataSourceFactories)
		const items = await this.getChatBIModels(modelIds)
		this.logger.log(`[getDSCoreService] Register ${items.length} ChatBI models into DSCoreService`)

		items.forEach((item) => {
			if (item.model) {
				const modelKey = getSemanticModelKey(item.model)
				this.logger.log(
					`[getDSCoreService] Register model: chatbiModelId=${item.id}, semanticModelId=${item.modelId}, modelKey=${modelKey}, entity=${item.entity}`
				)
				registerSemanticModel(item.model, semanticModelDraft, dsCoreService)
			} else {
				this.logger.warn(
					`[getDSCoreService] Skip registration because semantic model is missing: chatbiModelId=${item.id}, semanticModelId=${item.modelId}`
				)
			}
		})
		this.logger.log(`[getDSCoreService] DSCoreService registration completed`)

		return dsCoreService
	}

	@RequirePermissionOperation('analytics', 'dscore')
	async visitChatBIModel(modelId: string, cubeName: string): Promise<void> {
		if (!modelId || !cubeName) {
			return
		}
		await this.chatBIModelService.visit(modelId, cubeName)
	}

	@RequirePermissionOperation('analytics', 'create_indicator')
	async ensureCreateIndicatorAccess(): Promise<void> {
		return
	}

	@RequirePermissionOperation('analytics', 'create_indicator')
	async validateIndicatorStatement(input: AnalyticsIndicatorValidationInput): Promise<void> {
		const statement = input?.statement?.trim()
		if (!statement) {
			return
		}

		const modelKey = input.modelKey || input.semanticModelId
		if (!modelKey) {
			throw new Error(`Cannot validate indicator: model key is required`)
		}
		this.logger.warn(
			`[validateIndicatorStatement] Start validation: semanticModelId=${input.semanticModelId}, modelKey=${modelKey}, modelIds=${JSON.stringify(
				input?.modelIds ?? []
			)}`
		)
		this.logger.warn(`[validateIndicatorStatement] Statement preview:\n${formatStatementPreview(statement)}`)

		const dsCoreService = await this.getDSCoreService({
			modelIds: input?.modelIds ?? []
		})
		const dataSource = await firstValueFrom(dsCoreService.getDataSource(modelKey))
		try {
			await firstValueFrom(
				dataSource.query({
					statement,
					forceRefresh: true
				})
			)
			this.logger.warn(
				`[validateIndicatorStatement] Validation passed: semanticModelId=${input.semanticModelId}, modelKey=${modelKey}`
			)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			this.logger.error(
				`[validateIndicatorStatement] Validation failed: ${message}\nStatement:\n${formatStatementPreview(statement)}`
			)
			throw error
		}
	}
}
