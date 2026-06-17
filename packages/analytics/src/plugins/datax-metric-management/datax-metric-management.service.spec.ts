import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { IndicatorStatusEnum, IndicatorType, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'

const mockInterrupt = jest.fn((_input?: unknown) => ({ projectId: 'project-1' }))

jest.mock('@langchain/langgraph', () => {
	const actual = jest.requireActual('@langchain/langgraph')
	return {
		...actual,
		interrupt: (input: unknown) => mockInterrupt(input)
	}
})
jest.mock('@xpert-ai/server-config', () => ({
	environment: {
		clientBaseUrl: 'http://localhost'
	}
}))
jest.mock('../../ai/queries', () => ({
	GetBIContextQuery: class GetBIContextQuery {
		constructor(
			public readonly models?: string[],
			public readonly params?: unknown
		) {}
	}
}))
jest.mock('../../ai/toolset/builtin/bi-toolset', () => ({
	BIToolsEnum: {
		SHOW_INDICATORS: 'show_indicators'
	},
	updateOcapIndicators: jest.fn()
}))
jest.mock('../../certification', () => ({
	CertificationService: class CertificationService {}
}))
jest.mock('../../indicator', () => ({
	IndicatorService: class IndicatorService {},
	applyIndicatorDraft: (indicator: any) => (indicator.draft ? { ...indicator, ...indicator.draft } : indicator),
	createIndicatorNamespace: (projectId: string) => ['project', projectId, 'indicators']
}))
jest.mock('../../indicator/indicator.entity', () => ({
	Indicator: class Indicator {}
}))
jest.mock('../../model-member', () => ({
	RetrieveMembersCommand: class RetrieveMembersCommand {
		constructor(
			public readonly query: string,
			public readonly options: unknown
		) {}
	}
}))
jest.mock('../../project', () => ({
	CreateProjectStoreCommand: class CreateProjectStoreCommand {
		constructor(public readonly input: unknown) {}
	},
	ProjectGetQuery: class ProjectGetQuery {
		constructor(public readonly input: unknown) {}
	},
	ProjectMyQuery: class ProjectMyQuery {
		constructor(public readonly input: unknown) {}
	}
}))

import {
	DataXMetricManagementService,
	buildIndicatorWhere,
	toIndicatorDraft,
	toMetricRow
} from './datax-metric-management.service'

describe('DataXMetricManagementService', () => {
	beforeEach(() => {
		mockInterrupt.mockClear()
	})

	it('maps view input into a basic indicator draft with options', () => {
		const draft = toIndicatorDraft({
			code: 'GMV_PRODUCT_A',
			name: 'GMV Product A',
			type: IndicatorType.BASIC,
			modelId: 'model-1',
			businessAreaId: 'area-1',
			certificationId: 'cert-1',
			principal: 'Alice',
			validity: '2026-12-31',
			cube: 'Sales',
			description: 'GMV for product A',
			calendar: '[Date]',
			measure: '[Measures].[GMV]',
			aggregator: 'sum',
			dimensions: ['[Store]'],
			filters: [{ dimension: '[Product]', hierarchy: '[Product]', member: '[A]' }],
			visible: false,
			isApplication: true
		})

		expect(draft).toMatchObject({
			code: 'GMV_PRODUCT_A',
			name: 'GMV Product A',
			type: IndicatorType.BASIC,
			modelId: 'model-1',
			businessAreaId: 'area-1',
			certificationId: 'cert-1',
			principal: 'Alice',
			validity: '2026-12-31',
			entity: 'Sales',
			business: 'GMV for product A',
			visible: false,
			isApplication: true,
			options: {
				calendar: '[Date]',
				measure: '[Measures].[GMV]',
				aggregator: 'sum',
				dimensions: ['[Store]'],
				filters: [
					{
						dimension: {
							dimension: '[Product]',
							hierarchy: '[Product]'
						},
						members: [{ key: '[A]' }]
					}
				]
			}
		})
	})

	it('uses draft values when mapping rows for the workbench view', () => {
		const row = toMetricRow({
			id: 'metric-1',
			code: 'OLD',
			name: 'Old',
			modelId: 'model-1',
			entity: 'OldCube',
			business: 'Old definition',
			draft: {
				code: 'NEW',
				name: 'New',
				modelId: 'model-2',
				businessAreaId: 'area-1',
				certificationId: 'cert-1',
				entity: 'Sales',
				business: 'New definition',
				unit: '%',
				principal: 'Alice',
				validity: '2026-12-31',
				isApplication: true,
				options: {
					formula: '[Measures].[A] / [Measures].[B]'
				}
			},
			model: {
				name: 'Sales Model'
			},
			businessArea: {
				name: 'Sales Area'
			},
			certification: {
				name: 'Certified'
			}
		} as any)

		expect(row).toMatchObject({
			id: 'metric-1',
			code: 'NEW',
			name: 'New',
			modelId: 'model-2',
			modelName: 'Sales Model',
			businessAreaId: 'area-1',
			businessAreaName: 'Sales Area',
			certificationId: 'cert-1',
			certificationName: 'Certified',
			entity: 'Sales',
			business: 'New definition',
			unit: '%',
			principal: 'Alice',
			validity: '2026-12-31',
			isApplication: true,
			options: {
				formula: '[Measures].[A] / [Measures].[B]'
			}
		})
	})

	it('creates view drafts only when the indicator code is unique', async () => {
		const { service, indicatorService } = createService()

		await service.createViewDraft('project-1', {
			code: 'GMV',
			name: 'GMV',
			type: IndicatorType.DERIVE,
			cube: 'Sales',
			formula: '[Measures].[Sales]'
		})

		expect(indicatorService.checkCodeUnique).toHaveBeenCalledWith('GMV', 'project-1')
		expect(indicatorService.createDraft).toHaveBeenCalledWith(
			expect.objectContaining({
				code: 'GMV',
				entity: 'Sales',
				options: {
					formula: '[Measures].[Sales]'
				}
			}),
			'project-1'
		)
	})

	it('rejects duplicate view draft codes', async () => {
		const { service, indicatorService } = createService()
		indicatorService.checkCodeUnique.mockResolvedValue(false)

		await expect(service.createViewDraft('project-1', { code: 'GMV', name: 'GMV' })).rejects.toThrow(
			"The code 'GMV' already exists"
		)
		expect(indicatorService.createDraft).not.toHaveBeenCalled()
	})

	it('loads view data through IndicatorService and maps draft rows', async () => {
		const { service, indicatorService } = createService()
		indicatorService.findMy.mockResolvedValue({
			items: [
				{
					id: 'metric-1',
					code: 'OLD',
					draft: {
						code: 'NEW'
					}
				}
			],
			total: 1
		})

		await expect(
			service.getViewData({
				page: 1,
				pageSize: 20,
				parameters: {
					projectId: 'project-1',
					modelId: 'model-1'
				}
			})
		).resolves.toEqual({
			items: [expect.objectContaining({ id: 'metric-1', code: 'NEW' })],
			total: 1,
			meta: expect.objectContaining({
				metricScope: expect.objectContaining({
					projectId: 'project-1',
					modelIds: ['model-1']
				}),
				scopeSummary: 'project=project-1; models=model-1'
			})
		})
		expect(indicatorService.findMy).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					projectId: 'project-1',
					modelId: 'model-1'
				}
			})
		)
	})

	it('builds scoped indicator filters for project, model, business area, type, status, and search', () => {
		const where = buildIndicatorWhere({
			projectId: 'project-1',
			modelIds: ['model-1'],
			businessAreaIds: ['area-1'],
			certificationIds: ['cert-1'],
			tagIds: ['tag-1'],
			isApplication: true,
			type: IndicatorType.BASIC,
			status: IndicatorStatusEnum.DRAFT,
			search: 'sales'
		})

		expect(where).toEqual([
			expect.objectContaining({
				projectId: 'project-1',
				modelId: 'model-1',
				businessAreaId: 'area-1',
				certificationId: 'cert-1',
				tags: {
					id: 'tag-1'
				},
				isApplication: true,
				type: IndicatorType.BASIC,
				status: IndicatorStatusEnum.DRAFT,
				code: expect.anything()
			}),
			expect.objectContaining({ name: expect.anything() }),
			expect.objectContaining({ business: expect.anything() })
		])
	})

	it('handles bulk delete with per-row failures', async () => {
		const { service, indicatorService } = createService()
		indicatorService.deleteById.mockImplementation(async (id) => {
			if (id === 'metric-2') {
				throw new Error('locked')
			}
		})

		await expect(service.bulkDeleteIndicators(['metric-1', 'metric-2'])).resolves.toEqual({
			deleted: ['metric-1'],
			failures: [{ id: 'metric-2', message: 'locked' }]
		})
	})

	it('exports indicators using the legacy YAML shape', async () => {
		const { service, indicatorService } = createService()
		indicatorService.findMy.mockResolvedValue({
			items: [
				{
					id: 'metric-1',
					code: 'GMV',
					name: 'GMV',
					isApplication: true,
					visible: true,
					tags: [{ name: 'Finance', category: 'INDICATOR', color: 'blue' }]
				}
			],
			total: 1
		})

		const result = await service.exportIndicators({
			parameters: {
				projectId: 'project-1'
			}
		})

		expect(result.fileName).toBe('Indicators.yaml')
		expect(result.content).toContain('code: GMV')
		expect(result.content).toContain('tags:')
		expect(result.count).toBe(1)
	})

	it('imports YAML rows as draft indicators with per-row validation results', async () => {
		const { service, indicatorService } = createService()
		indicatorService.checkCodeUnique.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

		const result = await service.importIndicators(
			'project-1',
			'- code: GMV\n  name: GMV\n- code: GMV\n  name: Duplicate\n'
		)

		expect(result.created).toHaveLength(1)
		expect(result.failures).toEqual([
			expect.objectContaining({
				index: 1,
				code: 'GMV'
			})
		])
		expect(indicatorService.createDraft).toHaveBeenCalledTimes(1)
	})

	it('starts project embedding through IndicatorService', async () => {
		const { service, indicatorService } = createService()

		await expect(service.startEmbeddingProject('project-1')).resolves.toEqual({ projectId: 'project-1' })
		expect(indicatorService.startEmbedding).toHaveBeenCalledWith('project-1')
	})

	it('initializes a runtime session for a selected project', async () => {
		const { service, queryBus } = createService()
		queryBus.execute.mockImplementation(async (query: any) => {
			if (query.constructor.name === 'ProjectGetQuery') {
				return {
					id: 'project-1',
					models: [{ id: 'model-1' }]
				}
			}
			return {
				models: [
					{
						id: 'model-1',
						name: 'Sales Model',
						options: {
							schema: {
								cubes: [{ name: 'Sales' }]
							}
						}
					}
				],
				dsCoreService: {},
				indicatorService: {}
			}
		})

		const session = service.createSession(createContext())
		const project = await session.loadProjectContext('project-1')
		const state = session.createInitialState({}, 'prompt')

		expect(project.id).toBe('project-1')
		expect(queryBus.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				models: ['model-1'],
				params: { indicatorDraft: true }
			})
		)
		expect(state.tool_indicators_cubes).toContain('Sales')
	})

	it('returns scope guidance instead of throwing when read tools run without a project scope', async () => {
		const { service, queryBus } = createService()
		queryBus.execute.mockImplementation(mockProjectBIContext)

		const session = service.createSession(createContext())
		await session.init()
		await expect(session.listCubesTool({}, { configurable: {} } as any)).resolves.toContain(
			'Metric scope is required before metric operations'
		)
		await expect(session.indicatorRetrieverTool({ query: '销售额' }, { configurable: {} } as any)).resolves.toEqual(
			[expect.stringContaining('Metric scope is required before metric operations'), []]
		)

		expect(mockInterrupt).not.toHaveBeenCalled()
	})

	it('restores active metric scope from graph state before the next tool call', async () => {
		const { service, queryBus } = createService()
		queryBus.execute.mockImplementation(mockProjectBIContext)

		const session = service.createSession(createContext())
		await session.init()
		session.createInitialState({ tool_indicators_scope: { projectId: 'project-1' } }, 'prompt')

		await expect(session.listCubesTool({}, { configurable: {} } as any)).resolves.toContain('Sales')
		expect(mockInterrupt).not.toHaveBeenCalled()
	})

	it('waits for a concurrently selected scope before failing metric operations', async () => {
		const { service, queryBus } = createService()
		queryBus.execute.mockImplementation(mockProjectBIContext)

		const session = service.createSession(createContext())
		const config = { configurable: {} } as any
		await session.init()
		const pendingCubes = session.listCubesTool({}, config)
		await new Promise((resolve) => setTimeout(resolve, 20))
		await session.metricScopeSetTool({ projectId: 'project-1' }, config)

		await expect(pendingCubes).resolves.toContain('Sales')
		expect(mockInterrupt).not.toHaveBeenCalled()
	})
})

