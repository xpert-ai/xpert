import { McpControlError } from './mcp-control.error'
// Retain original work independently of caller wait lifetime. Compensation never invokes tools/call.
// Only a negotiated receipt for the pinned service/generation confirms remote settlement.
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { randomUUID } from 'node:crypto'
import { MCP_EXECUTION_CONTROL_EXTENSION_ID, mcpExecutionCapabilitySchema } from '@xpert-ai/contracts'
import { withTaskControl } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { hashJson, requireJsonValue, hashText } from '../../mcp-publication/mcp-task.helpers'
import { McpOperationStore } from './mcp-operation.store'
import { McpOperationTransport } from './mcp-operation.transport'
import { ExecuteMcpOperationCommand } from './mcp-operation.command'
import { McpRemoteOperation } from './mcp-operation.entity'
import { McpConsumer } from '../mcp-consumer'
import { mcpTaskStartResultSchema } from '../tasks/task-schemas'
import { requestMcpControl } from './mcp-control.client'
export { controlMeta } from './mcp-control.client'
import { mcpConsumerCallToolResultSchema } from '../tools/mcp-consumer-call-tool-result'
import { readMcpOperation } from './mcp-operation.schema'

@Injectable()
@CommandHandler(ExecuteMcpOperationCommand)
export class McpOperationService implements ICommandHandler<ExecuteMcpOperationCommand>, OnModuleDestroy {
    private readonly logger = new Logger(McpOperationService.name)
    private readonly timer: ReturnType<typeof setInterval>
    private polling = false
    private stopped = false
    private readonly originals = new Map<string, McpConsumer>()
    private readonly writes = new Map<string, () => Promise<unknown>>()
    constructor(
        private readonly store: McpOperationStore,
        private readonly transport: McpOperationTransport
    ) {
        this.timer = setInterval(() => void this.reconcile(), 1000)
        this.timer.unref()
    }
    onModuleDestroy() {
        this.stopped = true
        clearInterval(this.timer)
    }

    async execute({ input }: ExecuteMcpOperationCommand) {
        input.signal?.throwIfAborted()
        const pinned = await this.transport.prepare(input.toolsetId, input.serverName, input.toolName, input.authority)
        if (pinned.connectionVersion !== input.connectionVersion) throw new McpControlError('connection')
        const descriptor = await input.consumer.connection.describeServer(input.serverName)
        const extension =
            typeof descriptor.capabilities === 'object' && descriptor.capabilities !== null
                ? Reflect.get(descriptor.capabilities, 'extensions')
                : undefined
        const capability = mcpExecutionCapabilitySchema.safeParse(
            typeof extension === 'object' && extension !== null
                ? Reflect.get(extension, MCP_EXECUTION_CONTROL_EXTENSION_ID)
                : undefined
        )
        const operationId = randomUUID(),
            generation = randomUUID()
        const parent = await this.store.controls.producer()
        if (parent && !input.operationKey)
            throw new Error(
                t('server-ai:Error.McpOperationIdentityRequired', {
                    defaultValue: 'A stable operation key is required for this MCP call.'
                })
            )
        const key = hashText(
            JSON.stringify([
                parent?.targetId ?? ['standalone', pinned.scope.actor],
                input.operationKey ?? randomUUID(),
                input.toolsetId,
                input.serverName,
                input.toolName
            ])
        )
        const reserved = await this.store.reserve(
            key,
            {
                version: 1,
                ...pinned,
                reconnectable: pinned.reconnectable && input.consumer.connection.usesModernHttp(input.serverName),
                identity: {
                    version: 1,
                    operationId,
                    generation,
                    inputHash: hashJson(requireJsonValue(input.arguments)),
                    toolName: input.toolName
                },
                serverId: capability.success ? capability.data.serverId : null,
                mode: input.mode,
                phase: 'reserved',
                hostId: this.store.hostId,
                claim: randomUUID(),
                hostExited: false,
                inputResponses: {},
                failureCount: 0
            },
            input.policy
        )
        if (reserved.owner) {
            this.originals.set(reserved.operation.id, input.consumer)
            const drain = this.drain(reserved.operation)
            input.retain?.(drain)
            void this.start(reserved.operation, input).catch(() =>
                this.logger.warn('MCP original call remains unconfirmed')
            )
        }
        return this.wait(reserved.operation, input, parent?.targetId)
    }

    private async drain(initial: McpRemoteOperation) {
        while (!this.stopped) {
            try {
                const row = await this.store.read(initial.id)
                if (row?.record.phase === 'settled') {
                    this.originals.delete(initial.id)
                    return
                }
            } catch {
                /* Losing database access cannot release the original transport. */
            }
            await new Promise<void>((resolve) => {
                const timer = setTimeout(resolve, 1000)
                timer.unref()
            })
        }
        // Shutdown cannot manufacture a settlement receipt or close a shared transport.
        await new Promise<void>(() => undefined)
    }

