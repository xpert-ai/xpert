import { ForbiddenException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { McpAppHistoryService } from './mcp-app-history.service'
import { McpAppHistoryStoreService } from './mcp-app-history-store.service'
import type { McpAppInstanceSnapshot } from './mcp-app-instance-store.service'

describe('MCP App authorized history', () => {
    const result = {
        content: [{ type: 'text', text: 'Saved place' }],
        structuredContent: { places: [{ name: 'Cafe' }] }
    }
    const component = {
        type: 'McpApp',
        appInstanceId: 'app',
        resourceUri: 'ui://maps',
        toolName: 'search',
        toolCallId: 'call',
        serverName: 'maps',
        executionId: 'run',
        toolResult: result,
        toolInput: { q: 'Cafe' }
    }
    const snapshot: McpAppInstanceSnapshot = {
        version: 1,
        stateVersion: 1,
        appInstanceId: 'app',
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'user',
        serverName: 'maps',
        toolName: 'search',
        displayName: 'search',
        resourceUri: 'ui://maps',
        toolCallId: 'call',
        createdAt: 1,
        expiresAt: 2,
        source: {
            kind: 'middleware',
            provider: 'maps',
            nodeKey: 'node',
            agentKey: 'agent',
            pluginName: 'maps',
            interruptAfter: false
        },
        executionContext: { xpertId: 'assistant', executionId: 'run', conversationId: 'conversation' },
        toolInput: { q: 'Cafe' },
        toolResult: result
    }
    const message = () => ({
        id: 'message',
        conversationId: 'conversation',
        executionId: 'run',
        conversation: { xpertId: 'assistant' },
        createdAt: new Date(1000),
        events: [{ data: component }]
    })
    let messages: { findOneAuthorized: jest.Mock }
    let store: { find: jest.Mock }
    let queries: { execute: jest.Mock }
    let service: McpAppHistoryService
    beforeEach(() => {
        messages = { findOneAuthorized: jest.fn().mockResolvedValue(message()) }
        store = { find: jest.fn().mockResolvedValue(snapshot) }
        queries = { execute: jest.fn() }
        service = new McpAppHistoryService(
            messages as unknown as ChatMessageService,
            store as unknown as McpAppHistoryStoreService,
            queries as unknown as QueryBus
        )
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
    })
    afterEach(() => jest.restoreAllMocks())

    it('reads an expired original result without runtime, token, or tool execution', async () => {
        const { history } = await service.load('app', 'message')
        expect(history).toMatchObject({
            appInstanceId: 'app',
            toolInput: { q: 'Cafe' },
            toolResult: result,
            createdAt: 1,
            canResume: true,
            toolResultTruncated: false
        })
        expect(history).not.toHaveProperty('executionContext')
        expect(history).not.toHaveProperty('source')
        expect(messages.findOneAuthorized).toHaveBeenCalledWith('message', { relations: ['conversation'] })
    })
    describe('MCP toolset names with a configured prefix', () => {
        const toolsetSnapshot: McpAppInstanceSnapshot = {
            ...snapshot,
            source: undefined,
            toolsetId: 'toolset',
            serverName: 'generic',
            toolName: 'modern_search',
            displayName: 'generic__modern_search',
            resourceUri: 'ui://generic/search'
        }
        const toolsetComponent = {
            ...component,
            toolsetId: 'toolset',
            serverName: 'generic',
            toolName: 'generic__modern_search',
            resourceUri: 'ui://generic/search'
        }
        beforeEach(() => {
            store.find.mockResolvedValue(toolsetSnapshot)
            messages.findOneAuthorized.mockResolvedValue({ ...message(), events: [{ data: toolsetComponent }] })
        })

        it.each(['modern_search', 'generic__modern_search'])(
            'reads history and authorizes resume for %s',
            async (toolName) => {
                messages.findOneAuthorized.mockResolvedValue({
                    ...message(),
                    events: [{ data: { ...toolsetComponent, toolName } }]
                })

                const loaded = await service.load('app', 'message')

                expect(loaded.history).toMatchObject({ toolResult: result, canResume: true })
                expect(loaded.snapshot).toEqual(toolsetSnapshot)
            }
        )

        it.each(['other__modern_search', 'generic__other_search', '', undefined])(
            'rejects an unrelated or missing tool name: %s',
            async (toolName) => {
                messages.findOneAuthorized.mockResolvedValue({
                    ...message(),
                    events: [{ data: { ...toolsetComponent, toolName } }]
                })

                await expect(service.load('app', 'message')).rejects.toBeInstanceOf(ForbiddenException)
            }
        )

        it.each(['serverName', 'toolsetId', 'toolCallId', 'resourceUri'] as const)(
            'rejects a display-name match with conflicting %s',
            async (field) => {
                messages.findOneAuthorized.mockResolvedValue({
                    ...message(),
                    events: [{ data: { ...toolsetComponent, [field]: 'other' } }]
                })

                await expect(service.load('app', 'message')).rejects.toBeInstanceOf(ForbiddenException)
            }
        )
    })
    it('rejects revoked conversation access before looking up provenance', async () => {
        messages.findOneAuthorized.mockRejectedValue(new ForbiddenException())
        await expect(service.load('app', 'message')).rejects.toBeInstanceOf(ForbiddenException)
        expect(store.find).not.toHaveBeenCalled()
    })
    it('rejects a valid but unrelated message', async () => {
        messages.findOneAuthorized.mockResolvedValue({ ...message(), events: [] })
        await expect(service.load('app', 'other-message')).rejects.toBeInstanceOf(ForbiddenException)
        expect(store.find).not.toHaveBeenCalled()
    })
    it.each(['conversationId', 'executionId'] as const)('rejects conflicting server provenance %s', async (field) => {
        store.find.mockResolvedValue({
            ...snapshot,
            executionContext: { ...snapshot.executionContext, [field]: 'other' }
        })
        await expect(service.load('app', 'message')).rejects.toBeInstanceOf(ForbiddenException)
    })
    it('rejects a different Assistant audience even when the user can read the message', async () => {
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            resourceScope: { kind: 'assistant', xpertId: 'other-assistant' }
        } as ReturnType<typeof RequestContext.currentApiPrincipal>)
        await expect(service.load('app', 'message')).rejects.toBeInstanceOf(ForbiddenException)
    })
    it('keeps a legacy result readable without guessing resumable provenance', async () => {
        store.find.mockResolvedValue(null)
        expect((await service.load('app', 'message')).history).toMatchObject({
            toolResult: result,
            createdAt: 1000,
            canResume: false
        })
    })
    it('preserves the truncated legacy result state', async () => {
        store.find.mockResolvedValue(null)
        messages.findOneAuthorized.mockResolvedValue({
            ...message(),
            events: [
                {
                    data: {
                        ...component,
                        toolResult: undefined,
                        toolResultTruncated: true
                    }
                }
            ]
        })
        expect((await service.load('app', 'message')).history).toMatchObject({
            toolResult: undefined,
            toolResultTruncated: true,
            canResume: false
        })
    })
    it('does not let another permitted reader resume the original user-bound authority', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('reader')
        expect((await service.load('app', 'message')).history.canResume).toBe(false)
    })
})
