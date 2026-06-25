import { STATE_VARIABLE_HUMAN } from '@xpert-ai/contracts'
import { AGENT_CHAT_DISPATCH_MESSAGE_TYPE } from '@xpert-ai/plugin-sdk'
import { XpertEnqueueTriggerDispatchCommand } from '../enqueue-trigger-dispatch.command'
import { XpertEnqueueTriggerDispatchHandler } from './enqueue-trigger-dispatch.handler'

describe('XpertEnqueueTriggerDispatchHandler', () => {
    function createHandler() {
        const xpertService = {
            repository: {
            findOne: jest.fn()
            }
        }
        const userService = {
            findOne: jest.fn().mockResolvedValue({
                id: 'user-1',
                preferredLanguage: 'en_US'
            })
        }
        const handoffQueue = { enqueue: jest.fn().mockResolvedValue({ id: 'handoff-id' }) }

        const handler = new XpertEnqueueTriggerDispatchHandler(
            xpertService as any,
            userService as any,
            handoffQueue as any
        )

        return {
            handler,
            xpertService,
            userService,
            handoffQueue
        }
    }

    it('enqueues explicit-user trigger dispatch with legacy user headers', async () => {
        const { handler, xpertService, handoffQueue } = createHandler()
        xpertService.repository.findOne.mockResolvedValue({
            id: 'xpert-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            createdById: 'user-1'
        })

        await handler.execute(
            new XpertEnqueueTriggerDispatchCommand(
                'xpert-1',
                'user-1',
                {
                    [STATE_VARIABLE_HUMAN]: {
                        input: 'hello'
                    }
                } as any,
                {
                    isDraft: false,
                    from: 'job'
                }
            )
        )

        expect(handoffQueue.enqueue).toHaveBeenCalledTimes(1)
        const [message] = handoffQueue.enqueue.mock.calls[0]
        expect(message.type).toBe(AGENT_CHAT_DISPATCH_MESSAGE_TYPE)
        expect(message.payload.options.from).toBe('job')
        expect(message.payload.options.runtimePrincipal).toBeUndefined()
        expect(message.headers.userId).toBe('user-1')
        expect(message.headers.organizationId).toBe('org-1')
    })

    it('uses assistant runtime principal when trigger dispatch has no explicit user', async () => {
        const { handler, xpertService, userService, handoffQueue } = createHandler()
        xpertService.repository.findOne.mockResolvedValue({
            id: 'xpert-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            createdById: 'owner-user'
        })

        await handler.execute(
            new XpertEnqueueTriggerDispatchCommand(
                'xpert-1',
                null,
                {
                    [STATE_VARIABLE_HUMAN]: {
                        input: 'hello'
                    }
                } as any,
                {
                    isDraft: false,
                    from: 'job'
                }
            )
        )

        expect(userService.findOne).not.toHaveBeenCalled()
        expect(handoffQueue.enqueue).toHaveBeenCalledTimes(1)
        const [message] = handoffQueue.enqueue.mock.calls[0]
        expect(message.type).toBe(AGENT_CHAT_DISPATCH_MESSAGE_TYPE)
        expect(message.payload.options).toEqual(
            expect.objectContaining({
                xpertId: 'xpert-1',
                from: 'job',
                runtimePrincipal: {
                    type: 'assistant',
                    xpertId: 'xpert-1'
                }
            })
        )
        expect(message.headers).toEqual(
            expect.not.objectContaining({
                userId: expect.anything()
            })
        )
    })

    it('throws when xpert does not exist', async () => {
        const { handler, xpertService } = createHandler()
        xpertService.repository.findOne.mockResolvedValue(null)

        await expect(
            handler.execute(
                new XpertEnqueueTriggerDispatchCommand(
                    'xpert-404',
                    'user-1',
                    {
                        [STATE_VARIABLE_HUMAN]: {
                            input: 'hello'
                        }
                    } as any,
                    {
                        isDraft: false,
                        from: 'job'
                    }
                )
            )
        ).rejects.toThrow('Xpert "xpert-404" not found')
    })
})
