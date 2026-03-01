import { BullModule, getQueueToken } from '@nestjs/bull'
import { Test, TestingModule } from '@nestjs/testing'
import { CommandBus, CqrsModule } from '@nestjs/cqrs'
import { existsSync } from 'node:fs'
import path from 'node:path'
import * as dotenv from 'dotenv'
import { Queue } from 'bull'
import { HandoffProcessorRegistry, IHandoffProcessor, RunSource } from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { HandoffQueueModule } from '../../message-queue.module'
import { AGENT_CHAT_MESSAGE_TYPE, LocalQueueTaskService } from '../../local-sync-task.service'
import { AgentChatHandoffProcessor } from '../../plugins/agent-chat/agent-chat.processor'
import { XPERT_HANDOFF_QUEUE } from '../../constants'
import { EnqueueAgentChatMessageCommand } from '../enqueue-agent-chat-message.command'
import { StopHandoffMessageCommand } from '../stop-handoff-message.command'
import { ConfigService } from '@metad/server-config'

const customEnvPath = process.env.SERVER_AI_E2E_ENV_PATH
const defaultEnvPath = path.resolve(process.cwd(), 'packages/server-ai/.env.e2e.local')
const fallbackEnvPath = path.resolve(process.cwd(), '.env')
console.log(`Using environment variables from: ${customEnvPath ?? (existsSync(defaultEnvPath) ? defaultEnvPath : fallbackEnvPath)}`)
const resolvedEnvPath = customEnvPath ?? (existsSync(defaultEnvPath) ? defaultEnvPath : fallbackEnvPath)
dotenv.config({ path: resolvedEnvPath })
const fallbackHandoffRoutingPath = path.resolve(process.cwd(), 'docker/handoff-routing.example.yaml')
process.env.HANDOFF_ROUTING_CONFIG_PATH = fallbackHandoffRoutingPath
const redisHostFromEnv = process.env.REDIS_HOST || 'localhost'

class TestHandoffProcessorRegistry {
	constructor(private readonly processor: AgentChatHandoffProcessor) {}

	get(type: string): IHandoffProcessor {
		if (type !== AGENT_CHAT_MESSAGE_TYPE) {
			throw new Error(`No test handoff processor found for type: ${type}`)
		}
		return this.processor
	}
}

const describeWithRedis = redisHostFromEnv ? describe : describe.skip

