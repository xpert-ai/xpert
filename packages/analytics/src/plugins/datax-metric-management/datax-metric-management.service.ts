import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { getContextVariable } from '@langchain/core/context'
import { ToolMessage } from '@langchain/core/messages'
import { BaseStore, Command, interrupt, LangGraphRunnableConfig } from '@langchain/langgraph'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
	BIInterruptMessageType,
	ChatDashboardMessageType,
	ChatMessageEventTypeEnum,
	ChatMessageStepCategory,
	CONTEXT_VARIABLE_CURRENTSTATE,
	getToolCallIdFromConfig,
	IBusinessArea,
	IIndicator,
	IProject,
	ISemanticModel,
	IUser,
	IndicatorStatusEnum,
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
import { FindOptionsOrder, ILike, In } from 'typeorm'
import { GetBIContextQuery } from '../../ai/queries'
import { TBIContext } from '../../ai/types'
import { updateOcapIndicators } from '../../ai/toolset/builtin/bi-toolset'
import { markdownIndicators, markdownModelCubes, tryFixFormula } from '../../ai/toolset/types'
import { BusinessAreaMyCommand } from '../../business-area/commands/business-area.my.command'
import { applyIndicatorDraft, createIndicatorNamespace, IndicatorService } from '../../indicator'
import { Indicator } from '../../indicator/indicator.entity'
import { RetrieveMembersCommand } from '../../model-member'
import { CreateProjectStoreCommand, ProjectGetQuery, ProjectMyQuery } from '../../project'
import {
	BasicIndicatorInput,
	DeleteIndicatorInput,
	DeriveIndicatorInput,
	DimensionMemberRetrieverInput,
	GetCubeContextInput,
	IndicatorRetrieverInput,
	IndicatorsVariableEnum,
	ListIndicatorsInput,
	MetricScope,
	MetricScopeClearInput,
	MetricScopeInput,
	MetricScopeOptionsInput,
	MetricScopePreviewInput,
	MetricScopeSetInput,
	MetricState,
	ShowIndicatorsInput
} from './schemas'

const MAXIMUM_CUBE_CONTEXT_WAIT_TIME = 3000
const METRIC_SCOPE_SYNC_RETRY_COUNT = 6
const METRIC_SCOPE_SYNC_RETRY_INTERVAL = 50
const METRIC_SCOPE_REQUIRED_MESSAGE =
	'Metric scope is required before metric operations. Call indicator_scope_options to list selectable projects, then call indicator_scope_set with projectId.'

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
	businessAreaId?: string
	businessAreaName?: string
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
	businessAreaId?: string
	businessArea?: BusinessAreaOptionSource
}