    private async withOriginal<T>(row: McpRemoteOperation, work: (consumer: McpConsumer) => Promise<T>) {
        const original = this.originals.get(row.id)
        if (!original) return this.transport.withConnection(row, work)
        await this.transport.assertOriginal(row)
        const result = await work(original)
        await this.transport.assertOriginal(row)
        return result
    }

    private async start(row: McpRemoteOperation, input: ExecuteMcpOperationCommand['input']) {
        let admitted = false
        try {
            row = await this.store.admit(row)
            admitted = true
            // Do not reuse the caller's already-aborted wait signal for creation or control delivery.
            const signal = AbortSignal.timeout(30000)
            if (row.record.mode === 'task') {
                const started = await withTaskControl({ version: 2, targetId: row.targetId }, () =>
                    input.consumer.tools.beginTask(
                        input.toolName,
                        input.arguments,
                        input.serverName,
                        signal,
                        row.record.serverId ? row.record.identity : undefined
                    )
                )
                await this.persist(row, () =>
                    this.store.update(row.id, row.generation, (current) => {
                        const taskStart = mcpTaskStartResultSchema.safeParse(started)
                        if (!taskStart.success) {
                            current.record.result = mcpConsumerCallToolResultSchema.parse(started)
                            current.record.callReturned = true
                            current.record.hostExited = true
                            current.record.phase = 'observing'
                            return
                        }
                        if (current.record.taskId && current.record.taskId !== taskStart.data.taskId)
                            throw new McpControlError('handle')
                        current.record.taskId = taskStart.data.taskId
                        current.record.phase = 'observing'
                        current.record.hostExited = true
                    })
                )
            } else {
                const result = await withTaskControl({ version: 2, targetId: row.targetId }, () =>
                    input.consumer.tools.callDirect(
                        input.toolName,
                        input.arguments,
                        input.serverName,
                        signal,
                        input.input
                    )
                )
                await this.persist(row, () =>
                    this.store.update(row.id, row.generation, (current) => {
                        current.record.result = result
                        current.record.hostExited = true
                        current.record.phase = 'observing'
                        // A natural synchronous return proves the original call returned, not a cancelled call.
                        // Remote detached work is not claimed as owned without an explicit control contract.
                        current.record.callReturned = true
                    })
                )
            }
        } catch {
            await this.persist(row, () =>
                this.store.update(row.id, row.generation, (current) => {
                    current.record.hostExited = true
                    if (admitted) current.record.phase = 'unknown'
                })
            )
        }
        await this.reconcileOne(row).catch(() => undefined)
    }

    private async persist(row: McpRemoteOperation, write: () => Promise<unknown>) {
        this.writes.set(row.id, write)
        try {
            await write()
            this.writes.delete(row.id)
        } catch {
            this.logger.warn('MCP original response persistence pending')
        }
    }

    private async wait(initial: McpRemoteOperation, input: ExecuteMcpOperationCommand['input'], observerId?: string) {
        let lastStatus: string | undefined
        while (true) {
            input.signal?.throwIfAborted()
            if (observerId && (await this.store.controls.desired(observerId)) === 'terminated') throw pendingControl()
            const row = await this.store.read(initial.id)
            if (!row) throw pendingControl()
            const intent = await this.store.controls.desired(row.targetId)
            if (intent === 'terminated') throw pendingControl()
            if (row.record.result) {
                await this.transport.assertOriginal(row)
                return row.record.result
            }
            const task = row.record.task
            const status = task ? JSON.stringify([task.status, task.lastUpdatedAt, task.progress]) : undefined
            if (task && status !== lastStatus) {
                await input.onStatus?.(task)
                lastStatus = status
            }
            if (task?.status === 'completed') {
                await this.transport.assertOriginal(row)
                return task.result
            }
            if (task?.status === 'failed' || task?.status === 'cancelled') throw pendingControl()
            if (task?.status === 'input_required' && input.input) {
                await this.transport.assertOriginal(row)
                const requests = task.inputRequests
                if (requests && typeof requests === 'object') {
                    for (const [key, value] of Object.entries(requests)) {
                        if (row.record.inputResponses[key]) continue
                        await this.respond(row, key, value, input)
                    }
                }
            }
            if (row.record.phase === 'unknown' && !row.record.serverId && !row.record.taskId) throw pendingControl()
            await new Promise<void>((resolve) => setTimeout(resolve, 100))
        }
    }

