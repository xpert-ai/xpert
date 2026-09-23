import { tool } from '@langchain/core/tools'
import { AgentMiddlewareRegistry, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { createThreadReferenceMiddleware } from './thread-reference.runtime'
import { THREAD_REFERENCE_MIDDLEWARE_NAME } from './thread-reference.middleware'
import { readThreadSchema } from '../chat-conversation/thread-reference.contract'

it('registers the hidden built-in gate and its tool in the normal runtime tool map', async () => {
    const readThread = tool(async () => '', {
        name: 'read_thread',
        description: 'Read referenced history',
        schema: readThreadSchema
    })
    const createMiddleware = jest.fn().mockReturnValue({ name: THREAD_REFERENCE_MIDDLEWARE_NAME, tools: [readThread] })
    const get = jest.fn().mockReturnValue({ createMiddleware })
    const context = { tools: new Map(), conversationId: 'conversation', threadId: 'thread' } as Omit<
        IAgentMiddlewareContext,
        'node'
    >
    const result = await createThreadReferenceMiddleware({ get } as unknown as AgentMiddlewareRegistry, context)
    expect(get).toHaveBeenCalledWith(THREAD_REFERENCE_MIDDLEWARE_NAME)
    expect(createMiddleware).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
            conversationId: 'conversation',
            threadId: 'thread',
            node: expect.objectContaining({ provider: THREAD_REFERENCE_MIDDLEWARE_NAME, required: true })
        })
    )
    expect(result.key).toBe('__thread_reference_middleware__')
    expect(context.tools.get('read_thread')).toBe(readThread)
})
