import { McpConsumerConnection } from '../connection/mcp-consumer-connection'
import { taskCapabilityMeta } from '../tools/mcp-consumer-tools'
import {
    McpConsumerTask,
    McpConsumerTaskStart,
    mcpTaskAcknowledgementSchema,
    mcpTaskResultSchema
} from './task-schemas'

type TaskMethod = 'tasks/get' | 'tasks/update' | 'tasks/cancel'

export type McpConsumerTaskWaitOptions = {
    serverName?: string
    signal?: AbortSignal
    maxWaitMs?: number
    defaultPollIntervalMs?: number
    onStatus?: (task: McpConsumerTask | McpConsumerTaskStart) => void | Promise<void>
    onInputRequired?: (task: McpConsumerTask) => Promise<object>
}

export class McpConsumerTaskInputRequiredError extends Error {
    constructor(readonly task: McpConsumerTask) {
        super(`MCP task '${task.taskId}' requires input`)
    }
}

export class McpConsumerTaskFailedError extends Error {
    constructor(readonly task: McpConsumerTask) {
        super(task.statusMessage || `MCP task '${task.taskId}' ${task.status}`)
    }
}

export class McpConsumerTasks {
    constructor(
        private readonly connection: McpConsumerConnection,
        private readonly startTaskCall: (
            name: string,
            arguments_: Record<string, unknown>,
            serverName?: string,
            signal?: AbortSignal
        ) => Promise<McpConsumerTaskStart>
    ) {}

    start(name: string, arguments_: Record<string, unknown> = {}, serverName?: string, signal?: AbortSignal) {
        return this.startTaskCall(name, arguments_, serverName, signal)
    }

    get(taskId: string, serverName?: string, signal?: AbortSignal): Promise<McpConsumerTask> {
        return this.request('tasks/get', taskId, undefined, serverName, signal)
    }

    update(
        taskId: string,
        inputResponses: object,
        serverName?: string,
        signal?: AbortSignal
    ): Promise<McpConsumerTask> {
        return this.mutate('tasks/update', taskId, inputResponses, serverName, signal)
    }

    cancel(taskId: string, serverName?: string, signal?: AbortSignal): Promise<McpConsumerTask> {
        return this.mutate('tasks/cancel', taskId, undefined, serverName, signal)
    }

    async wait(started: McpConsumerTaskStart, options: McpConsumerTaskWaitOptions = {}): Promise<McpConsumerTask> {
        const deadline = resolveDeadline(started, options.maxWaitMs)
        let current: McpConsumerTask | McpConsumerTaskStart = started

        try {
            while (!options.signal?.aborted) {
                assertNotAborted(options.signal)
                await options.onStatus?.(current)

                if (current.status === 'input_required') {
                    const detailed = isTaskResult(current)
                        ? current
                        : await this.get(current.taskId, options.serverName, options.signal)
                    if (!options.onInputRequired) {
                        throw new McpConsumerTaskInputRequiredError(detailed)
                    }
                    const inputResponses = await options.onInputRequired(detailed)
                    current = await this.update(detailed.taskId, inputResponses, options.serverName, options.signal)
                    continue
                }

                if (current.status === 'completed') {
                    return isTaskResult(current)
                        ? current
                        : this.get(current.taskId, options.serverName, options.signal)
                }
                if (current.status === 'failed' || current.status === 'cancelled') {
                    const detailed = isTaskResult(current)
                        ? current
                        : await this.get(current.taskId, options.serverName, options.signal)
                    throw new McpConsumerTaskFailedError(detailed)
                }
                if (deadline !== undefined && Date.now() >= deadline) {
                    throw new Error(`MCP task '${current.taskId}' did not complete before its wait deadline`)
                }

                await abortableDelay(
                    normalizePollInterval(current.pollIntervalMs, options.defaultPollIntervalMs),
                    options.signal,
                    deadline
                )
                current = await this.get(current.taskId, options.serverName, options.signal)
            }
            throw taskWaitAbortedError(options.signal)
        } catch (error) {
            if (options.signal?.aborted) {
                await this.cancel(started.taskId, options.serverName).catch(() => undefined)
            }
            throw error
        }
    }

    result(task: McpConsumerTask): unknown {
        if (task.status === 'completed') return task.result
        if (task.status === 'input_required') throw new McpConsumerTaskInputRequiredError(task)
        throw new McpConsumerTaskFailedError(task)
    }

    private request(
        method: TaskMethod,
        taskId: string,
        inputResponses?: object,
        serverName?: string,
        signal?: AbortSignal
    ) {
        return this.connection.requestExtension(
            serverName,
            {
                method,
                params: {
                    taskId,
                    ...(inputResponses ? { inputResponses } : {}),
                    _meta: taskCapabilityMeta()
                }
            },
            mcpTaskResultSchema,
            {
                signal,
                routing: { method, name: taskId }
            }
        )
    }

    private async mutate(
        method: Exclude<TaskMethod, 'tasks/get'>,
        taskId: string,
        inputResponses?: object,
        serverName?: string,
        signal?: AbortSignal
    ) {
        await this.connection.requestExtension(
            serverName,
            {
                method,
                params: {
                    taskId,
                    ...(inputResponses ? { inputResponses } : {}),
                    _meta: taskCapabilityMeta()
                }
            },
            mcpTaskAcknowledgementSchema,
            {
                signal,
                routing: { method, name: taskId }
            }
        )
        return this.get(taskId, serverName, signal)
    }
}

function isTaskResult(task: McpConsumerTask | McpConsumerTaskStart): task is McpConsumerTask {
    return task.resultType === 'complete'
}

function resolveDeadline(task: McpConsumerTaskStart, maxWaitMs?: number) {
    if (maxWaitMs !== undefined) {
        if (!Number.isFinite(maxWaitMs) || maxWaitMs <= 0) {
            throw new Error('MCP task maxWaitMs must be a positive finite number')
        }
        return Date.now() + maxWaitMs
    }
    if (task.ttlMs === null) return undefined
    const createdAt = Date.parse(task.createdAt)
    return Number.isFinite(createdAt) ? createdAt + task.ttlMs : Date.now() + task.ttlMs
}

function normalizePollInterval(value?: number, fallback = 1_000) {
    const interval = value ?? fallback
    if (!Number.isFinite(interval)) return 1_000
    return Math.min(30_000, Math.max(100, interval))
}

function assertNotAborted(signal?: AbortSignal) {
    if (!signal?.aborted) return
    throw taskWaitAbortedError(signal)
}

function taskWaitAbortedError(signal?: AbortSignal) {
    return signal?.reason instanceof Error ? signal.reason : new Error('MCP task wait was aborted')
}

function abortableDelay(delayMs: number, signal?: AbortSignal, deadline?: number) {
    const boundedDelay = deadline === undefined ? delayMs : Math.max(0, Math.min(delayMs, deadline - Date.now()))
    return new Promise<void>((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timeout)
            signal?.removeEventListener('abort', onAbort)
            reject(signal?.reason instanceof Error ? signal.reason : new Error('MCP task wait was aborted'))
        }
        const timeout = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort)
            resolve()
        }, boundedDelay)
        timeout.unref?.()
        if (signal?.aborted) onAbort()
        else signal?.addEventListener('abort', onAbort, { once: true })
    })
}
