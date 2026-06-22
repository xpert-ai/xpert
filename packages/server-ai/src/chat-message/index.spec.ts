import { appendMessageSteps, sanitizeMessageContentForPersistence } from './index'

describe('appendMessageSteps', () => {
    it('does not persist MCP App runtime tokens in message events', () => {
        const message: any = {}

        appendMessageSteps(message, [
            {
                id: 'call_1',
                category: 'Dashboard',
                type: 'McpApp',
                appInstanceToken: 'runtime-token',
                data: {
                    type: 'McpApp',
                    appInstanceId: 'app-1',
                    appInstanceToken: 'runtime-token',
                    resourceUri: 'ui://wiki-explorer/mcp-app.html',
                    toolName: 'wiki_links'
                }
            } as any
        ])

        expect(message.events).toEqual([
            {
                id: 'call_1',
                category: 'Dashboard',
                type: 'McpApp',
                data: {
                    type: 'McpApp',
                    appInstanceId: 'app-1',
                    resourceUri: 'ui://wiki-explorer/mcp-app.html',
                    toolName: 'wiki_links'
                }
            }
        ])
    })

    it('removes previously persisted MCP App runtime tokens when updating a step', () => {
        const message: any = {
            events: [
                {
                    id: 'call_1',
                    category: 'Dashboard',
                    type: 'McpApp',
                    appInstanceToken: 'old-runtime-token',
                    data: {
                        type: 'McpApp',
                        appInstanceId: 'app-1',
                        appInstanceToken: 'old-runtime-token',
                        resourceUri: 'ui://wiki-explorer/mcp-app.html',
                        toolName: 'wiki_links'
                    }
                }
            ]
        }

        appendMessageSteps(message, [
            {
                id: 'call_1',
                category: 'Dashboard',
                type: 'McpApp',
                status: 'success',
                data: {
                    type: 'McpApp',
                    appInstanceId: 'app-1',
                    resourceUri: 'ui://wiki-explorer/mcp-app.html',
                    toolName: 'wiki_links'
                }
            } as any
        ])

        expect(message.events[0]).toMatchObject({
            id: 'call_1',
            category: 'Dashboard',
            type: 'McpApp',
            status: 'success',
            data: {
                type: 'McpApp',
                appInstanceId: 'app-1',
                resourceUri: 'ui://wiki-explorer/mcp-app.html',
                toolName: 'wiki_links'
            }
        })
        expect(message.events[0].appInstanceToken).toBeUndefined()
        expect(message.events[0].data.appInstanceToken).toBeUndefined()
    })

    it('does not persist MCP App runtime tokens in component message content', () => {
        const content = sanitizeMessageContentForPersistence({
            id: 'call_1',
            type: 'component',
            data: {
                type: 'McpApp',
                appInstanceId: 'app-1',
                appInstanceToken: 'runtime-token',
                resourceUri: 'ui://wiki-explorer/mcp-app.html',
                toolName: 'wiki_links',
                data: {
                    type: 'McpApp',
                    appInstanceId: 'app-1',
                    appInstanceToken: 'runtime-token',
                    resourceUri: 'ui://wiki-explorer/mcp-app.html',
                    toolName: 'wiki_links'
                }
            }
        } as any)

        expect(content).toEqual({
            id: 'call_1',
            type: 'component',
            data: {
                type: 'McpApp',
                appInstanceId: 'app-1',
                resourceUri: 'ui://wiki-explorer/mcp-app.html',
                toolName: 'wiki_links',
                data: {
                    type: 'McpApp',
                    appInstanceId: 'app-1',
                    resourceUri: 'ui://wiki-explorer/mcp-app.html',
                    toolName: 'wiki_links'
                }
            }
        })
    })
})
