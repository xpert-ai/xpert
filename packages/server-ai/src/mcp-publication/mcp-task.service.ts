// Cancellation intent, handler return and descendant settlement are separate durable events.
// Input responses resume the same live handler; an abandoned claim never replays its body.
import {
    MCP_EXECUTION_CONTROL_EXTENSION_ID,
    mcpOperationIdentitySchema,
    type McpOperationIdentity,
    type McpExecutionControlRequest,
    type McpPrincipal
} from '@xpert-ai/contracts'
import {
    MANAGED_QUEUE_SERVICE_TOKEN,
    type ManagedQueueService,
    type ToolInputApi,
    type ToolTasksApi
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { TaskControlRejected, withTaskControl } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { randomUUID } from 'node:crypto'
import { Repository } from 'typeorm'
import { ToolRuntimeService } from '../tool-runtime'
import { McpPublication, McpPublicationCapability, McpTask } from './entities'
import { McpElicitationService } from './mcp-elicitation.service'
import { McpSubscriptionService } from './mcp-subscription.service'
import { McpTaskExecutionService } from './mcp-task-execution.service'
import { parseMcpRuntimeConfiguration } from './mcp-runtime-configuration'
import { McpTaskControlStore } from './control/mcp-task-control.store'
import { controlledMcpTask } from './control/mcp-task-control.record'
import { McpCreateTaskResult, McpDetailedTask, McpTaskJobPayload } from './mcp-task.types'
import {
    MAX_TASK_PAYLOAD_BYTES,
    MAX_TASK_LIFETIME_MS,
    requireJsonValue,
    assertJsonSize,
    hashText,
    hashJson,
    clampLifetime,
    toCreateTaskResult,
    toDetailedTask,
    invalidTaskParams,
    taskNotFound,
    hasTaskScope,
    parseTaskPayload,
    toMcpCallToolResult,
    taskError,
    jsonObject,
    clampProgress
} from './mcp-task.helpers'
export * from './mcp-task.types'
const DEFAULT_POLL_INTERVAL_MS = 2000

@Injectable()
export class McpTaskService implements OnModuleDestroy {
    private readonly logger = new Logger(McpTaskService.name)
    private readonly active = new Map<string, AbortController>()
    private readonly receipts = new Map<
        string,
        {
            task: McpTask
            outcome: 'completed' | 'failed'
            result?: ReturnType<typeof requireJsonValue>
            error?: ReturnType<typeof taskError>
        }
    >()
    private readonly timer: ReturnType<typeof setInterval>
    private polling = false
    constructor(
        @InjectRepository(McpTask) private readonly taskRepository: Repository<McpTask>,
        @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly managedQueue: ManagedQueueService,
        private readonly toolRuntime: ToolRuntimeService,
        private readonly elicitation: McpElicitationService,
        private readonly subscriptions: McpSubscriptionService,
        private readonly execution: McpTaskExecutionService,
        private readonly control: McpTaskControlStore
    ) {
        this.timer = setInterval(() => void this.reconcile(), 1000)
        this.timer.unref()
    }
    onModuleDestroy() {
        clearInterval(this.timer)
    }
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
        approvalGranted?: boolean
        operation?: McpOperationIdentity
        terminate?: boolean
    }): Promise<McpCreateTaskResult> {
        const arguments_ = requireJsonValue(input.arguments ?? {})
        assertJsonSize(arguments_, MAX_TASK_PAYLOAD_BYTES)
        const operation = input.operation ? mcpOperationIdentitySchema.parse(input.operation) : undefined
        const inputHash = operation && input.terminate ? operation.inputHash : hashJson(arguments_)
        if (operation && (operation.inputHash !== inputHash || operation.toolName !== input.capability.publicName))
            throw invalidTaskParams()
        const idempotencyKey = operation
            ? operationKey(input.publication, input.principal, operation)
            : hashText(
                  `${input.publication.id}\0${input.principal.subjectType}\0${input.principal.subjectId}\0${input.requestId}\0${typeof input.rpcRequestId}\0${String(input.rpcRequestId ?? '')}\0${input.capability.publicName}`
              )
        const lifetimeMs = clampLifetime(input.maxLifetimeMs)
        const taskId = randomUUID()
        const payload: McpTaskJobPayload = {
            version: 1,
            approvalGranted: input.approvalGranted === true,
            taskId,
            publicationId: input.publication.id,
            runtime: parseMcpRuntimeConfiguration(input.publication.runtime),
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
        const seed = this.taskRepository.create({
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
        const reserved = await this.control.reserve(seed, operation, input.terminate)
        if (input.terminate && reserved.task.control) await this.control.terminate(reserved.task)
        if (reserved.task.control) await this.reconcileOne(reserved.task).catch(() => undefined)
        return toCreateTaskResult((await this.control.read(reserved.task.taskId)) ?? reserved.task)
    }

    async get(publication: McpPublication, principal: McpPrincipal, taskId: string): Promise<McpDetailedTask> {
        let task = await this.loadBoundTask(publication, principal, taskId)
        if (task.control) {
            if (task.expiresAt.getTime() <= Date.now() && task.control.phase !== 'settled')
                task = await this.control.terminate(task)
            await this.reconcileOne(task).catch(() => undefined)
            task = await this.control.read(taskId)
        }
        return {
            ...toDetailedTask(task),
            ...(task.control?.operation
                ? { _meta: { [MCP_EXECUTION_CONTROL_EXTENSION_ID]: await this.control.evidence(task) } }
                : {})
        }
    }

    async update(publication: McpPublication, principal: McpPrincipal, taskId: string, inputResponses: unknown) {
        const task = await this.loadBoundTask(publication, principal, taskId)
        if (!task.control) throw invalidTaskParams()
        const supplied = jsonObject(requireJsonValue(inputResponses))
        if (!supplied) throw invalidTaskParams()
        assertJsonSize(supplied, MAX_TASK_PAYLOAD_BYTES)
        await this.control.update(taskId, task.control.generation, async (current, tx) => {
            if ((await this.control.controls.desired(current.control.targetId, tx)) === 'terminated')
                throw invalidTaskParams()
            if (current.status !== 'input_required') return
            const outstanding = jsonObject(current.inputRequests) ?? {}
            const responses = jsonObject(current.inputResponses) ?? {}
            for (const key of Object.keys(outstanding)) {
                if (
                    Object.prototype.hasOwnProperty.call(supplied, key) &&
                    !Object.prototype.hasOwnProperty.call(responses, key)
                )
                    responses[key] = supplied[key]
            }
            assertJsonSize(responses, MAX_TASK_PAYLOAD_BYTES)
            current.inputResponses = responses
        })
        this.subscriptions.publishTaskUpdated(task.publicationId, taskId)
        return { resultType: 'complete' as const }
    }

    async cancel(publication: McpPublication, principal: McpPrincipal, taskId: string) {
        const task = await this.loadBoundTask(publication, principal, taskId)
        if (!task.control) throw invalidTaskParams()
        await this.control.terminate(task)
        this.active.get(taskId)?.abort()
        await this.reconcileOne(task).catch(() => undefined)
        return { resultType: 'complete' as const }
    }

    async controlOperation(
        publication: McpPublication,
        principal: McpPrincipal,
        capability: McpPublicationCapability,
        request: McpExecutionControlRequest
    ) {
        if (
            request.serverId !== publication.id ||
            request.toolName !== capability.publicName ||
            !hasTaskScope(principal, capability.publicName)
        )
            throw taskNotFound()
        const { serverId: _serverId, action, ...identity } = request
        let task = await this.control.byKey(publication.id, operationKey(publication, principal, identity))
        if (!task && action === 'terminate') {
            await this.create({
                publication,
                principal,
                capability,
                arguments: {},
                requestId: identity.operationId,
                executionId: randomUUID(),
                operation: identity,
                terminate: true
            })
            task = await this.control.byKey(publication.id, operationKey(publication, principal, identity))
        }
        if (!task)
            return {
                resultType: 'complete' as const,
                receipt: {
                    version: 1 as const,
                    serverId: publication.id,
                    operationId: identity.operationId,
                    generation: identity.generation,
                    taskId: null,
                    state: 'unknown' as const,
                    intent: 'running' as const,
                    revision: 0,
                    handlerExited: false,
                    descendantsSettled: false
                }
            }
        if (
            task.inputHash !== identity.inputHash ||
            task.control?.generation !== identity.generation ||
            task.toolName !== identity.toolName
        )
            throw invalidTaskParams()
        if (action === 'terminate') {
            await this.cancel(publication, principal, task.taskId)
            return {
                resultType: 'complete' as const,
                receipt: await this.control.evidence(await this.control.read(task.taskId))
            }
        }
        const detailed = await this.get(publication, principal, task.taskId)
        return {
            resultType: 'complete' as const,
            receipt: await this.control.evidence(await this.control.read(task.taskId)),
            task: detailed
        }
    }

    async process(payloadValue: unknown): Promise<void> {
        const delivered = parseTaskPayload(payloadValue)
        if (!delivered) throw invalidTaskParams()
        let task = await this.control.read(delivered.taskId)
        if (!task?.control || task.control.generation !== delivered.generation) return
        // The queue is a wake-up hint; execution input comes from the authorized durable reservation.
        const payload = parseTaskPayload(task.requestPayload)
        if (!payload || payload.taskId !== task.taskId) throw invalidTaskParams()
        controlledMcpTask(task)
        if (task.expiresAt.getTime() <= Date.now()) {
            await this.control.terminate(task)
            return
        }
        try {
            task = await this.control.claim(task)
        } catch (error) {
            if (error instanceof TaskControlRejected && error.reason !== 'paused') return
            throw error
        }
        const controller = new AbortController()
        this.active.set(task.taskId, controller)
        let receipt: typeof this.receipts extends Map<string, infer R> ? R : never = { task, outcome: 'failed' }
        try {
            if ((await this.control.controls.desired(task.control.targetId)) === 'terminated') controller.abort()
            controller.signal.throwIfAborted()
            const result = await withTaskControl({ version: 2, targetId: task.control.targetId }, () =>
                this.execution.run(task, payload, (runtime) =>
                    this.toolRuntime.executeTool({
                        source: 'mcp',
                        mcpRuntime: runtime,
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
                        signal: controller.signal,
                        host: {
                            input: this.createTaskInput(task, payload, controller.signal),
                            tasks: this.createTaskApi(task),
                            events: this.subscriptions.eventsApi(payload.publicationId)
                        }
                    })
                )
            )
            const value = requireJsonValue(toMcpCallToolResult(result, payload.appResourceUri))
            assertJsonSize(value, MAX_TASK_PAYLOAD_BYTES)
            receipt = { task, outcome: 'completed', result: value }
        } catch (error) {
            receipt = { task, outcome: 'failed', error: taskError(error) }
        } finally {
            // Preserve the real result/exit receipt across transient database errors without replay.
            this.receipts.set(task.taskId, receipt)
            this.active.delete(task.taskId)
            await this.flushReceipt(task.taskId)
        }
    }

    private createTaskInput(task: McpTask, payload: McpTaskJobPayload, signal: AbortSignal): ToolInputApi {
        return {
            request: async <TValue extends import('@xpert-ai/contracts').JSONValue>(
                request: import('@xpert-ai/plugin-sdk').ToolInputRequest
            ): Promise<TValue> => {
                const normalized = this.elicitation.normalizeRequest(request)
                const key = randomUUID()
                await this.control.update(task.taskId, task.control.generation, async (current, tx) => {
                    if ((await this.control.controls.desired(current.control.targetId, tx)) === 'terminated')
                        throw invalidTaskParams()
                    current.status = 'input_required'
                    current.inputRequests = {
                        ...(jsonObject(current.inputRequests) ?? {}),
                        [key]: requireJsonValue(this.elicitation.embeddedRequest(normalized))
                    }
                })
                this.subscriptions.publishTaskUpdated(task.publicationId, task.taskId)
                while (true) {
                    signal.throwIfAborted()
                    const current = await this.control.read(task.taskId)
                    if (!current || (await this.control.controls.desired(task.control.targetId)) === 'terminated')
                        throw invalidTaskParams()
                    const responses = jsonObject(current.inputResponses)
                    const resolution = this.elicitation.resolveResponse(normalized, responses?.[key])
                    if (resolution.kind === 'accepted') {
                        await this.execution.run(current, payload, async () => undefined)
                        await this.control.update(task.taskId, task.control.generation, async (latest, tx) => {
                            if ((await this.control.controls.desired(latest.control.targetId, tx)) === 'terminated')
                                throw invalidTaskParams()
                            const requests = jsonObject(latest.inputRequests) ?? {}
                            delete requests[key]
                            latest.inputRequests = Object.keys(requests).length ? requests : null
                            if (!latest.inputRequests) latest.status = 'working'
                        })
                        return resolution.content as TValue
                    }
                    if (resolution.kind === 'declined' || resolution.kind === 'cancelled')
                        throw new Error(t('server-ai:Error.McpElicitationDeclined'))
                    await new Promise<void>((resolve) => setTimeout(resolve, 100))
                }
            }
        }
    }

    private createTaskApi(task: McpTask): ToolTasksApi {
        const assertId = (id: string) => {
            if (id !== task.taskId) throw invalidTaskParams()
        }
        return {
            create: async (request) => {
                if (request.capabilityKey !== parseTaskPayload(task.requestPayload)?.capabilityKey)
                    throw invalidTaskParams()
                return { taskId: task.taskId, status: (await this.control.read(task.taskId)).status }
            },
            update: async (id, patch) => {
                assertId(id)
                if (patch.status === 'input_required') throw invalidTaskParams()
                if (patch.status === 'cancelled') await this.control.terminate(task)
                const current = await this.control.update(id, task.control.generation, (value) => {
                    if (patch.progress !== undefined) value.progress = clampProgress(patch.progress)
                })
                return { taskId: id, status: current.status }
            },
            cancel: async (id) => {
                assertId(id)
                const current = await this.control.terminate(task)
                this.active.get(id)?.abort()
                return { taskId: id, status: current.status }
            }
        }
    }

    private async flushReceipt(id: string) {
        const receipt = this.receipts.get(id)
        if (!receipt) return
        try {
            await this.control.update(id, receipt.task.control.generation, (current) => {
                if (
                    current.control.claim !== receipt.task.control.claim ||
                    current.control.hostId !== this.control.hostId
                )
                    throw invalidTaskParams()
                if (current.control.phase === 'settled') return
                current.control.handlerExited = true
                current.control.phase = 'settling'
                current.control.outcome = receipt.outcome
                current.resultRef = receipt.result ?? null
                current.error = receipt.error ?? null
                current.inputRequests = null
                current.status = 'working'
                current.nextControlAt = new Date()
            })
            this.receipts.delete(id)
            await this.control.finalize(await this.control.read(id))
        } catch {
            this.logger.warn('MCP handler receipt persistence pending')
        }
    }

    async reconcile() {
        if (this.polling) return
        this.polling = true
        try {
            for (const id of this.receipts.keys()) await this.flushReceipt(id)
            for (const task of await this.control.due()) {
                try {
                    await this.reconcileOne(task)
                } catch {
                    this.logger.warn('MCP task control pending')
                }
            }
        } catch {
            this.logger.warn('MCP task control storage unavailable')
        } finally {
            this.polling = false
        }
    }

    async reconcileOne(snapshot: McpTask) {
        let task = await this.control.read(snapshot.taskId)
        if (!task?.control || task.control.phase === 'settled') return
        controlledMcpTask(task)
        if (task.expiresAt.getTime() <= Date.now()) task = await this.control.terminate(task)
        const terminated = (await this.control.controls.desired(task.control.targetId)) === 'terminated'
        if (terminated) this.active.get(task.taskId)?.abort()
        const token = await this.control.controls.delivery(task.control.targetId)
        if (!token) return
        try {
            if (terminated) {
                for (const child of await this.control.controls.descendants(task.control.targetId)) {
                    if (child.id !== task.control.targetId && child.state === 'queued' && !child.claim)
                        await this.control.controls.settleUnstarted(child.id)
                }
                if (task.queueJobId)
                    await this.managedQueue
                        .cancel({ jobId: task.queueJobId, executionPool: 'default' })
                        .catch(() => undefined)
            } else if (!task.control.published && task.control.phase === 'queued') {
                const payload = parseTaskPayload(task.requestPayload)
                if (!payload) throw invalidTaskParams()
                const result = await withTaskControl({ version: 2, targetId: task.control.targetId }, () =>
                    this.managedQueue.enqueue({
                        pluginName: '@xpert-ai/platform',
                        queueName: 'mcp-publication',
                        jobName: 'execute-tool',
                        payload: { ...payload, generation: task.control.generation },
                        tenantId: task.tenantId,
                        organizationId: task.organizationId,
                        userId: payload.principal.userId,
                        jobId: `mcp-task-${task.taskId}-${task.control.generation}`,
                        executionPool: 'default',
                        attempts: 1,
                        controlPolicy: 'attached',
                        drainOnPause: false
                    })
                )
                task = await this.control.update(task.taskId, task.control.generation, (current) => {
                    current.control.published = true
                    current.queueJobId = result.jobId
                })
            }
            task = await this.control.finalize(task)
            if (task.control.phase !== 'settled')
                await this.control.update(task.taskId, task.control.generation, (current) => {
                    current.nextControlAt = new Date(Date.now() + 1000)
                })
            this.subscriptions.publishTaskUpdated(task.publicationId, task.taskId)
        } finally {
            await this.control.controls.delivered(task.control.targetId, token, null)
        }
    }

    private async loadBoundTask(publication: McpPublication, principal: McpPrincipal, id: string) {
        const task = await this.control.read(id)
        if (
            !task ||
            task.publicationId !== publication.id ||
            task.tenantId !== principal.tenantId ||
            (task.organizationId ?? null) !== (principal.organizationId ?? publication.organizationId ?? null) ||
            task.subjectId !== principal.subjectId ||
            task.subjectType !== principal.subjectType ||
            !hasTaskScope(principal, task.toolName)
        )
            throw taskNotFound()
        return task
    }
}

function operationKey(publication: McpPublication, principal: McpPrincipal, operation: McpOperationIdentity) {
    return hashText(JSON.stringify([publication.id, principal.subjectType, principal.subjectId, operation.operationId]))
}
