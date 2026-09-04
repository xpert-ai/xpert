import type { JSONValue, McpPrincipal, McpTaskStatus } from '@xpert-ai/contracts'
import {
    MANAGED_QUEUE_SERVICE_TOKEN,
    type ManagedQueueService,
    type ToolInputApi,
    type ToolInputRequest,
    type ToolTasksApi,
    type XpertToolContent,
    type XpertToolResult
} from '@xpert-ai/plugin-sdk'
import type { CallToolResult } from '@modelcontextprotocol/server'
import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { createHash, randomUUID } from 'node:crypto'
import { Repository } from 'typeorm'
import { applicationMetrics } from '../metrics/application-metrics'
import { ToolRuntimeService } from '../tool-runtime'
import { McpPublication, McpPublicationCapability, McpTask } from './entities'
import { assertMcpAppToolResult } from './mcp-app-tool-result'
import { McpElicitationService } from './mcp-elicitation.service'
import { McpSubscriptionService } from './mcp-subscription.service'

const MCP_TASK_QUEUE_OWNER = '@xpert-ai/platform'
const MCP_TASK_QUEUE_NAME = 'mcp-publication'
const MCP_TASK_JOB_NAME = 'execute-tool'
const DEFAULT_TASK_LIFETIME_MS = 60 * 60 * 1000
const MAX_TASK_LIFETIME_MS = 24 * 60 * 60 * 1000
const DEFAULT_POLL_INTERVAL_MS = 2_000
const CANCELLATION_POLL_INTERVAL_MS = 1_000
const MAX_TASK_PAYLOAD_BYTES = 2 * 1024 * 1024

interface McpTaskJobPayload {
    version: 1
    taskId: string
    publicationId: string
    capabilityId: string
    tenantId: string
    organizationId?: string | null
    toolsetId: string
    capabilityKey: string
    serverName?: string
    remoteName?: string
    remoteTaskMode?: 'optional' | 'required'
    arguments: JSONValue
    principal: {
        type: 'user' | 'service_account'
        id: string
        userId?: string
        clientId?: string
    }
    traceId?: string
    appResourceUri?: string
}

export interface McpCreateTaskResult extends CallToolResult {
    resultType: 'task'
    taskId: string
    status: McpTaskStatus
    statusMessage?: string
    createdAt: string
    lastUpdatedAt: string
    ttlMs: number | null
    pollIntervalMs?: number
}

export type McpDetailedTask = {
    resultType: 'complete'
    taskId: string
    status: McpTaskStatus
    statusMessage?: string
    createdAt: string
    lastUpdatedAt: string
    ttlMs: number | null
    pollIntervalMs?: number
    inputRequests?: JSONValue
    result?: JSONValue
    error?: JSONValue
}

export class McpTaskProtocolError extends Error {
    constructor(
        readonly code: number,
        message: string,
        readonly data?: JSONValue
    ) {
        super(message)
    }
}

class McpTaskInputRequiredError extends Error {}

@Injectable()
export class McpTaskService {
    readonly #activeTaskControllers = new Map<string, Set<AbortController>>()

    constructor(
        @InjectRepository(McpTask)
        private readonly taskRepository: Repository<McpTask>,
        @Inject(MANAGED_QUEUE_SERVICE_TOKEN)
        private readonly managedQueue: ManagedQueueService,
        private readonly toolRuntime: ToolRuntimeService,
        private readonly elicitation: McpElicitationService,
        private readonly subscriptions: McpSubscriptionService
    ) {}

