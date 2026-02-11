import { ExecutionQueueService } from './execution-queue.service'
import { RunRegistryService } from './run-registry.service'
import { SessionKeyResolver } from './session-key.resolver'

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('ExecutionQueueService', () => {
	let runtime: ExecutionQueueService
	let runRegistry: RunRegistryService

	beforeEach(() => {
		runRegistry = new RunRegistryService()
		runtime = new ExecutionQueueService(runRegistry, new SessionKeyResolver())
	})

	afterEach(() => {
		runRegistry.onModuleDestroy()
	})

	it('runs task and clears run after completion', async () => {
		const abortController = new AbortController()
		const runId = runtime.generateRunId()
		const output = await runtime.run({
			runId,
			sessionKey: 'chat:conversation:test',
			abortController,
			task: async () => 'ok'
		})

		expect(output).toBe('ok')
		expect(runtime.getRun(runId)).toBeUndefined()
	})

	it('aborts runs by session key', async () => {
		const abortController = new AbortController()
		const runPromise = runtime.run({
			runId: 'run-1',
			sessionKey: 'chat:conversation:conv-1',
			abortController,
			task: async () => {
				await new Promise<void>((_resolve, reject) => {
					abortController.signal.addEventListener(
						'abort',
						() => reject(new Error('aborted-by-session')),
						{ once: true }
					)
				})
				return 1
			}
		})

		await sleep(10)
		const aborted = runtime.abortBySessionKey('chat:conversation:conv-1', 'cancel')
		expect(aborted).toContain('run-1')
		await expect(runPromise).rejects.toThrow('aborted-by-session')
	})

	it('aborts by timeout', async () => {
		const abortController = new AbortController()
		await expect(
			runtime.run({
				runId: 'run-timeout',
				sessionKey: 'chat:conversation:conv-timeout',
				abortController,
				timeoutMs: 20,
				task: async () => {
					await new Promise<void>((_resolve, reject) => {
						abortController.signal.addEventListener(
							'abort',
							() => reject(new Error('aborted-by-timeout')),
							{ once: true }
						)
					})
					return 1
				}
			})
		).rejects.toThrow('aborted-by-timeout')
	})
})
