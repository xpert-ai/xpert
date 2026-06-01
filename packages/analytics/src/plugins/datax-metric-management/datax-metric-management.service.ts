import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { ToolMessage } from '@langchain/core/messages'
import { BaseStore, Command, getStore, interrupt, LangGraphRunnableConfig } from '@langchain/langgraph'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
	BIInterruptMessageType,
	ChatDashboardMessageType,
	ChatMessageEventTypeEnum,
	ChatMessageStepCategory,
	configurableStoreNamespace,
	getStoreNamespace,
	getToolCallIdFromConfig,
	IIndicator,
	IProject,
	ISemanticModel,
	IndicatorType,
	TIndicatorDraft,
	TInterruptMessage,
	TMessageComponent,
	TMessageContentIndicator,
	XpertViewQuery
} from '@xpert-ai/contracts'
import {
	AggregationRole,
	C_MEASURES,
	DataSettings,
	EntityType,
	getEntityCalendar,
	getEntityHierarchy,
	getEntityProperty,
	getEntityProperty2,
	isEntitySet,
	markdownModelCube,
	PropertyDimension,
	PropertyLevel,
	suuid,
	wrapBrackets
} from '@xpert-ai/ocap-core'
import { environment } from '@xpert-ai/server-config'
import { getErrorMessage, race, TimeoutError } from '@xpert-ai/server-common'
import { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { groupBy } from 'lodash'
import { firstValueFrom, switchMap } from 'rxjs'
import { FindOptionsOrder, ILike } from 'typeorm'
import { GetBIContextQuery } from '../../ai/queries'
import { TBIContext } from '../../ai/types'
import { updateOcapIndicators } from '../../ai/toolset/builtin/bi-toolset'
import { markdownIndicators, markdownModelCubes, tryFixFormula } from '../../ai/toolset/types'
import { applyIndicatorDraft, createIndicatorNamespace, IndicatorService } from '../../indicator'
import { Indicator } from '../../indicator/indicator.entity'
import { RetrieveMembersCommand } from '../../model-member'
import { CreateProjectStoreCommand, ProjectGetQuery, ProjectMyQuery } from '../../project'
import { MEMORY_BI_PROJECT_ID_KEY } from './constants'
import {
	BasicIndicatorInput,
	DeleteIndicatorInput,
	DeriveIndicatorInput,
	DimensionMemberRetrieverInput,
	GetCubeContextInput,
	IndicatorRetrieverInput,
	IndicatorsVariableEnum,
	ListIndicatorsInput,
	MetricState,
	ShowIndicatorsInput,
	SwitchProjectInput
} from './schemas'

const MAXIMUM_CUBE_CONTEXT_WAIT_TIME = 3000

type ProjectListResult = {
	items: IProject[]
	total: number
}

export type MetricRow = {
	id: string
	code?: string
	name?: string
	type?: string
	status?: string
	modelId?: string
	modelName?: string
	entity?: string
	business?: string
	unit?: string
	embeddingStatus?: string
	visible?: boolean
	updatedAt?: Date
	draft?: unknown
	options?: unknown
}

type ModelOptionSource = {
	id?: string
	name?: string
	title?: string
}

@Injectable()
export class DataXMetricManagementService {
	private readonly logger = new Logger(DataXMetricManagementService.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly indicatorService: IndicatorService
	) {}

	createSession(context: IAgentMiddlewareContext) {
		return new DataXMetricManagementSession(
			this.commandBus,
			this.queryBus,
			this.indicatorService,
			context,
			this.logger
		)
	}

	async loadProjects(): Promise<IProject[]> {
		const result = await this.queryBus.execute<unknown, ProjectListResult>(
			new ProjectMyQuery({
				relations: ['models']
			})
		)
		return result.items
	}

	async getViewData(
		query: XpertViewQuery
	): Promise<{ items: MetricRow[]; total: number; meta?: Record<string, unknown> }> {
		const projectId = getStringInput(query.parameters, 'projectId')
		if (!projectId) {
			return {
				items: [],
				total: 0,
				meta: {
					reason: 'project_required'
				}
			}
		}

		const modelId = getStringInput(query.parameters, 'modelId')
		const page = query.page ?? 1
		const pageSize = query.pageSize ?? 20
		const result = await this.indicatorService.findMy({
			where: buildIndicatorWhere(projectId, modelId, query.search),
			relations: ['model'],
			take: pageSize,
			skip: (page - 1) * pageSize,
			order: buildIndicatorOrder(query.sortBy, query.sortDirection)
		})

		return {
			items: result.items.map(toMetricRow),
			total: result.total
		}
	}

	async createViewDraft(projectId: string, input: Record<string, unknown> | null | undefined) {
		const draft = toIndicatorDraft(input)
		if (!draft.code || !draft.name) {
			throw new Error('Metric code and name are required')
		}
		const isValid = await this.indicatorService.checkCodeUnique(draft.code, projectId)
		if (!isValid) {
			throw new Error(`The code '${draft.code}' already exists in the project '${projectId}'`)
		}
		return this.indicatorService.createDraft(draft, projectId)
	}

	async updateViewDraft(id: string, input: Record<string, unknown> | null | undefined) {
		return this.indicatorService.updateDraft(id, toIndicatorDraft(input))
	}

	async publishIndicator(id: string) {
		return this.indicatorService.publish(id)
	}

	async embeddingIndicator(id: string) {
		return this.indicatorService.embedding(id)
	}

	async deleteIndicatorById(id: string) {
		return this.indicatorService.deleteById(id)
	}
}

export class DataXMetricManagementSession {
	private project: IProject | null = null
	private biContext: TBIContext | null = null

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly indicatorService: IndicatorService,
		private readonly context: IAgentMiddlewareContext,
		private readonly logger: Logger
	) {}

	get models() {
		return this.biContext?.models ?? []
	}

	async init() {
		const store = this.getRuntimeStore()
		if (store) {
			const namespace = configurableStoreNamespace(this.context)
			const memory = await store.get(namespace, MEMORY_BI_PROJECT_ID_KEY)
			const projectId = memory?.value?.projectId as string
			if (projectId) {
				await this.switchProject(projectId)
				return
			}
		}

		this.biContext = await this.queryBus.execute<GetBIContextQuery, TBIContext>(new GetBIContextQuery())
		this.decorateBIContext()
	}

	createInitialState(state: MetricState = {}, defaultPrompt: string) {
		return {
			tool_indicators_prompts_default: state.tool_indicators_prompts_default || defaultPrompt,
			tool_indicators_cubes: state.tool_indicators_cubes || markdownModelCubes(this.models),
			[IndicatorsVariableEnum.INDICATORS]: state[IndicatorsVariableEnum.INDICATORS] ?? {}
		}
	}

	async switchProject(projectId: string) {
		const project = await this.queryBus.execute<ProjectGetQuery, IProject>(
			new ProjectGetQuery({
				id: projectId,
				options: {
					relations: ['models']
				}
			})
		)
		const modelIds = project.models?.map((model) => model.id).filter(Boolean) ?? []
		this.biContext = await this.queryBus.execute<GetBIContextQuery, TBIContext>(
			new GetBIContextQuery(modelIds, { indicatorDraft: true })
		)
		this.decorateBIContext()
		this.project = {
			...project,
			models: this.models.length ? this.models : project.models
		}
		return this.project
	}

	async switchProjectTool(input: SwitchProjectInput, config: LangGraphRunnableConfig) {
		const project = input.project_id
			? await this.switchProject(input.project_id)
			: await this.interruptBIProject(config, input)
		const content = JSON.stringify({
			message: `Project with ID '${project.id}' has been initialized successfully.`,
			projectId: project.id
		})

		return new Command({
			update: {
				tool_indicators_cubes: markdownModelCubes(this.models),
				messages: [
					new ToolMessage({
						content,
						tool_call_id: getToolCallIdFromConfig(config)
					})
				]
			}
		})
	}

	async listCubesTool(_input: Record<string, never>, config: LangGraphRunnableConfig) {
		await this.interruptBIProject(config, {})
		return markdownModelCubes(this.models)
	}

	async listIndicatorsTool(input: ListIndicatorsInput, config: LangGraphRunnableConfig) {
		const project = await this.interruptBIProject(config, {})
		const where: Record<string, string> = { projectId: project.id }
		if (input.model_id) {
			where.modelId = input.model_id
		}
		if (input.cube_name) {
			where.entity = input.cube_name
		}

		const { items, total } = await this.indicatorService.findAll({ where })
		const indicators = items.map(applyIndicatorDraft)
		await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
			id: getToolCallIdFromConfig(config),
			category: 'Dashboard',
			type: ChatDashboardMessageType.ListIndicators,
			message: `(${total})`,
			data: indicators.map((item) => item.id)
		})
		return markdownIndicators(indicators)
	}

	async createBasicIndicatorTool(input: BasicIndicatorInput, config: LangGraphRunnableConfig) {
		if (!input.measure) {
			throw new Error('The measure field of indicator cannot be empty')
		}

		const project = await this.interruptBIProject(config, {})
		await this.assertCodeUnique(input.code, project.id)
		this.checkModelCube(input.modelId, input.cube)
		await this.dispatchToolMessage(config, input.name + ` [${input.code}]`)

		const entityType = await this.loadEntityType(input.modelId, input.cube)
		this.checkCalendar(entityType, input.calendar, input.cube)
		this.checkBasicFilters(entityType, input.filters, input.cube)

		const draft: TIndicatorDraft = {
			...input,
			entity: input.cube,
			business: input.description,
			type: IndicatorType.BASIC,
			visible: true,
			options: {
				calendar: input.calendar,
				filters: input.filters?.map((filter) => ({
					dimension: {
						dimension: filter.dimension,
						hierarchy: filter.hierarchy || null
					},
					members: [
						{
							key: filter.member
						}
					]
				})),
				measure: input.measure
			}
		}

		const indicator = await this.indicatorService.createDraft(draft, project.id)
		await updateOcapIndicators(this.getBIContext().dsCoreService, [indicator], {
			logger: this.logger,
			isDraft: true
		})
		await this.dispatchIndicatorCreated(config, draft, indicator)
		return this.indicatorCommand(config, draft, {
			message: `The basic indicator with code '${input.code}' has been created.`,
			projectId: project.id,
			modelId: draft.modelId,
			indicatorId: indicator.id
		})
	}

	async createDeriveIndicatorTool(input: DeriveIndicatorInput, config: LangGraphRunnableConfig) {
		if (!input.formula) {
			throw new Error('The formula of indicator cannot be empty')
		}

		const project = await this.interruptBIProject(config, {})
		await this.assertCodeUnique(input.code, project.id)
		this.checkModelCube(input.modelId, input.cube)
		await this.dispatchToolMessage(config, input.name + ` [${input.code}]`)

		const formula = tryFixFormula(input.formula, input.code)
		await this.testFormula(input, formula)
		const entityType = await this.loadEntityType(input.modelId, input.cube)
		this.checkCalendar(entityType, input.calendar, input.cube)

		const draft: TIndicatorDraft = {
			...input,
			entity: input.cube,
			business: input.description,
			type: IndicatorType.DERIVE,
			visible: true,
			options: {
				calendar: input.calendar,
				formula
			}
		}

		const indicator = await this.indicatorService.createDraft(draft, project.id)
		await updateOcapIndicators(this.getBIContext().dsCoreService, [indicator], {
			logger: this.logger,
			isDraft: true
		})
		await this.dispatchIndicatorCreated(config, draft, indicator)
		return this.indicatorCommand(config, draft, {
			message: `The indicator with code '${input.code}' has been created.`,
			projectId: project.id,
			modelId: draft.modelId,
			indicatorId: indicator.id
		})
	}

	async editIndicatorTool(input: DeriveIndicatorInput, config: LangGraphRunnableConfig) {
		if (!input.formula) {
			throw new Error('The formula of indicator cannot be empty')
		}

		const project = await this.interruptBIProject(config, {})
		await this.dispatchToolMessage(config, input.name || input.code)
		const { record, success } = await this.indicatorService.findOneOrFailByWhereOptions({
			code: input.code,
			projectId: project.id
		})
		if (!success) {
			throw new Error(`The indicator code '${input.code}' does not exist in the project '${project.id}'`)
		}

		this.checkModelCube(input.modelId, input.cube)
		const formula = tryFixFormula(input.formula, input.code)
		await this.testFormula(input, formula)
		const draft: TIndicatorDraft = {
			...input,
			entity: input.cube,
			business: input.description,
			type: IndicatorType.DERIVE,
			visible: true,
			options: {
				calendar: input.calendar,
				formula
			}
		}
		const indicator = await this.indicatorService.updateDraft(record.id, draft)
		await updateOcapIndicators(this.getBIContext().dsCoreService, [indicator], {
			logger: this.logger,
			isDraft: true
		})
		await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
			id: getToolCallIdFromConfig(config),
			category: 'Dashboard',
			type: ChatDashboardMessageType.Indicator,
			data: {
				indicatorId: indicator.id
			}
		} as TMessageComponent<TMessageContentIndicator>)
		return this.indicatorCommand(config, draft, {
			message: `The indicator with code '${input.code}' has been updated.`,
			projectId: project.id,
			modelId: draft.modelId,
			indicatorId: indicator.id
		})
	}

	async deleteIndicatorTool(input: DeleteIndicatorInput, config: LangGraphRunnableConfig) {
		if (!input.code) {
			throw new Error('The code of indicator cannot be empty')
		}

		const project = await this.interruptBIProject(config, {})
		const { record: indicator, success } = await this.indicatorService.findOneOrFailByWhereOptions({
			code: input.code,
			projectId: project.id
		})
		if (!success) {
			throw new Error(`The indicator code '${input.code}' does not exist in the project '${project.id}'`)
		}

		const confirm = await this.interruptDeleteIndicator(indicator)
		if (!confirm) {
			await this.dispatchToolMessage(config, `[rejected by user] ${indicator.code}`)
			return JSON.stringify({
				message: `Deletion of indicator with code '${input.code}' has been rejected by user.`,
				projectId: project.id,
				indicatorId: indicator.id,
				rejected: true
			})
		}

		await this.dispatchToolMessage(config, indicator.name + `[${indicator.code}]`)
		await this.indicatorService.deleteById(indicator.id)
		return JSON.stringify({
			message: `Indicator with code '${input.code}' has been deleted successfully.`,
			projectId: project.id,
			indicatorId: indicator.id
		})
	}

	async indicatorRetrieverTool(input: IndicatorRetrieverInput, config: LangGraphRunnableConfig) {
		const project = await this.interruptBIProject(config, {})
		const toolCallId = getToolCallIdFromConfig(config)
		await this.dispatchToolMessage(config, input.query)

		try {
			const projectStore = await this.commandBus.execute<CreateProjectStoreCommand, BaseStore>(
				new CreateProjectStoreCommand({})
			)
			const indicators: IIndicator[] = []
			const namespace = createIndicatorNamespace(project.id)
			const items = await projectStore.search(namespace, { query: input.query, limit: input.limit })
			indicators.push(...items.map((item) => item.value))

			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				id: toolCallId,
				category: 'Computer',
				type: ChatMessageStepCategory.List,
				message: input.query + ` (${indicators.length})`,
				data: indicators.map((item) => ({
					url: `${environment.clientBaseUrl}/models/${item.modelId || item.id}/dimension/${item.code}`,
					title: item.name + `[${item.code}]`,
					description: item.business
				}))
			} as TMessageComponent)

			return [indicators.map((item) => JSON.stringify(item, null, 2)).join('\n\n'), indicators]
		} catch (err) {
			this.logger.error(err)
			return [`Error: ${getErrorMessage(err)}`, []]
		}
	}

	async getCubeContextTool(input: GetCubeContextInput, config: LangGraphRunnableConfig) {
		await this.interruptBIProject(config, {})
		await this.dispatchToolMessage(config, input.cube_name)
		this.checkModelCube(input.model_id, input.cube_name)

		try {
			return await race(MAXIMUM_CUBE_CONTEXT_WAIT_TIME, async () => {
				this.logger.debug(`Start get context for (modelId='${input.model_id}', cube='${input.cube_name}')`)
				let entityType: EntityType
				const entitySet = await firstValueFrom(
					this.getBIContext()
						.dsCoreService.getDataSource(this.getModelKey(input.model_id))
						.pipe(switchMap((dataSource) => dataSource.selectEntitySet(input.cube_name)))
				)
				if (isEntitySet(entitySet)) {
					entityType = entitySet.entityType
				} else {
					this.logger.error(`Get context error: ${entitySet.message}`)
				}

				return markdownModelCube({
					modelId: input.model_id,
					dataSource: input.model_id,
					cube: entityType
				})
			})
		} catch (err) {
			if (err instanceof TimeoutError) {
				throw new Error(
					`Timeout for getting context of cube '${input.cube_name}' in model '${input.model_id}', please confirm whether the model information is correct.`
				)
			}
			throw err
		}
	}

	async dimensionMemberRetrieverTool(input: DimensionMemberRetrieverInput, config: LangGraphRunnableConfig) {
		await this.interruptBIProject(config, {})
		const dataSource = await firstValueFrom(
			this.getBIContext().dsCoreService.getDataSource(this.getModelKey(input.modelId))
		)
		const entityType = await firstValueFrom(dataSource.selectEntityType(input.cube))
		if (entityType instanceof Error) {
			throw entityType
		}

		let { dimension, hierarchy } = input
		if (dimension) {
			dimension = wrapBrackets(dimension)
			const property = getEntityProperty2<PropertyDimension>(entityType, dimension)
			if (!property) {
				throw new Error(t('Error.NoPropertyFoundFor', { ns: 'core', cube: entityType.name, name: dimension }))
			}
			if (property.semantics?.disableEmbeddingMembers) {
				return t('Error.DimensionEmbeddingDisabled', { ns: 'core', cube: entityType.name, name: dimension })
			}
			if (property.role === AggregationRole.hierarchy || property.role === AggregationRole.level) {
				dimension = property.dimension
			}
		}
		if (hierarchy) {
			hierarchy = wrapBrackets(hierarchy)
			const property = getEntityProperty2(entityType, hierarchy)
			if (!property) {
				throw new Error(t('Error.NoPropertyFoundFor', { ns: 'core', cube: entityType.name, name: hierarchy }))
			}
			if (property.role === AggregationRole.level) {
				hierarchy = (property as PropertyLevel).hierarchy
			}
		}
		if (input.level) {
			const property = getEntityProperty2(entityType, input.level)
			if (!property) {
				throw new Error(t('Error.NoPropertyFoundFor', { ns: 'core', cube: entityType.name, name: input.level }))
			}
		}

		const docs = await this.commandBus.execute(
			new RetrieveMembersCommand(input.query || '*', {
				dsCoreService: this.getBIContext().dsCoreService,
				modelId: input.modelId,
				cube: input.cube,
				dimension,
				hierarchy,
				level: input.level,
				topK: input.topK,
				reEmbedding: input.re_embedding
			})
		)

		await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
			id: getToolCallIdFromConfig(config),
			category: 'Computer',
			type: ChatMessageStepCategory.Knowledges,
			data: docs.map(([doc]) => doc)
		})
		return docs.map(([doc]) => `- Caption: ${doc.metadata.caption || ''}; Key: \`${doc.metadata.key}\``).join('\n')
	}

	async showIndicatorsTool(input: ShowIndicatorsInput, config: LangGraphRunnableConfig) {
		const dataSource = await this.getBIContext().dsCoreService._getDataSource(this.getModelKey(input.modelId))
		const cubes = groupBy(input.indicators, 'cube')
		for await (const cube of Object.keys(cubes)) {
			const entityType = await firstValueFrom(dataSource.selectEntityType(cube))
			if (entityType instanceof Error) {
				throw entityType
			}

			for await (const indicator of cubes[cube]) {
				const metric = dataSource.getIndicator(indicator.indicator, indicator.cube)
				if (!metric) {
					const property = getEntityProperty(entityType, indicator.indicator)
					if (!property) {
						throw new Error(
							t('analytics:Error.IndicatorNotFoundInCube', {
								cube: indicator.cube,
								indicator: indicator.indicator
							})
						)
					}
				}
			}

			const toolCallId = getToolCallIdFromConfig(config)
			try {
				getEntityCalendar(entityType)
				await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
					id: toolCallId,
					category: 'Dashboard',
					type: 'Indicators',
					indicators: cubes[cube].map((indicator) => ({
						...indicator,
						dataSource: input.modelId,
						entitySet: indicator.cube,
						indicatorCode: indicator.indicator,
						isDraft: true
					}))
				} as TMessageComponent)
			} catch (err) {
				for await (const indicator of cubes[cube]) {
					await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
						id: toolCallId,
						category: 'Dashboard',
						type: 'KPI',
						dataSettings: {
							dataSource: input.modelId,
							entitySet: cube,
							KPIAnnotation: {
								DataPoint: {
									Value: {
										dimension: C_MEASURES,
										measure: indicator.indicator
									}
								}
							}
						} as DataSettings
					} as TMessageComponent)
				}
			}
		}

		return 'The detailed data of the indicator list has been visually presented to the user, and you do not need to repeat the indicator information.'
	}

	private async interruptBIProject(
		config: LangGraphRunnableConfig,
		input: { project_id?: string | null; is_new?: boolean | null }
	) {
		if (this.project && !input.is_new && !input.project_id) {
			return this.project
		}
		if (input.project_id) {
			return this.switchProject(input.project_id)
		}

		const store = this.getRuntimeStore(config)
		const namespace = this.getRuntimeStoreNamespace(config)
		const projectId = await this.interruptBIProjectId(store, namespace, input)
		return this.switchProject(projectId)
	}

	private getRuntimeStore(config?: LangGraphRunnableConfig) {
		return extractStore(config?.store ?? safeGetStore() ?? this.context.store)
	}

	private getRuntimeStoreNamespace(config?: LangGraphRunnableConfig) {
		if (config?.configurable) {
			return getStoreNamespace(config)
		}
		return configurableStoreNamespace(this.context)
	}

	private async interruptBIProjectId(
		store: BaseStore | undefined,
		namespace: string[],
		input: { project_id?: string | null; is_new?: boolean | null }
	) {
		const memory = store ? await store.get(namespace, MEMORY_BI_PROJECT_ID_KEY) : null
		let projectId = memory?.value?.projectId as string
		if (!projectId || input.is_new) {
			const value = interrupt<TInterruptMessage<{ projectId?: string }>, { projectId: string }>({
				category: 'BI',
				type: BIInterruptMessageType.SwitchProject,
				title: {
					en_US: 'Switch project',
					zh_Hans: '切换项目'
				},
				message: {
					en_US: 'Please select a project or create a new one',
					zh_Hans: '请选择或创建一个新的项目'
				},
				data: { projectId: input.project_id ?? undefined }
			})

			projectId = value.projectId
			if (store) {
				await store.put(namespace, MEMORY_BI_PROJECT_ID_KEY, { projectId })
			}
		}
		return projectId
	}

	private async interruptDeleteIndicator(indicator: IIndicator) {
		const value = interrupt<TInterruptMessage, { confirm: boolean }>({
			category: 'BI',
			type: BIInterruptMessageType.DeleteArtifact,
			title: {
				en_US: 'Delete indicator: ' + indicator.name,
				zh_Hans: '删除指标: ' + indicator.name
			},
			message: {
				en_US: 'Please confirm the deletion of the indicator: code = ' + indicator.code,
				zh_Hans: '请确认删除指标: code = ' + indicator.code
			}
		})
		return value?.confirm
	}

	private getBIContext() {
		if (!this.biContext) {
			throw new Error('Metric management BI context has not been initialized')
		}
		return this.biContext
	}

	private decorateBIContext() {
		this.biContext = {
			...this.biContext,
			commandBus: this.commandBus,
			queryBus: this.queryBus,
			indicatorService: this.indicatorService,
			logger: this.logger
		} as TBIContext
	}

	private getModel(id: string) {
		return this.models?.find((item) => item.id === id)
	}

	private getModelKey(id: string) {
		const model = this.getModel(id)
		return model?.id ?? id
	}

	private checkModelCube(modelId: string, cubeName: string) {
		const model = this.getModel(modelId)
		if (!model) {
			throw new Error(`Model with ID ${modelId} not found`)
		}
		if (!model.options?.schema?.cubes) {
			throw new Error(`Model with ID ${modelId} has no cubes defined`)
		}

		const cube = model.options.schema.cubes.find((item) => item.name === cubeName)
		if (!cube) {
			throw new Error(`Cube with name ${cubeName} not found in model with ID ${modelId}`)
		}
		return cube
	}

	private async assertCodeUnique(code: string, projectId: string) {
		const isValid = await this.indicatorService.checkCodeUnique(code, projectId)
		if (!isValid) {
			throw new Error(`The code '${code}' already exists in the project '${projectId}'`)
		}
	}

	private async loadEntityType(modelId: string, cube: string) {
		const dataSource = await firstValueFrom(
			this.getBIContext().dsCoreService.getDataSource(this.getModelKey(modelId))
		)
		const entitySet = await firstValueFrom(dataSource.selectEntitySet(cube))
		if (!isEntitySet(entitySet)) {
			throw new Error(`Cannot load runtime entity type for cube '${cube}' of model '${modelId}'`)
		}
		return entitySet.entityType
	}

	private checkCalendar(entityType: EntityType, calendar: string | null | undefined, cube: string) {
		if (!calendar) {
			return
		}
		const property = getEntityHierarchy(entityType, calendar)
		if (!property) {
			throw new Error(`The calendar hierarchy '${calendar}' does not exist in the cube '${cube}'`)
		}
	}

	private checkBasicFilters(
		entityType: EntityType,
		filters: BasicIndicatorInput['filters'] | null | undefined,
		cube: string
	) {
		for (const filter of filters ?? []) {
			const property = getEntityProperty(entityType, filter.dimension)
			if (!property) {
				throw new Error(`The dimension '${filter.dimension}' does not exist in the cube '${cube}'`)
			}
			if (filter.hierarchy && !property.hierarchies?.find((hierarchy) => hierarchy.name === filter.hierarchy)) {
				throw new Error(
					`The hierarchy '${filter.hierarchy}' does not exist in the dimension '${filter.dimension}' of cube '${cube}'`
				)
			}
		}
	}

	private async testFormula(input: DeriveIndicatorInput, formula: string) {
		if (!input.query) {
			return
		}
		const statement = `WITH MEMBER [Measures].[${input.code}] AS ${formula}\n` + input.query
		const dataSource = await firstValueFrom(
			this.getBIContext().dsCoreService.getDataSource(this.getModelKey(input.modelId))
		)
		await firstValueFrom(dataSource.query({ statement, forceRefresh: true, timeout: 1000 * 60 }))
	}

	private async dispatchToolMessage(config: LangGraphRunnableConfig, message: string) {
		await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
			id: getToolCallIdFromConfig(config),
			category: 'Tool',
			message
		})
	}

	private async dispatchIndicatorCreated(
		config: LangGraphRunnableConfig,
		draft: TIndicatorDraft,
		indicator: IIndicator
	) {
		await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
			id: getToolCallIdFromConfig(config),
			category: 'Dashboard',
			type: ChatDashboardMessageType.Indicator,
			data: {
				modelId: draft.modelId,
				indicatorId: indicator.id
			}
		} as TMessageComponent<TMessageContentIndicator>)

		await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
			id: suuid(),
			category: 'Dashboard',
			type: ChatDashboardMessageType.Indicators,
			dataSettings: {
				dataSource: draft.modelId,
				entitySet: draft.entity
			},
			indicators: [
				{
					id: indicator.id,
					dataSource: draft.modelId,
					entitySet: draft.entity,
					cube: draft.entity,
					indicatorCode: draft.code,
					isDraft: true
				}
			]
		} as TMessageComponent)
	}

	private indicatorCommand(
		config: LangGraphRunnableConfig,
		draft: TIndicatorDraft,
		content: Record<string, unknown>
	) {
		return new Command({
			update: {
				[IndicatorsVariableEnum.INDICATORS]: {
					indicators: [draft]
				},
				messages: [
					new ToolMessage({
						tool_call_id: getToolCallIdFromConfig(config),
						content: JSON.stringify(content),
						status: 'success'
					})
				]
			}
		})
	}
}