    async create(input: {
        publication: McpPublication
        principal: McpPrincipal
        capability: McpPublicationCapability
        arguments: unknown
        requestId: string
        rpcRequestId?: string | number
        executionId: string
        traceId?: string
        appResourceUri?: string
        maxLifetimeMs?: number
    }): Promise<McpCreateTaskResult> {
        const arguments_ = requireJsonValue(input.arguments ?? {})
        assertJsonSize(arguments_, MAX_TASK_PAYLOAD_BYTES)
        const idempotencyKey = hashText(
            `${input.publication.id}\0${input.principal.subjectType}\0${input.principal.subjectId}\0${input.requestId}\0${typeof input.rpcRequestId}\0${String(input.rpcRequestId ?? '')}\0${input.capability.publicName}`
        )
        const inputHash = hashJson(arguments_)
        const existing = await this.findByIdempotency(input.publication.id, idempotencyKey)
        if (existing) {
            this.assertIdempotentReplay(existing, input.principal, inputHash)
            return toCreateTaskResult(existing)
        }

        const queueHealth = await this.managedQueue.getExecutionPoolHealth({ executionPool: 'default' })
        if (!queueHealth.available) {
            throw new McpTaskProtocolError(
                -32603,
                t('server-ai:Error.McpTaskQueueUnavailable', {
                    defaultValue: 'The MCP task worker is not available.'
                })
            )
        }

        const lifetimeMs = clampLifetime(input.maxLifetimeMs)
        const taskId = randomUUID()
        const payload: McpTaskJobPayload = {
            version: 1,
            taskId,
            publicationId: input.publication.id,
            capabilityId: input.capability.id,
            tenantId: input.publication.tenantId,
            organizationId: input.principal.organizationId ?? input.publication.organizationId ?? null,
            toolsetId: input.capability.toolsetId,
            capabilityKey: input.capability.capabilityKey,
            ...(input.capability.descriptorSnapshot.source.serverName
                ? { serverName: input.capability.descriptorSnapshot.source.serverName }
                : {}),
            ...(input.capability.descriptorSnapshot.source.remoteName
                ? { remoteName: input.capability.descriptorSnapshot.source.remoteName }
                : {}),
            ...(input.capability.descriptorSnapshot.capabilityType === 'tool' &&
            input.capability.descriptorSnapshot.taskMode
                ? { remoteTaskMode: input.capability.descriptorSnapshot.taskMode }
                : {}),
            arguments: arguments_,
            principal: {
                type: input.principal.subjectType,
                id: input.principal.subjectId,
                ...(input.principal.userId ? { userId: input.principal.userId } : {}),
                ...(input.principal.clientId ? { clientId: input.principal.clientId } : {})
            },
            ...(input.traceId ? { traceId: input.traceId } : {}),
            ...(input.appResourceUri ? { appResourceUri: input.appResourceUri } : {})
        }
        const requestPayload = requireJsonValue(payload)
        assertJsonSize(requestPayload, MAX_TASK_PAYLOAD_BYTES)
        const now = new Date()
        let task: McpTask
        try {
            task = await this.saveTask(
                this.taskRepository.create({
                    taskId,
                    publicationId: input.publication.id,
                    capabilityId: input.capability.id,
                    tenantId: input.publication.tenantId,
                    organizationId: input.principal.organizationId ?? input.publication.organizationId ?? null,
                    executionId: input.executionId,
                    requestId: input.requestId.slice(0, 191),
                    toolName: input.capability.publicName,
                    idempotencyKey,
                    inputHash,
                    subjectType: input.principal.subjectType,
                    subjectId: input.principal.subjectId,
                    status: 'working',
                    statusMessage: t('server-ai:Status.McpTaskWorking', {
                        defaultValue: 'The operation is in progress.'
                    }),
                    progress: null,
                    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
                    inputRequests: null,
                    inputResponses: null,
                    requestPayload,
                    resultRef: null,
                    error: null,
                    revision: 0,
                    expiresAt: new Date(now.getTime() + lifetimeMs),
                    createdById: input.principal.userId ?? null,
                    updatedById: input.principal.userId ?? null
                })
            )
        } catch (error) {
            const raced = await this.findByIdempotency(input.publication.id, idempotencyKey)
            if (!raced) throw error
            this.assertIdempotentReplay(raced, input.principal, inputHash)
            return toCreateTaskResult(raced)
        }

        try {
            await this.enqueue(task, payload)
        } catch (error) {
            task.status = 'failed'
            task.statusMessage = t('server-ai:Error.McpTaskQueueFailed', {
                defaultValue: 'The MCP task could not be queued.'
            })
            task.error = taskError(error)
            await this.saveTask(task)
            throw error
        }
        return toCreateTaskResult(task)
    }

