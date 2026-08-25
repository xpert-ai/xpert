import { MCP_CAPABILITY_DESCRIPTOR_VERSION, type McpPrincipal } from '@xpert-ai/contracts'
import type { ManagedQueueService, ToolInputRequest } from '@xpert-ai/plugin-sdk'
import type { Repository } from 'typeorm'
import { ToolRuntimeService } from '../tool-runtime'
import { McpPublication, McpPublicationCapability, McpTask } from './entities'
import { McpElicitationService } from './mcp-elicitation.service'
import { McpTaskService } from './mcp-task.service'
import { McpSubscriptionService } from './mcp-subscription.service'

describe('McpTaskService', () => {
    let stored: McpTask[]
    let repository: Repository<McpTask>
    let queue: jest.Mocked<Pick<ManagedQueueService, 'enqueue' | 'cancel' | 'getExecutionPoolHealth'>>
    let runtime: jest.Mocked<Pick<ToolRuntimeService, 'executeTool'>>
    let subscriptions: McpSubscriptionService
    let service: McpTaskService

    beforeEach(() => {
        stored = []
        repository = createTaskRepository(stored)
        queue = {
            enqueue: jest.fn().mockImplementation(async (input) => ({ jobId: input.jobId ?? 'generated-job' })),
            cancel: jest.fn().mockResolvedValue({ success: true, jobId: 'job' }),
            getExecutionPoolHealth: jest.fn().mockResolvedValue({
                executionPool: 'default',
                available: true,
                workerCount: 1
            })
        }
        runtime = {
            executeTool: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'done' }] })
        }
        const elicitation = {
            normalizeRequest: (request: ToolInputRequest) => request,
            embeddedRequest: (request: ToolInputRequest) => ({
                method: 'elicitation/create',
                params:
                    request.type === 'form'
                        ? { mode: 'form', message: request.title, requestedSchema: request.schema }
                        : { mode: 'url', message: request.title, url: request.url }
            }),
            resolveResponse: (_request: ToolInputRequest, response: unknown) => {
                if (typeof response !== 'object' || response === null) return { kind: 'missing' } as const
                return Reflect.get(response, 'action') === 'accept'
                    ? { kind: 'accepted', content: Reflect.get(response, 'content') }
                    : { kind: 'missing' }
            }
        }
        subscriptions = createTaskSubscriptions()
        service = new McpTaskService(
            repository,
            queue as unknown as ManagedQueueService,
            runtime as unknown as ToolRuntimeService,
            elicitation as unknown as McpElicitationService,
            subscriptions
        )
    })

    it('durably creates and completes one queued task', async () => {
        const result = await service.create(taskInput())

        expect(result).toMatchObject({ resultType: 'task', status: 'working' })
        expect(stored).toHaveLength(1)
        expect(queue.enqueue).toHaveBeenCalledTimes(1)

        const payload = queue.enqueue.mock.calls[0][0].payload
        await service.process(payload)

        expect(runtime.executeTool).toHaveBeenCalledWith(
            expect.objectContaining({
                serverName: 'third-party',
                remoteName: 'long_task',
                remoteTaskMode: 'required'
            })
        )

        const completed = await service.get(publication(), principal(), result.taskId)
        expect(completed).toMatchObject({
            resultType: 'complete',
            status: 'completed',
            result: { content: [{ type: 'text', text: 'done' }] }
        })
        await expect(service.get(publication(), principal(), result.taskId)).resolves.toEqual(completed)
        expect(runtime.executeTool).toHaveBeenCalledTimes(1)
    })

    it('deduplicates exact retries and rejects request ID reuse with changed input', async () => {
        const first = await service.create(taskInput())
        const replay = await service.create(taskInput())

        expect(replay.taskId).toBe(first.taskId)
        expect(queue.enqueue).toHaveBeenCalledTimes(1)
        await expect(service.create(taskInput({ arguments: { value: 'changed' } }))).rejects.toMatchObject({
            code: -32602
        })
    })

    it('isolates the same request ID between principals', async () => {
        const first = await service.create(taskInput())
        const second = await service.create(taskInput({ principal: principal('10000000-0000-4000-8000-000000000008') }))

        expect(second.taskId).not.toBe(first.taskId)
        expect(queue.enqueue).toHaveBeenCalledTimes(2)
    })

    it('isolates separate RPC calls within the same transport request', async () => {
        const first = await service.create(taskInput({ rpcRequestId: 'rpc-call-1' }))
        const second = await service.create(taskInput({ rpcRequestId: 'rpc-call-2' }))

        expect(second.taskId).not.toBe(first.taskId)
        expect(queue.enqueue).toHaveBeenCalledTimes(2)
    })

    it('persists input_required and resumes from tasks/update without creating a second task', async () => {
        runtime.executeTool.mockImplementation(async (request) => {
            const input = await request.host?.input?.request({
                type: 'form',
                title: 'Confirm',
                schema: {
                    type: 'object',
                    properties: { approved: { type: 'boolean' } },
                    required: ['approved']
                }
            })
            return { structuredContent: { input } }
        })
        const created = await service.create(taskInput())
        const payload = queue.enqueue.mock.calls[0][0].payload

        await service.process(payload)
        const waiting = await service.get(publication(), principal(), created.taskId)
        expect(waiting.status).toBe('input_required')
        const inputRequests = waiting.inputRequests
        expect(inputRequests).toBeDefined()
        const inputKey = Object.keys(inputRequests as object)[0]

        await service.update(publication(), principal(), created.taskId, {
            [inputKey]: { action: 'accept', content: { approved: true } }
        })
        expect(queue.enqueue).toHaveBeenCalledTimes(2)
        await service.process(queue.enqueue.mock.calls[1][0].payload)

        await expect(service.get(publication(), principal(), created.taskId)).resolves.toMatchObject({
            status: 'completed',
            result: { structuredContent: { input: { approved: true } } }
        })
        expect(stored).toHaveLength(1)
    })

    it('fails a task instead of persisting an oversized result', async () => {
        runtime.executeTool.mockResolvedValue({
            content: [{ type: 'text', text: 'x'.repeat(2 * 1024 * 1024) }]
        })
        const created = await service.create(taskInput())

        await service.process(queue.enqueue.mock.calls[0][0].payload)

        const detail = await service.get(publication(), principal(), created.taskId)
        expect(detail).toMatchObject({
            status: 'failed',
            error: {
                code: -32603,
                message: expect.any(String),
                data: { internalCode: expect.any(String) }
            }
        })
        expect(detail).not.toHaveProperty('result')
    })

    it('enforces text fallback and structured content for an App-linked task result', async () => {
        const missingStructured = await service.create(
            taskInput({
                appResourceUri: 'ui://xpert/publication/app',
                requestId: 'rpc-request-app-invalid'
            })
        )
        await service.process(queue.enqueue.mock.calls[0][0].payload)
        await expect(service.get(publication(), principal(), missingStructured.taskId)).resolves.toMatchObject({
            status: 'failed',
            error: { message: expect.stringContaining('structuredContent') }
        })

        runtime.executeTool.mockResolvedValueOnce({
            content: [{ type: 'text', text: 'Model fallback' }],
            structuredContent: { view: 'ready' }
        })
        const valid = await service.create(
            taskInput({ appResourceUri: 'ui://xpert/publication/app', requestId: 'rpc-request-app-valid' })
        )
        await service.process(queue.enqueue.mock.calls[1][0].payload)
        await expect(service.get(publication(), principal(), valid.taskId)).resolves.toMatchObject({
            status: 'completed',
            result: {
                content: [{ type: 'text', text: 'Model fallback' }],
                structuredContent: { view: 'ready' },
                _meta: { ui: { resourceUri: 'ui://xpert/publication/app' } }
            }
        })
    })

    it('cancels the durable queue job and prevents a late worker from executing it', async () => {
        const created = await service.create(taskInput())
        const payload = queue.enqueue.mock.calls[0][0].payload

        await service.cancel(publication(), principal(), created.taskId)
        await service.process(payload)

        expect(queue.cancel).toHaveBeenCalledWith({
            jobId: expect.stringContaining(`mcp-task-${created.taskId}`),
            executionPool: 'default'
        })
        expect(runtime.executeTool).not.toHaveBeenCalled()
        await expect(service.get(publication(), principal(), created.taskId)).resolves.toMatchObject({
            status: 'cancelled'
        })
    })

    it('aborts an active execution when cancellation is issued through another API instance', async () => {
        queue.cancel.mockResolvedValue({ success: false, jobId: 'job', state: 'active', reason: 'active' })
        let executionSignal: AbortSignal | undefined
        runtime.executeTool.mockImplementation(async (request) => {
            executionSignal = request.signal
            await new Promise<void>((_resolve, reject) => {
                const rejectCancelled = () => reject(request.signal?.reason ?? new Error('cancelled'))
                if (request.signal?.aborted) rejectCancelled()
                else request.signal?.addEventListener('abort', rejectCancelled, { once: true })
            })
            return { content: [{ type: 'text', text: 'should not complete' }] }
        })
        const created = await service.create(taskInput())
        const payload = queue.enqueue.mock.calls[0][0].payload
        const processing = service.process(payload)
        await waitUntil(() => runtime.executeTool.mock.calls.length === 1)

        const cancellingApi = new McpTaskService(
            repository,
            queue as unknown as ManagedQueueService,
            runtime as unknown as ToolRuntimeService,
            {
                normalizeRequest: (request: ToolInputRequest) => request
            } as unknown as McpElicitationService,
            subscriptions
        )
        await cancellingApi.cancel(publication(), principal(), created.taskId)
        await processing

        expect(executionSignal?.aborted).toBe(true)
        await expect(service.get(publication(), principal(), created.taskId)).resolves.toMatchObject({
            status: 'cancelled'
        })
    })
})