export function toMetricRow(indicator: IIndicator): MetricRow {
	const model = indicator.model as ModelOptionSource | undefined
	const draft = indicator.draft ?? {}
	const options = (draft as TIndicatorDraft).options ?? indicator.options

	return {
		id: indicator.id,
		code: (draft as TIndicatorDraft).code ?? indicator.code,
		name: (draft as TIndicatorDraft).name ?? indicator.name,
		type: (draft as TIndicatorDraft).type ?? indicator.type,
		status: indicator.status,
		modelId: (draft as TIndicatorDraft).modelId ?? indicator.modelId,
		modelName: model?.name ?? model?.title ?? (draft as TIndicatorDraft).modelId ?? indicator.modelId,
		entity: (draft as TIndicatorDraft).entity ?? indicator.entity,
		business: (draft as TIndicatorDraft).business ?? indicator.business,
		unit: (draft as TIndicatorDraft).unit ?? indicator.unit,
		embeddingStatus: indicator.embeddingStatus,
		visible: (draft as TIndicatorDraft).visible ?? indicator.visible,
		updatedAt: indicator.updatedAt,
		draft: indicator.draft,
		options
	}
}

export function toModelOption(model: unknown) {
	const source = model as ModelOptionSource
	return {
		value: source.id ?? '',
		label: source.name ?? source.title ?? source.id ?? ''
	}
}