    async get(publication: McpPublication, principal: McpPrincipal, taskId: string): Promise<McpDetailedTask> {
        const task = await this.loadBoundTask(publication, principal, taskId)
        if (task.expiresAt.getTime() <= Date.now() && !isTerminal(task.status)) {
            task.status = 'failed'
            task.statusMessage = t('server-ai:Error.McpTaskExpired', {
                defaultValue: 'The MCP task expired before it completed.'
            })
            task.error = { code: 'MCP_TASK_EXPIRED', message: task.statusMessage }
            await this.saveTask(task)
        }
        return toDetailedTask(task)
    }

    async update(
        publication: McpPublication,
        principal: McpPrincipal,
        taskId: string,
        inputResponses: unknown
    ): Promise<{ resultType: 'complete' }> {
        const task = await this.loadBoundTask(publication, principal, taskId)
        if (task.status !== 'input_required') return { resultType: 'complete' }
        const outstanding = jsonObject(task.inputRequests)
        const supplied = jsonObject(requireJsonValue(inputResponses))
        const existing = jsonObject(task.inputResponses)
        if (!outstanding || !supplied) throw invalidTaskParams()

        const merged: Record<string, JSONValue> = { ...(existing ?? {}) }
        for (const key of Object.keys(outstanding)) {
            if (Object.prototype.hasOwnProperty.call(supplied, key)) merged[key] = supplied[key]
        }
        task.inputResponses = merged
        const complete = Object.keys(outstanding).every((key) => Object.prototype.hasOwnProperty.call(merged, key))
        if (!complete) {
            await this.saveTask(task)
            return { resultType: 'complete' }
        }

        const payload = parseTaskPayload(task.requestPayload)
        if (!payload) {
            task.status = 'failed'
            task.statusMessage = t('server-ai:Error.McpTaskPayloadUnavailable', {
                defaultValue: 'The persisted MCP task payload is unavailable.'
            })
            task.error = { code: 'MCP_TASK_PAYLOAD_UNAVAILABLE', message: task.statusMessage }
            await this.saveTask(task)
            return { resultType: 'complete' }
        }
        task.status = 'working'
        task.statusMessage = t('server-ai:Status.McpTaskWorking', {
            defaultValue: 'The operation is in progress.'
        })
        task.revision += 1
        await this.saveTask(task)
        try {
            await this.enqueue(task, payload)
        } catch (error) {
            task.status = 'failed'
            task.statusMessage = t('server-ai:Error.McpTaskQueueFailed', {
                defaultValue: 'The MCP task could not be queued.'
            })
            task.error = taskError(error)
            await this.saveTask(task)
        }
        return { resultType: 'complete' }
    }

    async cancel(
        publication: McpPublication,
        principal: McpPrincipal,
        taskId: string
    ): Promise<{ resultType: 'complete' }> {
        const task = await this.loadBoundTask(publication, principal, taskId)
        if (isTerminal(task.status)) return { resultType: 'complete' }
        if (task.queueJobId) {
            await this.managedQueue.cancel({ jobId: task.queueJobId, executionPool: 'default' })
        }
        task.status = 'cancelled'
        task.statusMessage = t('server-ai:Status.McpTaskCancelled', {
            defaultValue: 'Cancellation was requested for the MCP task.'
        })
        task.inputRequests = null
        await this.saveTask(task)
        this.abortActiveExecutions(task.taskId)
        return { resultType: 'complete' }
    }

