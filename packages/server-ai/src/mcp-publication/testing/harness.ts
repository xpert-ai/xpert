import { DataSource } from 'typeorm'
import { TaskControlStore } from '@xpert-ai/server-core'
import type { ManagedQueueService, ToolInputRequest } from '@xpert-ai/plugin-sdk'
import { ToolRuntimeService } from '../../tool-runtime'
import { McpTask } from '../entities'
import { McpTaskControlStore } from '../control/mcp-task-control.store'
import { McpTaskService } from '../mcp-task.service'
import { McpElicitationService } from '../mcp-elicitation.service'
import { createTaskSubscriptions, taskExecution } from './fixtures'

export function publisherHarness(db: DataSource) {
    const controls = new TaskControlStore(db)
    const store = new McpTaskControlStore(db.getRepository(McpTask), controls)
    const runtime = {
        executeTool: jest
            .fn<ReturnType<ToolRuntimeService['executeTool']>, Parameters<ToolRuntimeService['executeTool']>>()
            .mockResolvedValue({ content: [] })
    }
    const queue = {
        enqueue: jest.fn(async (input) => ({ jobId: input.jobId })),
        cancel: jest.fn(async () => ({ success: false, jobId: 'active', reason: 'active' as const })),
        getExecutionPoolHealth: jest.fn(async () => ({
            available: true,
            executionPool: 'default' as const,
            workerCount: 1
        }))
    }
    const elicitation = {
        normalizeRequest: (request: ToolInputRequest) => request,
        embeddedRequest: (request: ToolInputRequest) => ({
            method: 'elicitation/create',
            params:
                request.type === 'form'
                    ? { mode: 'form', message: request.title, requestedSchema: request.schema }
                    : { mode: 'url', message: request.title, url: request.url, elicitationId: 'test' }
        }),
        resolveResponse: (_request: ToolInputRequest, response: unknown) => {
            if (typeof response !== 'object' || response === null) return { kind: 'missing' }
            return Reflect.get(response, 'action') === 'accept'
                ? { kind: 'accepted', content: Reflect.get(response, 'content') }
                : { kind: 'declined' }
        }
    }
    const service = new McpTaskService(
        db.getRepository(McpTask),
        queue as unknown as ManagedQueueService,
        runtime as unknown as ToolRuntimeService,
        elicitation as unknown as McpElicitationService,
        createTaskSubscriptions(),
        taskExecution(),
        store
    )
    return { service, store, controls, runtime, queue, close: () => service.onModuleDestroy() }
}
export async function until(check: () => Promise<boolean> | boolean) {
    for (let i = 0; i < 500; i++) {
        if (await check()) return
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error('MCP integration condition did not become true')
}
export function gate() {
    let release!: () => void
    const promise = new Promise<void>((resolve) => {
        release = resolve
    })
    return { promise, release }
}