export function getStringInput(parameters: Record<string, unknown> | undefined, key: string) {
	const value = parameters?.[key]
	const normalized = Array.isArray(value) ? value[0] : value
	return typeof normalized === 'string' && normalized.trim() ? normalized.trim() : undefined
}

function buildIndicatorWhere(projectId: string, modelId?: string, search?: string) {
	const base = {
		projectId,
		...(modelId ? { modelId } : {})
	}
	const normalizedSearch = search?.trim()

	if (!normalizedSearch) {
		return base
	}

	const pattern = `%${normalizedSearch}%`
	return [
		{ ...base, code: ILike(pattern) },
		{ ...base, name: ILike(pattern) },
		{ ...base, business: ILike(pattern) }
	]
}

function buildIndicatorOrder(sortBy?: string, sortDirection?: string): FindOptionsOrder<Indicator> {
	const direction = sortDirection === 'asc' ? 'ASC' : 'DESC'
	if (
		sortBy === 'code' ||
		sortBy === 'name' ||
		sortBy === 'type' ||
		sortBy === 'status' ||
		sortBy === 'embeddingStatus' ||
		sortBy === 'updatedAt'
	) {
		return { [sortBy]: direction } as FindOptionsOrder<Indicator>
	}

	return { updatedAt: 'DESC' }
}