function taskInput(overrides?: {
    arguments?: unknown
    appResourceUri?: string
    principal?: McpPrincipal
    requestId?: string
    rpcRequestId?: string | number
}) {
    return {
        publication: publication(),
        principal: overrides?.principal ?? principal(),
        capability: capability(),
        arguments: overrides?.arguments ?? { value: 'original' },
        requestId: overrides?.requestId ?? 'rpc-request-1',
        rpcRequestId: overrides?.rpcRequestId ?? 1,
        executionId: '20000000-0000-4000-8000-000000000001',
        ...(overrides?.appResourceUri ? { appResourceUri: overrides.appResourceUri } : {})
    }
}

function publication() {
    return Object.assign(new McpPublication(), {
        id: '10000000-0000-4000-8000-000000000001',
        tenantId: '10000000-0000-4000-8000-000000000002',
        organizationId: '10000000-0000-4000-8000-000000000003',
        slug: 'test-publication'
    })
}

function capability() {
    return Object.assign(new McpPublicationCapability(), {
        id: '10000000-0000-4000-8000-000000000005',
        toolsetId: '10000000-0000-4000-8000-000000000006',
        capabilityKey: 'long_task',
        publicName: 'long_task',
        descriptorSnapshot: {
            descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
            capabilityType: 'tool',
            capabilityKey: 'long_task',
            inputSchema: { type: 'object' },
            behavior: { risk: 'write', sideEffect: 'reversible', idempotency: 'idempotent' },
            taskMode: 'required',
            requiredContext: ['workspace', 'principal', 'execution'],
            visibility: ['model'],
            source: {
                toolsetId: '10000000-0000-4000-8000-000000000006',
                serverName: 'third-party',
                remoteName: 'long_task'
            }
        }
    })
}