    async process(payloadValue: unknown): Promise<void> {
        const payload = parseTaskPayload(payloadValue)
        if (!payload) throw new Error('Invalid MCP task queue payload')
        const task = await this.loadTask(payload.taskId)
        if (!task || isTerminal(task.status)) return
        if (task.expiresAt.getTime() <= Date.now()) {
            task.status = 'failed'
            task.statusMessage = t('server-ai:Error.McpTaskExpired', {
                defaultValue: 'The MCP task expired before it completed.'
            })
            task.error = { code: 'MCP_TASK_EXPIRED', message: task.statusMessage }
            await this.saveTask(task)
            return
        }

        const cancellation = this.watchTaskCancellation(payload.publicationId, task.taskId)
        try {
            await cancellation.refresh()
            if (cancellation.signal.aborted) return
            applicationMetrics.startMcpTask({ publicationId: payload.publicationId })
            try {
                const hostInput = this.createTaskInput(task)
                const hostTasks = this.createTaskApi(task, payload)
                try {
                    const result = await this.toolRuntime.executeTool({
                        source: 'mcp',
                        principal: payload.principal,
                        tenantId: payload.tenantId,
                        organizationId: payload.organizationId ?? null,
                        toolsetId: payload.toolsetId,
                        toolName: payload.capabilityKey,
                        serverName: payload.serverName,
                        remoteName: payload.remoteName,
                        remoteTaskMode: payload.remoteTaskMode,
                        arguments: payload.arguments,
                        executionId: task.executionId,
                        requestId: task.requestId,
                        traceId: payload.traceId,
                        signal: AbortSignal.any([
                            cancellation.signal,
                            AbortSignal.timeout(Math.max(1, task.expiresAt.getTime() - Date.now()))
                        ]),
                        host: {
                            input: hostInput,
                            tasks: hostTasks,
                            events: this.subscriptions.eventsApi(payload.publicationId)
                        }
                    })
                    const current = await this.loadTask(task.taskId)
                    if (!current || current.status === 'cancelled') return
                    current.status = 'completed'
                    current.statusMessage = t('server-ai:Status.McpTaskCompleted', {
                        defaultValue: 'The MCP task completed.'
                    })
                    current.progress = 1
                    const resultRef = requireJsonValue(toMcpCallToolResult(result, payload.appResourceUri))
                    assertJsonSize(resultRef, MAX_TASK_PAYLOAD_BYTES)
                    current.resultRef = resultRef
                    current.error = null
                    current.inputRequests = null
                    await this.saveTask(current)
                } catch (error) {
                    if (error instanceof McpTaskInputRequiredError) return
                    const current = await this.loadTask(task.taskId)
                    if (!current || current.status === 'cancelled') return
                    current.status = 'failed'
                    current.statusMessage = error instanceof Error ? error.message.slice(0, 500) : 'MCP task failed'
                    current.error = taskError(error)
                    current.inputRequests = null
                    await this.saveTask(current)
                }
            } finally {
                applicationMetrics.finishMcpTask({ publicationId: payload.publicationId })
            }
        } finally {
            cancellation.close()
        }
    }

    private watchTaskCancellation(publicationId: string, taskId: string) {
        const controller = new AbortController()
        let controllers = this.#activeTaskControllers.get(taskId)
        if (!controllers) {
            controllers = new Set()
            this.#activeTaskControllers.set(taskId, controllers)
        }
        controllers.add(controller)

        let checking = false
        const refresh = async () => {
            if (checking || controller.signal.aborted) return
            checking = true
            try {
                const current = await this.loadTask(taskId)
                if (!current || current.status === 'cancelled') abortTaskController(controller)
            } finally {
                checking = false
            }
        }
        const unsubscribe = this.subscriptions.subscribeTasks(publicationId, (updatedTaskId) => {
            if (updatedTaskId === taskId) void refresh()
        })
        const poll = setInterval(() => void refresh(), CANCELLATION_POLL_INTERVAL_MS)
        poll.unref?.()
        let closed = false
        return {
            signal: controller.signal,
            refresh,
            close: () => {
                if (closed) return
                closed = true
                clearInterval(poll)
                unsubscribe()
                controllers?.delete(controller)
                if (!controllers?.size) this.#activeTaskControllers.delete(taskId)
            }
        }
    }

