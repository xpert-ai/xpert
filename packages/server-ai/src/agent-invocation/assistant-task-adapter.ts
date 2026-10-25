import { AssistantTaskExecution } from './assistant-task-execution'
import { Injectable } from '@nestjs/common'
import {
    AgentMiddlewareAssistantTaskInput,
    AgentMiddlewareAssistantTaskResult,
    AgentRuntimeContext,
    AgentRuntimeHandle,
    AgentRuntimeObservation,
    AgentRuntimeStart,
    AgentRuntimeStrategy,
    AgentInvocationStatus,
    DefaultRuntimeCapabilityRegistry,
    IAgentRuntimeStrategy,
    RequestContext
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'crypto'
import { z } from 'zod/v3'
import { AgentInvocationRuntime, invocationError } from './invocation-runtime'
import { resolveAgentExecutionScope } from '../shared/agent/middleware-runtime/execution-scope'

interface TaskExecutor {
    start(
        operationId: string,
        checkpoint?: (task: AgentMiddlewareAssistantTaskResult) => Promise<void>
    ): Promise<AgentMiddlewareAssistantTaskResult>
    inspect(handle: AgentRuntimeHandle): Promise<AgentMiddlewareAssistantTaskResult | null>
    cancel(handle: AgentRuntimeHandle): Promise<void>
}
const Receipt = z.object({
    status: z.enum(['queued', 'running', 'interrupted', 'succeeded', 'failed', 'unknown']),
    taskId: z.string().optional(),
    executionId: z.string().optional(),
    conversationId: z.string().optional(),
    threadId: z.string().optional(),
    executorXpertId: z.string().optional(),
    executorAgentKey: z.string().optional(),
    executorAssistantTemplateKey: z.string().optional(),
    executorAssistantTitle: z.string().optional(),
    executorPublishedVersion: z.string().optional(),
    errorMessage: z.string().optional()
})

/** The legacy task transport is an executor, never a call back into startTask. */
@Injectable()
@AgentRuntimeStrategy('xpert-task')
export class AssistantTaskRuntimeStrategy implements IAgentRuntimeStrategy {
    readonly capabilities = {
        recovery: 'session' as const,
        interactions: false,
        cancellation: true,
        idempotentCancellation: true,
        background: true
    }
    async start(request: AgentRuntimeStart, context: AgentRuntimeContext): Promise<AgentRuntimeObservation> {
        return context.capabilities.require(AssistantTaskExecution).start(request, context)
    }
    async inspect(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
        return context.capabilities.require(AssistantTaskExecution).inspect(handle, context)
    }
    async cancel(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
        return context.capabilities.require(AssistantTaskExecution).cancel(handle, context)
    }
}

export async function invokeAssistantTask(
    runtime: AgentInvocationRuntime,
    input: AgentMiddlewareAssistantTaskInput,
    target: { id: string; revision: string; workspaceId: string },
    executor: TaskExecutor,
    authorize: () => Promise<void>
): Promise<AgentMiddlewareAssistantTaskResult> {
    const callId = input.clientMessageId || input.correlation?.operationId || input.executionId || randomUUID()
    const identity = resolveAgentExecutionScope({ xpertId: input.xpertId, agentKey: input.agentKey })
    const api = runtime.scoped({
        controlAdapter: 'native-assistant-task',
        // Authorized Pipeline work owns an independent domain lifecycle until its control bridge is implemented.
        controlPolicy: input.pipelineSource ? 'detached' : input.controlPolicy,
        scope: {
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId(),
            userId: RequestContext.currentUserId(),
            workspaceId: target.workspaceId,
            projectId: input.projectId,
            parentExecutionId: identity.executionId || `task:${input.xpertId}:${input.taskId || callId}`,
            callerAgentKey: identity.agentKey || input.target?.requesterAgentKey || input.xpertId,
            callerXpertId: input.xpertId
        },
        capabilities: new DefaultRuntimeCapabilityRegistry().register(AssistantTaskExecution, {
            async start(_request, context) {
                const handle = {
                    sessionId: input.conversationId || context.invocationId,
                    runId: input.executionId || context.invocationId
                }
                await context.checkpoint({ status: 'running', handle })
                return observation(
                    await executor.start(context.invocationId, (task) => context.checkpoint(observation(task, handle))),
                    handle
                )
            },
            async inspect(handle) {
                const task = await executor.inspect(handle)
                return task ? observation(task, handle) : { status: 'unknown', handle }
            },
            async cancel(handle) {
                await executor.cancel(handle)
                return { status: 'cancelling', handle }
            }
        }),
        authorize
    })
    // A canonical JSON string preserves all existing Task inputs without exposing them to a model.
    const invocation = await api.start({
        target: {
            bindingId: `assistant-task:${input.xpertId}:${target.id}`,
            provider: 'xpert-task',
            reference: target.id,
            revision: target.revision,
            configuration: {}
        },
        callId,
        input: { prompt: input.prompt, parameters: { taskInput: JSON.stringify(input) } }
    })
    if (invocation.result?.data) return parseReceipt(invocation.result.data, invocation.status)
    if (invocation.handle) {
        const state = await api.inspect(invocation.id)
        if (state.result?.data) return parseReceipt(state.result.data, state.status)
    }
    throw invocationError('DispatchUnknown')
}

function observation(task: AgentMiddlewareAssistantTaskResult, fallback: AgentRuntimeHandle): AgentRuntimeObservation {
    const receipt = Receipt.parse(task)
    return {
        status: receipt.status === 'interrupted' ? 'waiting' : receipt.status,
        handle: {
            sessionId: receipt.conversationId || fallback.sessionId,
            runId: receipt.executionId || fallback.runId
        },
        result: { text: '', data: receipt },
        ...(receipt.errorMessage ? { error: receipt.errorMessage } : {})
    }
}

function parseReceipt(data: unknown, status: AgentInvocationStatus): AgentMiddlewareAssistantTaskResult {
    const parsed = Receipt.parse(data)
    return {
        ...parsed,
        status:
            status === 'waiting'
                ? 'interrupted'
                : status === 'cancelled' || status === 'cancelling'
                  ? 'unknown'
                  : status
    }
}
