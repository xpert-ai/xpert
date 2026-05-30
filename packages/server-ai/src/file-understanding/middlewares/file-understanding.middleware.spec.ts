jest.mock('@xpert-ai/plugin-sdk', () => {
    const actual = jest.requireActual('@xpert-ai/plugin-sdk')
    return {
        ...actual,
        AgentMiddlewareStrategy: () => (target: unknown) => target
    }
})

import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { ListConversationFilesQuery } from '../queries'
import { FILE_UNDERSTANDING_MIDDLEWARE_NAME, FileUnderstandingMiddleware } from './file-understanding.middleware'

function createContext(conversationId = 'conversation-context'): IAgentMiddlewareContext {
    return {
        tenantId: 'tenant-1',
        userId: 'user-1',
        conversationId,
        node: {
            id: 'middleware-1',
            key: 'middleware-1',
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            provider: FILE_UNDERSTANDING_MIDDLEWARE_NAME
        },
        tools: new Map(),
        runtime: {} as any
    }
}

describe('FileUnderstandingMiddleware', () => {
    it('exposes file understanding tools through the middleware contract', async () => {
        const queryBus = {
            execute: jest.fn()
        }
        const strategy = new FileUnderstandingMiddleware(queryBus as any)
        const middleware = await Promise.resolve(strategy.createMiddleware(undefined, createContext()))

        expect(strategy.meta.builtin).toBe(true)
        expect(middleware.name).toBe(FILE_UNDERSTANDING_MIDDLEWARE_NAME)
        expect(middleware.tools?.map((item) => item.name)).toEqual([
            'file_search',
            'file_read',
            'file_table_query',
            'file_preview',
            'file_page_images',
            'workspace_list',
            'workspace_read',
            'workspace_search'
        ])
    })

    it('uses middleware options as the conversation scope when provided', async () => {
        const queryBus = {
            execute: jest.fn().mockResolvedValue([])
        }
        const middleware = await Promise.resolve(
            new FileUnderstandingMiddleware(queryBus as any).createMiddleware(
                { conversationId: 'conversation-option' },
                createContext('conversation-context')
            )
        )
        const workspaceListTool = middleware.tools?.find((item) => item.name === 'workspace_list')

        await workspaceListTool?.invoke({})

        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(ListConversationFilesQuery))
        expect(queryBus.execute.mock.calls[0][0].conversationId).toBe('conversation-option')
    })
})
