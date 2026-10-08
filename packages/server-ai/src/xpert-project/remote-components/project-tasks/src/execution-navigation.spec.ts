import { request } from './bridge'
import { openTaskExecution } from './execution-navigation'

jest.mock('./bridge', () => ({ request: jest.fn() }))
const send = jest.mocked(request)

describe('task execution navigation', () => {
    beforeEach(() => send.mockReset())

    it.each(['assistant.execution', 'assistant.conversation'])(
        'opens the authorized %s attempt on every click, including reopening the same attempt',
        async (navigationTarget) => {
            const target = {
                target: navigationTarget,
                projectId: 'project',
                conversationId: 'conversation',
                threadId: 'thread',
                executionId: 'agent-execution',
                xpertId: 'assistant'
            }
            send.mockResolvedValueOnce({ success: true, data: target })
                .mockResolvedValueOnce({ success: true })
                .mockResolvedValueOnce({ success: true, data: target })
                .mockResolvedValueOnce({ success: true })
            await openTaskExecution('attempt-2', 'Open failed')
            await openTaskExecution('attempt-2', 'Open failed')
            expect(send).toHaveBeenNthCalledWith(1, 'executeAction', {
                actionKey: 'execution-target',
                input: { taskExecutionId: 'attempt-2', destination: 'execution' }
            })
            expect(send).toHaveBeenNthCalledWith(2, 'invokeClientCommand', {
                commandKey: 'workbench.navigation.open',
                payload: target
            })
            expect(send).toHaveBeenNthCalledWith(4, 'invokeClientCommand', {
                commandKey: 'workbench.navigation.open',
                payload: target
            })
        }
    )

    it('opens the selected coding invocation inside the current workbench', async () => {
        const target = {
            target: 'workbench.view',
            viewKey: 'platform.coding-execution__execution',
            selectionId: 'invocation-2',
            projectId: 'project'
        }
        send.mockResolvedValueOnce({ success: true, data: target }).mockResolvedValueOnce({ success: true })
        await openTaskExecution('attempt-2', 'Open failed')
        expect(send).toHaveBeenLastCalledWith('invokeClientCommand', {
            commandKey: 'workbench.navigation.open',
            payload: target
        })
    })

    it('resolves the owner conversation separately from the execution viewer', async () => {
        const target = {
            target: 'assistant.conversation',
            projectId: 'project',
            conversationId: 'conversation',
            threadId: 'thread',
            xpertId: null
        }
        send.mockResolvedValueOnce({ success: true, data: target }).mockResolvedValueOnce({ success: true })
        await openTaskExecution('attempt-2', 'Open failed', 'conversation')
        expect(send).toHaveBeenNthCalledWith(1, 'executeAction', {
            actionKey: 'execution-target',
            input: { taskExecutionId: 'attempt-2', destination: 'conversation' }
        })
        expect(send).toHaveBeenLastCalledWith('invokeClientCommand', {
            commandKey: 'workbench.navigation.open',
            payload: target
        })
    })

    it.each([
        [{ success: false, code: 'unsupported' }, 'Open failed (unsupported)'],
        [{ success: false, code: 'forbidden', message: 'Access denied' }, 'Access denied'],
        [undefined, 'Open failed (invalid_response)']
    ])('reports a rejected or missing navigation acknowledgement', async (response, message) => {
        send.mockResolvedValueOnce({
            success: true,
            data: {
                target: 'assistant.conversation',
                projectId: 'project',
                conversationId: 'conversation',
                threadId: 'thread',
                executionId: 'execution',
                xpertId: 'assistant'
            }
        }).mockResolvedValueOnce(response)
        await expect(openTaskExecution('attempt', 'Open failed')).rejects.toThrow(message)
    })

    it('does not navigate when the project access check rejects the attempt', async () => {
        send.mockRejectedValueOnce(new Error('Access denied'))
        await expect(openTaskExecution('attempt', 'Open failed')).rejects.toThrow('Access denied')
        expect(send).toHaveBeenCalledTimes(1)
    })

    it('does not substitute the latest conversation when the exact execution target is unavailable', async () => {
        send.mockResolvedValueOnce({ success: true, data: { conversationId: 'latest' } })
        await expect(openTaskExecution('attempt', 'Open failed')).rejects.toThrow()
        expect(send).toHaveBeenCalledTimes(1)
    })
})
