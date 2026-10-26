import { MCP_CAPABILITY_DESCRIPTOR_VERSION, type McpPrincipal } from '@xpert-ai/contracts'
import { McpPublication, McpPublicationCapability } from '../entities'
import { McpTaskExecutionService } from '../mcp-task-execution.service'
import { McpSubscriptionService } from '../mcp-subscription.service'
export function taskInput(overrides?: {
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

export function publication() {
    return Object.assign(new McpPublication(), {
        id: '10000000-0000-4000-8000-000000000001',
        tenantId: '10000000-0000-4000-8000-000000000002',
        organizationId: '10000000-0000-4000-8000-000000000003',
        slug: 'test-publication'
    })
}

export function capability() {
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

export function principal(subjectId = '10000000-0000-4000-8000-000000000007'): McpPrincipal {
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

export function createTaskSubscriptions(): McpSubscriptionService {
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

export async function waitUntil(predicate: () => boolean) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
        if (predicate()) return
        await new Promise<void>((resolve) => setTimeout(resolve, 10))
    }
    throw new Error('Timed out waiting for MCP task execution')
}

export function taskExecution(): McpTaskExecutionService {
    const service = Object.create(McpTaskExecutionService.prototype) as McpTaskExecutionService
    service.run = async (_task, payload, execute) => execute(payload.runtime ?? null)
    return service
}