function principal(subjectId = '10000000-0000-4000-8000-000000000007'): McpPrincipal {
    return {
        authMethod: 'api_key',
        subjectType: 'user',
        subjectId,
        userId: subjectId,
        tenantId: '10000000-0000-4000-8000-000000000002',
        organizationId: '10000000-0000-4000-8000-000000000003',
        publicationId: '10000000-0000-4000-8000-000000000001',
        scopes: ['tools:call']
    }
}

function createTaskSubscriptions(): McpSubscriptionService {
    const listeners = new Map<string, Set<(taskId: string) => void>>()
    return {
        eventsApi: () => ({ emit: jest.fn() }),
        publishTaskUpdated: (publicationId: string, taskId: string) => {
            for (const listener of listeners.get(publicationId) ?? []) listener(taskId)
        },
        subscribeTasks: (publicationId: string, listener: (taskId: string) => void) => {
            let publicationListeners = listeners.get(publicationId)
            if (!publicationListeners) {
                publicationListeners = new Set()
                listeners.set(publicationId, publicationListeners)
            }
            publicationListeners.add(listener)
            return () => {
                publicationListeners?.delete(listener)
                if (!publicationListeners?.size) listeners.delete(publicationId)
            }
        }
    } as unknown as McpSubscriptionService
}

async function waitUntil(predicate: () => boolean) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (predicate()) return
        await new Promise<void>((resolve) => setImmediate(resolve))
    }
    throw new Error('Timed out waiting for MCP task execution')
}

function createTaskRepository(stored: McpTask[]): Repository<McpTask> {
    const repository = {
        create: (input: object) => Object.assign(new McpTask(), input),
        save: async (task: McpTask) => {
            const now = new Date()
            task.createdAt ??= now
            task.updatedAt = now
            const index = stored.findIndex((item) => item.taskId === task.taskId)
            if (index === -1) stored.push(task)
            else stored[index] = task
            return task
        },
        createQueryBuilder: () => {
            const parameters: Record<string, string> = {}
            const builder = {
                addSelect: () => builder,
                where: (_query: string, values: Record<string, string>) => {
                    Object.assign(parameters, values)
                    return builder
                },
                andWhere: (_query: string, values: Record<string, string>) => {
                    Object.assign(parameters, values)
                    return builder
                },
                getOne: async () =>
                    stored.find((task) =>
                        parameters.taskId
                            ? task.taskId === parameters.taskId &&
                              (!parameters.publicationId || task.publicationId === parameters.publicationId)
                            : task.publicationId === parameters.publicationId &&
                              task.idempotencyKey === parameters.idempotencyKey
                    ) ?? null
            }
            return builder
        }
    }
    return repository as unknown as Repository<McpTask>
}
