import { LogOneQuery } from '../../model-query-log/queries/log-one.query'
import { ModelQueryLogUpsertCommand } from '../../model-query-log/commands/upsert.command'

jest.mock('@metad/contracts', () => ({
	QueryStatusEnum: {
		RUNNING: 'running',
		SUCCESS: 'success',
		FAILED: 'failed'
	}
}))

jest.mock('@metad/server-ai', () => ({
	ExecutionQueueService: class {}
}))

jest.mock('@metad/server-core', () => ({
	runWithRequestContext: (_context: unknown, callback: () => void) => callback(),
	UserService: class {}
}))

jest.mock('../../agent/agent.gateway', () => ({
	EventsGateway: class {}
}))

jest.mock('../../data-source', () => ({
	DataSourceOlapQuery: class {
		constructor(..._args: any[]) {}
	}
}))

jest.mock('../queries', () => ({
	ModelCubeQuery: class {
		constructor(..._args: any[]) {}
	},
	ModelOlapQuery: class {
		constructor(..._args: any[]) {}
	}
}))

const { ModelQueryProcessor } = require('./query.processor')

describe('ModelQueryProcessor', () => {
	let processor: any
	let gateway: { sendQueryResult: jest.Mock }
	let queryBus: { execute: jest.Mock }
	let commandBus: { execute: jest.Mock }
	let userService: { findOne: jest.Mock }
	let executionQueue: any

	const buildJob = () =>
		({
			data: {
				sessionId: 'session-1',
				userId: 'user-1',
				logId: 'log-1',
				data: {
					id: 'query-1',
					tenantId: 'tenant-1',
					organizationId: 'org-1',
					dataSourceId: 'ds-1',
					modelId: 'model-1',
					body: 'SELECT 1',
					acceptLanguage: 'en',
					forceRefresh: false,
					isDraft: false
				}
			}
		}) as any

	beforeEach(() => {
		gateway = {
			sendQueryResult: jest.fn()
		}
		queryBus = {
			execute: jest.fn(async (query) => {
				if (query instanceof LogOneQuery) {
					return { createdAt: new Date(Date.now() - 1000) }
				}

				return {
					data: [{ value: 1 }],
					cache: false
				}
			})
		}
		commandBus = {
			execute: jest.fn(async () => undefined)
		}
		userService = {
			findOne: jest.fn(async () => ({ id: 'user-1' }))
		}
		executionQueue = {
			generateRunId: jest.fn(() => 'run-1'),
			run: jest.fn(async (options: { task: () => Promise<unknown> }) => options.task()),
			sessionKeyResolver: {
				resolveForAnalytics: jest.fn(() => 'analytics:ws:session-1:model:model-1')
			}
		}

		processor = new ModelQueryProcessor(
			gateway as any,
			queryBus as any,
			commandBus as any,
			userService as any,
				executionQueue as any
			)

		jest
			.spyOn(processor as any, 'runInContext')
			.mockImplementation(async (_params: unknown, task: () => Promise<unknown>) => task())
	})

	it('routes execution through core queue with analytics source and session key resolver', async () => {
		await processor.handleQuery(buildJob())

			expect(executionQueue.sessionKeyResolver.resolveForAnalytics).toHaveBeenCalledWith({
				sessionId: 'session-1',
				modelId: 'model-1'
			})
			expect(executionQueue.run).toHaveBeenCalledTimes(1)
			expect(executionQueue.run).toHaveBeenCalledWith(
				expect.objectContaining({
					runId: 'run-1',
					sessionKey: 'analytics:ws:session-1:model:model-1',
				globalLane: 'main',
				source: 'analytics'
			})
		)
		expect(gateway.sendQueryResult).toHaveBeenCalledWith(
			'session-1',
			expect.objectContaining({
				id: 'query-1',
				status: 200
			})
		)
	})

	it('marks query as failed when queue execution fails before task runs', async () => {
		executionQueue.run.mockRejectedValueOnce(new Error('queue is unavailable'))

		await processor.handleQuery(buildJob())

		const logCommands = commandBus.execute.mock.calls
			.map(([command]) => command)
			.filter((command) => command instanceof ModelQueryLogUpsertCommand)

		expect(logCommands.some((command) => command.entity.status === 'failed')).toBe(true)
		expect(gateway.sendQueryResult).toHaveBeenCalledWith(
			'session-1',
			expect.objectContaining({
				id: 'query-1',
				status: 500
			})
		)
	})
})