    private abortActiveExecutions(taskId: string) {
        for (const controller of this.#activeTaskControllers.get(taskId) ?? []) {
            abortTaskController(controller)
        }
    }

    private createTaskInput(task: McpTask): ToolInputApi {
        let sequence = 0
        return {
            request: async <TValue extends JSONValue = JSONValue>(request: ToolInputRequest): Promise<TValue> => {
                sequence += 1
                const normalized = this.elicitation.normalizeRequest(request)
                const key = `input-${sequence}-${hashJson(requireJsonValue(normalized)).slice(0, 12)}`
                const responses = jsonObject(task.inputResponses)
                const resolution = this.elicitation.resolveResponse(normalized, responses?.[key])
                if (resolution.kind === 'accepted') return resolution.content as TValue
                if (resolution.kind === 'declined' || resolution.kind === 'cancelled') {
                    throw new Error(
                        t('server-ai:Error.McpElicitationDeclined', {
                            defaultValue: 'The client declined or cancelled the requested input.'
                        })
                    )
                }

                task.status = 'input_required'
                task.statusMessage = t('server-ai:Status.McpTaskInputRequired', {
                    defaultValue: 'The MCP task requires additional input.'
                })
                const outstanding = jsonObject(task.inputRequests) ?? {}
                task.inputRequests = requireJsonValue({
                    ...outstanding,
                    [key]: this.elicitation.embeddedRequest(normalized)
                })
                await this.saveTask(task)
                throw new McpTaskInputRequiredError()
            }
        }
    }

    private createTaskApi(task: McpTask, payload: McpTaskJobPayload): ToolTasksApi {
        return {
            create: async (request) => {
                if (request.capabilityKey !== payload.capabilityKey) {
                    throw new Error('A running MCP task cannot create a task for another capability')
                }
                return { taskId: task.taskId, status: task.status }
            },
            update: async (taskId, patch) => {
                if (taskId !== task.taskId) throw new Error('MCP task binding mismatch')
                if (patch.status === 'input_required') {
                    throw new Error('Use host.input.request() to place an MCP task into input_required')
                }
                if (patch.progress !== undefined) task.progress = clampProgress(patch.progress)
                if (patch.status === 'cancelled') task.status = 'cancelled'
                await this.saveTask(task)
                return { taskId: task.taskId, status: task.status }
            },
            cancel: async (taskId) => {
                if (taskId !== task.taskId) throw new Error('MCP task binding mismatch')
                task.status = 'cancelled'
                await this.saveTask(task)
                return { taskId: task.taskId, status: task.status }
            }
        }
    }

    private async enqueue(task: McpTask, payload: McpTaskJobPayload) {
        const result = await this.managedQueue.enqueue({
            pluginName: MCP_TASK_QUEUE_OWNER,
            queueName: MCP_TASK_QUEUE_NAME,
            jobName: MCP_TASK_JOB_NAME,
            payload,
            tenantId: payload.tenantId,
            organizationId: payload.organizationId,
            userId: payload.principal.userId,
            jobId: `mcp-task-${task.taskId}-${task.revision}`,
            attempts: 1,
            removeOnComplete: { age: Math.ceil(MAX_TASK_LIFETIME_MS / 1000), count: 10_000 },
            removeOnFail: { age: Math.ceil(MAX_TASK_LIFETIME_MS / 1000), count: 10_000 },
            executionPool: 'default'
        })
        task.queueJobId = result.jobId
        await this.saveTask(task)
    }

    private async loadBoundTask(publication: McpPublication, principal: McpPrincipal, taskId: string) {
        const task = await this.loadTask(taskId, publication.id)
        if (
            !task ||
            task.subjectType !== principal.subjectType ||
            task.subjectId !== principal.subjectId ||
            !hasTaskScope(principal, task.toolName)
        ) {
            throw taskNotFound()
        }
        return task
    }

    private async saveTask(task: McpTask) {
        const saved = await this.taskRepository.save(task)
        this.subscriptions.publishTaskUpdated(saved.publicationId, saved.taskId)
        return saved
    }

