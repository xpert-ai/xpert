jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn() }))
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { CommandBus } from '@nestjs/cqrs'
import { randomUUID } from 'node:crypto'
import { createProjectRuntimeTools } from './runtime'
import { DecideProjectTaskCommand, DispatchProjectTaskCommand } from '../../../runtime/project-task-dispatch.command'
import {
    ConversationResourceCard,
    projectTaskDecisionInputSchema,
    projectTaskDispatchInputSchema
} from '@xpert-ai/contracts'

describe('Project general-agent Runtime tools', () => {
    it.each([false, true])('preserves a committed delegation when card emission fails: %s', async (failCard) => {
        const emit = jest.mocked(dispatchCustomEvent)
        emit.mockReset()
        if (failCard) emit.mockRejectedValueOnce(new Error('Card stream disconnected'))
        const projectId = randomUUID()
        const card: ConversationResourceCard = {
            resource: { namespace: 'platform.project-tasks', type: 'execution', id: randomUUID() },
            title: 'Implementation',
            description: 'Running',
            open: { target: 'workbench.view', viewKey: 'platform.project-tasks__timeline' }
        }
        const receipt = {
            status: 'running',
            projectTaskId: randomUUID(),
            taskExecutionId: card.resource.id,
            invocationId: randomUUID()
        }
        const execute = jest.fn(async () => ({ ...receipt, card }))
        const commands = Object.assign(Object.create(CommandBus.prototype) as CommandBus, { execute })
        const dispatch = createProjectRuntimeTools(
            {
                projectId,
                conversationId: randomUUID(),
                executionId: randomUUID(),
                callerType: 'project_agent',
                agentKey: 'general_agent'
            },
            commands,
            jest.fn()
        ).find((item) => item.name === 'project_dispatch_task')
        const result = await dispatch.invoke(
            { taskId: receipt.projectTaskId, bindingId: randomUUID(), expectedRevision: 1 },
            { configurable: { thread_id: 'thread', tool_call_id: 'tool-call' } }
        )
        expect(result).toEqual(receipt)
        expect(execute).toHaveBeenCalledTimes(1)
        expect(emit).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ type: 'resource_card', data: card }),
            expect.objectContaining({ configurable: expect.objectContaining({ thread_id: 'thread' }) })
        )
    })
    it('takes caller identity from the host while accepting only task delegation fields from the model', async () => {
        const execute = jest.fn(async (_command: object) => ({ status: 'queued' }))
        const commands = Object.assign(Object.create(CommandBus.prototype) as CommandBus, { execute })
        const projectId = randomUUID(),
            conversationId = randomUUID(),
            executionId = randomUUID()
        const tools = createProjectRuntimeTools(
            {
                projectId,
                conversationId,
                executionId,
                callerType: 'project_agent',
                agentKey: 'general_agent'
            },
            commands,
            jest.fn()
        )
        const dispatch = tools.find((item) => item.name === 'project_dispatch_task')
        const input = {
            taskId: randomUUID(),
            bindingId: randomUUID(),
            expectedRevision: 1,
            instructions: ''
        }
        await dispatch.invoke(input, { configurable: { thread_id: 'thread', tool_call_id: 'tool-call' } })
        expect(execute).toHaveBeenCalledWith(expect.any(DispatchProjectTaskCommand))
        expect(execute.mock.calls[0][0]).toMatchObject({
            projectId,
            input: { ...input, requestId: expect.any(String) },
            caller: {
                type: 'project_agent',
                executionId,
                conversationId,
                threadId: 'thread',
                agentKey: 'general_agent',
                sourceMessageId: 'tool-call'
            }
        })
        await expect(dispatch.invoke({ ...input, tenantId: randomUUID() })).rejects.toThrow()
        expect(execute).toHaveBeenCalledTimes(1)
    })
})

