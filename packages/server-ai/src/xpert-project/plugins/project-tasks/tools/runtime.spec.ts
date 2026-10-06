jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn() }))
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { CommandBus } from '@nestjs/cqrs'
import { randomUUID } from 'node:crypto'
import { createProjectRuntimeTools } from './runtime'
import { DispatchProjectTaskCommand } from '../../../runtime/project-task-dispatch.command'
import { projectTaskCard } from '../../../runtime/project-task-card'

describe('Project general-agent Runtime tools', () => {
    it.each([false, true])('preserves a committed delegation when card emission fails: %s', async (failCard) => {
        const emit = jest.mocked(dispatchCustomEvent)
        emit.mockReset()
        if (failCard) emit.mockRejectedValueOnce(new Error('Card stream disconnected'))
        const projectId = randomUUID()
        const card = projectTaskCard({
            type: 'execution',
            id: randomUUID(),
            title: 'Implementation',
            status: 'running',
            attempt: 1
        })
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
            { taskId: receipt.projectTaskId, bindingId: randomUUID(), requestId: randomUUID(), expectedRevision: 1 },
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
            requestId: randomUUID(),
            expectedRevision: 1,
            instructions: ''
        }
        await dispatch.invoke(input, { configurable: { thread_id: 'thread', tool_call_id: 'tool-call' } })
        expect(execute).toHaveBeenCalledWith(expect.any(DispatchProjectTaskCommand))
        expect(execute.mock.calls[0][0]).toMatchObject({
            projectId,
            input,
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
