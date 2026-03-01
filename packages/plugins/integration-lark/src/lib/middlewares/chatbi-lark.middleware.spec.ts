import { ToolMessage } from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'
import { ChatMessageTypeEnum } from '@metad/contracts'
import { ENTITY_TYPE_SALESORDER } from '@metad/ocap-core'
import { ANALYTICS_PERMISSION_SERVICE_TOKEN } from '@xpert-ai/plugin-sdk'
import { NEVER, of } from 'rxjs'
import { ChatBILarkMiddleware } from './chatbi-lark.middleware'

async function createFixture() {
	const strategy = new ChatBILarkMiddleware()
	const middleware = await Promise.resolve(
		strategy.createMiddleware(
			{
				models: [
					{
						modelId: 'model-1',
						cubeName: 'Sales',
						entityCaption: 'Sales Cube',
						context: 'Sales cube context',
						prompts: ['Show sales trend', 'Top customers']
					}
				],
				dataLimit: 2
			},
			{} as any
		)
	)

	return { middleware }
}

function createEntityTypeForChart() {
	const entityType = JSON.parse(JSON.stringify(ENTITY_TYPE_SALESORDER))
	entityType.properties['[Department]'].caption = 'Department'
	entityType.properties['[Department]'].hierarchies[0].caption = 'Department'
	entityType.properties['[Department]'].hierarchies[0].memberCaption = 'DepartmentName'
	entityType.properties.sales.caption = 'Sales'
	return entityType
}

async function createAnalyticsFixture({
	queryData = [],
	membersData = [],
	statsStatement,
	selectEntitySetResult$,
	selectMembersResult$,
	queryResult$,
	timeouts
}: {
	queryData?: Record<string, any>[]
	membersData?: Record<string, any>[]
	statsStatement?: string
	selectEntitySetResult$?: any
	selectMembersResult$?: any
	queryResult$?: any
	timeouts?: number
} = {}) {
	const entityType = createEntityTypeForChart()
	const querySpy = jest.fn().mockReturnValue(
		queryResult$ ??
			of({
				data: queryData,
				...(statsStatement
					? {
							stats: {
								statements: [statsStatement]
							}
						}
					: {})
			})
	)

	const entityService = {
		selectEntityType: jest.fn().mockReturnValue(of(entityType)),
		selectQuery: querySpy,
		onDestroy: jest.fn()
	}
	const dataSource = {
		options: {},
		selectOptions: jest.fn().mockReturnValue(of({ parameters: {} })),
		selectEntitySet: jest.fn().mockReturnValue(of({ name: 'SalesOrder', entityType })),
		selectMembers: jest
			.fn()
			.mockReturnValue(selectMembersResult$ ?? of(membersData)),
		createEntityService: jest.fn().mockReturnValue(entityService)
	}
	const dsCoreService = {
		selectEntitySet: jest.fn().mockReturnValue(selectEntitySetResult$ ?? of({ entityType })),
		getDataSource: jest.fn().mockReturnValue(of(dataSource)),
		getToday: jest.fn().mockReturnValue({ today: new Date('2025-01-01T00:00:00.000Z') })
	}
	const analyticsPermissionService = {
		resolveChatBIModels: jest.fn().mockResolvedValue([
			{
				chatbiModelId: 'chatbi-model-1',
				modelId: 'model-1',
				modelKey: 'model-1',
				cubeName: 'SalesOrder',
				entityCaption: 'Sales Order',
				entityDescription: 'Sales order context',
				prompts: []
			}
		]),
		getDSCoreService: jest.fn().mockResolvedValue(dsCoreService),
		visitChatBIModel: jest.fn().mockResolvedValue(undefined),
		ensureCreateIndicatorAccess: jest.fn().mockResolvedValue(undefined),
		validateIndicatorStatement: jest.fn().mockResolvedValue(undefined)
	}

	const pluginContext = {
		resolve: jest.fn((token: string) => {
			if (token === ANALYTICS_PERMISSION_SERVICE_TOKEN) {
				return analyticsPermissionService
			}
			return null
		})
	}
	const strategy = new ChatBILarkMiddleware(pluginContext as any)
	const middleware = await Promise.resolve(
		strategy.createMiddleware(
			{
				models: [{ id: 'chatbi-model-1' }],
				dataPermission: true,
				dataLimit: 10,
				...(timeouts ? { timeouts } : {})
			},
			{} as any
		)
	)

	return { middleware, dsCoreService, querySpy }
}