    private loadTask(taskId: string, publicationId?: string) {
        const query = this.taskRepository
            .createQueryBuilder('task')
            .addSelect([
                'task.inputRequests',
                'task.inputResponses',
                'task.requestPayload',
                'task.resultRef',
                'task.error'
            ])
            .where('task.taskId = :taskId', { taskId })
        if (publicationId) query.andWhere('task.publicationId = :publicationId', { publicationId })
        return query.getOne()
    }

    private findByIdempotency(publicationId: string, idempotencyKey: string) {
        return this.taskRepository
            .createQueryBuilder('task')
            .where('task.publicationId = :publicationId', { publicationId })
            .andWhere('task.idempotencyKey = :idempotencyKey', { idempotencyKey })
            .getOne()
    }

    private assertIdempotentReplay(task: McpTask, principal: McpPrincipal, inputHash: string) {
        if (
            task.subjectType !== principal.subjectType ||
            task.subjectId !== principal.subjectId ||
            task.inputHash !== inputHash
        ) {
            throw new McpTaskProtocolError(
                -32602,
                t('server-ai:Error.McpTaskIdempotencyConflict', {
                    defaultValue: 'The MCP request ID was already used with different input or credentials.'
                })
            )
        }
    }
}

function toCreateTaskResult(task: McpTask): McpCreateTaskResult {
    const createdAt = task.createdAt ?? new Date()
    const updatedAt = task.updatedAt ?? createdAt
    return {
        content: [],
        resultType: 'task',
        taskId: task.taskId,
        status: task.status,
        ...(task.statusMessage ? { statusMessage: task.statusMessage } : {}),
        createdAt: createdAt.toISOString(),
        lastUpdatedAt: updatedAt.toISOString(),
        ttlMs: Math.max(0, task.expiresAt.getTime() - createdAt.getTime()),
        ...(task.pollIntervalMs ? { pollIntervalMs: task.pollIntervalMs } : {})
    }
}

function toDetailedTask(task: McpTask): McpDetailedTask {
    const createdAt = task.createdAt ?? new Date()
    const updatedAt = task.updatedAt ?? createdAt
    return {
        resultType: 'complete',
        taskId: task.taskId,
        status: task.status,
        ...(task.statusMessage ? { statusMessage: task.statusMessage } : {}),
        createdAt: createdAt.toISOString(),
        lastUpdatedAt: updatedAt.toISOString(),
        ttlMs: Math.max(0, task.expiresAt.getTime() - createdAt.getTime()),
        ...(task.pollIntervalMs ? { pollIntervalMs: task.pollIntervalMs } : {}),
        ...(task.status === 'input_required' && task.inputRequests ? { inputRequests: task.inputRequests } : {}),
        ...(task.status === 'completed' && task.resultRef ? { result: task.resultRef } : {}),
        ...(task.status === 'failed' && task.error ? { error: toTaskProtocolError(task.error) } : {})
    }
}

function toTaskProtocolError(error: { code?: string; message: string }): JSONValue {
    return {
        code: -32603,
        message: error.message,
        ...(error.code ? { data: { internalCode: error.code } } : {})
    }
}

function toMcpCallToolResult(result: XpertToolResult, appResourceUri?: string): CallToolResult {
    assertMcpAppToolResult(result, Boolean(appResourceUri))
    const content = (result.content ?? []).flatMap(toMcpContent)
    const structuredContent = jsonObjectOrUndefined(result.structuredContent)
    const meta =
        result.meta || appResourceUri
            ? {
                  ...(result.meta ?? {}),
                  ...(appResourceUri ? { ui: { resourceUri: appResourceUri } } : {})
              }
            : undefined
    return {
        content: content.length
            ? content
            : [{ type: 'text', text: structuredContent ? JSON.stringify(structuredContent) : '' }],
        ...(structuredContent ? { structuredContent } : {}),
        ...(meta ? { _meta: meta } : {}),
        ...(result.isError !== undefined ? { isError: result.isError } : {})
    }
}