export function toIndicatorDraft(input: Record<string, unknown> | null | undefined): TIndicatorDraft {
	const source = input ?? {}
	const type = getIndicatorType(source)
	const cube = getOptionalString(source, 'cube') ?? getOptionalString(source, 'entity')
	const description = getOptionalString(source, 'description') ?? getOptionalString(source, 'business')
	const calendar = getOptionalString(source, 'calendar')
	const measure = getOptionalString(source, 'measure')
	const formula = getOptionalString(source, 'formula')
	const options = {
		...(calendar ? { calendar } : {}),
		...(measure ? { measure } : {}),
		...(formula ? { formula } : {}),
		...toViewFilters(source)
	}

	return {
		code: getOptionalString(source, 'code'),
		name: getOptionalString(source, 'name'),
		type,
		modelId: getOptionalString(source, 'modelId'),
		entity: cube,
		business: description,
		unit: getOptionalString(source, 'unit'),
		visible: getOptionalBoolean(source, 'visible') ?? true,
		isApplication: getOptionalBoolean(source, 'isApplication') ?? false,
		options: Object.keys(options).length ? options : undefined
	}
}

function toViewFilters(source: Record<string, unknown>) {
	const filters = Array.isArray(source.filters) ? source.filters : []
	const normalized = filters
		.map((filter) => {
			if (!filter || typeof filter !== 'object') {
				return null
			}
			const value = filter as Record<string, unknown>
			const dimension = getOptionalString(value, 'dimension')
			const member = getOptionalString(value, 'member')
			if (!dimension || !member) {
				return null
			}
			return {
				dimension: {
					dimension,
					hierarchy: getOptionalString(value, 'hierarchy') ?? null
				},
				members: [{ key: member }]
			}
		})
		.filter(Boolean)
	return normalized.length ? { filters: normalized } : {}
}

function getOptionalString(source: Record<string, unknown>, key: string) {
	const value = source[key]
	return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getOptionalBoolean(source: Record<string, unknown>, key: string) {
	const value = source[key]
	return typeof value === 'boolean' ? value : undefined
}

function getIndicatorType(source: Record<string, unknown>) {
	const value = source.type
	if (value === IndicatorType.BASIC || value === IndicatorType.DERIVE) {
		return value
	}
	return IndicatorType.BASIC
}

function safeGetStore(): BaseStore | undefined {
	try {
		return getStore()
	} catch {
		return undefined
	}
}

function extractStore(input?: BaseStore): BaseStore | undefined {
	if (!input) {
		return undefined
	}
	let current = input as BaseStore & { store?: BaseStore }
	while (current?.constructor?.name === 'AsyncBatchedStore' && current.store) {
		current = current.store as BaseStore & { store?: BaseStore }
	}
	return current
}
