jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { CommandBus } from '@nestjs/cqrs'
import { randomUUID } from 'node:crypto'
import { createProjectRuntimeTools } from './runtime'
import { DispatchProjectTaskCommand } from '../../../runtime/project-task-dispatch.command'

describe('Project general-agent Runtime tools', () => {
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