function toMcpContent(content: XpertToolContent): CallToolResult['content'] {
    switch (content.type) {
        case 'text':
            return [{ type: 'text', text: content.text }]
        case 'image':
            return [{ type: 'image', data: content.data, mimeType: content.mimeType }]
        case 'audio':
            return [{ type: 'audio', data: content.data, mimeType: content.mimeType }]
        case 'resource_link':
            assertAllowedResourceUri(content.uri)
            return [{ type: 'resource_link', uri: content.uri, name: content.name ?? content.uri }]
    }
}

function parseTaskPayload(value: unknown): McpTaskJobPayload | null {
    if (!isObject(value) || Reflect.get(value, 'version') !== 1) return null
    const principal = Reflect.get(value, 'principal')
    const arguments_ = Reflect.get(value, 'arguments')
    if (!isObject(principal) || !isJsonValue(arguments_)) return null
    const principalType = Reflect.get(principal, 'type')
    const principalId = Reflect.get(principal, 'id')
    const userId = Reflect.get(principal, 'userId')
    const clientId = Reflect.get(principal, 'clientId')
    if (
        (principalType !== 'user' && principalType !== 'service_account') ||
        typeof principalId !== 'string' ||
        (userId !== undefined && typeof userId !== 'string') ||
        (clientId !== undefined && typeof clientId !== 'string')
    ) {
        return null
    }
    const required = ['taskId', 'publicationId', 'capabilityId', 'tenantId', 'toolsetId', 'capabilityKey'] as const
    if (required.some((key) => typeof Reflect.get(value, key) !== 'string')) return null
    const organizationId = Reflect.get(value, 'organizationId')
    const serverName = Reflect.get(value, 'serverName')
    const remoteName = Reflect.get(value, 'remoteName')
    const remoteTaskMode = Reflect.get(value, 'remoteTaskMode')
    const traceId = Reflect.get(value, 'traceId')
    const appResourceUri = Reflect.get(value, 'appResourceUri')
    if (
        (organizationId !== undefined && organizationId !== null && typeof organizationId !== 'string') ||
        (serverName !== undefined && typeof serverName !== 'string') ||
        (remoteName !== undefined && typeof remoteName !== 'string') ||
        (remoteTaskMode !== undefined && remoteTaskMode !== 'optional' && remoteTaskMode !== 'required') ||
        (traceId !== undefined && typeof traceId !== 'string') ||
        (appResourceUri !== undefined && typeof appResourceUri !== 'string')
    ) {
        return null
    }
    return {
        version: 1,
        taskId: Reflect.get(value, 'taskId'),
        publicationId: Reflect.get(value, 'publicationId'),
        capabilityId: Reflect.get(value, 'capabilityId'),
        tenantId: Reflect.get(value, 'tenantId'),
        organizationId: typeof organizationId === 'string' ? organizationId : null,
        toolsetId: Reflect.get(value, 'toolsetId'),
        capabilityKey: Reflect.get(value, 'capabilityKey'),
        ...(typeof serverName === 'string' ? { serverName } : {}),
        ...(typeof remoteName === 'string' ? { remoteName } : {}),
        ...(remoteTaskMode === 'optional' || remoteTaskMode === 'required' ? { remoteTaskMode } : {}),
        arguments: arguments_,
        principal: {
            type: principalType,
            id: principalId,
            ...(typeof userId === 'string' ? { userId } : {}),
            ...(typeof clientId === 'string' ? { clientId } : {})
        },
        ...(typeof traceId === 'string' ? { traceId } : {}),
        ...(typeof appResourceUri === 'string' ? { appResourceUri } : {})
    }
}

function assertAllowedResourceUri(uri: string) {
    const parsed = new URL(uri)
    if (['file:', 'javascript:', 'data:'].includes(parsed.protocol)) {
        throw new Error(`MCP Resource URI scheme '${parsed.protocol}' is not allowed`)
    }
    const decodedPath = decodeURIComponent(parsed.pathname)
    if (decodedPath.split('/').includes('..')) {
        throw new Error('MCP Resource URI contains directory traversal')
    }
}