describe.each(['project_dispatch_task', 'project_decide_task'] as const)('%s host operation identity', (name) => {
    function fixture() {
        const context = {
            projectId: randomUUID(),
            conversationId: randomUUID(),
            executionId: randomUUID(),
            callerType: 'project_agent' as const,
            agentKey: 'general_agent'
        }
        const input =
            name === 'project_dispatch_task'
                ? { taskId: randomUUID(), bindingId: randomUUID(), expectedRevision: 1 }
                : {
                      taskId: randomUUID(),
                      expectedRevision: 1,
                      implementationExecutionId: randomUUID(),
                      specificationDigest: `sha256:${'a'.repeat(64)}`,
                      evidence: [{ type: 'invocation_result' as const, invocationId: randomUUID(), revision: 1 }],
                      outcome: 'accept' as const,
                      rationale: 'Inspected the implementation',
                      checks: ['Verified the output']
                  }
        const calls: Array<DispatchProjectTaskCommand | DecideProjectTaskCommand> = []
        const execute = jest.fn(async (command: object) => {
            if (!(command instanceof DispatchProjectTaskCommand) && !(command instanceof DecideProjectTaskCommand)) {
                throw new Error('Unexpected command')
            }
            const schema =
                command instanceof DispatchProjectTaskCommand
                    ? projectTaskDispatchInputSchema
                    : projectTaskDecisionInputSchema
            schema.parse(command.input)
            calls.push(command)
            return { status: 'queued' }
        })
        const commands = Object.assign(Object.create(CommandBus.prototype) as CommandBus, { execute })
        const create = (overrides: Partial<Parameters<typeof createProjectRuntimeTools>[0]> = {}) =>
            createProjectRuntimeTools({ ...context, ...overrides }, commands, jest.fn()).find(
                (tool) => tool.name === name
            )
        const config = { configurable: { thread_id: 'thread', tool_call_id: 'call-1' } }
        return { context, input, calls, execute, create, config }
    }

    it('hides requestId from the model schema and rejects a model-supplied override', async () => {
        const f = fixture()
        const tool = f.create()
        expect(tool.schema.shape).not.toHaveProperty('requestId')
        await expect(tool.invoke({ ...f.input, requestId: randomUUID() }, f.config)).rejects.toThrow()
        expect(f.execute).not.toHaveBeenCalled()
        await tool.invoke(f.input, f.config)
        expect(f.calls).toHaveLength(1)
    })

    it('recovers the same operation after a lost response and reconstruction in another Agent run', async () => {
        const f = fixture()
        const committed = f.execute.getMockImplementation()
        f.execute.mockImplementationOnce(async (command) => {
            await committed(command)
            throw new Error('Response lost after commit')
        })
        await expect(f.create().invoke(f.input, f.config)).rejects.toThrow('Response lost after commit')
        await f.create({ executionId: randomUUID() }).invoke(f.input, {
            configurable: { thread_id: 'thread', toolCall: { id: 'call-1' } }
        })
        expect(f.calls).toHaveLength(2)
        expect(f.calls[1].input).toEqual(f.calls[0].input)
        expect(f.calls[1].caller.executionId).not.toBe(f.calls[0].caller.executionId)
    })

    it('keeps the operation key when arguments change so the service can reject conflicting replay', async () => {
        const f = fixture()
        const tool = f.create()
        await tool.invoke(f.input, f.config)
        await tool.invoke({ ...f.input, expectedRevision: 2 }, f.config)
        expect(f.calls[1].input.requestId).toBe(f.calls[0].input.requestId)
        expect(f.calls[1].input.expectedRevision).toBe(2)
    })

    it('gives a new tool call its own operation and separates conversation, thread, project and Agent', async () => {
        const f = fixture()
        await f.create().invoke(f.input, f.config)
        await f.create().invoke(f.input, { configurable: { thread_id: 'thread', tool_call_id: 'call-2' } })
        await f.create().invoke(f.input, { configurable: { thread_id: 'other-thread', tool_call_id: 'call-1' } })
        for (const context of [
            { projectId: randomUUID() },
            { conversationId: randomUUID() },
            { agentKey: 'other-agent' },
            { callerType: 'xpert' as const, xpertId: randomUUID() }
        ]) {
            await f.create(context).invoke(f.input, f.config)
        }
        expect(new Set(f.calls.map((call) => call.input.requestId)).size).toBe(7)
    })

    it('rejects missing tool-call identity before issuing a command instead of generating a random fallback', async () => {
        const f = fixture()
        await expect(f.create().invoke(f.input, { configurable: { thread_id: 'thread' } })).rejects.toThrow()
        expect(f.execute).not.toHaveBeenCalled()
    })
})
