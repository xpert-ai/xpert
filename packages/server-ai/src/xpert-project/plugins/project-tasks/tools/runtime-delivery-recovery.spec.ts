jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn() }))
import { AIMessage } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import { GraphInterrupt } from '@langchain/langgraph'
import { ForbiddenException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { TaskControlRejected } from '@xpert-ai/server-core'
import i18next from 'i18next'
import { randomUUID } from 'node:crypto'
import { AgentInvocationAuthorizationError, AgentInvocationError } from '../../../../agent-invocation/invocation-errors'
import { ExecutionCancelledError } from '../../../../execution-control/execution-cancelled.error'
import en from '../../../../i18n/en.json'
import { ToolNode } from '../../../../xpert-agent/commands/handlers/tool_node'
import { RecoverProjectTaskDeliveryCommand } from '../../../runtime/project-task-dispatch.command'
import { createProjectRuntimeTools } from './runtime'

function fixture() {
    const execute = jest.fn(),
        permission = jest.fn()
    const commandBus = Object.assign(Object.create(CommandBus.prototype) as CommandBus, { execute })
    const tools: StructuredToolInterface[] = createProjectRuntimeTools(
        { projectId: randomUUID() },
        commandBus,
        permission
    )
    const recovery = tools.find((item) => item.name === 'project_recover_task_delivery')
    if (!recovery) throw new Error('Recovery tool not registered')
    return {
        execute,
        permission,
        recovery,
        input: { taskId: randomUUID(), executionId: randomUUID(), expectedRevision: 7 }
    }
}

beforeAll(async () => {
    await i18next.init({ lng: 'en', resources: { en: { 'server-ai': en } } })
})

describe('Project delivery recovery tool error boundary', () => {
    it.each(['InvalidRequest', 'ConcurrentUpdate', 'DeliveryRecoveryUnavailable', 'NotFound'] as const)(
        'returns a tool observation instead of killing coordination for %s',
        async (code) => {
            const f = fixture()
            f.execute.mockRejectedValue(new AgentInvocationError(code))
            const node = new ToolNode<unknown>([f.recovery], { toolName: 'Project Tasks' })
            const output = await node.invoke({
                messages: [
                    new AIMessage({
                        content: '',
                        tool_calls: [{ id: 'recover-1', name: f.recovery.name, args: f.input }]
                    })
                ]
            })
            expect(output).toEqual([
                expect.objectContaining({
                    update: expect.objectContaining({
                        messages: [
                            expect.objectContaining({
                                name: f.recovery.name,
                                tool_call_id: 'recover-1',
                                status: 'error',
                                content: expect.stringContaining(`Delivery recovery was rejected (${code})`)
                            })
                        ]
                    })
                })
            ])
            expect(f.permission).toHaveBeenCalledWith('edit')
            expect(f.execute).toHaveBeenCalledTimes(1)
            expect(f.execute).toHaveBeenCalledWith(expect.any(RecoverProjectTaskDeliveryCommand))
        }
    )

    it.each([
        new AgentInvocationError('InvalidScope'),
        new AgentInvocationAuthorizationError(new Error('revoked')),
        new AgentInvocationError('ProviderChanged'),
        new AgentInvocationError('DispatchUnknown'),
        new GraphInterrupt(),
        new ExecutionCancelledError(randomUUID(), 'cancelled'),
        new TaskControlRejected('paused'),
        new Error('unexpected implementation failure')
    ])('does not translate authorization, control or unrelated failures (%s)', async (error) => {
        const f = fixture()
        f.execute.mockRejectedValue(error)
        await expect(f.recovery.invoke(f.input)).rejects.toBe(error)
    })

    it('checks project permission before attempting recovery', async () => {
        const f = fixture(),
            denied = new ForbiddenException()
        f.permission.mockRejectedValue(denied)
        await expect(f.recovery.invoke(f.input)).rejects.toBe(denied)
        expect(f.execute).not.toHaveBeenCalled()
    })

    it('preserves a successful recovery receipt', async () => {
        const f = fixture(),
            receipt = { invocationId: randomUUID(), revision: 8, status: 'succeeded' }
        f.execute.mockResolvedValue(receipt)
        await expect(f.recovery.invoke(f.input)).resolves.toEqual(receipt)
    })
})