function requireJsonValue(value: unknown): JSONValue {
    const normalized = normalizeJsonValue(value, 0)
    if (normalized === undefined) throw invalidTaskParams()
    return normalized
}

function normalizeJsonValue(value: unknown, depth: number): JSONValue | undefined {
    if (depth > 50) return undefined
    if (value === null) return null
    if (typeof value === 'string') return value
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
    if (Array.isArray(value)) {
        const items: JSONValue[] = []
        for (const item of value) {
            const normalized = normalizeJsonValue(item, depth + 1)
            if (normalized === undefined) return undefined
            items.push(normalized)
        }
        return items
    }
    if (!isObject(value)) return undefined
    const result: Record<string, JSONValue> = {}
    for (const key of Object.keys(value)) {
        const normalized = normalizeJsonValue(Reflect.get(value, key), depth + 1)
        if (normalized !== undefined) result[key] = normalized
    }
    return result
}

function isJsonValue(value: unknown): value is JSONValue {
    return normalizeJsonValue(value, 0) !== undefined
}

function jsonObject(value: unknown): Record<string, JSONValue> | null {
    if (!isObject(value)) return null
    const normalized = normalizeJsonValue(value, 0)
    return normalized && !Array.isArray(normalized) && typeof normalized === 'object' ? normalized : null
}

function jsonObjectOrUndefined(value: unknown): Record<string, unknown> | undefined {
    const normalized = normalizeJsonValue(value, 0)
    return normalized && !Array.isArray(normalized) && typeof normalized === 'object'
        ? Object.fromEntries(Object.entries(normalized))
        : undefined
}

function isObject(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hashJson(value: JSONValue) {
    return hashText(canonicalJson(value))
}

function canonicalJson(value: JSONValue): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
    if (value && typeof value === 'object') {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
            .join(',')}}`
    }
    return JSON.stringify(value)
}

function hashText(value: string) {
    return createHash('sha256').update(value).digest('hex')
}

function assertJsonSize(value: JSONValue, maxBytes: number) {
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maxBytes) throw invalidTaskParams()
}

function clampLifetime(value?: number) {
    if (!Number.isFinite(value) || !value || value <= 0) return DEFAULT_TASK_LIFETIME_MS
    return Math.min(Math.max(Math.trunc(value), 60_000), MAX_TASK_LIFETIME_MS)
}

function clampProgress(value: number) {
    if (!Number.isFinite(value)) throw new Error('MCP task progress must be a finite number')
    return Math.min(Math.max(value, 0), 1)
}

function isTerminal(status: McpTaskStatus) {
    return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function abortTaskController(controller: AbortController) {
    if (!controller.signal.aborted) controller.abort(new Error('MCP task execution was cancelled'))
}

function hasTaskScope(principal: McpPrincipal, toolName: string) {
    return (
        principal.scopes.includes('*') ||
        principal.scopes.includes('tools:call') ||
        principal.scopes.includes(`tools:call:${toolName}`)
    )
}

function taskError(error: unknown): { code?: string; message: string } {
    const message = error instanceof Error ? error.message : String(error)
    const code =
        isObject(error) && typeof Reflect.get(error, 'code') === 'string'
            ? Reflect.get(error, 'code').slice(0, 100)
            : error instanceof Error
              ? error.name.slice(0, 100)
              : undefined
    return { ...(code ? { code } : {}), message: message.slice(0, 2_000) }
}

function taskNotFound() {
    return new McpTaskProtocolError(
        -32602,
        t('server-ai:Error.McpTaskNotFound', { defaultValue: 'The MCP task was not found.' })
    )
}

function invalidTaskParams() {
    return new McpTaskProtocolError(
        -32602,
        t('server-ai:Error.McpTaskInvalidParams', { defaultValue: 'The MCP task request is invalid.' })
    )
}