function createService() {
	const commandBus = Object.assign(Object.create(CommandBus.prototype), {
		execute: jest.fn()
	}) as CommandBus & { execute: jest.Mock }
	const queryBus = Object.assign(Object.create(QueryBus.prototype), {
		execute: jest.fn()
	}) as QueryBus & { execute: jest.Mock }
	const indicatorService = {
		checkCodeUnique: jest.fn(async () => true),
		createDraft: jest.fn(async (draft) => ({ id: 'metric-1', draft })),
		updateDraft: jest.fn(async (id, draft) => ({ id, draft })),
		publish: jest.fn(),
		embedding: jest.fn(),
		deleteById: jest.fn(),
		startEmbedding: jest.fn(),
		findMy: jest.fn(async () => ({ items: [], total: 0 })),
		findAll: jest.fn(async () => ({ items: [], total: 0 })),
		findOne: jest.fn(async () => ({ id: 'metric-1', code: 'GMV', name: 'GMV', projectId: 'project-1' })),
		findOneOrFailByWhereOptions: jest.fn()
	}
	const certificationService = {
		findAll: jest.fn(async () => ({ items: [], total: 0 }))
	}
	return {
		commandBus,
		queryBus,
		indicatorService,
		certificationService,
		service: new DataXMetricManagementService(
			commandBus,
			queryBus,
			indicatorService as any,
			certificationService as any
		)
	}
}

