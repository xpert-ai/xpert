jest.mock('../desktop-shell/desktop-shell-operation.service', () => ({ DesktopShellOperationService: class {} }))
jest.mock('../xpert-agent-execution/agent-execution.service', () => ({ XpertAgentExecutionService: class {} }))
jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))
jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))

import { DiscoveryService, Reflector } from '@nestjs/core'
import { XpertAgentExecutionStatusEnum as Status } from '@xpert-ai/contracts'
import {
    AgentRuntimeRegistry,
    BUILTIN_GLOBAL_SCOPE,
    DefaultRuntimeCapabilityRegistry,
    IAgentRuntimeStrategy,
    AgentRuntimeObservation,
    HandoffMessage
} from '@xpert-ai/plugin-sdk'
import { AgentInvocationRuntime } from '../agent-invocation/invocation-runtime'
import { MemoryInvocationStore } from '../agent-invocation/invocation-test-store'
import { CancelExternalAssistantHandler } from '../chat-conversation/commands/handlers/cancel-external-assistant.handler'
import { CancelExternalAssistantCommand } from '../chat-conversation/commands/cancel-external-assistant.command'
import { StopHandoffMessageHandler } from '../handoff/commands/handlers/stop-handoff-message.handler'
import { StopHandoffMessageCommand } from '../handoff/commands/stop-handoff-message.command'

describe('phase 2 control loss regressions', () => {
    it('retains cancellation before the first handle and cancels the late original task without restarting', async () => {
        const store = new MemoryInvocationStore()
        const registry = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
        const cancel = jest.fn().mockResolvedValue({ status: 'cancelled' })
        const start = jest.fn<Promise<AgentRuntimeObservation>, Parameters<IAgentRuntimeStrategy['start']>>()
        registry.register(
            'test',
            {
                capabilities: { recovery: 'session', interactions: false, cancellation: true, background: true },
                start,
                cancel,
                inspect: jest.fn().mockResolvedValue({ status: 'running' })
            },
            { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE }
        )
        const runtime = new AgentInvocationRuntime(store, registry)
        const api = runtime.scoped({
            scope: {
                tenantId: 'tenant',
                organizationId: 'org',
                userId: 'user',
                parentExecutionId: 'parent',
                callerAgentKey: 'main'
            },
            capabilities: new DefaultRuntimeCapabilityRegistry(),
            authorize: async () => undefined
        })
        start.mockImplementation(async (_request, context) => {
            await api.cancel(context.invocationId)
            return { status: 'running', handle: { sessionId: 'original-session', runId: 'original-run' } }
        })
        const request = {
            callId: 'one-operation',
            target: { bindingId: 'binding', provider: 'test', reference: 'agent', revision: '1', configuration: {} },
            input: { prompt: 'work' }
        }
        const result = await api.start(request)
        await api.start(request)
        expect(start).toHaveBeenCalledTimes(1)
        expect(cancel).toHaveBeenCalledTimes(1)
        expect(cancel.mock.calls[0][0]).toEqual({ sessionId: 'original-session', runId: 'original-run' })
        expect(result.status).toBe('cancelled')
    })

    it('includes the registered cross-thread pending child when cancelling an owned subtree', async () => {
        const owned = ['expert', 'background-child']
        const executions = {
            findAllByParentId: jest
                .fn()
                .mockImplementation(async (id: string) =>
                    id === 'expert'
                        ? [{ id: 'background-child', threadId: 'child-thread', status: Status.PENDING }]
                        : []
                ),
            interruptRunning: jest.fn()
        }
        const cancellations = { ownedExecutionIds: jest.fn().mockResolvedValue(owned), cancelExecutions: jest.fn() }
        const handler = new CancelExternalAssistantHandler(
            executions as never,
            cancellations as never,
            { execute: jest.fn() } as never
        )
        const result = await handler.execute(
            new CancelExternalAssistantCommand({
                id: 'expert',
                threadId: 'parent-thread',
                status: Status.RUNNING,
                metadata: { invocationKind: 'external_assistant' }
            })
        )
        expect(result.canceledExecutionIds).toEqual(owned)
        expect(cancellations.cancelExecutions).toHaveBeenCalledWith(owned, expect.any(String))
    })

    it('records cancellation for a queued match even if it becomes active before removal', async () => {
        const message: HandoffMessage = {
            id: 'racing-job',
            type: 'test',
            version: 1,
            tenantId: 'tenant',
            sessionKey: 'session',
            businessKey: 'business',
            attempt: 1,
            maxAttempts: 1,
            enqueuedAt: 0,
            traceId: 'trace',
            payload: { executionId: 'expert' }
        }
        const queue = {
            findJobs: jest
                .fn()
                .mockResolvedValue([{ queueName: 'queue', state: 'waiting', job: { id: 'job', data: message } }]),
            removeJobs: jest.fn().mockResolvedValue([])
        }
        const cancellations = {
            cancelOwnedTargets: jest.fn().mockResolvedValue({ messageIds: [], executionIds: [] }),
            confirmRemoved: jest.fn(),
            persist: jest.fn(),
            cancelMessages: jest.fn().mockResolvedValue([])
        }
        const handler = new StopHandoffMessageHandler(
            queue as never,
            cancellations as never,
            { cancel: jest.fn() } as never,
            { remove: jest.fn() } as never
        )
        await handler.execute(new StopHandoffMessageCommand({ executionIds: ['expert'], reason: 'stop' }))
        expect(cancellations.cancelMessages).toHaveBeenCalledWith(['racing-job'], 'stop')
    })
})