function getTool(middleware: any, name: string) {
	const tool = middleware.tools.find((item) => item.name === name)
	if (!tool) {
		throw new Error(`Tool ${name} not found`)
	}
	return tool
}

function getUpdateCardPayload(subscriber: { next: jest.Mock }) {
	const chunk = subscriber.next.mock.calls[0]?.[0]
	return chunk?.data?.data?.data
}

describe('ChatBILarkMiddleware', () => {
	it('createMiddleware returns six compatible tool names', async () => {
		const { middleware } = await createFixture()
		expect(middleware.tools).toHaveLength(6)
		expect(middleware.tools.map((tool) => tool.name)).toEqual([
			'get_available_cubes',
			'get_cube_context',
			'dimension_member_retriever',
			'create_indicator',
			'welcome',
			'answer_question'
		])
	})

	it('beforeAgent initializes chatbi state variables', async () => {
		const { middleware } = await createFixture()
		const beforeAgent =
			typeof middleware.beforeAgent === 'function' ? middleware.beforeAgent : middleware.beforeAgent?.hook
		expect(beforeAgent).toBeDefined()
		const result = (await beforeAgent?.(
			{
				tool_chatbi_prompts_default: '',
				chatbi_models: '',
				chatbi_cubes: [],
				chatbi_cubes_context: '',
				chatbi_indicators: []
			},
			{} as any
		)) as any

		expect(result.tool_chatbi_prompts_default).toContain('get_cube_context')
		expect(result.chatbi_models).toContain('cubeName: Sales')
	})

	it('get_available_cubes returns models markdown', async () => {
		const { middleware } = await createFixture()
		const result = await getTool(middleware, 'get_available_cubes').invoke({})

		expect(typeof result).toBe('string')
		expect(result).toContain('dataSource: model-1')
		expect(result).toContain('cubeName: Sales')
	})

	it('get_cube_context returns Command.update with compatible keys', async () => {
		const { middleware } = await createAnalyticsFixture()
		const result = await getTool(middleware, 'get_cube_context').invoke(
			{ modelId: 'chatbi-model-1', name: 'SalesOrder' },
			{
				metadata: {
					tool_call_id: 'tool-call-cube'
				}
			}
		)

		expect(result).toBeInstanceOf(Command)
		expect(result.update.chatbi_cubes).toEqual([
			{
				modelId: 'model-1',
				cubeName: 'SalesOrder',
				context: expect.stringContaining('SalesOrder')
			}
		])
		expect(result.update.chatbi_cubes_context).toContain('SalesOrder')
		expect(result.update.messages[0]).toBeInstanceOf(ToolMessage)
	})

	it('create_indicator updates chatbi_indicators and sends update card', async () => {
		const { middleware } = await createFixture()
		const subscriber = { next: jest.fn() }

		const result = await getTool(middleware, 'create_indicator').invoke(
			{
				modelId: 'model-1',
				cube: 'Sales',
				code: 'GrossMargin',
				name: 'Gross Margin',
				formula: '[Measures].[Sales] - [Measures].[Cost]'
			},
			{
				metadata: {
					tool_call_id: 'tool-call-indicator'
				},
				configurable: {
					subscriber
				}
			}
		)

		expect(result).toBeInstanceOf(Command)
		expect(result.update.chatbi_indicators).toHaveLength(1)
		expect(result.update.chatbi_indicators[0].code).toBe('GrossMargin')
		expect(result.update.messages[0]).toBeInstanceOf(ToolMessage)
		expect(subscriber.next).toHaveBeenCalledTimes(1)
		expect(subscriber.next.mock.calls[0][0].data.type).toBe(ChatMessageTypeEnum.MESSAGE)
		expect(subscriber.next.mock.calls[0][0].data.data.type).toBe('update')
	})

	it('answer_question throws when DSCoreService is unavailable', async () => {
		const { middleware } = await createFixture()
		const subscriber = { next: jest.fn() }

		await expect(
			getTool(middleware, 'answer_question').invoke(
				{
					preface: 'Sales overview',
					visualType: 'Table',
					dimensions: [{ dimension: 'Customer' }],
					measures: [{ dimension: 'Measures', measure: 'Sales Amount' }],
					slicers: [{ dimension: { dimension: 'Region' }, members: [{ key: '[Region].[APAC]' }] }]
				},
				{
					configurable: {
						subscriber
					}
				}
			)
		).rejects.toThrow('Analytics permission service is unavailable')
	})

	it('answer_question uses DSCore selectEntitySet/query and renders table card with stats panel', async () => {
		const { middleware, dsCoreService, querySpy } = await createAnalyticsFixture({
			queryData: [{ '[Department]': 'A', DepartmentName: 'Dept A', sales: 123.45 }],
			statsStatement: 'SELECT [Measures].[sales] ON COLUMNS FROM [SalesOrder]'
		})
		const subscriber = { next: jest.fn() }

		const result = await getTool(middleware, 'answer_question').invoke(
			{
				preface: 'Table analysis',
				visualType: 'Table',
				dataSettings: {
					dataSource: 'model-1',
					entitySet: 'SalesOrder'
				},
				dimensions: [{ dimension: '[Department]' }],
				measures: [{ dimension: 'Measures', measure: 'sales' }]
			},
			{
				configurable: {
					subscriber
				}
			}
		)

		expect(dsCoreService.selectEntitySet).toHaveBeenCalledWith('model-1', 'SalesOrder')
		expect(querySpy).toHaveBeenCalled()
		expect(typeof result).toBe('string')
		expect(result).toContain('The data are:')
		const card = getUpdateCardPayload(subscriber)
		expect(card.elements.some((item) => item.tag === 'table')).toBe(true)
		const stats = card.elements.find((item) => item.tag === 'collapsible_panel')
		expect(stats).toBeDefined()
		expect(stats.header?.title?.content).toBe('Query Statement')
	})

	it('answer_question renders line chart card on DSCore query path', async () => {
		const { middleware, querySpy } = await createAnalyticsFixture({
			queryData: [
				{ '[Department]': 'A', DepartmentName: 'Dept A', sales: 100 },
				{ '[Department]': 'B', DepartmentName: 'Dept B', sales: 200 }
			]
		})
		const subscriber = { next: jest.fn() }

		await getTool(middleware, 'answer_question').invoke(
			{
				preface: 'Line analysis',
				visualType: 'LineChart',
				dataSettings: {
					dataSource: 'model-1',
					entitySet: 'SalesOrder'
				},
				dimensions: [{ dimension: '[Department]' }],
				measures: [{ dimension: 'Measures', measure: 'sales' }]
			},
			{
				configurable: {
					subscriber
				}
			}
		)

		expect(querySpy).toHaveBeenCalled()
		const card = getUpdateCardPayload(subscriber)
		const chart = card.elements.find((item) => item.tag === 'chart')
		expect(chart).toBeDefined()
		expect(chart.chart_spec?.type).toBe('line')
	})

	it('answer_question renders KPI card on DSCore query path', async () => {
		const { middleware, querySpy } = await createAnalyticsFixture({
			queryData: [{ sales: 4567.89 }]
		})
		const subscriber = { next: jest.fn() }

		await getTool(middleware, 'answer_question').invoke(
			{
				preface: 'KPI analysis',
				visualType: 'KPI',
				dataSettings: {
					dataSource: 'model-1',
					entitySet: 'SalesOrder'
				},
				dimensions: [],
				measures: [{ dimension: 'Measures', measure: 'sales' }]
			},
			{
				configurable: {
					subscriber
				}
			}
		)

		expect(querySpy).toHaveBeenCalled()
		const card = getUpdateCardPayload(subscriber)
		expect(card.elements.some((item) => item.tag === 'markdown' && item.text_size === 'heading-1')).toBe(true)
	})

	it('answer_question accepts timeSlicers and keeps query execution typed', async () => {
		const { middleware, querySpy } = await createAnalyticsFixture({
			queryData: [{ sales: 100 }]
		})
		const subscriber = { next: jest.fn() }

		await getTool(middleware, 'answer_question').invoke(
			{
				preface: 'Time slicer analysis',
				visualType: 'Table',
				dataSettings: {
					dataSource: 'model-1',
					entitySet: 'SalesOrder'
				},
				dimensions: [{ dimension: '[Department]' }],
				measures: [{ dimension: 'Measures', measure: 'sales' }],
				timeSlicers: [
					{
						dimension: '[Time]',
						hierarchy: '[Time]',
						granularity: 'Month',
						start: '2024-01',
						end: '2024-02'
					}
				]
			},
			{
				configurable: {
					subscriber
				}
			}
		)

		expect(querySpy).toHaveBeenCalled()
		const queryOptions = querySpy.mock.calls[0][0]
		expect(Array.isArray(queryOptions?.filters)).toBe(true)
		expect(queryOptions.filters.length).toBeGreaterThan(0)
	})

	it('answer_question throws timeout when selectEntitySet does not emit in time', async () => {
		const { middleware } = await createAnalyticsFixture({
			selectEntitySetResult$: NEVER,
			timeouts: 100
		})

		await expect(
			getTool(middleware, 'answer_question').invoke({
				preface: 'timeout test',
				visualType: 'Table',
				dataSettings: {
					dataSource: 'model-1',
					entitySet: 'SalesOrder'
				},
				dimensions: [{ dimension: '[Department]' }],
				measures: [{ dimension: 'Measures', measure: 'sales' }]
			})
		).rejects.toThrow('Timeout while selecting entity set')
	})

	it('answer_question throws timeout when query result does not emit in time', async () => {
		const { middleware } = await createAnalyticsFixture({
			queryResult$: NEVER,
			timeouts: 150
		})

		await expect(
			getTool(middleware, 'answer_question').invoke({
				preface: 'timeout test',
				visualType: 'Table',
				dataSettings: {
					dataSource: 'model-1',
					entitySet: 'SalesOrder'
				},
				dimensions: [{ dimension: '[Department]' }],
				measures: [{ dimension: 'Measures', measure: 'sales' }]
			})
		).rejects.toThrow('Timeout while waiting query result')
	})

	it('dimension_member_retriever returns members from DSCore datasource', async () => {
		const { middleware } = await createAnalyticsFixture({
			membersData: [
				{
					memberCaption: 'Alice',
					memberKey: 'CUST_ALICE',
					memberUniqueName: '[Customer].[CUST_ALICE]'
				},
				{
					memberCaption: 'Bob',
					memberKey: 'CUST_BOB',
					memberUniqueName: '[Customer].[CUST_BOB]'
				}
			]
		})
		const result = await getTool(middleware, 'dimension_member_retriever').invoke({
			modelId: 'chatbi-model-1',
			cube: 'SalesOrder',
			query: 'Alice',
			dimension: 'Customer'
		})

		expect(typeof result).toBe('string')
		expect(result).toContain('Caption: Alice')
		expect(result).toContain('`[Customer].[CUST_ALICE]`')
	})

	it('welcome sends update card and returns tool message command', async () => {
		const { middleware } = await createFixture()
		const subscriber = { next: jest.fn() }

		const result = await getTool(middleware, 'welcome').invoke(
			{
				language: 'en',
				models: [
					{
						modelId: 'model-1',
						cubeName: 'Sales',
						prompts: ['Show sales trend']
					}
				],
				more: [
					{
						modelId: 'model-1',
						cubeName: 'Sales'
					}
				]
			},
			{
				metadata: {
					tool_call_id: 'tool-call-welcome'
				},
				configurable: {
					subscriber
				}
			}
		)

		expect(result).toBeInstanceOf(Command)
		expect(result.update.sys_language).toBe('en')
		expect(result.update.messages[0]).toBeInstanceOf(ToolMessage)
		expect(subscriber.next).toHaveBeenCalledTimes(1)
		expect(subscriber.next.mock.calls[0][0].data.type).toBe(ChatMessageTypeEnum.MESSAGE)
		expect(subscriber.next.mock.calls[0][0].data.data.type).toBe('update')
	})
})
