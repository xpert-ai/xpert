import { RequestContext } from '@xpert-ai/plugin-sdk'
import { UserType } from '@xpert-ai/contracts'
import { runWithCapturedRequestContext, RequestContextSnapshot } from '../shared/request-context'
import { ResolveGroupDeliveryContextHandler } from './group-delivery-context.handler'
import { GroupAccessService } from './group-access.service'
import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { of } from 'rxjs'
import type { AgentChatDispatchPayload, HandoffMessage, ProcessContext } from '@xpert-ai/plugin-sdk'
import { AgentChatDispatchHandoffProcessor } from '../handoff/plugins/agent-chat/agent-chat-dispatch.processor'
import { HandoffQueueService } from '../handoff/message-queue.service'
import { AgentChatRealtimeService } from '../handoff/agent-chat-realtime.service'
import {
    PrepareGroupChatCommand,
    FinishGroupChatCommand,
    ResolveGroupDeliveryContextCommand
} from './group-dispatch.commands'
import { XpertChatCommand } from '../xpert/commands/chat.command'
import { hasGroupRuntime } from './group-runtime-context'

describe('group common chat dispatch', () => {
    const commands = { execute: jest.fn() },
        queue = { enqueue: jest.fn().mockResolvedValue({ id: 'callback' }) }
    const context: ProcessContext = { runId: 'run', traceId: 'trace', abortSignal: new AbortController().signal }
    const message: HandoffMessage<AgentChatDispatchPayload> = {
        id: 'group:dispatch:receipt',
        type: 'agent.chat_dispatch.v1',
        version: 1,
        tenantId: 'tenant',
        businessKey: 'group',
        sessionKey: 'c',
        attempt: 1,
        maxAttempts: 5,
        enqueuedAt: Date.now(),
        traceId: 'source',
        payload: {
            request: { action: 'send', conversationId: 'runtime-c', message: { input: { input: 'hello' } } },
            options: { xpertId: 'c', groupDeliveryId: 'receipt' },
            callback: { messageType: 'noop', events: 'lifecycle' }
        }
    }
    const human: RequestContextSnapshot = {
        user: { id: 'human-a', tenantId: 'tenant', type: UserType.USER },
        headers: { 'tenant-id': 'tenant', 'organization-id': 'organization', 'x-scope-level': 'organization' }
    }
    const access = { withDeliveryActor: jest.fn() }
    let processor: AgentChatDispatchHandoffProcessor
    let resolveContext: ResolveGroupDeliveryContextHandler
    beforeEach(async () => {
        jest.clearAllMocks()
        commands.execute.mockReset()
        access.withDeliveryActor.mockReset().mockImplementation((_id, _tenant, conversationId, task) => {
            expect(hasGroupRuntime()).toBe(true)
            expect(conversationId).toBe('runtime-c')
            return runWithCapturedRequestContext(human, task)
        })
        const module = await Test.createTestingModule({
            providers: [
                AgentChatDispatchHandoffProcessor,
                ResolveGroupDeliveryContextHandler,
                { provide: GroupAccessService, useValue: access },
                { provide: CommandBus, useValue: commands },
                { provide: HandoffQueueService, useValue: queue },
                { provide: AgentChatRealtimeService, useValue: {} }
            ]
        }).compile()
        processor = module.get(AgentChatDispatchHandoffProcessor)
        resolveContext = module.get(ResolveGroupDeliveryContextHandler)
    })
    it('forwards lifecycle only through Handoff and binds runtime access around execution', async () => {
        commands.execute.mockImplementation((command: unknown) => {
            if (command instanceof ResolveGroupDeliveryContextCommand) return resolveContext.execute(command)
            if (command instanceof PrepareGroupChatCommand) return message.payload
            if (command instanceof XpertChatCommand) {
                expect(hasGroupRuntime()).toBe(true)
                expect(RequestContext.currentUserId()).toBe('human-a')
                expect(RequestContext.currentTenantId()).toBe('tenant')
                expect(RequestContext.getOrganizationId()).toBe('organization')
                return of(...Array.from({ length: 200 }, () => ({ data: { type: 'message', data: 'token' } })))
            }
        })
        expect(await processor.process(message, context)).toEqual({ status: 'ok' })
        expect(queue.enqueue).toHaveBeenCalledTimes(1)
        expect(queue.enqueue.mock.calls[0][0].payload.kind).toBe('complete')
        expect(commands.execute).toHaveBeenLastCalledWith(new FinishGroupChatCommand('receipt', false, true))
        expect(hasGroupRuntime()).toBe(false)
        expect(RequestContext.currentUserId()).not.toBe('human-a')
        expect(access.withDeliveryActor).toHaveBeenCalledWith('receipt', 'tenant', 'runtime-c', expect.any(Function))
    })
    it('reports dispatch failure for reserved-run cleanup instead of leaving an owned lease running', async () => {
        commands.execute.mockImplementation((command: unknown) => {
            if (command instanceof ResolveGroupDeliveryContextCommand) return resolveContext.execute(command)
            if (command instanceof PrepareGroupChatCommand) return message.payload
            if (command instanceof XpertChatCommand) throw new Error('model unavailable')
        })
        expect(await processor.process(message, context)).toMatchObject({ status: 'dead' })
        expect(commands.execute).toHaveBeenLastCalledWith(new FinishGroupChatCommand('receipt', true, true))
    })
    it('cleans up a rejected admission without executing a chat or resolving an actor', async () => {
        commands.execute.mockResolvedValue(null)
        expect(await processor.process(message, context)).toEqual({ status: 'ok' })
        expect(commands.execute.mock.calls.map(([command]) => command.constructor)).toEqual([
            PrepareGroupChatCommand,
            FinishGroupChatCommand
        ])
        expect(commands.execute).toHaveBeenLastCalledWith(new FinishGroupChatCommand('receipt', false, false))
        expect(access.withDeliveryActor).not.toHaveBeenCalled()
        expect(queue.enqueue).not.toHaveBeenCalled()
    })

    it('reconciles a preparation error before propagating it to the existing queue retry policy', async () => {
        commands.execute.mockImplementation((command: unknown) => {
            if (command instanceof PrepareGroupChatCommand) throw new Error('admission unavailable')
        })
        await expect(processor.process(message, context)).rejects.toThrow('admission unavailable')
        expect(commands.execute).toHaveBeenLastCalledWith(new FinishGroupChatCommand('receipt', true, false))
        expect(hasGroupRuntime()).toBe(false)
    })

    it('does not execute when delivery authorization is revoked after admission', async () => {
        access.withDeliveryActor.mockRejectedValue(new Error('membership revoked'))
        commands.execute.mockImplementation((command: unknown) => {
            if (command instanceof PrepareGroupChatCommand) return message.payload
            if (command instanceof ResolveGroupDeliveryContextCommand) return resolveContext.execute(command)
            if (command instanceof XpertChatCommand) throw new Error('must not execute')
        })
        expect(await processor.process(message, context)).toMatchObject({
            status: 'dead',
            reason: 'membership revoked'
        })
        expect(commands.execute.mock.calls.some(([command]) => command instanceof XpertChatCommand)).toBe(false)
        expect(queue.enqueue.mock.calls[0][0].payload.kind).toBe('error')
        expect(commands.execute).toHaveBeenLastCalledWith(new FinishGroupChatCommand('receipt', true, true))
        expect(hasGroupRuntime()).toBe(false)
    })

    it('executes only the payload rebuilt by group admission', async () => {
        const prepared: AgentChatDispatchPayload = {
            ...message.payload,
            request: { action: 'send', conversationId: 'runtime-c', message: { input: { input: 'authorized input' } } }
        }
        commands.execute.mockImplementation((command: unknown) => {
            if (command instanceof PrepareGroupChatCommand) return prepared
            if (command instanceof ResolveGroupDeliveryContextCommand) return resolveContext.execute(command)
            if (command instanceof XpertChatCommand) {
                expect(command).toMatchObject({ request: prepared.request })
                return of()
            }
        })
        expect(await processor.process(message, context)).toEqual({ status: 'ok' })
    })

    it('keeps ordinary chats on the existing path with stream callbacks enabled by default', async () => {
        const ordinary: HandoffMessage<AgentChatDispatchPayload> = {
            ...message,
            payload: { ...message.payload, options: { xpertId: 'c' }, callback: { messageType: 'noop' } }
        }
        commands.execute.mockImplementation((command: unknown) => {
            expect(command).toBeInstanceOf(XpertChatCommand)
            expect(hasGroupRuntime()).toBe(false)
            return of({ data: { type: 'message', data: 'token' } })
        })
        expect(await processor.process(ordinary, context)).toEqual({ status: 'ok' })
        expect(queue.enqueue.mock.calls.map(([job]) => job.payload.kind)).toEqual(['stream', 'complete'])
        expect(access.withDeliveryActor).not.toHaveBeenCalled()
    })
})
