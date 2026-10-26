jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { RequestContext, AgentMiddlewareAssistantTaskResult } from '@xpert-ai/plugin-sdk'
import { TaskControlStore } from '@xpert-ai/server-core'
import { ExecutionControlEvidence } from '@xpert-ai/contracts'
import { AssistantTaskRuntimeService } from './assistant-task-runtime.service'
import { ControlAssistantTaskHandler } from './control-assistant-task.handler'
import { ControlAssistantTaskCommand } from './control-assistant-task.command'

describe('Assistant control completion bridge', () => {
    afterEach(() => jest.restoreAllMocks())
    it('waits for actual exit despite completed task metadata and follows the original execution alias', async () => {
        const id = randomUUID(),
            current = randomUUID(),
            tenantId = randomUUID(),
            organizationId = randomUUID()
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(organizationId)
        const proof: ExecutionControlEvidence = {
            version: 1,
            source: 'platform',
            subject: { kind: 'execution', id },
            scope: 'owned_subtree',
            state: 'terminating',
            desired: 'terminated',
            taskId: randomUUID(),
            rootId: randomUUID(),
            revision: 3,
            executionId: current,
            threadId: 'thread',
            observedAt: new Date().toISOString()
        }
        const runtime = {
            getTaskStatus: jest.fn<Promise<AgentMiddlewareAssistantTaskResult>, [unknown]>().mockResolvedValue({
                executionId: current,
                status: 'interrupted',
                control: proof
            }),
            cancelTask: jest.fn()
        }
        const tasks = {
            execution: jest.fn().mockResolvedValue({
                id: proof.taskId,
                state: 'completed',
                currentExecutionId: current,
                threadId: 'thread',
                tenantId,
                organizationId
            })
        }
        const handler = new ControlAssistantTaskHandler(
            runtime as unknown as AssistantTaskRuntimeService,
            tasks as unknown as TaskControlStore
        )
        expect(await handler.execute(new ControlAssistantTaskCommand(id, 'cancel'))).toMatchObject({
            status: 'cancelling'
        })
        expect(runtime.cancelTask).toHaveBeenCalledWith({ executionId: id, threadId: 'thread' })
        runtime.getTaskStatus.mockResolvedValue({ status: 'interrupted', control: { ...proof, state: 'settled' } })
        expect(await handler.execute(new ControlAssistantTaskCommand(id, 'inspect'))).toMatchObject({
            status: 'cancelled'
        })
        runtime.getTaskStatus.mockResolvedValue({ status: 'succeeded', control: { ...proof, state: 'settled' } })
        expect(await handler.execute(new ControlAssistantTaskCommand(id, 'cancel'))).toMatchObject({
            status: 'succeeded'
        })
        expect(runtime.cancelTask).toHaveBeenCalledTimes(1)
        runtime.getTaskStatus.mockResolvedValue({
            status: 'interrupted',
            control: { ...proof, state: 'paused', desired: 'paused' }
        })
        expect(await handler.execute(new ControlAssistantTaskCommand(id, 'inspect'))).toMatchObject({
            status: 'waiting'
        })
    })
})
