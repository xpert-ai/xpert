import { CancelChatCommand } from '../cancel-chat.command'
import { CancelChatHandler } from './cancel-chat.handler'
import { ExecutionQueueService, RunRegistryService, SessionKeyResolver } from '../../../handoff'

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('CancelChatHandler', () => {
	let runRegistry: RunRegistryService
	let runtime: ExecutionQueueService
	let executionCancelService: { cancelExecutions: jest.Mock }
	let handler: CancelChatHandler

	beforeEach(() => {
		runRegistry = new RunRegistryService()
		runtime = new ExecutionQueueService(runRegistry, new SessionKeyResolver())
		executionCancelService = {
			cancelExecutions: jest.fn()
		}
		handler = new CancelChatHandler(runtime, executionCancelService as any)
	})

	afterEach(() => {
		runRegistry.onModuleDestroy()
	})

	it('aborts active runtime runs and execution ids by conversation', async () => {
		const runController = new AbortController()
		const runPromise = runtime.run({
			runId: 'chat-run-1',
			sessionKey: 'chat:conversation:conv-1',
			conversationId: 'conv-1',
			executionId: 'execution-1',
			globalLane: 'main',
			abortController: runController,
			task: async () => {
				await new Promise<void>((_resolve, reject) => {
					runController.signal.addEventListener(
						'abort',
						() => reject(new Error('aborted-by-cancel')),
						{ once: true }
					)
				})
				return 1
			}
		})

		await sleep(10)

		const result = await handler.execute(
			new CancelChatCommand({
				event: undefined as any,
				data: {
					conversationId: 'conv-1'
				},
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				user: {
					id: 'user-1'
				} as any
			})
		)

		expect(result.abortedRunIds).toContain('chat-run-1')
		expect(result.abortedExecutionIds).toContain('execution-1')
		expect(executionCancelService.cancelExecutions).toHaveBeenCalledWith(
			['execution-1'],
			'User canceled'
		)
		await expect(runPromise).rejects.toThrow('aborted-by-cancel')
	})

	it('aborts run directly by runId', async () => {
		const runController = new AbortController()
		const runPromise = runtime.run({
			runId: 'chat-run-2',
			sessionKey: 'chat:conversation:conv-2',
			conversationId: 'conv-2',
			globalLane: 'main',
			abortController: runController,
			task: async () => {
				await new Promise<void>((_resolve, reject) => {
					runController.signal.addEventListener(
						'abort',
						() => reject(new Error('aborted-by-run-id')),
						{ once: true }
					)
				})
				return 1
			}
		})

		await sleep(10)

		const result = await handler.execute(
			new CancelChatCommand({
				event: undefined as any,
				data: {
					conversationId: 'conv-2',
					id: 'chat-run-2'
				},
				tenantId: 'tenant-1',
				user: { id: 'user-1' } as any
			} as any)
		)

		expect(result.abortedRunIds).toContain('chat-run-2')
		await expect(runPromise).rejects.toThrow('aborted-by-run-id')
	})
})
