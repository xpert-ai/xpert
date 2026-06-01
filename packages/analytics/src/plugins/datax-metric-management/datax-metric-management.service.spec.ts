import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { IndicatorType, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'

const mockInterrupt = jest.fn((_input?: unknown) => ({ projectId: 'project-1' }))

jest.mock('@langchain/langgraph', () => {
	const actual = jest.requireActual('@langchain/langgraph')
	return {
		...actual,
		getStore: jest.fn(() => undefined),
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

import { DataXMetricManagementService, toIndicatorDraft, toMetricRow } from './datax-metric-management.service'

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
			cube: 'Sales',
			description: 'GMV for product A',
			calendar: '[Date]',
			measure: '[Measures].[GMV]',
			filters: [{ dimension: '[Product]', hierarchy: '[Product]', member: '[A]' }],
			visible: false
		})

		expect(draft).toMatchObject({
			code: 'GMV_PRODUCT_A',
			name: 'GMV Product A',
			type: IndicatorType.BASIC,
			modelId: 'model-1',
			entity: 'Sales',
			business: 'GMV for product A',
			visible: false,
			options: {
				calendar: '[Date]',
				measure: '[Measures].[GMV]',
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
				entity: 'Sales',
				business: 'New definition',
				unit: '%',
				options: {
					formula: '[Measures].[A] / [Measures].[B]'
				}
			},
			model: {
				name: 'Sales Model'
			}
		} as any)

		expect(row).toMatchObject({
			id: 'metric-1',
			code: 'NEW',
			name: 'New',
			modelId: 'model-2',
			modelName: 'Sales Model',
			entity: 'Sales',
			business: 'New definition',
			unit: '%',
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
			total: 1
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
		const project = await session.switchProject('project-1')
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

	it('prompts for a project when metric tools run without a store', async () => {
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
		await session.init()
		await expect(session.listCubesTool({}, { configurable: {} } as any)).resolves.toContain('Sales')

		expect(mockInterrupt).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'switch_project'
			})
		)
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
		findMy: jest.fn(async () => ({ items: [], total: 0 })),
		findAll: jest.fn(async () => ({ items: [], total: 0 })),
		findOneOrFailByWhereOptions: jest.fn()
	}
	return {
		commandBus,
		queryBus,
		indicatorService,
		service: new DataXMetricManagementService(commandBus, queryBus, indicatorService as any)
	}
}

function createContext(): IAgentMiddlewareContext {
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
		}
	}
}