    private async respond(
        row: McpRemoteOperation,
        key: string,
        value: unknown,
        input: ExecuteMcpOperationCommand['input']
    ) {
        const owner = randomUUID()
        let acquired = false
        await this.store.update(row.id, row.generation, (current) => {
            if (
                current.record.inputResponses[key] ||
                (current.record.inputLease && current.record.inputLease.expiresAt > Date.now())
            )
                return
            current.record.inputLease = { key, owner, expiresAt: Date.now() + 30000 }
            acquired = true
        })
        if (!acquired) return
        const renew = setInterval(
            () =>
                void this.store
                    .update(row.id, row.generation, (current) => {
                        if (current.record.inputLease?.owner === owner)
                            current.record.inputLease.expiresAt = Date.now() + 30000
                    })
                    .catch(() => undefined),
            10000
        )
        renew.unref()
        try {
            const response = await input.consumer.elicitation.respond({ [key]: value }, input.serverName, input.input)
            await this.transport.assertOriginal(row)
            await this.store.update(row.id, row.generation, async (current, tx) => {
                if ((await this.store.controls.desired(current.targetId, tx)) === 'terminated') throw pendingControl()
                if (current.record.inputLease?.owner !== owner) throw pendingControl()
                if (!current.record.inputResponses[key]) current.record.inputResponses[key] = response
            })
        } finally {
            clearInterval(renew)
            // LangGraph interruption releases only the input waiter; resumption reuses this operation.
            await this.store.update(row.id, row.generation, (current) => {
                if (current.record.inputLease?.owner === owner) delete current.record.inputLease
            })
        }
    }

    async reconcile() {
        if (this.polling) return
        this.polling = true
        try {
            for (const [id, write] of this.writes) {
                try {
                    await write()
                    this.writes.delete(id)
                } catch {
                    /* Original receipt stays pending. */
                }
            }
            for (const candidate of await this.store.due()) {
                try {
                    await this.reconcileOne(readMcpOperation(candidate))
                } catch {
                    this.logger.warn('MCP remote control pending')
                }
            }
        } catch {
            this.logger.warn('MCP control storage unavailable')
        } finally {
            this.polling = false
        }
    }

    async reconcileOne(snapshot: McpRemoteOperation) {
        let row = await this.store.read(snapshot.id)
        if (!row || row.record.phase === 'settled') return
        const token = await this.store.controls.delivery(row.targetId)
        if (!token) return
        let failed = false
        let failureReason: string | null = null
        try {
            const intent = await this.store.controls.desired(row.targetId)
            if (row.record.phase === 'reserved') {
                await this.store.finalize(row)
                return
            }
            if (row.record.mode === 'call' || row.record.callReturned) {
                await this.store.finalize(row)
                return
            }
            if (!row.record.serverId && !row.record.taskId) return
            if (intent === 'terminated') {
                const receipt = await this.transport.terminate(row, this.originals.get(row.id))
                if (receipt)
                    row = await this.store.update(row.id, row.generation, (current) => {
                        if (
                            current.record.receipt?.state !== 'settled' &&
                            (!current.record.receipt || receipt.revision >= current.record.receipt.revision)
                        )
                            current.record.receipt = receipt
                        if (receipt.taskId) current.record.taskId = receipt.taskId
                    })
            } else
                await this.withOriginal(row, async (consumer) => {
                    if (row.record.serverId) {
                        const { receipt, task } = await requestMcpControl(consumer, row, 'inspect')
                        row = await this.store.update(row.id, row.generation, (current) => {
                            if (
                                current.record.receipt?.state !== 'settled' &&
                                (!current.record.receipt || receipt.revision >= current.record.receipt.revision)
                            )
                                current.record.receipt = receipt
                            if (receipt.taskId) current.record.taskId = receipt.taskId
                            if (
                                task &&
                                receipt.taskId === task.taskId &&
                                (!current.record.task ||
                                    Date.parse(task.lastUpdatedAt) >= Date.parse(current.record.task.lastUpdatedAt))
                            )
                                current.record.task = task
                        })
                    } else {
                        const task = await consumer.tasks.get(
                            row.record.taskId,
                            row.record.scope.serverName,
                            AbortSignal.timeout(10000)
                        )
                        if (task.taskId !== row.record.taskId) throw new McpControlError('handle')
                        row = await this.store.update(row.id, row.generation, (current) => {
                            current.record.task = task
                        })
                    }
                    // Only already-persisted input responses are retried; the prompt/handler is never replayed here.
                    if (row.record.taskId && row.record.task?.status === 'input_required') {
                        for (const response of Object.values(row.record.inputResponses)) {
                            if ((await this.store.controls.desired(row.targetId)) === 'terminated') break
                            await consumer.tasks.update(
                                row.record.taskId,
                                response,
                                row.record.scope.serverName,
                                AbortSignal.timeout(10000)
                            )
                        }
                    }
                })
            await this.store.finalize(row)
        } catch (error) {
            failed = true
            failureReason = error instanceof McpControlError ? `mcp_${error.reason}` : 'mcp_control_pending'
            throw pendingControl()
        } finally {
            row = await this.store.update(row.id, row.generation, (current) => {
                current.record.failureCount = failed ? current.record.failureCount + 1 : 0
                if (current.record.phase !== 'settled')
                    current.nextControlAt = new Date(
                        Date.now() + Math.min(30000, 1000 * 2 ** Math.min(current.record.failureCount, 5))
                    )
            })
            await this.store.controls.delivered(row.targetId, token, failureReason)
        }
    }
}

function pendingControl() {
    return new Error(
        t('server-ai:Error.McpControlPending', { defaultValue: 'The operation is still being confirmed.' })
    )
}
