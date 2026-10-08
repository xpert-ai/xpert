jest.mock('../../../desktop-shell/desktop-shell-operation.service', () => ({ DesktopShellOperationService: class {} }))
jest.mock('../../../xpert-agent-execution/agent-execution.service', () => ({ XpertAgentExecutionService: class {} }))
jest.mock('../../../shared/execution/execution-cancel.service', () => ({ ExecutionCancelService: class {} }))
jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))

import { IXpertAgentExecution, XpertAgentExecutionStatusEnum as Status } from '@xpert-ai/contracts'
import { CancelExternalAssistantCommand } from '../cancel-external-assistant.command'
import { CancelExternalAssistantHandler } from './cancel-external-assistant.handler'

describe('CancelExternalAssistantHandler', () => {
    function fixture() {
        const execution: IXpertAgentExecution = {
            id: 'writer',
            threadId: 'thread',
            status: Status.RUNNING,
            metadata: { invocationKind: 'external_assistant' }
        }
        const children: Record<string, IXpertAgentExecution[]> = {
            writer: [
                { id: 'image', threadId: 'thread', status: Status.RUNNING },
                { id: 'done', threadId: 'thread', status: Status.SUCCESS },
                { id: 'foreign', threadId: 'another-thread', status: Status.RUNNING }
            ],
            image: [{ id: 'tool', threadId: 'thread', status: Status.RUNNING }]
        }
        const executions = {
            findAllByParentId: jest.fn(async (id: string) => children[id] ?? []),
            interruptRunning: jest.fn().mockResolvedValue(undefined)
        }
        const cancellations = { cancelExecutions: jest.fn().mockResolvedValue(undefined) }
        const commands = { execute: jest.fn().mockResolvedValue(undefined) }
        const desktopShell = { cancelRuns: jest.fn().mockResolvedValue(undefined) }
        const handler = new CancelExternalAssistantHandler(
            executions as never,
            cancellations as never,
            commands as never,
            desktopShell as never
        )
        return { execution, executions, cancellations, commands, desktopShell, handler }
    }

    it('cancels only running descendants in the same thread', async () => {
        const f = fixture()
        await expect(f.handler.execute(new CancelExternalAssistantCommand(f.execution))).resolves.toEqual({
            canceledExecutionIds: ['writer', 'image', 'tool']
        })
        expect(f.cancellations.cancelExecutions).toHaveBeenCalledWith(
            ['writer', 'image', 'tool'],
            expect.stringContaining('cancelled by the user')
        )
        expect(f.executions.interruptRunning).toHaveBeenCalledWith(
            ['writer', 'image', 'tool'],
            'thread',
            expect.any(String)
        )
        expect(f.desktopShell.cancelRuns).toHaveBeenCalledWith(['writer', 'image', 'tool'])
        expect(f.executions.findAllByParentId).not.toHaveBeenCalledWith('foreign')
    })

    it.each([Status.SUCCESS, Status.ERROR, Status.INTERRUPTED, Status.PENDING])(
        'does not cancel a %s execution',
        async (status) => {
            const f = fixture()
            f.execution.status = status
            await expect(f.handler.execute(new CancelExternalAssistantCommand(f.execution))).resolves.toEqual({
                canceledExecutionIds: []
            })
            expect(f.cancellations.cancelExecutions).not.toHaveBeenCalled()
            expect(f.executions.interruptRunning).not.toHaveBeenCalled()
        }
    )
})