type BusinessAreaOptionSource = {
	id?: string
	name?: string
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

	async loadBusinessAreas(projectId?: string, userId?: string): Promise<IBusinessArea[]> {
		const areas = await this.commandBus.execute<BusinessAreaMyCommand, IBusinessArea[]>(
			new BusinessAreaMyCommand(toUserReference(userId))
		)
		if (!projectId) {
			return areas
		}

		const projects = await this.loadProjects()
		const project = projects.find((item) => item.id === projectId)
		const projectAreaIds = new Set(
			(project?.models ?? []).map((model) => (model as ModelOptionSource).businessAreaId).filter(Boolean)
		)
		if (!projectAreaIds.size) {
			return areas
		}
		return areas.filter((area) => area.id && projectAreaIds.has(area.id))
	}

	async getViewData(
		query: XpertViewQuery
	): Promise<{ items: MetricRow[]; total: number; meta?: Record<string, unknown> }> {
		const scope = metricScopeFromViewQuery(query)
		if (!scope.projectId) {
			return {
				items: [],
				total: 0,
				meta: {
					reason: 'project_required'
				}
			}
		}

		const page = query.page ?? 1
		const pageSize = query.pageSize ?? 20
		const result = await this.indicatorService.findMy({
			where: buildIndicatorWhere(scope),
			relations: ['model', 'businessArea'],
			take: pageSize,
			skip: (page - 1) * pageSize,
			order: buildIndicatorOrder(query.sortBy, query.sortDirection)
		})

		return {
			items: result.items.map(toMetricRow),
			total: result.total,
			meta: {
				metricScope: scope,
				scopeSummary: summarizeMetricScope(scope)
			}
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
	private currentMetricScope: MetricScope = {}

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

	get metricScope() {
		return this.currentMetricScope
	}

	async init() {
		this.biContext = await this.queryBus.execute<GetBIContextQuery, TBIContext>(new GetBIContextQuery())
		this.decorateBIContext()
	}

	createInitialState(state: MetricState = {}, defaultPrompt: string) {
		if (state.tool_indicators_scope !== undefined) {
			this.currentMetricScope = normalizeMetricScope(state.tool_indicators_scope)
		}
		return {
			tool_indicators_prompts_default: state.tool_indicators_prompts_default || defaultPrompt,
			tool_indicators_cubes: state.tool_indicators_cubes || markdownModelCubes(this.models),
			tool_indicators_scope: this.currentMetricScope,
			[IndicatorsVariableEnum.INDICATORS]: state[IndicatorsVariableEnum.INDICATORS] ?? {}
		}
	}

	async loadProjectContext(projectId: string) {
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

	async metricScopeGetTool(_input: Record<string, never>, _config: LangGraphRunnableConfig) {
		return JSON.stringify(
			this.metricScopeOutput(this.currentMetricScope, {
				message: this.currentMetricScope.projectId
					? 'Current metric management scope is ready.'
					: `No metric management scope has been selected. ${METRIC_SCOPE_REQUIRED_MESSAGE}`
			})
		)
	}

	async metricScopeSetTool(input: MetricScopeSetInput, config: LangGraphRunnableConfig) {
		const explicitScope = normalizeMetricScopeInput(input)
		const candidateScope = input.replace ? explicitScope : mergeMetricScope(this.currentMetricScope, explicitScope)
		if (!candidateScope.projectId) {
			throw new Error(METRIC_SCOPE_REQUIRED_MESSAGE)
		}
		const nextScope = await this.setActiveMetricScope(candidateScope, config, true)
		return this.metricScopeCommand(config, nextScope, {
			message: 'Metric management scope has been updated.'
		})
	}

	async metricScopeClearTool(input: MetricScopeClearInput, config: LangGraphRunnableConfig) {
		const nextScope =
			input.keep_project && this.currentMetricScope.projectId
				? { projectId: this.currentMetricScope.projectId }
				: {}
		const scope = await this.setActiveMetricScope(nextScope, config, true)
		return this.metricScopeCommand(config, scope, {
			message: input.keep_project
				? 'Metric scope filters have been cleared.'
				: 'Metric management scope has been cleared.'
		})
	}

	async metricScopeOptionsTool(input: MetricScopeOptionsInput, _config: LangGraphRunnableConfig) {
		const scope = mergeMetricScope(this.currentMetricScope, normalizeMetricScopeInput(input))
		const projects = await this.queryBus.execute<unknown, ProjectListResult>(
			new ProjectMyQuery({
				relations: ['models']
			})
		)
		const project = scope.projectId ? projects.items.find((item) => item.id === scope.projectId) : undefined
		const businessAreas = await this.loadAvailableBusinessAreas(scope.projectId)
		const search = scope.search?.toLowerCase()
		const options = {
			projects: projects.items
				.filter((item) => !search || item.name?.toLowerCase().includes(search) || item.id?.includes(search))
				.map((item) => ({ value: item.id, label: item.name ?? item.id })),
			models: (project?.models ?? [])
				.map((model) => toModelOption(model))
				.filter((item) => !search || item.label.toLowerCase().includes(search) || item.value.includes(search)),
			businessAreas: businessAreas
				.filter((area) => !search || area.name?.toLowerCase().includes(search) || area.id?.includes(search))
				.map((area) => ({ value: area.id, label: area.name ?? area.id })),
			statuses: Object.values(IndicatorStatusEnum).map((value) => ({ value, label: value })),
			types: Object.values(IndicatorType).map((value) => ({ value, label: value }))
		}
		return JSON.stringify(
			this.metricScopeOutput(scope, {
				message: 'Metric scope options are ready.',
				options
			})
		)
	}

	async metricScopePreviewTool(input: MetricScopePreviewInput, config: LangGraphRunnableConfig) {
		const scope = await this.tryResolveMetricScope(config, input)
		if (!scope) {
			return JSON.stringify(this.metricScopeRequiredOutput())
		}
		const limit = input.limit ?? 10
		const { items, total } = await this.indicatorService.findMy({
			where: buildIndicatorWhere(scope),
			relations: ['model', 'businessArea'],
			take: limit,
			order: {
				updatedAt: 'DESC'
			}
		})
		return JSON.stringify(
			this.metricScopeOutput(scope, {
				message: `Found ${total} metric(s) in the selected scope.`,
				total,
				items: items.map(toMetricRow)
			})
		)
	}

	async listCubesTool(input: MetricScopeInput, config: LangGraphRunnableConfig) {
		const scope = await this.tryResolveMetricScope(config, input)
		if (!scope) {
			return this.metricScopeRequiredText()
		}
		return markdownModelCubes(this.getScopedModels(scope))
	}

	async listIndicatorsTool(input: ListIndicatorsInput, config: LangGraphRunnableConfig) {
		const scope = await this.tryResolveMetricScope(config, input)
		if (!scope) {
			return this.metricScopeRequiredText()
		}
		const { items, total } = await this.indicatorService.findMy({
			where: buildIndicatorWhere(scope),
			relations: ['model', 'businessArea']
		})
		const indicators = items.map(applyIndicatorDraft)
		await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
			id: getToolCallIdFromConfig(config),
			category: 'Dashboard',
			type: ChatDashboardMessageType.ListIndicators,
			message: `(${total})`,
			data: indicators.map((item) => item.id)
		})
		return [`Scope: ${summarizeMetricScope(scope)}`, markdownIndicators(indicators)].join('\n\n')
	}

	async createBasicIndicatorTool(input: BasicIndicatorInput, config: LangGraphRunnableConfig) {
		if (!input.measure) {
			throw new Error('The measure field of indicator cannot be empty')
		}

		const { projectId, scope, input: scopedInput } = await this.prepareBasicIndicatorInput(input, config)
		await this.assertCodeUnique(scopedInput.code, projectId)
		this.checkModelCube(scopedInput.modelId, scopedInput.cube)
		await this.dispatchToolMessage(config, scopedInput.name + ` [${scopedInput.code}]`)

		const entityType = await this.loadEntityType(scopedInput.modelId, scopedInput.cube)
		this.checkCalendar(entityType, scopedInput.calendar, scopedInput.cube)
		this.checkBasicFilters(entityType, scopedInput.filters, scopedInput.cube)

		const draft: TIndicatorDraft = {
			...scopedInput,
			entity: scopedInput.cube,
			business: scopedInput.description,
			type: IndicatorType.BASIC,
			visible: true,
			options: {
				calendar: scopedInput.calendar,
				filters: scopedInput.filters?.map((filter) => ({
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
				measure: scopedInput.measure
			}
		}

		const indicator = await this.indicatorService.createDraft(draft, projectId)
		await updateOcapIndicators(this.getBIContext().dsCoreService, [indicator], {
			logger: this.logger,
			isDraft: true
		})
		await this.dispatchIndicatorCreated(config, draft, indicator)
		return this.indicatorCommand(config, draft, {
			message: `The basic indicator with code '${scopedInput.code}' has been created.`,
			projectId,
			modelId: draft.modelId,
			businessAreaId: draft.businessAreaId,
			metricScope: scope,
			indicatorId: indicator.id
		})
	}

	async createDeriveIndicatorTool(input: DeriveIndicatorInput, config: LangGraphRunnableConfig) {
		if (!input.formula) {
			throw new Error('The formula of indicator cannot be empty')
		}

		const { projectId, scope, input: scopedInput } = await this.prepareDeriveIndicatorInput(input, config)
		await this.assertCodeUnique(scopedInput.code, projectId)
		this.checkModelCube(scopedInput.modelId, scopedInput.cube)
		await this.dispatchToolMessage(config, scopedInput.name + ` [${scopedInput.code}]`)

		const formula = tryFixFormula(scopedInput.formula, scopedInput.code)
		await this.testFormula(scopedInput, formula)
		const entityType = await this.loadEntityType(scopedInput.modelId, scopedInput.cube)
		this.checkCalendar(entityType, scopedInput.calendar, scopedInput.cube)

		const draft: TIndicatorDraft = {
			...scopedInput,
			entity: scopedInput.cube,
			business: scopedInput.description,
			type: IndicatorType.DERIVE,
			visible: true,
			options: {
				calendar: scopedInput.calendar,
				formula
			}
		}

		const indicator = await this.indicatorService.createDraft(draft, projectId)
		await updateOcapIndicators(this.getBIContext().dsCoreService, [indicator], {
			logger: this.logger,
			isDraft: true
		})
		await this.dispatchIndicatorCreated(config, draft, indicator)
		return this.indicatorCommand(config, draft, {
			message: `The indicator with code '${scopedInput.code}' has been created.`,
			projectId,
			modelId: draft.modelId,
			businessAreaId: draft.businessAreaId,
			metricScope: scope,
			indicatorId: indicator.id
		})
	}

	async editIndicatorTool(input: DeriveIndicatorInput, config: LangGraphRunnableConfig) {
		if (!input.formula) {
			throw new Error('The formula of indicator cannot be empty')
		}

		const { projectId, scope, input: scopedInput } = await this.prepareDeriveIndicatorInput(input, config)
		await this.dispatchToolMessage(config, scopedInput.name || scopedInput.code)
		const { record, success } = await this.indicatorService.findOneOrFailByWhereOptions({
			...buildIndicatorBaseWhere(scope),
			code: scopedInput.code
		})
		if (!success) {
			throw new Error(`The indicator code '${scopedInput.code}' does not exist in the selected metric scope`)
		}

		this.checkModelCube(scopedInput.modelId, scopedInput.cube)
		const formula = tryFixFormula(scopedInput.formula, scopedInput.code)
		await this.testFormula(scopedInput, formula)
		const draft: TIndicatorDraft = {
			...scopedInput,
			entity: scopedInput.cube,
			business: scopedInput.description,
			type: IndicatorType.DERIVE,
			visible: true,
			options: {
				calendar: scopedInput.calendar,
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
			message: `The indicator with code '${scopedInput.code}' has been updated.`,
			projectId,
			modelId: draft.modelId,
			businessAreaId: draft.businessAreaId,
			metricScope: scope,
			indicatorId: indicator.id
		})
	}

	async deleteIndicatorTool(input: DeleteIndicatorInput, config: LangGraphRunnableConfig) {
		if (!input.code) {
			throw new Error('The code of indicator cannot be empty')
		}

		const scope = await this.resolveMetricScope(config, {})
		const { record: indicator, success } = await this.indicatorService.findOneOrFailByWhereOptions({
			...buildIndicatorBaseWhere(scope),
			code: input.code
		})
		if (!success) {
			throw new Error(`The indicator code '${input.code}' does not exist in the selected metric scope`)
		}

		const confirm = await this.interruptDeleteIndicator(indicator)
		if (!confirm) {
			await this.dispatchToolMessage(config, `[rejected by user] ${indicator.code}`)
			return JSON.stringify(
				this.metricScopeOutput(scope, {
					message: `Deletion of indicator with code '${input.code}' has been rejected by user.`,
					indicatorId: indicator.id,
					rejected: true
				})
			)
		}

		await this.dispatchToolMessage(config, indicator.name + `[${indicator.code}]`)
		await this.indicatorService.deleteById(indicator.id)
		return JSON.stringify(
			this.metricScopeOutput(scope, {
				message: `Indicator with code '${input.code}' has been deleted successfully.`,
				indicatorId: indicator.id
			})
		)
	}

	async indicatorRetrieverTool(input: IndicatorRetrieverInput, config: LangGraphRunnableConfig) {
		const scope = await this.tryResolveMetricScope(config, input)
		if (!scope) {
			return [this.metricScopeRequiredText(), []]
		}
		const toolCallId = getToolCallIdFromConfig(config)
		await this.dispatchToolMessage(config, input.query)

		try {
			const projectStore = await this.commandBus.execute<CreateProjectStoreCommand, BaseStore>(
				new CreateProjectStoreCommand({})
			)
			const namespace = createIndicatorNamespace(scope.projectId)
			const items = await projectStore.search(namespace, { query: input.query, limit: input.limit })
			const vectorIndicators = items.map((item) => item.value as IIndicator)
			const codes = vectorIndicators.map((item) => item.code).filter(Boolean)
			const { items: dbIndicators } = codes.length
				? await this.indicatorService.findMy({
						where: {
							...buildIndicatorBaseWhere(scope),
							code: In(codes)
						},
						relations: ['model', 'businessArea']
					})
				: { items: [] }
			const indicatorByCode = new Map<string, IIndicator>(
				dbIndicators
					.filter((indicator) => indicator.code)
					.map((indicator) => [indicator.code, indicator] as [string, IIndicator])
			)
			const indicators = vectorIndicators
				.map((indicator) => (indicator.code ? indicatorByCode.get(indicator.code) : null))
				.filter(Boolean)
				.map((indicator) => applyIndicatorDraft(indicator as IIndicator))

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

			return [
				[
					`Scope: ${summarizeMetricScope(scope)}`,
					indicators.map((item) => JSON.stringify(item, null, 2)).join('\n\n')
				].join('\n\n'),
				indicators
			]
		} catch (err) {
			this.logger.error(err)
			return [`Error: ${getErrorMessage(err)}`, []]
		}
	}

	async getCubeContextTool(input: GetCubeContextInput, config: LangGraphRunnableConfig) {
		const scope = await this.tryResolveMetricScope(config, {})
		if (!scope) {
			return this.metricScopeRequiredText()
		}
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
		const scope = await this.tryResolveMetricScope(config, {})
		if (!scope) {
			return this.metricScopeRequiredText()
		}
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
		const scope = await this.tryResolveMetricScope(config, {
			modelId: input.modelId
		})
		if (!scope) {
			return this.metricScopeRequiredText()
		}
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

	private async resolveMetricScope(config: LangGraphRunnableConfig, input: MetricScopeInput): Promise<MetricScope> {
		const explicit = normalizeMetricScopeInput(input)
		let scope = mergeMetricScope(this.currentMetricScope, explicit)
		if (!scope.projectId) {
			const runtimeScope = await this.waitForRuntimeMetricScope(config)
			if (runtimeScope.projectId) {
				scope = mergeMetricScope(runtimeScope, explicit)
			}
		}
		if (!scope.projectId) {
			throw new Error(METRIC_SCOPE_REQUIRED_MESSAGE)
		} else {
			await this.ensureProjectLoaded(scope.projectId)
		}
		return this.validateMetricScope(scope)
	}

	private async tryResolveMetricScope(config: LangGraphRunnableConfig, input: MetricScopeInput) {
		try {
			return await this.resolveMetricScope(config, input)
		} catch (err) {
			if (getErrorMessage(err).includes(METRIC_SCOPE_REQUIRED_MESSAGE)) {
				return null
			}
			throw err
		}
	}

	private metricScopeRequiredOutput() {
		return this.metricScopeOutput(this.currentMetricScope, {
			message: METRIC_SCOPE_REQUIRED_MESSAGE,
			metricScopeRequired: true
		})
	}

	private metricScopeRequiredText() {
		return [
			METRIC_SCOPE_REQUIRED_MESSAGE,
			'Use indicator_scope_options to inspect selectable projects, then call indicator_scope_set with projectId. Retry the metric operation only after indicator_scope_set has completed.'
		].join('\n')
	}

	private async waitForRuntimeMetricScope(config: LangGraphRunnableConfig) {
		for (let attempt = 0; attempt <= METRIC_SCOPE_SYNC_RETRY_COUNT; attempt += 1) {
			const scope = await this.readRuntimeMetricScope(config)
			if (scope.projectId) {
				return scope
			}
			if (attempt < METRIC_SCOPE_SYNC_RETRY_COUNT) {
				await sleep(METRIC_SCOPE_SYNC_RETRY_INTERVAL)
			}
		}
		return {}
	}

	private async readRuntimeMetricScope(config: LangGraphRunnableConfig) {
		if (this.currentMetricScope.projectId) {
			return this.currentMetricScope
		}

		const currentState = getContextVariable<Record<string, unknown>>(CONTEXT_VARIABLE_CURRENTSTATE)
		const scope = normalizeMetricScope(
			(currentState?.tool_indicators_scope ??
				(config as { state?: Record<string, unknown> } | undefined)?.state
					?.tool_indicators_scope) as MetricScope
		)
		if (scope.projectId) {
			this.currentMetricScope = scope
			return scope
		}
		return {}
	}

	private async setActiveMetricScope(scope: MetricScope, config: LangGraphRunnableConfig, replace: boolean) {
		const nextScope = await this.validateMetricScope(
			replace ? scope : mergeMetricScope(this.currentMetricScope, scope)
		)
		if (nextScope.projectId) {
			await this.ensureProjectLoaded(nextScope.projectId)
		}
		this.currentMetricScope = nextScope
		return nextScope
	}

	private async validateMetricScope(scope: MetricScope): Promise<MetricScope> {
		const normalized = normalizeMetricScope(scope)
		if (!normalized.projectId) {
			return normalized
		}

		await this.ensureProjectLoaded(normalized.projectId)
		const modelIds = new Set(this.models.map((model) => model.id).filter(Boolean))
		for (const modelId of normalized.modelIds ?? []) {
			if (!modelIds.has(modelId)) {
				throw new Error(`Model with ID ${modelId} is not available in project '${normalized.projectId}'`)
			}
		}

		if (normalized.businessAreaIds?.length) {
			const businessAreaIds = new Set(
				(await this.loadAvailableBusinessAreas(normalized.projectId)).map((area) => area.id).filter(Boolean)
			)
			for (const businessAreaId of normalized.businessAreaIds) {
				if (!businessAreaIds.has(businessAreaId)) {
					throw new Error(`Business area with ID ${businessAreaId} is not available for the current user`)
				}
			}
		}

		for (const entity of normalized.entities ?? []) {
			const hasEntity = this.getScopedModels(normalized).some((model) =>
				model.options?.schema?.cubes?.some((cube) => cube.name === entity)
			)
			if (!hasEntity) {
				throw new Error(`Cube/entity '${entity}' is not available in the selected metric scope`)
			}
		}

		return normalized
	}

	private async prepareBasicIndicatorInput(input: BasicIndicatorInput, config: LangGraphRunnableConfig) {
		const scope = await this.resolveMetricScope(config, input)
		const modelId = input.modelId ?? requireSingleScopeValue(scope.modelIds, 'semantic model')
		const cube = input.cube ?? requireSingleScopeValue(scope.entities, 'cube/entity')
		const businessAreaId = input.businessAreaId ?? optionalSingleScopeValue(scope.businessAreaIds, 'business area')
		const scopedInput = {
			...input,
			modelId,
			cube,
			...(businessAreaId ? { businessAreaId } : {})
		} as BasicIndicatorInput & { modelId: string; cube: string }
		return {
			projectId: scope.projectId as string,
			scope,
			input: scopedInput
		}
	}

	private async prepareDeriveIndicatorInput(input: DeriveIndicatorInput, config: LangGraphRunnableConfig) {
		const scope = await this.resolveMetricScope(config, input)
		const modelId = input.modelId ?? requireSingleScopeValue(scope.modelIds, 'semantic model')
		const cube = input.cube ?? requireSingleScopeValue(scope.entities, 'cube/entity')
		const businessAreaId = input.businessAreaId ?? optionalSingleScopeValue(scope.businessAreaIds, 'business area')
		const scopedInput = {
			...input,
			modelId,
			cube,
			...(businessAreaId ? { businessAreaId } : {})
		} as DeriveIndicatorInput & { modelId: string; cube: string }
		return {
			projectId: scope.projectId as string,
			scope,
			input: scopedInput
		}
	}

	private async ensureProjectLoaded(projectId: string) {
		if (this.project?.id === projectId) {
			return this.project
		}
		return this.loadProjectContext(projectId)
	}

	private getScopedModels(scope: MetricScope): ISemanticModel[] {
		const modelIds = new Set(scope.modelIds ?? [])
		const businessAreaIds = new Set(scope.businessAreaIds ?? [])
		return this.models.filter((model) => {
			if (modelIds.size && !modelIds.has(model.id)) {
				return false
			}
			if (businessAreaIds.size && !businessAreaIds.has((model as ModelOptionSource).businessAreaId)) {
				return false
			}
			return true
		})
	}

	private async loadAvailableBusinessAreas(projectId?: string): Promise<IBusinessArea[]> {
		const areas = await this.commandBus.execute<BusinessAreaMyCommand, IBusinessArea[]>(
			new BusinessAreaMyCommand(toUserReference(this.context.userId))
		)
		if (!projectId) {
			return areas
		}
		const project = this.project?.id === projectId ? this.project : await this.loadProjectContext(projectId)
		const projectAreaIds = new Set(
			(project.models ?? []).map((model) => (model as ModelOptionSource).businessAreaId).filter(Boolean)
		)
		if (!projectAreaIds.size) {
			return areas
		}
		return areas.filter((area) => area.id && projectAreaIds.has(area.id))
	}

	private metricScopeCommand(config: LangGraphRunnableConfig, scope: MetricScope, content: Record<string, unknown>) {
		return new Command({
			update: {
				tool_indicators_cubes: markdownModelCubes(this.models),
				tool_indicators_scope: scope,
				messages: [
					new ToolMessage({
						content: JSON.stringify(this.metricScopeOutput(scope, content)),
						tool_call_id: getToolCallIdFromConfig(config),
						status: 'success'
					})
				]
			}
		})
	}

	private metricScopeOutput(scope: MetricScope, content: Record<string, unknown>) {
		const modelId = scope.modelIds?.length === 1 ? scope.modelIds[0] : undefined
		const businessAreaId = scope.businessAreaIds?.length === 1 ? scope.businessAreaIds[0] : undefined
		return {
			...content,
			projectId: content.projectId ?? scope.projectId,
			...(modelId ? { modelId } : {}),
			...(businessAreaId ? { businessAreaId } : {}),
			metricScope: scope,
			scopeSummary: summarizeMetricScope(scope)
		}
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
		const output = this.metricScopeOutput(this.currentMetricScope, content)
		return new Command({
			update: {
				[IndicatorsVariableEnum.INDICATORS]: {
					indicators: [draft]
				},
				tool_indicators_scope: this.currentMetricScope,
				messages: [
					new ToolMessage({
						tool_call_id: getToolCallIdFromConfig(config),
						content: JSON.stringify(output),
						status: 'success'
					})
				]
			}
		})
	}
}

export function toMetricRow(indicator: IIndicator): MetricRow {
	const model = indicator.model as ModelOptionSource | undefined
	const businessArea = indicator.businessArea as BusinessAreaOptionSource | undefined
	const draft = indicator.draft ?? {}
	const options = (draft as TIndicatorDraft).options ?? indicator.options
	const businessAreaId = (draft as TIndicatorDraft).businessAreaId ?? indicator.businessAreaId

	return {
		id: indicator.id,
		code: (draft as TIndicatorDraft).code ?? indicator.code,
		name: (draft as TIndicatorDraft).name ?? indicator.name,
		type: (draft as TIndicatorDraft).type ?? indicator.type,
		status: indicator.status,
		modelId: (draft as TIndicatorDraft).modelId ?? indicator.modelId,
		modelName: model?.name ?? model?.title ?? (draft as TIndicatorDraft).modelId ?? indicator.modelId,
		businessAreaId,
		businessAreaName: businessArea?.name ?? businessAreaId,
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

export function toBusinessAreaOption(area: unknown) {
	const source = area as BusinessAreaOptionSource
	return {
		value: source.id ?? '',
		label: source.name ?? source.id ?? ''
	}
}

export function getStringInput(parameters: Record<string, unknown> | undefined, key: string) {
	const value = parameters?.[key]
	const normalized = Array.isArray(value) ? value[0] : value
	return typeof normalized === 'string' && normalized.trim() ? normalized.trim() : undefined
}

export function buildIndicatorBaseWhere(scope: MetricScope) {
	return {
		projectId: scope.projectId,
		...toWhereList('modelId', scope.modelIds),
		...toWhereList('businessAreaId', scope.businessAreaIds),
		...toWhereList('entity', scope.entities),
		...(scope.status ? { status: scope.status } : {}),
		...(scope.type ? { type: scope.type } : {})
	}
}

export function buildIndicatorWhere(scope: MetricScope) {
	const base = buildIndicatorBaseWhere(scope)
	const normalizedSearch = scope.search?.trim()

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

function toWhereList(key: string, values: string[] | undefined) {
	if (!values?.length) {
		return {}
	}
	return {
		[key]: values.length === 1 ? values[0] : In(values)
	}
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
		businessAreaId: getOptionalString(source, 'businessAreaId'),
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

function metricScopeFromViewQuery(query: XpertViewQuery): MetricScope {
	return normalizeMetricScope({
		projectId: getStringInput(query.parameters, 'projectId'),
		modelIds: getStringListInput(query.parameters, 'modelId'),
		businessAreaIds: getStringListInput(query.parameters, 'businessAreaId'),
		status: getStringInput(query.parameters, 'status') as IndicatorStatusEnum | undefined,
		type: getStringInput(query.parameters, 'type') as IndicatorType | undefined,
		search: query.search
	})
}

export function normalizeMetricScopeInput(input: Partial<MetricScopeInput> | undefined | null): MetricScope {
	const source = (input ?? {}) as MetricScopeInput
	return normalizeMetricScope({
		projectId: firstString(source.projectId, source.project_id),
		modelIds: firstStringList(source.modelIds, source.model_ids, source.modelId, source.model_id),
		businessAreaIds: firstStringList(
			source.businessAreaIds,
			source.business_area_ids,
			source.businessAreaId,
			source.business_area_id
		),
		entities: firstStringList(source.entities, source.entity, source.cubeName, source.cube_name),
		status: source.status ?? undefined,
		type: source.type ?? undefined,
		search: firstString(source.search)
	})
}

export function normalizeMetricScope(scope: MetricScope | undefined | null): MetricScope {
	return {
		projectId: normalizeString(scope?.projectId),
		modelIds: normalizeStringList(scope?.modelIds),
		businessAreaIds: normalizeStringList(scope?.businessAreaIds),
		entities: normalizeStringList(scope?.entities),
		status: scope?.status ?? undefined,
		type: scope?.type ?? undefined,
		search: normalizeString(scope?.search)
	}
}

function mergeMetricScope(base: MetricScope, patch: MetricScope): MetricScope {
	const next = normalizeMetricScope({
		projectId: patch.projectId ?? base.projectId,
		modelIds: patch.modelIds ?? base.modelIds,
		businessAreaIds: patch.businessAreaIds ?? base.businessAreaIds,
		entities: patch.entities ?? base.entities,
		status: patch.status ?? base.status,
		type: patch.type ?? base.type,
		search: patch.search ?? base.search
	})
	if (patch.projectId && patch.projectId !== base.projectId) {
		next.modelIds = patch.modelIds
		next.businessAreaIds = patch.businessAreaIds
		next.entities = patch.entities
	}
	return next
}

export function summarizeMetricScope(scope: MetricScope) {
	const parts = [
		scope.projectId ? `project=${scope.projectId}` : null,
		scope.modelIds?.length ? `models=${scope.modelIds.join(',')}` : null,
		scope.businessAreaIds?.length ? `businessAreas=${scope.businessAreaIds.join(',')}` : null,
		scope.entities?.length ? `entities=${scope.entities.join(',')}` : null,
		scope.status ? `status=${scope.status}` : null,
		scope.type ? `type=${scope.type}` : null,
		scope.search ? `search=${scope.search}` : null
	].filter(Boolean)
	return parts.length ? parts.join('; ') : 'all accessible metrics'
}

function requireSingleScopeValue(values: string[] | undefined, label: string) {
	if (!values?.length) {
		throw new Error(`A ${label} is required. Provide it explicitly or set a single active metric scope.`)
	}
	if (values.length > 1) {
		throw new Error(`Multiple ${label}s are selected in the active metric scope. Provide one explicitly.`)
	}
	return values[0]
}

function optionalSingleScopeValue(values: string[] | undefined, label: string) {
	if (!values?.length) {
		return undefined
	}
	if (values.length > 1) {
		throw new Error(`Multiple ${label}s are selected in the active metric scope. Provide one explicitly.`)
	}
	return values[0]
}

function getStringListInput(parameters: Record<string, unknown> | undefined, key: string) {
	const value = parameters?.[key]
	if (Array.isArray(value)) {
		return normalizeStringList(value)
	}
	const normalized = normalizeString(value)
	return normalized ? [normalized] : undefined
}

function firstString(...values: unknown[]) {
	for (const value of values) {
		const normalized = normalizeString(value)
		if (normalized) {
			return normalized
		}
	}
	return undefined
}

function firstStringList(...values: unknown[]) {
	for (const value of values) {
		const normalized = Array.isArray(value) ? normalizeStringList(value) : normalizeString(value)
		if (Array.isArray(normalized) && normalized.length) {
			return normalized
		}
		if (typeof normalized === 'string') {
			return [normalized]
		}
	}
	return undefined
}

function normalizeString(value: unknown) {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeStringList(values: unknown[] | undefined) {
	const seen = new Set<string>()
	const result: string[] = []
	for (const value of values ?? []) {
		const normalized = normalizeString(value)
		if (normalized && !seen.has(normalized)) {
			seen.add(normalized)
			result.push(normalized)
		}
	}
	return result.length ? result : undefined
}

function toUserReference(userId: string | undefined) {
	return (userId ? { id: userId } : undefined) as IUser
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