function mockProjectBIContext(query: any) {
	if (query.constructor.name === 'ProjectGetQuery') {
		return Promise.resolve({
			id: 'project-1',
			models: [{ id: 'model-1' }]
		})
	}
	return Promise.resolve({
		models: [
			{
				id: 'model-1',
				name: 'Sales Model',
				options: {
					schema: {
						cubes: [{ name: 'Sales' }]
					}
				}
			}
		],
		dsCoreService: {},
		indicatorService: {}
	})
}

function createContext(overrides: Partial<IAgentMiddlewareContext> = {}): IAgentMiddlewareContext {
	return {
		tenantId: 'tenant-1',
		organizationId: 'org-1',
		userId: 'user-1',
		workspaceId: 'workspace-1',
		projectId: 'project-1',
		conversationId: 'conversation-1',
		xpertId: 'xpert-1',
		agentKey: 'agent-1',
		node: {
			id: 'middleware-1',
			key: 'middleware-1',
			type: WorkflowNodeTypeEnum.MIDDLEWARE,
			provider: 'datax_metric_management'
		},
		tools: new Map(),
		runtime: {
			createModelClient: async () => {
				throw new Error('not used')
			},
			wrapWorkflowNodeExecution: async () => {
				throw new Error('not used')
			}
		},
		...overrides
	}
}