describeWithRedis('EnqueueAgentChatMessageCommand (e2e)', () => {
	let testingModule: TestingModule
	let commandBus: CommandBus
	let queue: Queue

	beforeAll(async () => {
		const host = redisHostFromEnv as string

		const port = Number(process.env.REDIS_PORT ?? process.env.REDIS_PORT ?? 6379)
		const db = Number(process.env.REDIS_DB ?? 15)

		testingModule = await Test.createTestingModule({
			imports: [
				CqrsModule,
				BullModule.forRoot({
					redis: {
						host,
						port,
						db,
						password: process.env.REDIS_PASSWORD ?? process.env.REDIS_PASSWORD,
						username: process.env.REDIS_USER ?? process.env.REDIS_USER
					}
				}),
				HandoffQueueModule
			],
			providers: [
				{
					provide: ConfigService,
					useValue: {
						assetOptions: {
							serverRoot: process.cwd()
						}
					}
				},
				LocalQueueTaskService,
				AgentChatHandoffProcessor
			]
		})
			.overrideProvider(HandoffProcessorRegistry)
			.useFactory({
				factory: (processor: AgentChatHandoffProcessor) => new TestHandoffProcessorRegistry(processor),
				inject: [AgentChatHandoffProcessor]
			})
			.compile()

		process.env.HANDOFF_ROUTING_CONFIG_PATH = fallbackHandoffRoutingPath
		await testingModule.init()
		commandBus = testingModule.get(CommandBus)
		queue = testingModule.get<Queue>(getQueueToken(XPERT_HANDOFF_QUEUE))
	})

	afterAll(async () => {
		await queue?.close()
		await testingModule?.close()
	})

	it('executes local queued task and returns expected result', async () => {
		const expected = {
			status: 'ok',
			payload: {
				message: 'handoff-local-task-done',
				value: 7
			}
		}

		const result = await commandBus.execute(
			new EnqueueAgentChatMessageCommand(
				{
					id: `e2e-enqueue-agent-chat-${randomUUID()}`,
					tenantId: process.env.E2E_TENANT_ID ?? 'e2e-tenant',
					organizationId: process.env.E2E_ORGANIZATION_ID ?? 'e2e-org',
					userId: process.env.E2E_USER_ID ?? 'e2e-user',
					sessionKey: `session-${Date.now()}`,
					source: 'chat' as RunSource,
					timeoutMs: 15000
				},
				async () => {
					return expected
				}
			)
		)

		expect(result).toEqual(expected)
	}, 20000)

	it('stops active local task by messageId', async () => {
		const runId = `e2e-handoff-stop-message-${randomUUID()}`
		let onTaskStarted = () => undefined
		let onTaskAborted = () => undefined
		const taskStarted = new Promise<void>((resolve) => {
			onTaskStarted = resolve
		})
		const taskAborted = new Promise<void>((resolve) => {
			onTaskAborted = resolve
		})

		const execution = commandBus.execute(
			new EnqueueAgentChatMessageCommand(
				{
					id: runId,
					tenantId: process.env.E2E_TENANT_ID ?? 'e2e-tenant',
					organizationId: process.env.E2E_ORGANIZATION_ID ?? 'e2e-org',
					userId: process.env.E2E_USER_ID ?? 'e2e-user',
					sessionKey: `session-${Date.now()}`,
					source: 'chat' as RunSource,
					timeoutMs: 15000
				},
				async ({ signal }) => {
					onTaskStarted()
					await new Promise<void>((resolve) => {
						const onAbort = () => {
							onTaskAborted()
							resolve()
						}
						if (signal.aborted) {
							onAbort()
							return
						}
						signal.addEventListener('abort', onAbort, { once: true })
					})
					return {
						status: 'stopped'
					}
				}
			)
		)

		const executionResult = execution
			.then((value) => ({ value, error: null as Error | null }))
			.catch((error: Error) => ({ value: null as unknown, error }))

		await taskStarted

		const stopResult = await commandBus.execute(
			new StopHandoffMessageCommand({
				messageIds: [runId],
				reason: 'Canceled by user'
			})
		)

		const settled = await executionResult
		expect(settled.error).toBeTruthy()
		expect(settled.error?.message).toContain('canceled:Canceled by user')
		await taskAborted
		expect(stopResult.aborted.messageIds).toContain(runId)
	}, 30000)

	it('stops active local task by executionId', async () => {
		const runId = `e2e-handoff-stop-execution-${randomUUID()}`
		const executionId = `execution-${randomUUID()}`
		let onTaskStarted = () => undefined
		let onTaskAborted = () => undefined
		const taskStarted = new Promise<void>((resolve) => {
			onTaskStarted = resolve
		})
		const taskAborted = new Promise<void>((resolve) => {
			onTaskAborted = resolve
		})

		const execution = commandBus.execute(
			new EnqueueAgentChatMessageCommand(
				{
					id: runId,
					executionId,
					tenantId: process.env.E2E_TENANT_ID ?? 'e2e-tenant',
					organizationId: process.env.E2E_ORGANIZATION_ID ?? 'e2e-org',
					userId: process.env.E2E_USER_ID ?? 'e2e-user',
					sessionKey: `session-${Date.now()}`,
					source: 'chat' as RunSource,
					timeoutMs: 15000
				},
				async ({ signal }) => {
					onTaskStarted()
					await new Promise<void>((resolve) => {
						const onAbort = () => {
							onTaskAborted()
							resolve()
						}
						if (signal.aborted) {
							onAbort()
							return
						}
						signal.addEventListener('abort', onAbort, { once: true })
					})
					return {
						status: 'stopped'
					}
				}
			)
		)

		const executionResult = execution
			.then((value) => ({ value, error: null as Error | null }))
			.catch((error: Error) => ({ value: null as unknown, error }))

		await taskStarted

		const stopResult = await commandBus.execute(
			new StopHandoffMessageCommand({
				executionIds: [executionId],
				reason: 'Canceled by user'
			})
		)

		const settled = await executionResult
		expect(settled.error).toBeTruthy()
		expect(settled.error?.message).toContain('canceled:Canceled by user')
		await taskAborted
		expect(stopResult.aborted.messageIds).toContain(runId)
	}, 30000)
})
